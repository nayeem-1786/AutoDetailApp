import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getBusinessInfo } from '@/lib/data/business';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';

const CANCELLABLE_EARLY = ['scheduled', 'intake'];
const CANCELLABLE_LATE = ['in_progress', 'pending_approval'];
const ADMIN_ROLES = ['super_admin', 'admin'];

/**
 * POST /api/pos/jobs/[id]/cancel — Cancel a job
 * Body: { reason: string, notify_method?: 'email' | 'sms' | 'both' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { reason, notify_method } = body as {
      reason: string;
      notify_method?: 'email' | 'sms' | 'both';
    };

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        { error: 'Cancellation reason is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch the job with customer and appointment info
    const { data: job, error: fetchErr } = await supabase
      .from('jobs')
      .select(`
        id, status, appointment_id,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email)
      `)
      .eq('id', id)
      .single();

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Check if job can be cancelled
    const isEarly = CANCELLABLE_EARLY.includes(job.status);
    const isLate = CANCELLABLE_LATE.includes(job.status);

    if (!isEarly && !isLate) {
      return NextResponse.json(
        { error: `Cannot cancel a job that is ${job.status}` },
        { status: 400 }
      );
    }

    // Permission check
    if (isLate) {
      // in_progress+ requires admin role (not grantable via permissions)
      if (!ADMIN_ROLES.includes(posEmployee.role)) {
        return NextResponse.json(
          { error: 'Only a manager can cancel in-progress jobs' },
          { status: 403 }
        );
      }
    } else {
      // scheduled/intake: check pos.jobs.cancel permission
      const canCancel = await checkPosPermission(
        supabase,
        posEmployee.role,
        posEmployee.employee_id,
        'pos.jobs.cancel'
      );
      if (!canCancel) {
        return NextResponse.json(
          { error: 'You don\'t have permission to cancel jobs' },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    // Cancel the job
    const { data: updatedJob, error: updateErr } = await supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        cancellation_reason: reason.trim(),
        cancelled_at: now,
        cancelled_by: posEmployee.employee_id,
        updated_at: now,
      })
      .eq('id', id)
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name)
      `)
      .single();

    if (updateErr) {
      console.error('Job cancel update error:', updateErr);
      return NextResponse.json(
        { error: 'Failed to cancel job' },
        { status: 500 }
      );
    }

    // If appointment-based, cancel the linked appointment and send notification
    let notified = false;
    const sentVia: string[] = [];

    if (job.appointment_id) {
      // Cancel linked appointment (frees the time slot)
      await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: reason.trim(),
          updated_at: now,
        })
        .eq('id', job.appointment_id);

      // Send notification if requested
      if (notify_method) {
        const customer = job.customer as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
        } | null;

        if (customer) {
          // Fetch appointment details for notification
          const { data: appointment } = await supabase
            .from('appointments')
            .select(`
              scheduled_date, scheduled_start_time,
              services:appointment_services(
                service:services!appointment_services_service_id_fkey(name)
              )
            `)
            .eq('id', job.appointment_id)
            .single();

          if (appointment) {
            const business = await getBusinessInfo();

            // Format date and time
            const dateStr = new Date(
              appointment.scheduled_date + 'T00:00:00'
            ).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            const timeStr = appointment.scheduled_start_time?.slice(0, 5) || '';
            const [h, m] = timeStr.split(':').map(Number);
            const period = h >= 12 ? 'PM' : 'AM';
            const displayHour = h % 12 || 12;
            const displayTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

            const services = (
              appointment.services as unknown as {
                service: { name: string } | null;
              }[]
            ) ?? [];
            const serviceNames = services
              .map((s) => s.service?.name || 'Service')
              .join(', ');

            const shouldSms =
              notify_method === 'sms' || notify_method === 'both';
            const shouldEmail =
              notify_method === 'email' || notify_method === 'both';

            // Send SMS
            if (shouldSms && customer.phone) {
              const smsBody =
                `Hi ${customer.first_name}, your ${serviceNames} appointment on ${dateStr} at ${displayTime} has been cancelled. ` +
                `Please contact us to reschedule. - ${business.name} ${business.phone}`;

              const smsResult = await sendSms(customer.phone, smsBody);
              if (smsResult.success) sentVia.push('sms');
            }

            // Send Email
            if (shouldEmail && customer.email) {
              const subject = `Appointment Cancelled \u2014 ${business.name}`;

              const textBody =
                `Appointment Cancellation from ${business.name}\n\n` +
                `Hi ${customer.first_name},\n\n` +
                `Your appointment has been cancelled.\n\n` +
                `Service: ${serviceNames}\n` +
                `Date: ${dateStr}\n` +
                `Time: ${displayTime}\n\n` +
                `If you\u2019d like to reschedule, please call us at ${business.phone} or book online at ${business.website}.\n\n` +
                `We apologize for any inconvenience.\n\n` +
                `${business.name}\n${business.address}`;

              const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; }
      .email-info-box { background-color: #1a1a2e !important; }
      .email-text { color: #e2e8f0 !important; }
      .email-text-muted { color: #94a3b8 !important; }
      .email-footer { background-color: #1a1a2e !important; }
      .email-footer-text { color: #64748b !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color-scheme: light dark;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div class="email-card" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background-color: #dc2626; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${business.name}</h1>
        <p style="margin: 8px 0 0; color: #fecaca; font-size: 14px;">Appointment Cancellation</p>
      </div>
      <div style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 class="email-text" style="margin: 0 0 8px; color: #1e3a5f; font-size: 20px;">Your Appointment Has Been Cancelled</h2>
          <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px;">Hi ${customer.first_name}, we\u2019re writing to let you know your appointment has been cancelled.</p>
        </div>
        <div class="email-info-box" style="background-color: #fef2f2; border-radius: 6px; padding: 16px; margin-bottom: 24px; border-left: 4px solid #dc2626;">
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Service:</strong> ${serviceNames}</p>
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Date:</strong> ${dateStr}</p>
          <p class="email-text" style="margin: 0; font-size: 14px;"><strong>Time:</strong> ${displayTime}</p>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${business.website}/book" style="display: inline-block; background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">Rebook Appointment</a>
        </div>
        <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
          Questions? Call us at <a href="tel:${business.phone}" style="color: #1e3a5f;">${business.phone}</a>
        </p>
      </div>
      <div class="email-footer" style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p class="email-footer-text" style="margin: 0; color: #9ca3af; font-size: 12px;">We apologize for any inconvenience. \u2014 ${business.name}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

              const emailResult = await sendEmail(
                customer.email,
                subject,
                textBody,
                htmlBody
              );
              if (emailResult.success) sentVia.push('email');
            }

            notified = sentVia.length > 0;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedJob,
      notified,
      sent_via: sentVia,
    });
  } catch (err) {
    console.error('Job cancel route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
