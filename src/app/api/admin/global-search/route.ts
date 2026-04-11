import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPhone } from '@/lib/utils/format';

interface SearchResultItem {
  id: string;
  label: string;
  subtitle: string | null;
  href: string;
  type: string;
}

/**
 * GET /api/admin/global-search?q=searchterm
 * Unified search across customers, products, services, transactions,
 * quotes, appointments, conversations, orders, and vehicles.
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: same pattern as /api/admin/customers/search
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim() || '';
    if (q.length < 2) {
      return NextResponse.json({
        customers: [], products: [], services: [], transactions: [],
        quotes: [], appointments: [], conversations: [], orders: [], vehicles: [],
      });
    }

    const pattern = `%${q}%`;

    // Smart query detection: Q- prefix → quote number, # prefix → receipt number
    const isQuoteSearch = /^q-/i.test(q);
    const isReceiptSearch = q.startsWith('#');
    const cleanedQ = isReceiptSearch ? q.slice(1).trim() : q;
    const cleanedPattern = `%${cleanedQ}%`;

    // Detect phone-like queries (digits with optional dashes/parens/spaces)
    const digits = q.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 4 && digits.length <= 11;

    // Run all searches in parallel
    const [
      customersRes, productsRes, servicesRes, transactionsRes,
      quotesRes, appointmentsRes, conversationsRes, ordersRes, vehiclesRes,
    ] = await Promise.allSettled([
      // 1. CUSTOMERS — name, phone, email
      admin.from('customers')
        .select('id, first_name, last_name, phone, email')
        .is('deleted_at', null)
        .or(
          isPhoneSearch
            ? `phone.ilike.%${digits}%`
            : `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`
        )
        .order('last_name')
        .limit(5),

      // 2. PRODUCTS — name, SKU, category name (via join)
      admin.from('products')
        .select('id, name, sku, product_categories(name)')
        .eq('is_active', true)
        .or(`name.ilike.${pattern},sku.ilike.${pattern}`)
        .order('name')
        .limit(5),

      // 3. SERVICES — name
      admin.from('services')
        .select('id, name, pricing_model')
        .eq('is_active', true)
        .ilike('name', pattern)
        .order('name')
        .limit(5),

      // 4. TRANSACTIONS — receipt number, customer name via join
      admin.from('transactions')
        .select('id, receipt_number, total_amount, status, transaction_date, customer:customers!customer_id(first_name, last_name)')
        .or(
          isReceiptSearch
            ? `receipt_number.ilike.${cleanedPattern}`
            : `receipt_number.ilike.${pattern}`
        )
        .order('transaction_date', { ascending: false })
        .limit(5),

      // 5. QUOTES — quote number, customer name via join
      admin.from('quotes')
        .select('id, quote_number, total_amount, status, created_at, customer:customers!customer_id(first_name, last_name)')
        .is('deleted_at', null)
        .ilike('quote_number', isQuoteSearch ? `%${cleanedQ}%` : pattern)
        .order('created_at', { ascending: false })
        .limit(5),

      // 6. APPOINTMENTS — customer name via join, service names via nested join
      admin.from('appointments')
        .select('id, scheduled_date, scheduled_start_time, status, customer:customers!customer_id(first_name, last_name), appointment_services(service:services!service_id(name))')
        .order('scheduled_date', { ascending: false })
        .limit(50), // Fetch more, filter client-side by customer name

      // 7. CONVERSATIONS — phone number, customer name via join
      admin.from('conversations')
        .select('id, phone_number, status, last_message_at, customer:customers!customer_id(first_name, last_name)')
        .or(
          isPhoneSearch
            ? `phone_number.ilike.%${digits}%`
            : `phone_number.ilike.${pattern}`
        )
        .order('last_message_at', { ascending: false })
        .limit(5),

      // 8. ORDERS — order number, customer name
      admin.from('orders')
        .select('id, order_number, total, first_name, last_name, email, created_at')
        .or(`order_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(5),

      // 9. VEHICLES — make, model, year + owning customer
      admin.from('vehicles')
        .select('id, year, make, model, color, customer_id, customer:customers!customer_id(id, first_name, last_name)')
        .or(`make.ilike.${pattern},model.ilike.${pattern}`)
        .limit(5),
    ]);

    const results: Record<string, SearchResultItem[]> = {
      customers: [],
      products: [],
      services: [],
      transactions: [],
      quotes: [],
      appointments: [],
      conversations: [],
      orders: [],
      vehicles: [],
    };

    // Format customers
    if (customersRes.status === 'fulfilled' && customersRes.value.data) {
      for (const c of customersRes.value.data) {
        const phone = c.phone ? formatPhone(c.phone) : null;
        results.customers.push({
          id: c.id,
          label: `${c.first_name} ${c.last_name}`.trim(),
          subtitle: phone || c.email || null,
          href: `/admin/customers/${c.id}`,
          type: 'customer',
        });
      }
    }

    // Format products
    if (productsRes.status === 'fulfilled' && productsRes.value.data) {
      for (const p of productsRes.value.data) {
        const cat = (p.product_categories as unknown as { name: string } | null)?.name;
        results.products.push({
          id: p.id,
          label: p.name,
          subtitle: [p.sku, cat].filter(Boolean).join(' — ') || null,
          href: `/admin/catalog/products/${p.id}`,
          type: 'product',
        });
      }
    }

    // Format services
    if (servicesRes.status === 'fulfilled' && servicesRes.value.data) {
      for (const s of servicesRes.value.data) {
        results.services.push({
          id: s.id,
          label: s.name,
          subtitle: s.pricing_model || null,
          href: `/admin/catalog/services/${s.id}`,
          type: 'service',
        });
      }
    }

    // Format transactions
    if (transactionsRes.status === 'fulfilled' && transactionsRes.value.data) {
      for (const t of transactionsRes.value.data) {
        const cust = t.customer as unknown as { first_name: string; last_name: string } | null;
        const custName = cust ? `${cust.first_name} ${cust.last_name}`.trim() : '';
        const amount = `$${Number(t.total_amount).toFixed(2)}`;
        results.transactions.push({
          id: t.id,
          label: `Receipt ${t.receipt_number}`,
          subtitle: [amount, custName, t.status].filter(Boolean).join(' — '),
          href: '/admin/transactions',
          type: 'transaction',
        });
      }
    }

    // Format quotes
    if (quotesRes.status === 'fulfilled' && quotesRes.value.data) {
      for (const qt of quotesRes.value.data) {
        const cust = qt.customer as unknown as { first_name: string; last_name: string } | null;
        const custName = cust ? `${cust.first_name} ${cust.last_name}`.trim() : '';
        const amount = `$${Number(qt.total_amount).toFixed(2)}`;
        results.quotes.push({
          id: qt.id,
          label: `Quote ${qt.quote_number}`,
          subtitle: [amount, custName, qt.status].filter(Boolean).join(' — '),
          href: `/admin/quotes/${qt.id}`,
          type: 'quote',
        });
      }
    }

    // Format appointments — filter by customer name client-side (Supabase can't .or() on related tables)
    if (appointmentsRes.status === 'fulfilled' && appointmentsRes.value.data) {
      const lowerQ = q.toLowerCase();
      const matched = appointmentsRes.value.data.filter((a) => {
        const cust = a.customer as unknown as { first_name: string; last_name: string } | null;
        if (!cust) return false;
        const fullName = `${cust.first_name} ${cust.last_name}`.toLowerCase();
        return fullName.includes(lowerQ);
      }).slice(0, 5);

      for (const a of matched) {
        const cust = a.customer as unknown as { first_name: string; last_name: string };
        const custName = `${cust.first_name} ${cust.last_name}`.trim();
        const svcs = (a.appointment_services as unknown as { service: { name: string } | null }[])
          ?.map((as) => as.service?.name)
          .filter(Boolean)
          .join(', ') || '';
        const dateStr = a.scheduled_date
          ? new Date(a.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        const timeStr = a.scheduled_start_time
          ? a.scheduled_start_time.slice(0, 5)
          : '';
        results.appointments.push({
          id: a.id,
          label: [dateStr, timeStr, svcs].filter(Boolean).join(' — ') || 'Appointment',
          subtitle: `${custName} — ${a.status}`,
          href: '/admin/appointments',
          type: 'appointment',
        });
      }
    }

    // Format conversations
    if (conversationsRes.status === 'fulfilled' && conversationsRes.value.data) {
      for (const c of conversationsRes.value.data) {
        const cust = c.customer as unknown as { first_name: string; last_name: string } | null;
        const custName = cust ? `${cust.first_name} ${cust.last_name}`.trim() : '';
        const phone = c.phone_number ? formatPhone(c.phone_number) : '';
        results.conversations.push({
          id: c.id,
          label: phone || custName || 'Conversation',
          subtitle: [custName, c.status].filter(Boolean).join(' — ') || null,
          href: '/admin/messaging',
          type: 'conversation',
        });
      }
    }

    // Format orders
    if (ordersRes.status === 'fulfilled' && ordersRes.value.data) {
      for (const o of ordersRes.value.data) {
        const custName = `${o.first_name} ${o.last_name}`.trim();
        const amount = `$${(Number(o.total) / 100).toFixed(2)}`; // orders store in cents
        results.orders.push({
          id: o.id,
          label: `Order ${o.order_number}`,
          subtitle: [amount, custName].filter(Boolean).join(' — '),
          href: `/admin/orders/${o.id}`,
          type: 'order',
        });
      }
    }

    // Format vehicles
    if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value.data) {
      for (const v of vehiclesRes.value.data) {
        const cust = v.customer as unknown as { id: string; first_name: string; last_name: string } | null;
        const custName = cust ? `${cust.first_name} ${cust.last_name}`.trim() : '';
        const desc = [v.year, v.make, v.model].filter(Boolean).join(' ');
        results.vehicles.push({
          id: v.id,
          label: desc || 'Vehicle',
          subtitle: [v.color, custName].filter(Boolean).join(' — ') || null,
          href: cust ? `/admin/customers/${cust.id}` : '/admin/customers',
          type: 'vehicle',
        });
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error('[GlobalSearch] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
