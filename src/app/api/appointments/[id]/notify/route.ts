import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { sendEmail } from '@/lib/utils/email';
import { fireWebhook } from '@/lib/utils/webhook';
import { formatCurrency } from '@/lib/utils/format';
import { sendSms } from '@/lib/utils/sms';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const method: 'email' | 'sms' | 'both' = body.method || 'both';

    const supabase = createAdminClient();
    const business = await getBusinessInfo();

    // Fetch appointment with customer and services
    const { data: appointment, error: fetchErr } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers(id, first_name, last_name, phone, email),
        vehicle:vehicles(id, year, make, model),
        employee:employees(id, first_name, last_name, phone),
        services:appointment_services(
          price_at_booking,
          tier_name,
          service:services(name)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchErr || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    const customer = appointment.customer as {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    } | null;

    if (!customer) {
      return NextResponse.json({ error: 'No customer associated with appointment' }, { status: 400 });
    }

    const vehicle = appointment.vehicle as {
      id: string; year: number; make: string; model: string;
    } | null;
    const vehicleStr = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A';

    const employee = appointment.employee as {
      id: string; first_name: string; last_name: string; phone: string | null;
    } | null;

    const services = (appointment.services as {
      price_at_booking: number;
      tier_name: string | null;
      service: { name: string } | null;
    }[]) ?? [];

    const customerName = `${customer.first_name} ${customer.last_name}`;
    const dateStr = new Date(appointment.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const timeStr = appointment.scheduled_start_time?.slice(0, 5) || '';
    // Convert 24h to 12h
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
    const serviceNames = services.map(s => s.service?.name || 'Service').join(', ');

    const sentVia: string[] = [];
    const errors: string[] = [];

    const shouldEmail = method === 'email' || method === 'both';
    const shouldSms = method === 'sms' || method === 'both';

    // --- Send via Email ---
    if (shouldEmail) {
      if (!customer.email) {
        errors.push('Customer has no email address');
      } else {
        const serviceLines = services
          .map((s) => `  ${s.service?.name || 'Service'}${s.tier_name ? ` (${s.tier_name})` : ''} — ${formatCurrency(s.price_at_booking)}`)
          .join('\n');

        const textBody = `Appointment Confirmation from ${business.name}

Hi ${customer.first_name},

Your appointment has been confirmed!

Date: ${dateStr}
Time: ${displayTime}
Vehicle: ${vehicleStr}
${serviceLines ? `\nServices:\n${serviceLines}\n` : ''}
Total: ${formatCurrency(appointment.total_amount)}

${business.address}

If you need to reschedule or have questions, please call us at ${business.phone}.

Thank you for choosing ${business.name}!`;

        const serviceRowsHtml = services
          .map((s) => `<tr>
            <td class="email-td" style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb; color: #374151;">${s.service?.name || 'Service'}${s.tier_name ? ` <span class="email-text-muted" style="color: #6b7280;">(${s.tier_name})</span>` : ''}</td>
            <td class="email-td" style="padding: 10px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatCurrency(s.price_at_booking)}</td>
          </tr>`)
          .join('');

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
      .email-border { border-color: #334155 !important; }
      .email-footer { background-color: #1a1a2e !important; }
      .email-footer-text { color: #64748b !important; }
      .email-th { background-color: #1e293b !important; color: #e2e8f0 !important; }
      .email-td { border-color: #334155 !important; color: #e2e8f0 !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color-scheme: light dark;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div class="email-card" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #1e3a5f; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${business.name}</h1>
        <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">${business.address}</p>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 class="email-text" style="margin: 0 0 8px; color: #1e3a5f; font-size: 20px;">Appointment Confirmed</h2>
          <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px;">Hi ${customer.first_name}, your appointment is confirmed!</p>
        </div>

        <div class="email-info-box" style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Date:</strong> ${dateStr}</p>
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Time:</strong> ${displayTime}</p>
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Vehicle:</strong> ${vehicleStr}</p>
        </div>

        ${services.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr class="email-th" style="background-color: #f3f4f6;">
              <th class="email-th" style="padding: 10px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Service</th>
              <th class="email-th" style="padding: 10px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${serviceRowsHtml}
          </tbody>
        </table>` : ''}

        <!-- Total -->
        <div class="email-border" style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-bottom: 32px;">
          <div style="display: flex; justify-content: space-between;">
            <span class="email-text" style="font-size: 18px; font-weight: 600; color: #1e3a5f;">Total</span>
            <span class="email-text" style="font-size: 18px; font-weight: 700; color: #1e3a5f;">${formatCurrency(appointment.total_amount)}</span>
          </div>
        </div>

        <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
          Need to reschedule? Call us at <a href="tel:${business.phone}" style="color: #1e3a5f;">${business.phone}</a>
        </p>
      </div>

      <!-- Footer -->
      <div class="email-footer" style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p class="email-footer-text" style="margin: 0; color: #9ca3af; font-size: 12px;">Thank you for choosing ${business.name}!</p>
      </div>
    </div>
  </div>
</body>
</html>`;

        const result = await sendEmail(
          customer.email,
          `Appointment Confirmed — ${dateStr} at ${displayTime}`,
          textBody,
          htmlBody
        );

        if (result.success) {
          sentVia.push('email');
        } else {
          errors.push(result.error);
        }
      }
    }

    // --- Send via SMS (Twilio) ---
    if (shouldSms) {
      if (!customer.phone) {
        errors.push('Customer has no phone number');
      } else {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

        if (!twilioSid || !twilioAuth || !twilioFrom) {
          errors.push('SMS service (Twilio) not configured');
        } else {
          try {
            const smsBody =
              `${business.name} — Appointment Confirmed\n\n` +
              `${dateStr}\n` +
              `${displayTime}\n` +
              `Total: ${formatCurrency(appointment.total_amount)}\n\n` +
              `Questions? Call ${business.phone}`;

            const formData = new URLSearchParams();
            formData.append('From', twilioFrom);
            formData.append('To', customer.phone);
            formData.append('Body', smsBody);

            const twRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
              }
            );

            if (!twRes.ok) {
              const errText = await twRes.text();
              console.error('Twilio error:', errText);
              errors.push('Failed to send SMS');
            } else {
              sentVia.push('sms');
            }
          } catch (smsErr) {
            console.error('SMS send error:', smsErr);
            errors.push('Failed to send SMS');
          }
        }
      }
    }

    // --- Notify assigned detailer via SMS (non-blocking) ---
    if (appointment.employee_id && employee?.phone) {
      try {
        const detailerBody =
          `New job assigned: ${serviceNames}` +
          (vehicle ? ` – ${vehicleStr}` : '') +
          `\n${dateStr} at ${displayTime}` +
          (appointment.mobile_address ? `\n${appointment.mobile_address}` : '') +
          `\nTotal: ${formatCurrency(appointment.total_amount)}`;
        const smsResult = await sendSms(employee.phone, detailerBody);
        if (smsResult.success) {
          console.log(`Detailer SMS sent to ${employee.first_name} ${employee.last_name}`);
        } else {
          console.error(`Detailer SMS failed for ${employee.first_name}:`, smsResult.error);
        }
      } catch (detailerErr) {
        console.error('Detailer SMS error (non-blocking):', detailerErr);
      }
    }

    // Fire webhook
    fireWebhook('appointment_confirmed', appointment, supabase).catch(() => {});

    return NextResponse.json({
      success: true,
      sent_via: sentVia,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    console.error('Appointment notify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
