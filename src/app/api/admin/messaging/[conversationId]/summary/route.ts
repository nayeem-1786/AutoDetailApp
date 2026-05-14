import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { LOYALTY } from '@/lib/utils/constants';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify employee role
  const { data: employee } = await admin
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const denied = await requirePermission(employee.id, 'marketing.two_way_sms');
  if (denied) return denied;

  // Fetch conversation with customer + summary
  const { data: conversation } = await admin
    .from('conversations')
    .select('id, customer_id, phone_number, summary, last_channel')
    .eq('id', conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let customerData = null;
  let vehicleData = null;
  let latestQuoteData = null;
  let loyaltyData = null;
  let appointmentData = null;
  let engagementData = null;

  if (conversation.customer_id) {
    const custId = conversation.customer_id;
    const today = new Date().toISOString().split('T')[0];

    // Parallel fetches
    const [
      { data: customer },
      { data: vehicle },
      { data: quote },
      { data: appointments },
    ] = await Promise.all([
      admin
        .from('customers')
        .select('first_name, last_name, phone, customer_type, loyalty_points_balance, first_visit_date, last_visit_date, visit_count, lifetime_spend')
        .eq('id', custId)
        .single(),
      admin
        .from('vehicles')
        .select('year, make, model, color')
        .eq('customer_id', custId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      admin
        .from('quotes')
        .select(`
          quote_number, status, total_amount, created_at, sent_at, viewed_at, accepted_at,
          items:quote_items(service:services(name))
        `)
        .eq('customer_id', custId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      admin
        .from('appointments')
        .select('scheduled_date, scheduled_start_time, status, appointment_services(services(name))')
        .eq('customer_id', custId)
        .gte('scheduled_date', today)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .limit(3),
    ]);

    if (customer) {
      const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      customerData = {
        name,
        phone: customer.phone || conversation.phone_number,
        type: customer.customer_type || 'unknown',
      };

      loyaltyData = {
        points: customer.loyalty_points_balance || 0,
        value: ((customer.loyalty_points_balance || 0) * LOYALTY.REDEEM_RATE).toFixed(2),
      };

      engagementData = {
        first_visit: customer.first_visit_date || null,
        last_visit: customer.last_visit_date || null,
        visit_count: customer.visit_count || 0,
        lifetime_spend: customer.lifetime_spend || 0,
      };
    }

    if (vehicle) {
      vehicleData = {
        year: vehicle.year ? String(vehicle.year) : '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        color: vehicle.color || '',
      };
    }

    if (quote) {
      const items = quote.items as unknown as Array<{ service: { name: string } | null }>;
      const services = items
        ?.map((item) => item.service?.name)
        .filter(Boolean) as string[] || [];

      latestQuoteData = {
        quote_number: quote.quote_number,
        status: quote.status,
        total_amount: quote.total_amount,
        services,
        created_at: quote.created_at,
        sent_at: quote.sent_at,
        viewed_at: quote.viewed_at,
        accepted_at: quote.accepted_at,
      };
    }

    if (appointments && appointments.length > 0) {
      appointmentData = appointments.map((a) => ({
        date: a.scheduled_date,
        time: a.scheduled_start_time,
        status: a.status,
        services: ((a.appointment_services as unknown as Array<{ services: { name: string } }>) || [])
          .map((as) => as.services?.name || 'Service'),
      }));
    }
  }

  // If no customer linked, return phone-only data
  if (!customerData) {
    customerData = {
      name: '',
      phone: conversation.phone_number,
      type: 'unknown',
    };
  }

  return NextResponse.json({
    customer: customerData,
    vehicle: vehicleData,
    latestQuote: latestQuoteData,
    loyalty: loyaltyData,
    appointments: appointmentData,
    engagement: engagementData,
    aiSummary: conversation.summary || null,
    lastChannel: conversation.last_channel || 'sms',
  });
}
