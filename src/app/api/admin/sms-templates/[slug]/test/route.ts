import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { sendSms } from '@/lib/utils/sms';
import { SMS_TEMPLATE_VARIABLES } from '@/lib/sms/sms-template-variables';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const admin = createAdminClient();

  // Get test phone number from business_settings
  const { data: testPhoneSetting } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'sms_test_phone_number')
    .maybeSingle();

  const testPhone = typeof testPhoneSetting?.value === 'string'
    ? testPhoneSetting.value.trim()
    : '';

  if (!testPhone) {
    return NextResponse.json(
      { error: 'Set a test phone number in Settings > Messaging first.' },
      { status: 400 }
    );
  }

  // Build variables from real customer data where available
  const variables: Record<string, string> = {};

  // Fetch a real recent customer for realistic test data
  try {
    const { data: customer } = await admin
      .from('customers')
      .select('id, first_name, last_name, phone')
      .not('phone', 'is', null)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (customer) {
      variables.first_name = customer.first_name || 'John';
      variables.last_name = customer.last_name || 'Smith';
      variables.customer_name = `${customer.first_name || 'John'} ${customer.last_name || 'Smith'}`.trim();

      // Fetch vehicle
      const { data: vehicle } = await admin
        .from('vehicles')
        .select('year, make, model')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (vehicle) {
        variables.vehicle_description = cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model });
      }

      // Fetch recent appointment
      const { data: appt } = await admin
        .from('appointments')
        .select('scheduled_date, scheduled_start_time, total_amount, appointment_services(service:services(name))')
        .eq('customer_id', customer.id)
        .order('scheduled_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (appt) {
        variables.appointment_date = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
        const time = appt.scheduled_start_time?.slice(0, 5) || '10:00';
        const [h, m] = time.split(':').map(Number);
        variables.appointment_time = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
        variables.service_total = `$${Number(appt.total_amount || 0).toFixed(2)}`;

        const services = (appt.appointment_services as unknown as Array<{ service: { name: string } | null }>) ?? [];
        const serviceNames = services.map((s) => s.service?.name || 'Service').filter(Boolean);
        if (serviceNames.length > 0) {
          variables.service_name = serviceNames[0];
          variables.services = serviceNames.join(', ');
        }
      }

      // Fetch recent quote
      const { data: quote } = await admin
        .from('quotes')
        .select('quote_number, total_amount, items:quote_items(item_name)')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (quote) {
        variables.quote_number = quote.quote_number || 'Q-001234';
        const items = (quote.items as unknown as Array<{ item_name: string }>) ?? [];
        if (items.length > 0) {
          variables.item_name = items[0].item_name;
        }
      }
    }
  } catch (err) {
    console.error('[SmsTemplateTest] Customer data fetch error:', err);
  }

  // Fill remaining gaps with sample values from variable definitions
  const templateVars = SMS_TEMPLATE_VARIABLES[slug] ?? [];
  for (const v of templateVars) {
    if (!variables[v.key] && v.sample && !v.sample.startsWith('[')) {
      variables[v.key] = v.sample;
    }
  }

  // Render and send
  const result = await renderSmsTemplate(slug, variables, 'Test SMS — template fallback');

  const smsResult = await sendSms(testPhone, result.body);

  if (!smsResult.success) {
    return NextResponse.json(
      { error: smsResult.error || 'Failed to send test SMS' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    body: result.body,
    phone: testPhone,
    variables,
  });
}
