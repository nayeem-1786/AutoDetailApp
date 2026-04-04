import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// DELETE /api/admin/products/[id]/group — Remove product from its variant group
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Get the product's current group
  const { data: product, error: productError } = await admin
    .from('products')
    .select('product_group_id')
    .eq('id', id)
    .single();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 404 });
  }

  if (!product.product_group_id) {
    return NextResponse.json({
      removed: false,
      error: 'Product is not in a variant group',
    });
  }

  const oldGroupId = product.product_group_id;

  // Remove this product from the group (keep variant_label intact)
  const { error: updateError } = await admin
    .from('products')
    .update({ product_group_id: null })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Count remaining products in the old group
  const { data: remaining, error: countError } = await admin
    .from('products')
    .select('id')
    .eq('product_group_id', oldGroupId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  // If only 1 product remains, dissolve the group (keep variant_label intact)
  if (remaining && remaining.length === 1) {
    await admin
      .from('products')
      .update({ product_group_id: null })
      .eq('id', remaining[0].id);
  }

  return NextResponse.json({ removed: true });
}
