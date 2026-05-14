import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPermission } from '@/lib/auth/check-permission';
import { shopUseSchema } from '@/lib/utils/validation';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';
import { toCents } from '@/lib/utils/money';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { granted } = await checkPermission(posEmployee.employee_id, 'inventory.shop_use');
    if (!granted) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = shopUseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { product_id, quantity, note } = parsed.data;

    // Fetch product
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('id, name, quantity_on_hand, cost_price')
      .eq('id', product_id)
      .single();

    if (prodError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.quantity_on_hand < quantity) {
      return NextResponse.json(
        { error: `Insufficient stock (${product.quantity_on_hand} available)` },
        { status: 400 }
      );
    }

    const quantityBefore = product.quantity_on_hand;
    const quantityAfter = quantityBefore - quantity;

    // Decrement stock
    const { error: updateError } = await supabase
      .from('products')
      .update({ quantity_on_hand: quantityAfter })
      .eq('id', product_id);

    if (updateError) {
      console.error('Shop use: stock update error:', updateError);
      return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 });
    }

    // Log stock adjustment
    const result = await logStockAdjustment({
      supabase,
      product_id,
      adjustment_type: 'shop_use',
      quantity_change: -quantity,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      reason: note ? `Shop use — ${note}` : 'Shop use',
      reference_id: null,
      reference_type: 'shop_use',
      created_by: posEmployee.employee_id,
      // TODO Unify-D: when Family D migrates products.cost_price to
      // cents, remove toCents() and use product.cost_price_cents
      // directly. See docs/sessions/money-unify-0-migration-
      // playbook-v2.md §Family D.
      unit_cost_cents:
        product.cost_price != null ? toCents(product.cost_price) : null,
    });

    if (!result.ok) {
      // Stock was updated but audit log failed — non-fatal
      console.error('Shop use: audit log failed:', result.error);
      return NextResponse.json({ ok: true, adjustment_id: null }, { status: 201 });
    }

    return NextResponse.json(
      { ok: true, adjustment_id: result.id },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/pos/shop-use error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
