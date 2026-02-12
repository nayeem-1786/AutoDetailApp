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
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const customerId = searchParams.get('customer_id');
    const vehicleSearch = searchParams.get('vehicle');
    const serviceId = searchParams.get('service_id');
    const zone = searchParams.get('zone');
    const phase = searchParams.get('phase');
    const staffId = searchParams.get('staff_id');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createAdminClient();

    let query = supabase
      .from('job_photos')
      .select(
        `id, job_id, zone, phase, image_url, thumbnail_url, storage_path,
         notes, annotation_data, is_featured, is_internal, sort_order,
         created_by, created_at,
         jobs!inner(
           id, status, services, customer_id, vehicle_id, assigned_staff_id, created_at,
           customers(id, first_name, last_name),
           vehicles(id, year, make, model, color),
           employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
         )`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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

    // Zone filter
    if (zone) {
      query = query.eq('zone', zone);
    }

    // Phase filter
    if (phase) {
      query = query.eq('phase', phase);
    }

    // Staff filter
    if (staffId) {
      query = query.eq('jobs.assigned_staff_id', staffId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Post-query filters that Supabase can't handle directly
    let filtered = data || [];

    // Vehicle text search (year make model)
    if (vehicleSearch) {
      const term = vehicleSearch.toLowerCase();
      filtered = filtered.filter((photo: Record<string, unknown>) => {
        const job = photo.jobs as Record<string, unknown> | null;
        const v = job?.vehicles as Record<string, unknown> | null;
        if (!v) return false;
        const vehicleStr = `${v.year || ''} ${v.make || ''} ${v.model || ''} ${v.color || ''}`.toLowerCase();
        return vehicleStr.includes(term);
      });
    }

    // Service filter (check against JSONB services array on the job)
    if (serviceId) {
      filtered = filtered.filter((photo: Record<string, unknown>) => {
        const job = photo.jobs as Record<string, unknown> | null;
        const services = (job?.services ?? []) as { id: string }[];
        return services.some((s) => s.id === serviceId);
      });
    }

    return NextResponse.json({
      data: filtered,
      total: vehicleSearch || serviceId ? filtered.length : (count ?? 0),
    });
  } catch (err) {
    console.error('[admin/photos] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
