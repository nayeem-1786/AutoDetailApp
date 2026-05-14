import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET /api/admin/products/[id]/variants — Get variant group siblings
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Get the product to find its group
  const { data: product, error: productError } = await admin
    .from('products')
    .select('product_group_id')
    .eq('id', id)
    .single();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 404 });
  }

  if (!product.product_group_id) {
    return NextResponse.json({ variants: [] });
  }

  // Get all other products in the same group
  const { data: variants, error: variantsError } = await admin
    .from('products')
    .select('id, name, variant_label, retail_price_cents, quantity_on_hand, image_url')
    .eq('product_group_id', product.product_group_id)
    .neq('id', id)
    .order('name');

  if (variantsError) {
    return NextResponse.json({ error: variantsError.message }, { status: 500 });
  }

  return NextResponse.json({ variants: variants ?? [] });
}
