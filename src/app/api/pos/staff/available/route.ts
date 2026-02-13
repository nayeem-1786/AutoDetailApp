import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * GET /api/pos/staff/available — List bookable staff with busy status and today's job counts.
 * Used by the reassign-detailer modal on the job detail view.
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get all active employees who are bookable
    const { data: staff, error: staffErr } = await supabase
      .from('employees')
      .select('id, first_name, last_name, role')
      .eq('status', 'active')
      .eq('bookable_for_appointments', true)
      .order('first_name');

    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    if (staff.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const staffIds = staff.map((s) => s.id);

    // Get today's active job counts per staff member
    // Use PST timezone for "today"
    const now = new Date();
    const pstDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const todayStart = `${pstDate}T00:00:00-08:00`;
    const todayEnd = `${pstDate}T23:59:59-08:00`;

    const { data: activeJobs } = await supabase
      .from('jobs')
      .select('assigned_staff_id, status')
      .in('assigned_staff_id', staffIds)
      .in('status', ['scheduled', 'intake', 'in_progress', 'pending_approval'])
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd);

    // Count jobs and determine busy status per staff
    const jobCounts = new Map<string, number>();
    const busyStaff = new Set<string>();

    for (const job of activeJobs ?? []) {
      if (!job.assigned_staff_id) continue;
      jobCounts.set(job.assigned_staff_id, (jobCounts.get(job.assigned_staff_id) ?? 0) + 1);
      // "Busy" = currently has an in_progress or intake job
      if (job.status === 'in_progress' || job.status === 'intake') {
        busyStaff.add(job.assigned_staff_id);
      }
    }

    const result = staff.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      role: s.role,
      job_count_today: jobCounts.get(s.id) ?? 0,
      is_busy: busyStaff.has(s.id),
    }));

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('POS staff available error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
