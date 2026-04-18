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
      is_exotic,
      is_classic,
    } = body as {
      name: string;
      phone: string;
      preferred_time?: string | null;
      vehicle_year?: number | null;
      vehicle_make?: string | null;
      vehicle_model?: string | null;
      is_exotic?: boolean;
      is_classic?: boolean;
    };

    if (!name || !phone) {
      return NextResponse.json({ error: 'Name and phone are required' }, { status: 400 });
    }

    const vehicleDesc = [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(' ') || 'Unknown vehicle';
    const vehicleWord = is_exotic && is_classic ? 'specialty' : is_exotic ? 'exotic' : 'classic';

    // Log audit event
    logAudit({
      action: 'create',
      entityType: 'booking',
      entityLabel: `Specialty callback: ${name} — ${vehicleDesc}`,
      details: {
        event: 'booking_blocked_specialty_vehicle',
        customer_name: name,
        customer_phone: phone,
        preferred_time: preferred_time || null,
        vehicle_year,
        vehicle_make,
        vehicle_model,
        is_exotic: is_exotic ?? false,
        is_classic: is_classic ?? false,
        vehicle_type: vehicleWord,
      },
      source: 'api',
    });

    // Send staff notification SMS
    try {
      const staffMessage = `Specialty vehicle callback request!\n${name} (${phone}) wants a quote for their ${vehicleWord} ${vehicleDesc}.${preferred_time ? `\nBest time: ${preferred_time}` : ''}\n\nFrom online booking.`;

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
