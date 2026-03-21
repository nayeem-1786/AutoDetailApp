import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { sendTemplatedEmail } from './send-templated-email';

export async function sendCancellationEmail(appointmentId: string, reason?: string) {
  const supabase = createAdminClient();
  const business = await getBusinessInfo();

  const { data: appointment } = await supabase
    .from('appointments')
    .select(`
      id, scheduled_date, scheduled_start_time,
      customer:customers!inner(id, first_name, last_name, email),
      services:appointment_services(service_id, service:services(name))
    `)
    .eq('id', appointmentId)
    .single();

  if (!appointment) return;
  const customer = appointment.customer as unknown as { first_name: string; last_name: string; email: string | null };
  if (!customer?.email) return;

  const services = (appointment.services || []) as unknown as { service_id: string; service: { name: string } | null }[];
  const primaryService = services[0];

  // Format date/time
  const dateStr = new Date(appointment.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = appointment.scheduled_start_time?.slice(0, 5) || '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  const displayTime = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

  try {
    await sendTemplatedEmail(customer.email, 'booking_cancellation', {
      first_name: customer.first_name,
      customer_name: `${customer.first_name} ${customer.last_name || ''}`.trim(),
      service_name: primaryService?.service?.name || 'Your service',
      appointment_date: dateStr,
      appointment_time: displayTime,
      cancellation_reason: reason || '',
      business_name: business.name,
      business_phone: business.phone,
      booking_url: `${process.env.NEXT_PUBLIC_APP_URL}/book`,
    });
  } catch (e) {
    console.error('Failed to send cancellation email:', e);
  }
}
