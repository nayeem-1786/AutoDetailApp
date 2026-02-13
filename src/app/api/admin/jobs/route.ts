import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function GET(req: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const denied = await requirePermission(employee.id, 'admin.photos.view');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = (page - 1) * limit;

  const status = searchParams.get('status');
  const staffId = searchParams.get('staff_id');
  const customerId = searchParams.get('customer_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sort_by') || 'created_at';
  const sortDir = (searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc';

  const admin = createAdminClient();

  // If searching by customer name/phone, find matching customer IDs first
  let searchCustomerIds: string[] | null = null;
  if (search && search.length >= 2) {
    const isPhoneSearch = /^[\d\s\-\(\)\+]+$/.test(search);
    if (isPhoneSearch) {
      const digits = search.replace(/\D/g, '');
      const { data: customers } = await admin
        .from('customers')
        .select('id')
        .like('phone', `%${digits}%`);
      searchCustomerIds = customers?.map((c) => c.id) || [];
    } else {
      const { data: customers } = await admin
        .from('customers')
        .select('id')
        .or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%`
        );
      searchCustomerIds = customers?.map((c) => c.id) || [];
    }
    // If no customers matched, return empty
    if (searchCustomerIds.length === 0) {
      return NextResponse.json({ jobs: [], total: 0, page, limit });
    }
  }

  // Build base query
  let query = admin
    .from('jobs')
    .select(
      `
      id,
      status,
      services,
      timer_seconds,
      work_started_at,
      work_completed_at,
      intake_started_at,
      intake_completed_at,
      actual_pickup_at,
      estimated_pickup_at,
      appointment_id,
      transaction_id,
      created_at,
      customer:customers!inner(id, first_name, last_name, phone),
      vehicle:vehicles(id, year, make, model, color),
      assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
    `,
      { count: 'exact' }
    );

  // Apply filters
  if (status) {
    query = query.eq('status', status);
  }
  if (staffId) {
    query = query.eq('assigned_staff_id', staffId);
  }
  if (customerId) {
    query = query.eq('customer_id', customerId);
  }
  if (dateFrom) {
    query = query.gte('created_at', `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte('created_at', `${dateTo}T23:59:59`);
  }
  if (searchCustomerIds) {
    query = query.in('customer_id', searchCustomerIds);
  }

  // Sorting
  const validSortColumns: Record<string, string> = {
    created_at: 'created_at',
    status: 'status',
    timer_seconds: 'timer_seconds',
  };
  const sortColumn = validSortColumns[sortBy] || 'created_at';
  query = query.order(sortColumn, { ascending: sortDir === 'asc' });

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data: jobs, error, count } = await query;

  if (error) {
    console.error('Admin jobs list error:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }

  // Batch fetch photo counts and addon counts for these jobs
  const jobIds = (jobs || []).map((j) => j.id);

  let photoCounts: Record<string, number> = {};
  let addonCounts: Record<string, number> = {};

  if (jobIds.length > 0) {
    // Photo counts per job
    const { data: photoRows } = await admin
      .from('job_photos')
      .select('job_id')
      .in('job_id', jobIds);
    if (photoRows) {
      for (const row of photoRows) {
        photoCounts[row.job_id] = (photoCounts[row.job_id] || 0) + 1;
      }
    }

    // Approved addon counts per job
    const { data: addonRows } = await admin
      .from('job_addons')
      .select('job_id')
      .in('job_id', jobIds)
      .eq('status', 'approved');
    if (addonRows) {
      for (const row of addonRows) {
        addonCounts[row.job_id] = (addonCounts[row.job_id] || 0) + 1;
      }
    }
  }

  // Enrich jobs with counts
  const enrichedJobs = (jobs || []).map((job) => ({
    ...job,
    photo_count: photoCounts[job.id] || 0,
    addon_count: addonCounts[job.id] || 0,
  }));

  return NextResponse.json({
    jobs: enrichedJobs,
    total: count || 0,
    page,
    limit,
  });
}
