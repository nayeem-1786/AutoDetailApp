import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.view');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const customerId = searchParams.get('customer_id');
    const vehicleId = searchParams.get('vehicle_id');
    const zone = searchParams.get('zone');
    const phase = searchParams.get('phase');
    const staffId = searchParams.get('staff_id');
    const featured = searchParams.get('featured');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;
    const supabase = createAdminClient();

    // If search term provided, find matching customer/vehicle IDs first
    // (Supabase PostgREST .or() on related tables doesn't work)
    let searchCustomerIds: string[] | null = null;
    let searchVehicleIds: string[] | null = null;

    if (search && search.length >= 2) {
      const term = `%${search}%`;

      // Search customers by name
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .or(`first_name.ilike.${term},last_name.ilike.${term}`)
        .limit(100);

      searchCustomerIds = (customers || []).map((c) => c.id);

      // Search vehicles by year/make/model
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id')
        .or(`make.ilike.${term},model.ilike.${term}`)
        .limit(100);

      searchVehicleIds = (vehicles || []).map((v) => v.id);
    }

    let query = supabase
      .from('job_photos')
      .select(
        `id, job_id, zone, phase, image_url, thumbnail_url, storage_path,
         notes, annotation_data, is_featured, is_internal, sort_order,
         created_by, created_at,
         jobs!inner(
           id, status, services, customer_id, vehicle_id, created_at,
           customers(id, first_name, last_name),
           vehicles(id, year, make, model, color)
         )`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Date range filters
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    // Customer filter
    if (customerId) {
      query = query.eq('jobs.customer_id', customerId);
    }

    // Vehicle filter
    if (vehicleId) {
      query = query.eq('jobs.vehicle_id', vehicleId);
    }

    // Zone filter
    if (zone) {
      query = query.eq('zone', zone);
    }

    // Phase filter
    if (phase) {
      query = query.eq('phase', phase);
    }

    // Staff filter (who took the photo)
    if (staffId) {
      query = query.eq('created_by', staffId);
    }

    // Featured filter
    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    // Search: filter by matching customer or vehicle IDs
    if (search && search.length >= 2 && searchCustomerIds && searchVehicleIds) {
      const allIds = [...searchCustomerIds, ...searchVehicleIds];
      if (allIds.length === 0) {
        // No matches — return empty
        return NextResponse.json({ photos: [], total: 0, page, limit });
      }
      // Filter jobs by customer or vehicle match
      // Since we can't do OR across different related fields, we need to do
      // post-query filtering
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    let filtered = data || [];

    // Post-query search filter (customer name or vehicle info match)
    if (search && search.length >= 2 && searchCustomerIds && searchVehicleIds) {
      filtered = filtered.filter((photo: Record<string, unknown>) => {
        const job = photo.jobs as Record<string, unknown> | null;
        if (!job) return false;
        const custId = job.customer_id as string;
        const vehId = job.vehicle_id as string | null;
        return (
          searchCustomerIds!.includes(custId) ||
          (vehId && searchVehicleIds!.includes(vehId))
        );
      });
    }

    // Fetch "taken_by" employee data for all created_by IDs in the result set
    const createdByIds = [
      ...new Set(filtered.map((p: Record<string, unknown>) => p.created_by as string).filter(Boolean)),
    ];
    let staffMap: Record<string, { id: string; first_name: string; last_name: string }> = {};
    if (createdByIds.length > 0) {
      const { data: staffData } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', createdByIds);
      if (staffData) {
        staffMap = Object.fromEntries(staffData.map((s) => [s.id, s]));
      }
    }

    // Transform response to match spec shape
    const photos = filtered.map((photo: Record<string, unknown>) => {
      const job = photo.jobs as Record<string, unknown> | null;
      const customer = job?.customers as Record<string, unknown> | null;
      const vehicle = job?.vehicles as Record<string, unknown> | null;
      const takenBy = photo.created_by ? staffMap[photo.created_by as string] : null;

      return {
        id: photo.id,
        image_url: photo.image_url,
        thumbnail_url: photo.thumbnail_url,
        zone: photo.zone,
        phase: photo.phase,
        notes: photo.notes,
        annotation_data: photo.annotation_data,
        is_featured: photo.is_featured,
        is_internal: photo.is_internal,
        created_at: photo.created_at,
        job: job
          ? {
              id: job.id,
              status: job.status,
              services: job.services,
              created_at: job.created_at,
            }
          : null,
        customer: customer
          ? {
              id: customer.id,
              first_name: customer.first_name,
              last_name: customer.last_name,
            }
          : null,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              color: vehicle.color,
            }
          : null,
        taken_by: takenBy || null,
      };
    });

    // For search results, the count may not match due to post-filtering
    const totalCount =
      search && search.length >= 2 ? photos.length : (count ?? 0);

    return NextResponse.json({
      photos,
      total: totalCount,
      page,
      limit,
    });
  } catch (err) {
    console.error('[admin/photos] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
