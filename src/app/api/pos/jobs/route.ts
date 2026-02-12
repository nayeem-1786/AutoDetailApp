import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

/**
 * GET /api/pos/jobs — List today's jobs
 * Query params: ?filter=mine|all|unassigned
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'mine';

    // Today in PST
    const now = new Date();
    const pstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const todayStart = new Date(pstDate.getFullYear(), pstDate.getMonth(), pstDate.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Convert back to UTC ISO strings for Supabase query
    const startUtc = new Date(todayStart.getTime() + (now.getTime() - pstDate.getTime())).toISOString();
    const endUtc = new Date(todayEnd.getTime() + (now.getTime() - pstDate.getTime())).toISOString();

    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
        addons:job_addons(id, status)
      `)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
      .neq('status', 'cancelled');

    if (filter === 'mine') {
      query = query.eq('assigned_staff_id', posEmployee.employee_id);
    } else if (filter === 'unassigned') {
      query = query.is('assigned_staff_id', null);
    }
    // filter === 'all' has no additional constraint

    const { data: jobs, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Jobs list error:', error);
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    return NextResponse.json({ data: jobs ?? [] });
  } catch (err) {
    console.error('Jobs list route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pos/jobs — Create a walk-in job
 * Body: { customer_id, vehicle_id?, assigned_staff_id?, services: [{id, name, price}], estimated_pickup_at? }
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json();
    const {
      customer_id,
      vehicle_id,
      assigned_staff_id,
      services,
      estimated_pickup_at,
    } = body as {
      customer_id: string;
      vehicle_id?: string;
      assigned_staff_id?: string;
      services: JobServiceSnapshot[];
      estimated_pickup_at?: string;
    };

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        customer_id,
        vehicle_id: vehicle_id || null,
        assigned_staff_id: assigned_staff_id || null,
        appointment_id: null, // walk-in
        services,
        status: 'scheduled',
        estimated_pickup_at: estimated_pickup_at || null,
        created_by: posEmployee.employee_id,
      })
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
      `)
      .single();

    if (error) {
      console.error('Job create error:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    return NextResponse.json({ data: job }, { status: 201 });
  } catch (err) {
    console.error('Job create route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
