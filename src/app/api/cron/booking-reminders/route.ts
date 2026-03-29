import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';
import { sendSms } from '@/lib/utils/sms';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const business = await getBusinessInfo();

  // Tomorrow in PST
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowPST = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id, scheduled_date, scheduled_start_time, total_amount,
      customer:customers!inner(id, first_name, last_name, email, phone, sms_consent),
      services:appointment_services(service_id, service:services(name))
    `)
    .eq('scheduled_date', tomorrowPST)
    .in('status', ['pending', 'confirmed'])
    .is('reminder_sent_at', null);

  let sent = 0;
  let failed = 0;

  for (const appt of appointments || []) {
    const customer = appt.customer as unknown as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; sms_consent: boolean };

    const services = (appt.services || []) as unknown as { service_id: string; service: { name: string } | null }[];
    const primaryService = services[0];

    // Format date/time
    const dateStr = new Date(appt.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const timeStr = appt.scheduled_start_time?.slice(0, 5) || '';
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

    const serviceName = primaryService?.service?.name || 'Your service';

    // Email reminder
    if (customer.email) {
      const result = await sendTemplatedEmail(customer.email, 'booking_reminder', {
        first_name: customer.first_name,
        customer_name: `${customer.first_name} ${customer.last_name || ''}`.trim(),
        service_name: serviceName,
        appointment_date: dateStr,
        appointment_time: displayTime,
        business_name: business.name,
        business_phone: business.phone,
        booking_url: `${process.env.NEXT_PUBLIC_APP_URL}/book`,
      });

      if (result.success || result.usedTemplate) sent++;
      else failed++;
    }

    // SMS reminder (transactional — no marketing consent needed, but respect opt-out)
    if (customer.phone && customer.sms_consent !== false) {
      try {
        const smsFallback = `Reminder: Your ${serviceName} appointment at ${business.name} is tomorrow at ${displayTime}. Need to reschedule? Call us at ${business.phone}`;
        const smsResult = await renderSmsTemplate('booking_reminder', {
          first_name: customer.first_name || undefined,
          service_name: serviceName,
          appointment_time: displayTime,
        }, smsFallback);
        if (smsResult.isActive) {
          await sendSms(customer.phone, smsResult.body);
        }
      } catch (smsErr) {
        console.error(`[BookingReminder] SMS failed for appointment ${appt.id}:`, smsErr);
      }
    }

    // Mark as reminded regardless (prevent retries on failure)
    await supabase
      .from('appointments')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', appt.id);
  }

  return NextResponse.json({ success: true, sent, failed, total: (appointments || []).length });
}
