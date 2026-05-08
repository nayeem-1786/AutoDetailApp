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

// ---------------------------------------------------------------------------
// Multi-word filter: every word in the query must appear somewhere in the
// concatenated field values. This handles out-of-order matches like
// "brush cone" finding "Cone Shape White Brush".
// ---------------------------------------------------------------------------

function multiWordMatch(
  items: Record<string, unknown>[],
  query: string,
  fields: string[],
  limit: number
): Record<string, unknown>[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) return items.slice(0, limit);

  return items.filter((item) => {
    const text = fields.map((f) => String(item[f] ?? '')).join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  }).slice(0, limit);
}

/** Get the first word of a query for the broadest DB match */
function firstWordPattern(q: string): string {
  const first = q.split(/\s+/)[0] || q;
  return `%${first}%`;
}

/** Check if query has multiple words */
function isMultiWord(q: string): boolean {
  return q.split(/\s+/).filter((w) => w.length > 0).length > 1;
}

/**
 * GET /api/admin/global-search?q=searchterm
 * Unified search across customers, products, services, transactions,
 * quotes, appointments, conversations, orders, and vehicles.
 *
 * Multi-word queries: DB fetches broadly with the first word, then
 * client-side filters to ensure ALL words match across fields.
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
    if (!employee) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim() || '';
    if (q.length < 2) {
      return NextResponse.json({
        customers: [], products: [], services: [], transactions: [],
        quotes: [], appointments: [], conversations: [], orders: [], vehicles: [],
      });
    }

    // Smart query detection: Q- prefix → quote number, # prefix → receipt number
    const isQuoteSearch = /^q-/i.test(q);
    const isReceiptSearch = q.startsWith('#');
    const cleanedQ = isReceiptSearch ? q.slice(1).trim() : q;

    // Detect phone-like queries (digits with optional dashes/parens/spaces)
    const digits = q.replace(/\D/g, '');
    const isPhoneSearch = digits.length >= 4 && digits.length <= 11;

    // For multi-word: use first word for DB query, filter all words client-side
    const multi = isMultiWord(q);
    const dbPattern = multi ? firstWordPattern(q) : `%${q}%`;
    const broadLimit = multi ? 50 : 15;

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
            : `first_name.ilike.${dbPattern},last_name.ilike.${dbPattern},email.ilike.${dbPattern},phone.ilike.${dbPattern}`
        )
        .order('last_name')
        .limit(broadLimit),

      // 2. PRODUCTS — name, SKU, description (description for multi-word filter only)
      admin.from('products')
        .select('id, name, sku, description, product_categories(name)')
        .eq('is_active', true)
        .or(`name.ilike.${dbPattern},sku.ilike.${dbPattern},description.ilike.${dbPattern}`)
        .order('name')
        .limit(broadLimit),

      // 3. SERVICES — name, description (description for multi-word filter only)
      admin.from('services')
        .select('id, name, description, pricing_model')
        .eq('is_active', true)
        .or(`name.ilike.${dbPattern},description.ilike.${dbPattern}`)
        .order('name')
        .limit(broadLimit),

      // 4. TRANSACTIONS — receipt number, customer name via join
      admin.from('transactions')
        .select('id, receipt_number, total_amount, status, transaction_date, customer:customers!customer_id(first_name, last_name)')
        .or(
          isReceiptSearch
            ? `receipt_number.ilike.%${cleanedQ}%`
            : `receipt_number.ilike.${dbPattern}`
        )
        .order('transaction_date', { ascending: false })
        .limit(15),

      // 5. QUOTES — quote number, customer name via join
      admin.from('quotes')
        .select('id, quote_number, total_amount, status, created_at, customer:customers!customer_id(first_name, last_name)')
        .is('deleted_at', null)
        .ilike('quote_number', isQuoteSearch ? `%${cleanedQ}%` : dbPattern)
        .order('created_at', { ascending: false })
        .limit(15),

      // 6. APPOINTMENTS — customer name via join, service names via nested join
      // Always fetches 50, filters client-side (Supabase can't .or() on joins)
      // Phase 0a-2: walk-ins included in search results; channel selected so
      // the result row can render its channel badge.
      admin.from('appointments')
        .select('id, scheduled_date, scheduled_start_time, status, channel, customer:customers!customer_id(first_name, last_name), appointment_services(service:services!service_id(name))')
        .order('scheduled_date', { ascending: false })
        .limit(50),

      // 7. CONVERSATIONS — phone number, customer name via join
      admin.from('conversations')
        .select('id, phone_number, status, last_message_at, customer:customers!customer_id(first_name, last_name)')
        .or(
          isPhoneSearch
            ? `phone_number.ilike.%${digits}%`
            : `phone_number.ilike.${dbPattern}`
        )
        .order('last_message_at', { ascending: false })
        .limit(15),

      // 8. ORDERS — order number, customer name, email
      admin.from('orders')
        .select('id, order_number, total, first_name, last_name, email, created_at')
        .or(`order_number.ilike.${dbPattern},first_name.ilike.${dbPattern},last_name.ilike.${dbPattern},email.ilike.${dbPattern}`)
        .order('created_at', { ascending: false })
        .limit(broadLimit),

      // 9. VEHICLES — make, model, color + owning customer
      admin.from('vehicles')
        .select('id, year, make, model, color, customer_id, customer:customers!customer_id(id, first_name, last_name)')
        .or(`make.ilike.${dbPattern},model.ilike.${dbPattern},color.ilike.${dbPattern}`)
        .limit(broadLimit),
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

    // Format customers (multi-word: filter across first_name + last_name + phone + email)
    if (customersRes.status === 'fulfilled' && customersRes.value.data) {
      const rows = multi
        ? multiWordMatch(customersRes.value.data as Record<string, unknown>[], q, ['first_name', 'last_name', 'phone', 'email'], 15)
        : customersRes.value.data;
      for (const c of rows as typeof customersRes.value.data) {
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

    // Format products (multi-word: filter across name + sku + description)
    if (productsRes.status === 'fulfilled' && productsRes.value.data) {
      const rows = multi
        ? multiWordMatch(productsRes.value.data as Record<string, unknown>[], q, ['name', 'sku', 'description'], 15)
        : productsRes.value.data;
      for (const p of rows as typeof productsRes.value.data) {
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

    // Format services (multi-word: filter across name + description)
    if (servicesRes.status === 'fulfilled' && servicesRes.value.data) {
      const rows = multi
        ? multiWordMatch(servicesRes.value.data as Record<string, unknown>[], q, ['name', 'description'], 15)
        : servicesRes.value.data;
      for (const s of rows as typeof servicesRes.value.data) {
        results.services.push({
          id: s.id,
          label: s.name,
          subtitle: s.pricing_model || null,
          href: `/admin/catalog/services/${s.id}`,
          type: 'service',
        });
      }
    }

    // Format transactions (no multi-word — receipt_number is a single token)
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

    // Format quotes (no multi-word — quote_number is a single token)
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

    // Format appointments — multi-word filter across customer name + service names
    if (appointmentsRes.status === 'fulfilled' && appointmentsRes.value.data) {
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
      const matched = appointmentsRes.value.data.filter((a) => {
        const cust = a.customer as unknown as { first_name: string; last_name: string } | null;
        if (!cust) return false;
        const svcNames = (a.appointment_services as unknown as { service: { name: string } | null }[])
          ?.map((as) => as.service?.name)
          .filter(Boolean)
          .join(' ') || '';
        const searchText = `${cust.first_name} ${cust.last_name} ${svcNames}`.toLowerCase();
        return words.every((word) => searchText.includes(word));
      }).slice(0, 15);

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

    // Format conversations (keep as-is — phone-based search)
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

    // Format orders (multi-word: filter across order_number + first_name + last_name + email)
    if (ordersRes.status === 'fulfilled' && ordersRes.value.data) {
      const rows = multi
        ? multiWordMatch(ordersRes.value.data as Record<string, unknown>[], q, ['order_number', 'first_name', 'last_name', 'email'], 15)
        : ordersRes.value.data;
      for (const o of rows as typeof ordersRes.value.data) {
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

    // Format vehicles (multi-word: filter across make + model + color + year)
    if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value.data) {
      const rows = multi
        ? multiWordMatch(vehiclesRes.value.data as Record<string, unknown>[], q, ['make', 'model', 'color', 'year'], 15)
        : vehiclesRes.value.data;
      for (const v of rows as typeof vehiclesRes.value.data) {
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
