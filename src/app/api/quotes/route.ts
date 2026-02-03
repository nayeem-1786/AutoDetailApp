import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createQuoteSchema } from '@/lib/utils/validation';
import { generateQuoteNumber } from '@/lib/utils/quote-number';
import { fireWebhook } from '@/lib/utils/webhook';
import { TAX_RATE } from '@/lib/utils/constants';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const customerId = searchParams.get('customer_id');
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
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    if (search) {
      // Search by quote number or customer name
      // Use ilike on quote_number; for customer name we filter post-fetch
      query = query.or(
        `quote_number.ilike.%${search}%`
      );
    }

    const { data: quotes, error, count } = await query;

    if (error) {
      console.error('Error fetching quotes:', error.message);
      return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
    }

    // If searching by customer name, we may need additional filtering
    let filtered = quotes || [];
    if (search && filtered.length > 0) {
      const q = search.toLowerCase();
      filtered = filtered.filter((quote) => {
        const matchesNumber = quote.quote_number?.toLowerCase().includes(q);
        const cust = quote.customer as { first_name?: string; last_name?: string } | null;
        const matchesName = cust
          ? `${cust.first_name ?? ''} ${cust.last_name ?? ''}`.toLowerCase().includes(q)
          : false;
        return matchesNumber || matchesName;
      });
    }

    return NextResponse.json({
      quotes: filtered,
      total: search ? filtered.length : (count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('Quotes GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    // Generate quote number
    const quoteNumber = await generateQuoteNumber(supabase);

    // Calculate subtotal from items
    const subtotal = data.items.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);

    // Tax: apply TAX_RATE to items with product_id (products are taxable)
    const taxableAmount = data.items.reduce((sum, item) => {
      if (item.product_id) {
        return sum + item.quantity * item.unit_price;
      }
      return sum;
    }, 0);
    const taxAmount = Math.round(taxableAmount * TAX_RATE * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    // Generate access token for public quote link
    const accessToken = crypto.randomUUID();

    // Insert quote
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
      })
      .select('*')
      .single();

    if (quoteError || !quote) {
      console.error('Error creating quote:', quoteError?.message);
      return NextResponse.json({ error: 'Failed to create quote' }, { status: 500 });
    }

    // Insert quote items
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
      // Clean up the quote if items failed
      await supabase.from('quotes').delete().eq('id', quote.id);
      return NextResponse.json({ error: 'Failed to create quote items' }, { status: 500 });
    }

    const createdQuote = { ...quote, items: insertedItems };

    // Fire webhook (fire-and-forget)
    fireWebhook('quote_created', createdQuote, supabase).catch(() => {});

    return NextResponse.json({ quote: createdQuote }, { status: 201 });
  } catch (err) {
    console.error('Quotes POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
