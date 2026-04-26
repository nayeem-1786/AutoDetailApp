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
      preferred_time,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      size_class,
    } = body as {
      name: string;
      phone: string;
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
      const staffMessage = `Specialty vehicle callback request!\n${name} (${phone}) wants a quote for their ${vehicleWord} ${vehicleDesc}.${preferred_time ? `\nBest time: ${preferred_time}` : ''}\n\nFrom online booking.`;

      // Session 1A interim: this caller passes only 2 of booking_staff_notify's
      // 5 required chips. The other 3 ({appointment_date}, {appointment_time},
      // {deposit_info}) don't apply to a specialty-vehicle callback request —
      // there's no appointment scheduled yet, just a request to call back.
      // renderSmsTemplate hard-skips on the missing required vars and returns
      // isActive:false; the staffMessage fallback string above is what actually
      // goes out. Session 2F will split this slug into booking_staff_notify_specialty
      // with a contract that matches the specialty-callback shape (callback request,
      // not confirmed booking). Do not "fix" this by synthesizing date/time/deposit
      // values — the slug split is the right answer.
      const [templateResult, biz] = await Promise.all([
        renderSmsTemplate('booking_staff_notify', {
          customer_name: name,
          services: `${vehicleWord.charAt(0).toUpperCase() + vehicleWord.slice(1)} vehicle quote — ${vehicleDesc}`,
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
