import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentCancelSchema } from '@/lib/utils/validation';
import { fireWebhook } from '@/lib/utils/webhook';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendCancellationNotifications } from '@/lib/email/send-cancellation-email';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

const TERMINAL_STATUSES = ['completed', 'cancelled'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.cancel');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const parsed = appointmentCancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Permission check: setting a cancellation fee requires appointments.waive_fee
    if (data.cancellation_fee !== undefined && data.cancellation_fee !== null) {
      const feeDenied = await requirePermission(employee.id, 'appointments.waive_fee');
      if (feeDenied) return feeDenied;
    }

    const supabase = createAdminClient();

    // Fetch current appointment
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Guard terminal states
    if (TERMINAL_STATUSES.includes(current.status)) {
      return NextResponse.json(
        { error: `Cannot cancel an appointment that is already ${current.status}` },
        { status: 400 }
      );
    }

    // Only persist fee if cancellation_fee flag is enabled
    const feeEnabled = await isFeatureEnabled(FEATURE_FLAGS.CANCELLATION_FEE);
    const fee = feeEnabled ? (data.cancellation_fee ?? null) : null;

    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: data.cancellation_reason,
        cancellation_fee: fee,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, status')
      .single();

    if (updateErr) {
      console.error('Appointment cancel failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to cancel appointment' },
        { status: 500 }
      );
    }

    // Send cancellation notifications — email + SMS (non-blocking)
    sendCancellationNotifications(id, data.cancellation_reason).catch(err =>
      console.error('Cancellation notifications failed (non-blocking):', err)
    );

    // Fire cancellation webhook
    fireWebhook('appointment_cancelled', {
      event: 'appointment.cancelled',
      timestamp: new Date().toISOString(),
      appointment: {
        id,
        cancellation_reason: data.cancellation_reason,
        cancellation_fee: fee,
      },
    }, supabase).catch(err => console.error('Webhook fire failed:', err));

    // --- Waitlist notification on cancellation ---
    // Check if waitlist feature is enabled
    const waitlistEnabled = await isFeatureEnabled(FEATURE_FLAGS.WAITLIST);

    if (waitlistEnabled) {
      // Get the cancelled appointment's services and date
      const { data: apptServices } = await supabase
        .from('appointment_services')
        .select('service_id')
        .eq('appointment_id', id);

      const { data: apptDetail } = await supabase
        .from('appointments')
        .select('scheduled_date')
        .eq('id', id)
        .single();

      if (apptServices && apptDetail) {
        const serviceIds = apptServices.map((s: { service_id: string }) => s.service_id);

        // Find waitlist entries matching any of these services + date (or no date preference).
        // service:services!service_id(name) is added for the per-row SMS template render
        // (Session 1.8); customer phone/name fields stay for SMS dispatch.
        const { data: waitlistMatches } = await supabase
          .from('waitlist_entries')
          .select('id, customer_id, service_id, customer:customers!customer_id(first_name, last_name, phone), service:services!service_id(name)')
          .in('service_id', serviceIds)
          .eq('status', 'waiting')
          .or(`preferred_date.eq.${apptDetail.scheduled_date},preferred_date.is.null`);

        // Auto-notify matching waitlist entries (update status, dispatch SMS)
        if (waitlistMatches && waitlistMatches.length > 0) {
          // Format the slot date once — matches /api/appointments/[id]/notify pattern.
          const slotDateStr = new Date(apptDetail.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          });

          // PostgREST infers many-to-one for waitlist_entries.customer_id (FK to PK)
          // and waitlist_entries.service_id (FK to PK) — embeds resolve to a single
          // object at runtime, NOT an array, despite database.types.ts generating an
          // array shape. See CLAUDE.md "Supabase relation cardinality" — the
          // `as unknown as` cast follows the canonical asRelationArray pattern at the
          // point of use (each row's customer/service is consumed once below).
          type WaitlistRow = {
            id: string;
            customer_id: string;
            service_id: string;
            customer: { first_name: string | null; last_name: string | null; phone: string | null } | null;
            service: { name: string | null } | null;
          };

          for (const entry of waitlistMatches as unknown as WaitlistRow[]) {
            await supabase
              .from('waitlist_entries')
              .update({ status: 'notified', notified_at: new Date().toISOString() })
              .eq('id', entry.id);

            // Session 1.8 — direct SMS dispatch (mirrors pos/jobs/[id]/complete:243-262).
            // Replaces the pre-1.8 `fireWebhook('appointment_cancelled', { waitlist_notified })`
            // call which was a customer-facing silent-drop bug — no n8n receiver is wired in
            // prod (per webhook receivers identity audit f5e714a8), so waitlisted customers
            // were marked `notified` in DB but never received the SMS.
            const phone = entry.customer?.phone;
            const serviceName = entry.service?.name ?? 'your requested service';
            if (phone) {
              const firstName = entry.customer?.first_name ?? undefined;
              const smsFallback = `Hi ${firstName ?? 'there'}, good news — a spot just opened for ${serviceName} on ${slotDateStr}! Reply or call to book.`;
              const smsResult = await renderSmsTemplate('waitlist_slot_available', {
                service_name: serviceName,
                appointment_date: slotDateStr,
                first_name: firstName,
                last_name: entry.customer?.last_name ?? undefined,
              }, smsFallback);

              if (smsResult.isActive) {
                await sendSms(phone, smsResult.body, {
                  logToConversation: true,
                  customerId: entry.customer_id,
                  notificationType: 'waitlist_slot_available',
                  contextId: id,
                });
              }
            }
          }

          // Forward-compat webhook fire — kept per Session 1.8 prompt for future external
          // receivers. Currently a silent no-op in prod (audit f5e714a8 confirmed no
          // receiver is wired). The direct sendSms loop above is the actual notification
          // channel; this is belt-and-suspenders for the day a receiver gets wired.
          fireWebhook('appointment_cancelled', {
            appointment_id: id,
            date: apptDetail.scheduled_date,
            waitlist_notified: waitlistMatches.map((w: { id: string; customer_id: string; service_id: string }) => ({
              id: w.id,
              customer_id: w.customer_id,
              service_id: w.service_id,
            })),
          }, supabase).catch((err) =>
            console.error('Waitlist notification webhook failed:', err)
          );
        }
      }
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'delete',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: { reason: data.cancellation_reason || null, cancellation_fee: fee },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('Appointment cancel error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
