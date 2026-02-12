import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const adjustmentType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = admin
      .from('stock_adjustments')
      .select(`
        *,
        products(id, name, sku),
        employees!stock_adjustments_created_by_fkey(id, first_name, last_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (productId) {
      query = query.eq('product_id', productId);
    }
    if (adjustmentType) {
      query = query.eq('adjustment_type', adjustmentType);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('List stock adjustments error:', error);
      return NextResponse.json({ error: 'Failed to load stock adjustments' }, { status: 500 });
    }

    const adjustments = (data ?? []).map((sa: Record<string, unknown>) => ({
      ...sa,
      product: sa.products,
      created_by_employee: sa.employees,
      products: undefined,
      employees: undefined,
    }));

    return NextResponse.json({ data: adjustments, total: count });
  } catch (err) {
    console.error('GET stock-adjustments error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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
    if (!employee) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { requirePermission } = await import('@/lib/auth/require-permission');
    const denied = await requirePermission(employee.id, 'inventory.adjust_stock');
    if (denied) return denied;

    const body = await request.json();
    const { product_id, adjustment, reason, adjustment_type } = body;

    if (!product_id || typeof adjustment !== 'number' || adjustment === 0) {
      return NextResponse.json({ error: 'product_id and non-zero adjustment are required' }, { status: 400 });
    }

    // Get current stock
    const { data: product } = await admin
      .from('products')
      .select('id, quantity_on_hand')
      .eq('id', product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const quantityBefore = product.quantity_on_hand;
    const quantityAfter = quantityBefore + adjustment;

    if (quantityAfter < 0) {
      return NextResponse.json({ error: 'Stock cannot go below zero' }, { status: 400 });
    }

    // Update product stock
    const { error: updateError } = await admin
      .from('products')
      .update({ quantity_on_hand: quantityAfter })
      .eq('id', product_id);

    if (updateError) {
      console.error('Update stock error:', updateError);
      return NextResponse.json({ error: 'Failed to update stock' }, { status: 500 });
    }

    // Log the adjustment
    const { data: sa, error: saError } = await admin
      .from('stock_adjustments')
      .insert({
        product_id,
        adjustment_type: adjustment_type || 'manual',
        quantity_change: adjustment,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        reason: reason || null,
        created_by: employee.id,
      })
      .select('*')
      .single();

    if (saError) {
      console.error('Log stock adjustment error:', saError);
      // Stock was already updated — log error but don't fail
    }

    return NextResponse.json({
      data: {
        id: sa?.id,
        product_id,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        adjustment,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('POST stock-adjustments error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
