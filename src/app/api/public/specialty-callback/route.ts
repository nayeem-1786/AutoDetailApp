import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/services/audit';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { getBusinessInfo } from '@/lib/data/business';

/**
 * POST /api/public/specialty-callback
 *
 * Fired when a customer with an exotic/classic vehicle requests a callback
 * from the booking block page. Logs an audit event and sends a staff notification.
 *
 * Session 29: payload switched from boolean flags to size_class (canonical taxonomy).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      phone,
      email,
      preferred_time,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      size_class,
    } = body as {
      name: string;
      phone: string;
      email?: string | null;
      preferred_time?: string | null;
      vehicle_year?: number | null;
      vehicle_make?: string | null;
      vehicle_model?: string | null;
      size_class?: string | null;
    };

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = size_class === 'classic' ? 'classic' : 'exotic';

    // Log audit event
    logAudit({
      action: 'create',
      entityType: 'booking',
      entityLabel: `Specialty callback: ${name} — ${vehicleDesc}`,
      details: {
        event: 'specialty_callback_requested',
        customer_name: name,
        customer_phone: phone,
        customer_email: email || null,
        preferred_time: preferred_time || null,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        size_class: size_class ?? null,
        vehicle_type: vehicleWord,
      },
      source: 'api',
    });

    // Send staff notification SMS
    try {
      const customerEmail = email || undefined;
      const staffMessage = `Specialty vehicle callback request!\n${name} (${phone}) wants a quote for their ${vehicleWord} ${vehicleDesc}.${preferred_time ? `\nBest time: ${preferred_time}` : ''}\n\nFrom online booking.`;

      const [templateResult, biz] = await Promise.all([
        // Session 2F: chip-driven send via dedicated sub-slug whose contract
        // matches the callback-request data scope (no appointment_date /
        // appointment_time / deposit_info — those don't apply to a callback
        // request). Engine renders the body; staffMessage above stays as
        // defense-in-depth fallback when template is inactive or unrendered.
        renderSmsTemplate('booking_staff_notify_specialty', {
          customer_name: name,
          customer_phone: phone,
          vehicle_description: vehicleDesc,
          customer_email: customerEmail,
          size_class: size_class || undefined,
          preferred_time: preferred_time || undefined,
        }, staffMessage),
        getBusinessInfo(),
      ]);

      const smsBody = templateResult?.body || staffMessage;
      const recipients = templateResult?.recipientPhones?.length
        ? templateResult.recipientPhones
        : [biz.phone].filter(Boolean);

      for (const recipientPhone of recipients) {
        if (recipientPhone) {
          await sendSms(recipientPhone, smsBody);
        }
      }
    } catch (smsErr) {
      console.error('[specialty-callback] Staff notification failed:', smsErr);
      // Best-effort — don't fail the response
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[specialty-callback] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
