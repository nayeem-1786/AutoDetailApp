import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import type { JobServiceSnapshot } from '@/lib/supabase/types';

/**
 * POST /api/pos/jobs/populate — Auto-populate jobs from today's confirmed appointments
 * Finds confirmed appointments for today that don't have corresponding job records
 * and creates scheduled jobs for them.
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get today's date in PST (YYYY-MM-DD format for DATE column comparison)
    const now = new Date();
    const pstFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayPst = pstFormatter.format(now); // e.g., "2026-02-12"

    // Get today's confirmed appointments
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select(`
        id,
        customer_id,
        vehicle_id,
        employee_id,
        scheduled_date,
        scheduled_end_time,
        status
      `)
      .eq('scheduled_date', todayPst)
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
        // Parse in PST context
        const dt = new Date(dateTimeStr + '-08:00'); // PST offset approximation
        if (!isNaN(dt.getTime())) {
          estimatedPickup = dt.toISOString();
        }
      }

      return {
        appointment_id: apt.id,
        customer_id: apt.customer_id,
        vehicle_id: apt.vehicle_id,
        assigned_staff_id: apt.employee_id,
        services: servicesByApt.get(apt.id) ?? [],
        status: 'scheduled' as const,
        estimated_pickup_at: estimatedPickup,
        created_by: posEmployee.employee_id,
      };
    });

    const { data: createdJobs, error: insertError } = await supabase
      .from('jobs')
      .insert(jobInserts)
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
