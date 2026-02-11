import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface ReceiveItem {
  item_id: string;
  quantity_received: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: employee } = await admin
      .from('employees')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch PO with items
    const { data: po } = await admin
      .from('purchase_orders')
      .select('id, status, purchase_order_items(id, product_id, quantity_ordered, quantity_received, unit_cost)')
      .eq('id', id)
      .single();

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if (po.status !== 'ordered') {
      return NextResponse.json(
        { error: 'Only ordered purchase orders can be received' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const items: ReceiveItem[] = body.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items are required' }, { status: 400 });
    }

    // Process each received item
    const poItems = po.purchase_order_items as Array<{
      id: string;
      product_id: string;
      quantity_ordered: number;
      quantity_received: number;
      unit_cost: number;
    }>;

    for (const receiveItem of items) {
      const poItem = poItems.find((i) => i.id === receiveItem.item_id);
      if (!poItem) {
        return NextResponse.json(
          { error: `Item ${receiveItem.item_id} not found in this PO` },
          { status: 400 }
        );
      }

      if (receiveItem.quantity_received < 0) {
        return NextResponse.json(
          { error: 'Received quantity cannot be negative' },
          { status: 400 }
        );
      }

      const newReceived = poItem.quantity_received + receiveItem.quantity_received;
      if (newReceived > poItem.quantity_ordered) {
        return NextResponse.json(
          { error: `Cannot receive more than ordered for item ${poItem.id}` },
          { status: 400 }
        );
      }

      // Get current stock level
      const { data: product } = await admin
        .from('products')
        .select('quantity_on_hand')
        .eq('id', poItem.product_id)
        .single();

      if (!product) continue;

      const quantityBefore = product.quantity_on_hand;
      const quantityAfter = quantityBefore + receiveItem.quantity_received;

      // Update product stock
      await admin
        .from('products')
        .update({ quantity_on_hand: quantityAfter })
        .eq('id', poItem.product_id);

      // Update PO item received count
      await admin
        .from('purchase_order_items')
        .update({ quantity_received: newReceived })
        .eq('id', poItem.id);

      // Log stock adjustment
      if (receiveItem.quantity_received > 0) {
        await admin
          .from('stock_adjustments')
          .insert({
            product_id: poItem.product_id,
            adjustment_type: 'received',
            quantity_change: receiveItem.quantity_received,
            quantity_before: quantityBefore,
            quantity_after: quantityAfter,
            reason: `PO ${po.id} received`,
            reference_id: po.id,
            reference_type: 'purchase_order',
            created_by: employee.id,
          });
      }
    }

    // Check if all items fully received
    const { data: updatedItems } = await admin
      .from('purchase_order_items')
      .select('quantity_ordered, quantity_received')
      .eq('purchase_order_id', id);

    const allReceived = (updatedItems ?? []).every(
      (i: { quantity_ordered: number; quantity_received: number }) =>
        i.quantity_received >= i.quantity_ordered
    );

    if (allReceived) {
      await admin
        .from('purchase_orders')
        .update({ status: 'received', received_at: new Date().toISOString() })
        .eq('id', id);
    }

    return NextResponse.json({
      data: {
        id,
        fully_received: allReceived,
      },
    });
  } catch (err) {
    console.error('POST receive PO error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
