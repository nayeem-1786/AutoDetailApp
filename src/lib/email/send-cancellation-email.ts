import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { sendTemplatedEmail } from './send-templated-email';
import { sendEmail } from '@/lib/utils/email';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { sendSms } from '@/lib/utils/sms';

interface CancellationNotificationResult {
  emailSent: boolean;
  smsSent: boolean;
  usedTemplate: boolean;
}

/**
 * Send cancellation notifications (email + SMS) for a cancelled appointment.
 *
 * Handles all data fetching internally — callers just pass the appointment ID.
 * - Email: tries DB template first, falls back to hardcoded HTML
 * - SMS: uses the `appointment_cancelled` SMS template
 * - Skips email if customer has no email (does NOT skip SMS)
 * - Skips SMS if customer has no phone (does NOT skip email)
 */
export async function sendCancellationNotifications(
  appointmentId: string,
  reason?: string
): Promise<CancellationNotificationResult> {
  const result: CancellationNotificationResult = {
    emailSent: false,
    smsSent: false,
    usedTemplate: false,
  };

  const supabase = createAdminClient();
  const business = await getBusinessInfo();

  const { data: appointment } = await supabase
    .from('appointments')
    .select(`
      id, scheduled_date, scheduled_start_time,
      customer:customers!inner(id, first_name, last_name, email, phone),
      services:appointment_services(service_id, service:services(name))
    `)
    .eq('id', appointmentId)
    .single();

  if (!appointment) return result;

  const customer = appointment.customer as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  if (!customer) return result;

  const serviceRows = (appointment.services || []) as unknown as {
    service_id: string;
    service: { name: string } | null;
  }[];
  const primaryServiceName = serviceRows[0]?.service?.name || 'Your service';
  const allServiceNames = serviceRows
    .map((s) => s.service?.name)
    .filter(Boolean)
    .join(', ') || 'Your service';

  // Format date
  const dateStr = new Date(appointment.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Format time with null safety — guard against null/empty/invalid before parsing
  const rawTime = appointment.scheduled_start_time;
  let displayTime = '';
  if (rawTime && typeof rawTime === 'string' && rawTime.includes(':')) {
    const timeStr = rawTime.slice(0, 5);
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h % 12 || 12;
      displayTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
    }
  }

  const bookingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/book`;
  const cancellationReason = reason || '';

  // --- Email ---
  if (customer.email) {
    try {
      const templated = await sendTemplatedEmail(customer.email, 'booking_cancellation', {
        first_name: customer.first_name,
        customer_name: `${customer.first_name} ${customer.last_name || ''}`.trim(),
        service_name: primaryServiceName,
        appointment_date: dateStr,
        appointment_time: displayTime,
        cancellation_reason: cancellationReason,
        business_name: business.name,
        business_phone: business.phone,
        booking_url: bookingUrl,
      });

      if (templated.usedTemplate && templated.success) {
        result.emailSent = true;
        result.usedTemplate = true;
      } else if (!templated.usedTemplate) {
        // Fallback: hardcoded HTML (same pattern as POS cancel route)
        const subject = `Appointment Cancelled \u2014 ${business.name}`;

        const textBody =
          `Appointment Cancellation from ${business.name}\n\n` +
          `Hi ${customer.first_name},\n\n` +
          `Your appointment has been cancelled.\n\n` +
          `Service: ${allServiceNames}\n` +
          `Date: ${dateStr}\n` +
          (displayTime ? `Time: ${displayTime}\n` : '') +
          `\nIf you\u2019d like to reschedule, please call us at ${business.phone} or book online at ${business.website}.\n\n` +
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
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Service:</strong> ${allServiceNames}</p>
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Date:</strong> ${dateStr}</p>
          ${displayTime ? `<p class="email-text" style="margin: 0; font-size: 14px;"><strong>Time:</strong> ${displayTime}</p>` : ''}
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${bookingUrl}" style="display: inline-block; background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">Rebook Appointment</a>
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

        const emailResult = await sendEmail(customer.email, subject, textBody, htmlBody);
        if (emailResult.success) result.emailSent = true;
      }
    } catch (e) {
      console.error('Cancellation email failed:', e);
    }
  }

  // --- SMS ---
  if (customer.phone) {
    try {
      const smsFallback =
        `Hi ${customer.first_name}, your ${allServiceNames} appointment on ${dateStr}` +
        (displayTime ? ` at ${displayTime}` : '') +
        ` has been cancelled. Please contact us to reschedule. - ${business.name} ${business.phone}`;

      const smsTemplateResult = await renderSmsTemplate('appointment_cancelled', {
        first_name: customer.first_name,
        services: allServiceNames,
        appointment_date: dateStr,
        appointment_time: displayTime,
        // Session 2D cheap-adds: last_name. Vehicle not loaded by this caller
        // — vehicle_description stays undefined.
        last_name: customer.last_name || undefined,
        vehicle_description: undefined,
      }, smsFallback);

      if (smsTemplateResult.isActive) {
        const smsResult = await sendSms(customer.phone, smsTemplateResult.body, {
          logToConversation: true,
          customerId: customer.id,
          notificationType: 'appointment_cancelled',
          contextId: appointmentId,
        });
        if (smsResult.success) result.smsSent = true;
      }
    } catch (e) {
      console.error('Cancellation SMS failed:', e);
    }
  }

  return result;
}
