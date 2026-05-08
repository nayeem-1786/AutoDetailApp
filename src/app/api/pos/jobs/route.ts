import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { findAvailableDetailer, addMinutesToTime } from '@/lib/utils/assign-detailer';
import { dateToPstStartOfDay, dateToPstEndOfDay, getNowPstRoundedTo15 } from '@/lib/utils/pst-date';
import type { JobServiceSnapshot } from '@/lib/supabase/types';
import { logAudit, getRequestIp } from '@/lib/services/audit';

/**
 * GET /api/pos/jobs — List jobs for a date
 * Query params: ?filter=mine|all|unassigned&date=YYYY-MM-DD (defaults to today PST)
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'mine';

    // Use date param or default to today PST
    const dateParam = searchParams.get('date');
    const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());

    const jobSelect = `
      *,
      customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
      vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
      assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
      addons:job_addons(id, status),
      appointment:appointments!jobs_appointment_id_fkey(scheduled_start_time, channel),
      photos:job_photos(id, zone, phase)
    `;
    // Only exclude cancelled — include closed for daily summary + list visibility
    const excludeStatuses = ['cancelled'];

    // Step 1: Get target date's appointment IDs
    // (Supabase .or() on related tables doesn't work — query appointments first)
    const { data: dateApts } = await supabase
      .from('appointments')
      .select('id')
      .eq('scheduled_date', targetDate);
    const dateAptIds = (dateApts ?? []).map((a) => a.id);

    // Step 2a: Jobs linked to target date's appointments
    let aptJobsQuery = dateAptIds.length > 0
      ? supabase
          .from('jobs')
          .select(jobSelect)
          .in('appointment_id', dateAptIds)
          .not('status', 'in', `(${excludeStatuses.join(',')})`)
      : null;

    // Step 2b: LEGACY — pre-Phase 0a walk-ins (appointment_id IS NULL) created
    // on target date in PST. Post-Phase 0a, walk-ins eagerly create a synthetic
    // appointment with channel='walk_in' + scheduled_date=today, so they are
    // picked up by aptJobsQuery above. This branch covers historical rows only;
    // it can be retired once all in-flight pre-0a walk-ins close out.
    const startUtc = dateToPstStartOfDay(targetDate);
    const endUtc = dateToPstEndOfDay(targetDate);
    let walkInQuery = supabase
      .from('jobs')
      .select(jobSelect)
      .is('appointment_id', null)
      .not('status', 'in', `(${excludeStatuses.join(',')})`)
      .gte('created_at', startUtc!)
      .lte('created_at', endUtc!);

    // Apply staff filter to both queries
    if (filter === 'mine') {
      if (aptJobsQuery) aptJobsQuery = aptJobsQuery.eq('assigned_staff_id', posEmployee.employee_id);
      walkInQuery = walkInQuery.eq('assigned_staff_id', posEmployee.employee_id);
    } else if (filter === 'unassigned') {
      if (aptJobsQuery) aptJobsQuery = aptJobsQuery.is('assigned_staff_id', null);
      walkInQuery = walkInQuery.is('assigned_staff_id', null);
    }

    // Execute both queries in parallel
    const [aptResult, walkInResult] = await Promise.all([
      aptJobsQuery ?? Promise.resolve({ data: [], error: null }),
      walkInQuery,
    ]);

    if (aptResult.error) {
      console.error('Jobs list (appointment) error:', aptResult.error);
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
    if (walkInResult.error) {
      console.error('Jobs list (walk-in) error:', walkInResult.error);
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    // Merge and sort by created_at descending
    const allJobs = [...(aptResult.data ?? []), ...(walkInResult.data ?? [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Compute estimated_duration_minutes per job from services table
    // Fetch all active services once — map service ID → duration
    const allServiceIds = new Set<string>();
    for (const job of allJobs) {
      const services = (job.services || []) as { id: string }[];
      for (const svc of services) {
        if (svc.id) allServiceIds.add(svc.id);
      }
    }

    const durationMap = new Map<string, number>();
    if (allServiceIds.size > 0) {
      const { data: svcDurations } = await supabase
        .from('services')
        .select('id, base_duration_minutes')
        .in('id', Array.from(allServiceIds));
      for (const svc of svcDurations ?? []) {
        durationMap.set(svc.id, svc.base_duration_minutes || 60);
      }
    }

    const enrichedJobs = allJobs.map((job) => {
      const services = (job.services || []) as { id: string }[];
      const totalMinutes = services.reduce((sum, svc) => sum + (durationMap.get(svc.id) || 60), 0);
      return { ...job, estimated_duration_minutes: totalMinutes };
    });

    return NextResponse.json({ data: enrichedJobs });
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
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Permission check: pos.jobs.manage (covers walk-in creation)
    const canCreate = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.jobs.manage'
    );
    if (!canCreate) {
      return NextResponse.json(
        { error: 'You don\'t have permission to create walk-in jobs' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      customer_id,
      vehicle_id,
      assigned_staff_id: providedStaffId,
      services,
      estimated_pickup_at,
      quote_id,
      notes,
    } = body as {
      customer_id: string;
      vehicle_id?: string;
      assigned_staff_id?: string;
      services: JobServiceSnapshot[];
      estimated_pickup_at?: string;
      quote_id?: string;
      notes?: string;
    };

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    // Prevent duplicate job from same quote
    if (quote_id) {
      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('quote_id', quote_id)
        .maybeSingle();

      if (existingJob) {
        return NextResponse.json(
          { error: 'A job has already been created from this quote' },
          { status: 409 }
        );
      }
    }

    // Auto-assign detailer if none provided (walk-in)
    let assignedStaffId = providedStaffId || null;
    const now = new Date();
    const pstDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const pstTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    if (!assignedStaffId) {
      const estimatedEnd = addMinutesToTime(pstTime, 60);
      assignedStaffId = await findAvailableDetailer(supabase, pstDate, pstTime, estimatedEnd);
    }

    // Compute estimated_pickup_at for timeline placement.
    // Use caller-provided value, or default to now rounded UP to the next 15-min slot
    // so the timeline displays a clean slot (e.g., 23:07 → 23:15) rather than an
    // arbitrary minute. The helper handles the midnight wrap by advancing the date.
    let pickupAt = estimated_pickup_at || null;
    if (!pickupAt) {
      pickupAt = getNowPstRoundedTo15().iso;
    }

    // Phase 0a: eager appointment creation for walk-ins.
    // Every walk-in job now gets a synthetic appointments row with channel='walk_in'
    // so jobs.appointment_id is always non-null. Eliminates the IS NULL branch in
    // downstream consumers (receipt composer, refund plan, lifecycle engine, etc.).
    //
    // Times: scheduled_start_time uses the EXACT current PST time (HH:MM:SS) — no
    // 15-min rounding — because rounding can wrap past midnight (23:53 → 00:00 next
    // day) which would place the appointment on tomorrow's date and hide the new
    // walk-in from today's queue (Site 2 filters by scheduled_date=today). The
    // rounded value remains on jobs.estimated_pickup_at for clean timeline slots.
    const pstTimeExact = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
    const apptStartTime = pstTimeExact; // HH:MM:SS PST
    const apptEndTime = addMinutesToTime(apptStartTime.slice(0, 5), 60) + ':00';
    const servicesTotal = services.reduce((sum, s) => sum + Number(s.price || 0), 0);

    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        customer_id,
        vehicle_id: vehicle_id || null,
        employee_id: assignedStaffId,
        status: 'in_progress',
        channel: 'walk_in',
        scheduled_date: pstDate,
        scheduled_start_time: apptStartTime,
        scheduled_end_time: apptEndTime,
        is_mobile: false,
        mobile_zone_id: null,
        mobile_address: null,
        mobile_surcharge: 0,
        payment_status: 'pending',
        subtotal: servicesTotal,
        tax_amount: 0,
        discount_amount: 0,
        total_amount: servicesTotal,
        payment_type: 'pay_on_site',
        deposit_amount: null,
        job_notes: notes || null,
        internal_notes: null,
      })
      .select('id')
      .single();

    if (apptErr || !appointment) {
      console.error('Walk-in appointment create error:', apptErr);
      return NextResponse.json(
        { error: 'Failed to create walk-in appointment' },
        { status: 500 }
      );
    }

    // Mirror booked-appointment behavior: populate appointment_services rows.
    // Atomic with the appointment INSERT — failure rolls back the appointment
    // (CASCADE cleans any partial appointment_services rows) so we never
    // leave a synthetic appointment without its service join rows.
    const apptServiceRows = services.map((s) => ({
      appointment_id: appointment.id,
      service_id: s.id,
      price_at_booking: s.price,
      tier_name: null,
    }));
    if (apptServiceRows.length > 0) {
      const { error: svcErr } = await supabase
        .from('appointment_services')
        .insert(apptServiceRows);
      if (svcErr) {
        // Rollback: delete the synthetic appointment (ON DELETE CASCADE
        // on appointment_services.appointment_id handles partial rows).
        await supabase.from('appointments').delete().eq('id', appointment.id);
        console.error(
          '[POS jobs POST] appointment_services insert failed; rolled back appointment:',
          svcErr.message
        );
        return NextResponse.json(
          { error: 'Failed to link services to appointment' },
          { status: 500 }
        );
      }
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        customer_id,
        vehicle_id: vehicle_id || null,
        assigned_staff_id: assignedStaffId,
        appointment_id: appointment.id,
        services,
        status: 'scheduled',
        estimated_pickup_at: pickupAt,
        created_by: posEmployee.employee_id,
        quote_id: quote_id || null,
        intake_notes: notes || null,
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
      // Roll back the synthetic appointment to avoid orphans.
      // ON DELETE CASCADE on appointment_services.appointment_id cleans the join rows.
      await supabase.from('appointments').delete().eq('id', appointment.id);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    const customerName = job.customer
      ? `Job for ${job.customer.first_name} ${job.customer.last_name}`
      : `Job #${job.id.slice(0, 8)}`;

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'create',
      entityType: 'job',
      entityId: job.id,
      entityLabel: customerName,
      details: { services_count: services.length, customer_id },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: job }, { status: 201 });
  } catch (err) {
    console.error('Job create route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
