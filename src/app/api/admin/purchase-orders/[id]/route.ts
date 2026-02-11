import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
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
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('purchase_orders')
      .select(`
        *,
        vendors(id, name, contact_name, email, phone, lead_time_days),
        employees!purchase_orders_created_by_fkey(id, first_name, last_name),
        purchase_order_items(id, product_id, quantity_ordered, quantity_received, unit_cost, products(id, name, sku, quantity_on_hand))
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const po = {
      ...data,
      vendor: data.vendors,
      created_by_employee: data.employees,
      items: data.purchase_order_items,
      vendors: undefined,
      employees: undefined,
      purchase_order_items: undefined,
    };

    return NextResponse.json({ data: po });
  } catch (err) {
    console.error('GET purchase-order detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    // Fetch current PO
    const { data: existing } = await admin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Handle status transitions
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        draft: ['ordered', 'cancelled'],
        ordered: ['received', 'cancelled'],
        received: [],
        cancelled: [],
      };

      const allowed = validTransitions[existing.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${body.status}` },
          { status: 400 }
        );
      }

      updates.status = body.status;
      if (body.status === 'ordered') {
        updates.ordered_at = new Date().toISOString();
      }
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes || null;
    }

    // Update items if provided (only for draft POs)
    if (body.items && existing.status === 'draft') {
      // Delete existing items and reinsert
      await admin.from('purchase_order_items').delete().eq('purchase_order_id', id);

      const itemRows = body.items.map((item: { product_id: string; quantity_ordered: number; unit_cost: number }) => ({
        purchase_order_id: id,
        product_id: item.product_id,
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
      }));

      const { error: itemsError } = await admin
        .from('purchase_order_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Update PO items error:', itemsError);
        return NextResponse.json({ error: 'Failed to update items' }, { status: 500 });
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await admin
        .from('purchase_orders')
        .update(updates)
        .eq('id', id);

      if (updateError) {
        console.error('Update PO error:', updateError);
        return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 });
      }
    }

    return NextResponse.json({ data: { id, ...updates } });
  } catch (err) {
    console.error('PATCH purchase-order error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only draft POs can be deleted
    const { data: po } = await admin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!po) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if (po.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft purchase orders can be deleted' }, { status: 400 });
    }

    // CASCADE will delete items
    const { error } = await admin
      .from('purchase_orders')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete PO error:', error);
      return NextResponse.json({ error: 'Failed to delete purchase order' }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error('DELETE purchase-order error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
