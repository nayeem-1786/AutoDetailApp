import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createQuoteSchema } from '@/lib/utils/validation';
import { generateQuoteNumber } from '@/lib/utils/quote-number';
import { fireWebhook } from '@/lib/utils/webhook';
import { TAX_RATE } from '@/lib/utils/constants';

export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email),
        vehicle:vehicles(id, year, make, model),
        items:quote_items(*)
      `,
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        `quote_number.ilike.%${search}%`
      );
    }

    const { data: quotes, error, count } = await query;

    if (error) {
      console.error('Error fetching quotes:', error.message);
      return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
    }

    // Post-fetch filter for customer name/phone search
    let filtered = quotes || [];
    if (search && filtered.length > 0) {
      const q = search.toLowerCase();
      filtered = filtered.filter((quote) => {
        const matchesNumber = quote.quote_number?.toLowerCase().includes(q);
        const cust = quote.customer as { first_name?: string; last_name?: string; phone?: string } | null;
        const matchesName = cust
          ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.toLowerCase().includes(q)
          : false;
        const matchesPhone = cust?.phone?.includes(q) ?? false;
        return matchesNumber || matchesName || matchesPhone;
      });
    }

    return NextResponse.json({
      quotes: filtered,
      total: search ? filtered.length : (count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('POS Quotes GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createQuoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    const quoteNumber = await generateQuoteNumber(supabase);

    const subtotal = data.items.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);

    const taxableAmount = data.items.reduce((sum, item) => {
      if (item.product_id) {
        return sum + item.quantity * item.unit_price;
      }
      return sum;
    }, 0);
    const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    // Generate short access token for public quote link
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const accessToken = Array.from(bytes, (b) => chars[b % chars.length]).join('');

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        quote_number: quoteNumber,
        customer_id: data.customer_id,
        vehicle_id: data.vehicle_id || null,
        status: 'draft',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        notes: data.notes || null,
        valid_until: data.valid_until || null,
        access_token: accessToken,
        created_by: posEmployee.employee_id,
      })
      .select('*')
      .single();

    if (quoteError || !quote) {
      console.error('Error creating quote:', quoteError?.message);
      return NextResponse.json({ error: 'Failed to create quote' }, { status: 500 });
    }

    const quoteItems = data.items.map((item) => ({
      quote_id: quote.id,
      service_id: item.service_id || null,
      product_id: item.product_id || null,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
      tier_name: item.tier_name || null,
      notes: item.notes || null,
    }));

    const { data: insertedItems, error: itemsError } = await supabase
      .from('quote_items')
      .insert(quoteItems)
      .select('*');

    if (itemsError) {
      console.error('Error creating quote items:', itemsError.message);
      await supabase.from('quotes').delete().eq('id', quote.id);
      return NextResponse.json({ error: 'Failed to create quote items' }, { status: 500 });
    }

    const createdQuote = { ...quote, items: insertedItems };

    fireWebhook('quote_created', createdQuote, supabase).catch(() => {});

    return NextResponse.json({ quote: createdQuote }, { status: 201 });
  } catch (err) {
    console.error('POS Quotes POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
