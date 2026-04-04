import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// POST /api/admin/products/group — Create a variant group from product IDs
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { productIds } = body as { productIds: string[] };

  if (!Array.isArray(productIds) || productIds.length < 2) {
    return NextResponse.json(
      { error: 'At least 2 product IDs are required' },
      { status: 400 }
    );
  }

  const groupId = crypto.randomUUID();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('products')
    .update({ product_group_id: groupId })
    .in('id', productIds)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ groupId, count: data?.length ?? 0 });
}
