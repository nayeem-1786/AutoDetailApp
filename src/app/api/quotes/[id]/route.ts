import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateQuoteSchema } from '@/lib/utils/validation';
import { TAX_RATE } from '@/lib/utils/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: quote, error } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email, address_line_1, city, state, zip),
        vehicle:vehicles(id, year, make, model, color, vehicle_type, size_class),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({ quote });
  } catch (err) {
    console.error('Quote GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateQuoteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const supabase = createAdminClient();

    // Fetch current quote
    const { data: current, error: fetchErr } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Build update payload
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.customer_id !== undefined) update.customer_id = data.customer_id;
    if (data.vehicle_id !== undefined) update.vehicle_id = data.vehicle_id;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.valid_until !== undefined) update.valid_until = data.valid_until;
    if (data.status !== undefined) update.status = data.status;

    // If items provided, recalculate totals
    if (data.items && data.items.length > 0) {
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

      update.subtotal = subtotal;
      update.tax_amount = taxAmount;
      update.total_amount = totalAmount;

      // Delete existing items and re-insert
      const { error: deleteErr } = await supabase
        .from('quote_items')
        .delete()
        .eq('quote_id', id);

      if (deleteErr) {
        console.error('Error deleting quote items:', deleteErr.message);
        return NextResponse.json({ error: 'Failed to update quote items' }, { status: 500 });
      }

      const newItems = data.items.map((item) => ({
        quote_id: id,
        service_id: item.service_id || null,
        product_id: item.product_id || null,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: Math.round(item.quantity * item.unit_price * 100) / 100,
        tier_name: item.tier_name || null,
        notes: item.notes || null,
      }));

      const { error: insertErr } = await supabase
        .from('quote_items')
        .insert(newItems);

      if (insertErr) {
        console.error('Error inserting quote items:', insertErr.message);
        return NextResponse.json({ error: 'Failed to insert quote items' }, { status: 500 });
      }
    }

    // Update quote
    const { data: updated, error: updateErr } = await supabase
      .from('quotes')
      .update(update)
      .eq('id', id)
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email),
        vehicle:vehicles(id, year, make, model),
        items:quote_items(*)
      `
      )
      .single();

    if (updateErr) {
      console.error('Quote update failed:', updateErr.message);
      return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
    }

    return NextResponse.json({ quote: updated });
  } catch (err) {
    console.error('Quote PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch current quote to check status
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft quotes can be deleted' },
        { status: 400 }
      );
    }

    // Soft-delete: set deleted_at timestamp
    const { error: deleteErr } = await supabase
      .from('quotes')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (deleteErr) {
      console.error('Quote delete failed:', deleteErr.message);
      return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Quote DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
