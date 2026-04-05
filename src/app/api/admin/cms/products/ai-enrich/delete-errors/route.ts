import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

/**
 * POST /api/admin/cms/products/ai-enrich/delete-errors
 * Delete drafts for given product IDs so they can be re-enriched.
 * Body: { productIds: string[], deleteStatus?: 'error' | 'rejected' }
 *   - 'error' (default): deletes pending drafts with error_message IS NOT NULL
 *   - 'rejected': deletes drafts with status = 'rejected'
 */
export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { productIds, deleteStatus = 'error' } = body as { productIds: string[]; deleteStatus?: 'error' | 'rejected' };

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ error: 'productIds array is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  let deleted = 0;
  for (let i = 0; i < productIds.length; i += 100) {
    const chunk = productIds.slice(i, i + 100);

    let query = admin
      .from('product_enrichment_drafts')
      .delete({ count: 'exact' })
      .in('product_id', chunk);

    if (deleteStatus === 'rejected') {
      query = query.eq('status', 'rejected');
    } else {
      query = query.eq('status', 'pending').not('error_message', 'is', null);
    }

    const { count } = await query;
    deleted += count ?? 0;
  }

  return NextResponse.json({ deleted });
}
