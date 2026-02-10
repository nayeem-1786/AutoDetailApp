import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin', 'cashier'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch conversation with customer
  const { data: conversation } = await admin
    .from('conversations')
    .select('id, customer_id, phone_number')
    .eq('id', conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let customerData = null;
  let vehicleData = null;
  let latestQuoteData = null;

  if (conversation.customer_id) {
    // Fetch customer
    const { data: customer } = await admin
      .from('customers')
      .select('first_name, last_name, phone, customer_type')
      .eq('id', conversation.customer_id)
      .single();

    if (customer) {
      const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      customerData = {
        name,
        phone: customer.phone || conversation.phone_number,
        type: customer.customer_type || 'unknown',
      };
    }

    // Fetch most recent vehicle
    const { data: vehicle } = await admin
      .from('vehicles')
      .select('year, make, model, color')
      .eq('customer_id', conversation.customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (vehicle) {
      vehicleData = {
        year: vehicle.year ? String(vehicle.year) : '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        color: vehicle.color || '',
      };
    }

    // Fetch latest quote with items
    const { data: quote } = await admin
      .from('quotes')
      .select(`
        quote_number, status, total_amount, created_at, sent_at, viewed_at, accepted_at,
        items:quote_items(service:services(name))
      `)
      .eq('customer_id', conversation.customer_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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
  });
}
