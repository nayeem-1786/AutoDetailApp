import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.manage';

export async function GET(
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

    const { id } = await params;
    const admin = createAdminClient();

    const { data: count, error: countErr } = await admin
      .from('stock_counts')
      .select(`
        *,
        started_by_employee:employees!stock_counts_started_by_fkey(id, first_name, last_name),
        committed_by_employee:employees!stock_counts_committed_by_fkey(id, first_name, last_name),
        cancelled_by_employee:employees!stock_counts_cancelled_by_fkey(id, first_name, last_name)
      `)
      .eq('id', id)
      .single();

    if (countErr || !count) {
      return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    }

    const { data: items, error: itemsErr } = await admin
      .from('stock_count_items')
      .select(`
        *,
        product:products(id, name, sku, barcode, image_url),
        last_updated_by_employee:employees!stock_count_items_last_updated_by_fkey(id, first_name, last_name)
      `)
      .eq('stock_count_id', id)
      .order('updated_at', { ascending: false });

    if (itemsErr) {
      console.error('[counts/:id][GET] items error:', itemsErr);
      return NextResponse.json({ error: 'Failed to load count items' }, { status: 500 });
    }

    return NextResponse.json({ count, items: items ?? [] });
  } catch (err) {
    console.error('[counts/:id][GET] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
