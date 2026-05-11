import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { pstStartOfDayLiteral } from '@/lib/utils/pst-date';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

/**
 * POST /api/pos/jobs/populate — Auto-populate jobs from today's confirmed appointments
 * Finds confirmed appointments for today that don't have corresponding job records
 * and creates scheduled jobs for them.
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Accept optional date from request body, default to today PST
    let dateParam: string | undefined;
    try {
      const body = await request.json();
      dateParam = body.date;
    } catch {
      // No body or invalid JSON — use today
    }

    const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());

    // Get target date's confirmed appointments
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        id,
        customer_id,
        vehicle_id,
        employee_id,
        scheduled_date,
        scheduled_end_time,
        status,
        is_mobile,
        mobile_surcharge,
        mobile_zone_name_snapshot
      `)
      .eq('scheduled_date', targetDate)
      .in('status', ['confirmed', 'in_progress']);

    if (aptError) {
      console.error('Appointments fetch error:', aptError);
      return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
    }

    if (!appointments || appointments.length === 0) {
      return NextResponse.json({ data: { created: 0, jobs: [] } });
    }

    // Get existing jobs for these appointments to avoid duplicates
    const appointmentIds = appointments.map((a) => a.id);
    const { data: existingJobs } = await supabase
      .from('jobs')
      .select('appointment_id')
      .in('appointment_id', appointmentIds);

    const existingAppointmentIds = new Set(
      (existingJobs ?? []).map((j) => j.appointment_id)
    );

    // Filter to only unmatched appointments
    const newAppointments = appointments.filter(
      (a) => !existingAppointmentIds.has(a.id)
    );

    if (newAppointments.length === 0) {
      return NextResponse.json({ data: { created: 0, jobs: [] } });
    }

    // Fetch appointment services for each new appointment
    const newAptIds = newAppointments.map((a) => a.id);
    const { data: aptServices } = await supabase
      .from('appointment_services')
      .select(`
        appointment_id,
        service_id,
        price_at_booking,
        service:services!appointment_services_service_id_fkey(id, name)
      `)
      .in('appointment_id', newAptIds);

    // Group services by appointment_id
    const servicesByApt = new Map<string, JobServiceSnapshot[]>();
    for (const svc of aptServices ?? []) {
      const aptId = svc.appointment_id;
      if (!servicesByApt.has(aptId)) {
        servicesByApt.set(aptId, []);
      }
      const service = svc.service as unknown as { id: string; name: string } | null;
      servicesByApt.get(aptId)!.push({
        id: svc.service_id,
        name: service?.name ?? 'Unknown Service',
        price: Number(svc.price_at_booking),
      });
    }

    // Build job records
    const jobInserts = newAppointments.map((apt) => {
      // Calculate estimated pickup from scheduled_end_time
      let estimatedPickup: string | null = null;
      if (apt.scheduled_end_time) {
        // scheduled_end_time is a TIME like "14:30:00", scheduled_date is a DATE
        const dateTimeStr = `${apt.scheduled_date}T${apt.scheduled_end_time}`;
        // Parse in PST/PDT context — extract correct offset for this date
        const offsetStr = pstStartOfDayLiteral(apt.scheduled_date).slice(-6); // e.g. "-08:00" or "-07:00"
        const dt = new Date(dateTimeStr + offsetStr);
        if (!isNaN(dt.getTime())) {
          estimatedPickup = dt.toISOString();
        }
      }

      // Append mobile entry to the services JSONB snapshot when the
      // appointment is mobile, so POS ticket UI renders the mobile line.
      const baseServices = servicesByApt.get(apt.id) ?? [];
      const mobileSurchargeNum = Number(apt.mobile_surcharge ?? 0);
      const services = apt.is_mobile && mobileSurchargeNum > 0
        ? [
            ...baseServices,
            {
              id: null,
              name: apt.mobile_zone_name_snapshot || 'Mobile Service Fee',
              price: mobileSurchargeNum,
              is_mobile_fee: true,
            } as JobServiceSnapshot,
          ]
        : baseServices;

      return {
        appointment_id: apt.id,
        customer_id: apt.customer_id,
        vehicle_id: apt.vehicle_id,
        assigned_staff_id: apt.employee_id,
        services,
        status: 'scheduled' as const,
        estimated_pickup_at: estimatedPickup,
        created_by: posEmployee.employee_id,
      };
    });

    // Use upsert with ignoreDuplicates to safely handle concurrent calls.
    // The UNIQUE constraint on appointment_id prevents duplicates at the DB level.
    // (Partial indexes don't work with Supabase .upsert() — full constraint required.)
    const { data: createdJobs, error: insertError } = await supabase
      .from('jobs')
      .upsert(jobInserts, { onConflict: 'appointment_id', ignoreDuplicates: true })
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
      `);

    if (insertError) {
      console.error('Jobs populate insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create jobs' }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        created: createdJobs?.length ?? 0,
        jobs: createdJobs ?? [],
      },
    });
  } catch (err) {
    console.error('Jobs populate route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
