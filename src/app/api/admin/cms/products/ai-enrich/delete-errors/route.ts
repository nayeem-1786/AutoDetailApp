import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

/**
 * POST /api/admin/cms/products/ai-enrich/delete-errors
 * Delete error drafts for given product IDs so they can be re-enriched.
 * Body: { productIds: string[] }
 */
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { productIds } = body as { productIds: string[] };

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ error: 'productIds array is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Delete error drafts (pending status with error_message) for these products
  let deleted = 0;
  for (let i = 0; i < productIds.length; i += 100) {
    const chunk = productIds.slice(i, i + 100);
    const { count } = await admin
      .from('product_enrichment_drafts')
      .delete({ count: 'exact' })
      .in('product_id', chunk)
      .eq('status', 'pending')
      .not('error_message', 'is', null);

    deleted += count ?? 0;
  }

  return NextResponse.json({ deleted });
}
