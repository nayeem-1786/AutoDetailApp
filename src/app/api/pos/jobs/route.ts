import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { findAvailableDetailer, addMinutesToTime } from '@/lib/utils/assign-detailer';
import { dateToPstStartOfDay, dateToPstEndOfDay, getNowPstRoundedTo15, getTodayPst } from '@/lib/utils/pst-date';
import type { JobServiceSnapshot } from '@/lib/supabase/types';
import { getRequestIp } from '@/lib/services/audit';
import { resolveMobileAddressAction } from '@/lib/utils/mobile-address-action';
import { generateAppointmentNumber } from '@/lib/utils/appointment-number';
import { materializeJobFromAppointment } from '@/lib/appointments/lifecycle-sync';
import type { PosUnstartedAppointment } from '@/app/pos/jobs/components/schedule-types';

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

    // Session 2.4 (AC-7) — terminal-state opt-in. When `include_terminal=true`
    // the jobs query stops excluding `cancelled` AND the un-started query
    // expands to surface terminal-state appointments for today (cancelled /
    // completed / no_show). Default behavior (no param) is unchanged: cancelled
    // jobs hidden, only confirmed/in_progress un-started apps surfaced.
    const includeTerminalRaw = searchParams.get('include_terminal');
    const includeTerminal = includeTerminalRaw === 'true' || includeTerminalRaw === '1';

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
    // Only exclude cancelled — include closed for daily summary + list visibility.
    // Session 2.4 (AC-7): when `include_terminal=true`, the operator opts in to
    // see cancelled jobs too; the exclusion list collapses to empty.
    const excludeStatuses = includeTerminal ? [] : ['cancelled'];

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
      : null;
    if (aptJobsQuery && excludeStatuses.length > 0) {
      aptJobsQuery = aptJobsQuery.not('status', 'in', `(${excludeStatuses.join(',')})`);
    }

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
      .gte('created_at', startUtc!)
      .lte('created_at', endUtc!);
    if (excludeStatuses.length > 0) {
      walkInQuery = walkInQuery.not('status', 'in', `(${excludeStatuses.join(',')})`);
    }

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

    // ── Session 2.2 (AC-3 second half) — un-started appointments ──────────────
    // Today scope ALSO surfaces confirmed/in_progress appointments for TODAY
    // that have not yet been materialized into a job. The operator presses
    // Start Intake on these cards to invoke the Session 2.1 materialization
    // endpoint. Only returned when `targetDate === today_pst` (past dates are
    // historical review; future dates belong to the Schedule scope).
    //
    // Filter parity with the jobs query above: `mine` → assigned to me,
    // `unassigned` → employee_id IS NULL, `all` → no filter. Mirrors the
    // staff-filter switch at :82-88.
    const todayPst = getTodayPst();
    let unstartedAppointments: PosUnstartedAppointment[] = [];
    if (targetDate === todayPst) {
      // Step 1: candidate appointments for today, in materialization-eligible
      // statuses (mirrors `populate/route.ts:65` exactly — confirmed +
      // in_progress; pending requires confirmation; terminal states excluded).
      // Session 2.4 (AC-7): when `include_terminal=true`, the operator opts in
      // to see today's terminal-state un-started appointments (cancelled,
      // completed, no_show) — useful for review/recovery action. Pending stays
      // excluded because it never reaches "un-started" semantics on Today
      // scope (un-confirmed appointments don't surface as actionable here).
      const unstartedStatuses = includeTerminal
        ? ['confirmed', 'in_progress', 'cancelled', 'completed', 'no_show']
        : ['confirmed', 'in_progress'];
      let unstartedQuery = supabase
        .from('appointments')
        .select(`
          id,
          scheduled_date,
          scheduled_start_time,
          scheduled_end_time,
          status,
          channel,
          total_amount,
          deposit_amount,
          customer:customers!customer_id(id, first_name, last_name, phone, email),
          vehicle:vehicles!vehicle_id(id, year, make, model, color),
          detailer:employees!employee_id(id, first_name, last_name),
          appointment_services(id, service_id, price_at_booking, tier_name, quantity, service:services!service_id(id, name))
        `)
        .eq('scheduled_date', todayPst)
        .in('status', unstartedStatuses)
        .order('scheduled_start_time');

      if (filter === 'mine') {
        unstartedQuery = unstartedQuery.eq('employee_id', posEmployee.employee_id);
      } else if (filter === 'unassigned') {
        unstartedQuery = unstartedQuery.is('employee_id', null);
      }

      const { data: candidateApts, error: candidateErr } = await unstartedQuery;
      if (candidateErr) {
        console.error('Unstarted appointments fetch error:', candidateErr.message);
        // Non-fatal — the existing jobs payload still ships; an empty
        // un-started array is a clean degraded state. The 5xx path is reserved
        // for jobs-list failures (the operator's primary work surface).
      } else if (candidateApts && candidateApts.length > 0) {
        // Step 2: drop candidates that already have a materialized job (the
        // dedup mirrors `populate/route.ts:76-90` and `schedule/route.ts:131-141`).
        // jobs.appointment_id is UNIQUE so a single SELECT covers all dedup.
        const candidateIds = candidateApts.map((a) => a.id);
        const { data: existingJobs } = await supabase
          .from('jobs')
          .select('appointment_id')
          .in('appointment_id', candidateIds);
        const materialized = new Set(
          (existingJobs ?? []).map((j) => (j as { appointment_id: string }).appointment_id)
        );

        const rawUnstartedRows = candidateApts as unknown as Array<UnstartedRawRow>;
        unstartedAppointments = rawUnstartedRows
          .filter((a) => !materialized.has(a.id))
          .map((a) => ({
            id: a.id,
            scheduled_date: a.scheduled_date,
            scheduled_start_time: a.scheduled_start_time,
            scheduled_end_time: a.scheduled_end_time ?? null,
            status: a.status,
            channel: a.channel,
            customer: a.customer ?? null,
            vehicle: a.vehicle ?? null,
            detailer: a.detailer ?? null,
            appointment_services: (a.appointment_services ?? []).map((s) => ({
              id: s.id,
              service_id: s.service_id,
              price_at_booking: Number(s.price_at_booking ?? 0),
              tier_name: s.tier_name ?? null,
              quantity: Number(s.quantity ?? 1),
              service: s.service ?? null,
            })),
            total_amount: Number(a.total_amount ?? 0),
            deposit_amount: a.deposit_amount == null ? null : Number(a.deposit_amount),
            scope: 'today_unstarted' as const,
          }));
      }
    }

    return NextResponse.json({
      data: enrichedJobs,
      unstarted_appointments: unstartedAppointments,
    });
  } catch (err) {
    console.error('Jobs list route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Session 2.2 — raw row shape for the un-started appointment query (mirrors
 * `schedule/route.ts`'s `RawScheduleRow` pattern: Supabase embed cardinality
 * is to-one for the joined FKs at runtime; the cast keeps the mapping
 * tsc-clean).
 */
interface UnstartedRawRow {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  status: PosUnstartedAppointment['status'];
  channel: PosUnstartedAppointment['channel'];
  total_amount: number | string | null;
  deposit_amount: number | string | null;
  customer: PosUnstartedAppointment['customer'];
  vehicle: PosUnstartedAppointment['vehicle'];
  detailer: PosUnstartedAppointment['detailer'];
  appointment_services: Array<{
    id: string;
    service_id: string;
    price_at_booking: number | string | null;
    tier_name: string | null;
    quantity: number | string | null;
    service: { id: string; name: string } | null;
  }> | null;
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
      is_mobile: rawIsMobile,
      mobile_zone_id: rawMobileZoneId,
      mobile_address: rawMobileAddress,
      mobile_surcharge: rawMobileSurcharge,
      mobile_zone_name_snapshot: rawMobileLabel,
      is_custom: rawIsCustom,
      // Item 15g Layer 15g-ii — modifier snapshot from the quote → POS
      // walk-in path. quote-ticket-panel's handleCreateJob forwards these
      // alongside services + mobile fields. All optional + nullable for
      // backward compatibility with older clients / true walk-ins that
      // never applied a modifier.
      coupon_code: rawCouponCode,
      coupon_discount: rawCouponDiscount,
      loyalty_points_to_redeem: rawLoyaltyPoints,
      loyalty_discount: rawLoyaltyDiscount,
      manual_discount_type: rawManualType,
      manual_discount_value: rawManualValue,
      manual_discount_label: rawManualLabel,
    } = body as {
      customer_id: string;
      vehicle_id?: string;
      assigned_staff_id?: string;
      services: JobServiceSnapshot[];
      estimated_pickup_at?: string;
      quote_id?: string;
      notes?: string;
      is_mobile?: boolean;
      mobile_zone_id?: string | null;
      mobile_address?: string | null;
      mobile_surcharge?: number;
      mobile_zone_name_snapshot?: string | null;
      // Phase Mobile-1.2: client-supplied "Custom path" disambiguator. When
      // mobile_zone_id is null, this distinguishes "no zone selected yet"
      // (false) from "cashier chose Custom" (true). Optional + defaults to
      // false for backward compat with older clients.
      is_custom?: boolean;
      coupon_code?: string | null;
      coupon_discount?: number | null;
      loyalty_points_to_redeem?: number | null;
      loyalty_discount?: number | null;
      manual_discount_type?: 'dollar' | 'percent' | null;
      manual_discount_value?: number | null;
      manual_discount_label?: string | null;
    };

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    if (!services || !Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: 'At least one service is required' }, { status: 400 });
    }

    // Walk-in mobile resolution. Two paths (LOCKED-3):
    //   Zone path:   mobile_zone_id present → server re-fetches zone, validates
    //                client-supplied surcharge matches, snapshots zone name.
    //   Custom path: mobile_zone_id null → cashier override, trust staff-supplied
    //                surcharge (bounded 0 < x <= 500) and label (defaults to "Custom").
    const isMobile = rawIsMobile === true;
    let mobileZoneId: string | null = null;
    let mobileSurcharge = 0;
    let mobileZoneNameSnapshot: string | null = null;
    let mobileAddress: string | null = null;
    if (isMobile) {
      const address = (rawMobileAddress ?? '').trim();
      if (!address) {
        return NextResponse.json(
          { error: 'Address is required for mobile service' },
          { status: 400 }
        );
      }
      mobileAddress = address.slice(0, 200);

      if (rawMobileZoneId) {
        const { data: zone, error: zoneErr } = await supabase
          .from('mobile_zones')
          .select('id, name, surcharge, is_available')
          .eq('id', rawMobileZoneId)
          .single();
        if (zoneErr || !zone) {
          return NextResponse.json({ error: 'Invalid mobile zone' }, { status: 400 });
        }
        if (!zone.is_available) {
          return NextResponse.json({ error: 'Mobile zone is not available' }, { status: 400 });
        }
        const clientSurcharge = Number(rawMobileSurcharge ?? 0);
        if (Math.abs(Number(zone.surcharge) - clientSurcharge) > 0.01) {
          return NextResponse.json(
            { error: 'Mobile surcharge mismatch — please refresh and try again' },
            { status: 400 }
          );
        }
        mobileZoneId = zone.id;
        mobileSurcharge = Number(zone.surcharge);
        mobileZoneNameSnapshot = zone.name;
      } else if (rawIsCustom === true) {
        // Custom path: cashier explicitly chose "Custom…" — validate the
        // staff-supplied surcharge as a positive number bounded at $500.
        const customAmount = Number(rawMobileSurcharge ?? 0);
        if (!(customAmount > 0) || customAmount > 500) {
          return NextResponse.json(
            { error: 'Enter a custom fee between $1 and $500' },
            { status: 400 }
          );
        }
        mobileSurcharge = Math.round(customAmount * 100) / 100;
        const customLabel = (rawMobileLabel ?? '').trim().slice(0, 100);
        mobileZoneNameSnapshot = customLabel || 'Custom';
      } else {
        // No zone selected at all (placeholder still showing).
        return NextResponse.json(
          { error: 'Please select a service area for the mobile fee' },
          { status: 400 }
        );
      }
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
    // Times: scheduled_start_time stores MINUTE precision (HH:MM:00). Originally
    // this path captured seconds (HH:MM:SS) to avoid the midnight-wrap issue with
    // 15-min rounding (23:53 → 00:00 next day → wrong date), but the HTML5
    // `<input type="time">` step=60 validator rejects seconds-precise values,
    // which broke the Admin Appointment dialog edit form on walk-in rows
    // (Layer 8e UAT finding). Minute precision avoids both pitfalls: no
    // 15-min rounding (date stays on today), no seconds (admin input accepts).
    // Intake start/stop (`actual_start_time`/`actual_end_time`) keep seconds.
    const apptStartTime =
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now) + ':00';
    const apptEndTime = addMinutesToTime(apptStartTime.slice(0, 5), 60) + ':00';
    const servicesTotal = services.reduce((sum, s) => sum + Number(s.price || 0), 0);
    const appointmentSubtotal = servicesTotal + mobileSurcharge;

    // Item 15g Layer 15g-ii — modifier snapshot for the synthetic walk-in
    // appointment. quote-ticket-panel's handleCreateJob forwards these from
    // the converted quote so the appointment carries the same loyalty +
    // manual-discount + coupon snapshot the operator saw at quote time.
    // A pure walk-in (no quote bridge) sends all null and the appointment
    // gets safe defaults (0 / NULL).
    const couponDiscount = Number(rawCouponDiscount ?? 0) || 0;
    const loyaltyPoints = Number(rawLoyaltyPoints ?? 0) || 0;
    const loyaltyDiscount = Number(rawLoyaltyDiscount ?? 0) || 0;
    const manualDiscountValue = resolveManualDiscountAmount(
      rawManualType ?? null,
      Number(rawManualValue ?? 0) || null,
      appointmentSubtotal
    );
    const manualDiscountLabel = (rawManualLabel ?? null)?.toString().trim() || null;
    const totalDiscount = couponDiscount + loyaltyDiscount + (manualDiscountValue ?? 0);
    const appointmentTotal = Math.max(0, appointmentSubtotal - totalDiscount);

    // Phase 3 Theme A (AC-10 v1.4): appointment_number is NOT NULL — generate
    // it before the INSERT so the row can satisfy the constraint. The atomic
    // appointment + job pair (this route's walk-in semantic) still commits
    // together; if a downstream step fails the appointment is rolled back,
    // and the counter advance leaves a gap (accepted per AC-10 race-safety).
    const appointmentNumber = await generateAppointmentNumber(supabase);
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        appointment_number: appointmentNumber,
        customer_id,
        vehicle_id: vehicle_id || null,
        employee_id: assignedStaffId,
        status: 'in_progress',
        channel: 'walk_in',
        scheduled_date: pstDate,
        scheduled_start_time: apptStartTime,
        scheduled_end_time: apptEndTime,
        is_mobile: isMobile,
        mobile_zone_id: mobileZoneId,
        mobile_address: mobileAddress,
        mobile_surcharge: mobileSurcharge,
        mobile_zone_name_snapshot: mobileZoneNameSnapshot,
        payment_status: 'pending',
        subtotal: appointmentSubtotal,
        tax_amount: 0,
        discount_amount: totalDiscount,
        total_amount: appointmentTotal,
        payment_type: 'pay_on_site',
        deposit_amount: null,
        job_notes: notes || null,
        internal_notes: null,
        coupon_code: rawCouponCode ?? null,
        coupon_discount: couponDiscount || null,
        loyalty_points_redeemed: loyaltyPoints,
        loyalty_discount: loyaltyDiscount,
        manual_discount_value: manualDiscountValue,
        manual_discount_label: manualDiscountValue !== null ? manualDiscountLabel : null,
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

    // Session 2.1.1 (Memory #29 closure) — route the walk-in's job-creation
    // step through the shared `materializeJobFromAppointment` helper rather
    // than the inline jobs.insert(...) + logAudit(...) pair that lived here
    // pre-2.1.1. `trigger: 'walk_in'` differentiates the initial job state
    // (status='scheduled', NULL work_started_at/intake_started_at) from
    // Start Intake's. The helper appends the mobile-fee entry from the
    // appointment row (uniform behavior across both triggers); walk-in
    // passes the base services snapshot via `servicesSnapshot` to bypass the
    // appointment_services + services join (we already have the rows in
    // memory from the request body). Gates pass naturally: the just-INSERTed
    // appointment is on today's date (future-date gate) and in 'in_progress'
    // state (status gate). Audit is emitted inside the helper with
    // trigger='walk_in' + customer_id + services_count in details.
    const materializeResult = await materializeJobFromAppointment(
      supabase,
      appointment.id,
      {
        trigger: 'walk_in',
        actor: {
          userId: posEmployee.auth_user_id,
          userEmail: posEmployee.email,
          employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
          employeeId: posEmployee.employee_id,
        },
        source: 'pos',
        ipAddress: getRequestIp(request),
        quoteId: quote_id || null,
        intakeNotes: notes || null,
        estimatedPickupAtOverride: pickupAt,
        servicesSnapshot: services,
      }
    );

    if (!materializeResult.ok || !materializeResult.jobId) {
      // Roll back the synthetic appointment to avoid orphans.
      // ON DELETE CASCADE on appointment_services.appointment_id cleans the
      // join rows the appointment_services INSERT above committed.
      console.error(
        'Walk-in job materialize failed:',
        materializeResult.error
      );
      await supabase.from('appointments').delete().eq('id', appointment.id);
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: materializeResult.httpStatus }
      );
    }

    // The helper returns only the new job id — fetch the row with the joins
    // the POS client expects in the create-response shape (customer,
    // vehicle, assigned_staff). A failure here leaves the job intact (no
    // rollback): the row is fully consistent in the DB; only the
    // response-shape SELECT failed. Client retries the list endpoint.
    const { data: job, error: jobFetchErr } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
      `)
      .eq('id', materializeResult.jobId)
      .single();

    if (jobFetchErr || !job) {
      console.error('Walk-in job response fetch failed:', jobFetchErr);
      return NextResponse.json(
        { error: 'Failed to fetch job after create' },
        { status: 500 }
      );
    }

    // Phase 3 Theme F (F.2) — unify the FK semantics across the two
    // conversion seams. Pre-F.2 the walk-in seam left
    // `quotes.converted_appointment_id = NULL` even when a job had been
    // created from the quote (audit `dcf511df` finding F.2); the
    // canonical convertQuote seam writes this column post-INSERT, so the
    // asymmetry meant a quote's converted state was discoverable via
    // jobs.quote_id only on the walk-in path and via
    // quotes.converted_appointment_id only on the canonical path. Closing
    // the asymmetry here also feeds the F.7 race guard on the OTHER seam:
    // a subsequent convertQuote() call now sees converted_appointment_id
    // set by this walk-in and short-circuits to its idempotent return
    // path (returning this walk-in's appointment) rather than creating a
    // duplicate appointment row. The `.is('converted_appointment_id',
    // null)` filter mirrors convertQuote's second-arm race guard — if
    // the canonical path raced ahead of us, we no-op rather than
    // overwrite. Best-effort: a UPDATE failure leaves the walk-in
    // intact and surfaces via console; the client retry path doesn't
    // need to know.
    if (quote_id) {
      const { error: linkErr } = await supabase
        .from('quotes')
        .update({
          status: 'converted',
          converted_appointment_id: appointment.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quote_id)
        .is('converted_appointment_id', null);
      if (linkErr) {
        console.error(
          'Walk-in quote linkage failed (non-fatal):',
          linkErr.message
        );
      }
    }

    // Phase Mobile-1.1: compute save-to-customer action.
    // Returns null when mobile is off / no customer / empty address.
    // Performs silent-save UPDATE atomically when customer has no existing
    // profile address. Diff-only outcomes return non-null with diff=true
    // and the client surfaces the conflict prompt.
    const mobile_address_action = await resolveMobileAddressAction(supabase, {
      customerId: customer_id,
      isMobile,
      enteredAddress: mobileAddress,
    });

    return NextResponse.json(
      { data: job, mobile_address_action },
      { status: 201 }
    );
  } catch (err) {
    console.error('Job create route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Item 15g Layer 15g-ii — resolve the manual-discount dollar amount from
 * a (type, value, subtotal) triple. Mirrors `convert-service.ts` and the
 * client-side reducer math so the synthetic walk-in appointment receives
 * the same dollar value the cashier saw at quote / register time.
 */
function resolveManualDiscountAmount(
  type: 'dollar' | 'percent' | null | undefined,
  value: number | null | undefined,
  subtotal: number
): number | null {
  if (!type || value == null || !(value > 0)) return null;
  if (type === 'dollar') {
    return Math.min(value, subtotal);
  }
  const pct = Math.min(value, 100);
  return Math.round(((subtotal * pct) / 100) * 100) / 100;
}
