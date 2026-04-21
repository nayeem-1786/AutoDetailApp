import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.manage';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isFeatureEnabled(FEATURE_FLAGS.INVENTORY_MANAGEMENT))) {
      return NextResponse.json({ error: 'Inventory management is disabled' }, { status: 403 });
    }

    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, PERMISSION_KEY);
    if (denied) return denied;

    const { id: countId } = await params;
    const body = await request.json();
    const { product_id, increment, set_to } = body;

    if (!product_id || typeof product_id !== 'string') {
      return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
    }

    const hasIncrement = typeof increment === 'number';
    const hasSetTo = typeof set_to === 'number';

    if (hasIncrement === hasSetTo) {
      return NextResponse.json(
        { error: 'Provide exactly one of: increment, set_to' },
        { status: 400 }
      );
    }

    if (hasSetTo && set_to < 0) {
      return NextResponse.json({ error: 'set_to must be >= 0' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: count, error: countErr } = await admin
      .from('stock_counts')
      .select('id, status')
      .eq('id', countId)
      .single();

    if (countErr || !count) {
      return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    }

    if (count.status !== 'active') {
      return NextResponse.json(
        { error: `Count is ${count.status}, not active` },
        { status: 403 }
      );
    }

    const { data: existing } = await admin
      .from('stock_count_items')
      .select('id, counted_qty, expected_qty')
      .eq('stock_count_id', countId)
      .eq('product_id', product_id)
      .maybeSingle();

    if (hasSetTo) {
      if (!existing) {
        return NextResponse.json(
          { error: 'Line not found; scan the product first to snapshot expected_qty' },
          { status: 404 }
        );
      }

      const { data: updated, error: updateErr } = await admin
        .from('stock_count_items')
        .update({
          counted_qty: set_to,
          last_updated_by: employee.id,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr) {
        console.error('[counts/:id/items][POST] update error:', updateErr);
        return NextResponse.json({ error: 'Failed to update line' }, { status: 500 });
      }

      return NextResponse.json({ item: updated });
    }

    // hasIncrement path
    const delta = increment ?? 1;

    if (existing) {
      const { data: updated, error: updateErr } = await admin
        .from('stock_count_items')
        .update({
          counted_qty: existing.counted_qty + delta,
          last_updated_by: employee.id,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateErr) {
        console.error('[counts/:id/items][POST] increment error:', updateErr);
        return NextResponse.json({ error: 'Failed to update line' }, { status: 500 });
      }

      return NextResponse.json({ item: updated });
    }

    // New line: snapshot expected_qty from live products.quantity_on_hand
    const { data: product, error: prodErr } = await admin
      .from('products')
      .select('id, quantity_on_hand')
      .eq('id', product_id)
      .single();

    if (prodErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { data: inserted, error: insertErr } = await admin
      .from('stock_count_items')
      .insert({
        stock_count_id: countId,
        product_id,
        expected_qty: product.quantity_on_hand,
        counted_qty: delta,
        last_updated_by: employee.id,
        created_by: employee.id,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[counts/:id/items][POST] insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to add line' }, { status: 500 });
    }

    return NextResponse.json({ item: inserted }, { status: 201 });
  } catch (err) {
    console.error('[counts/:id/items][POST] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
