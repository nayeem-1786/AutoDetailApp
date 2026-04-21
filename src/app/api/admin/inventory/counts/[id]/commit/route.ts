import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.manage';

export async function POST(
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

    const { id: countId } = await params;
    const admin = createAdminClient();

    const { data: rpcResult, error: rpcErr } = await admin.rpc('commit_stock_count', {
      p_count_id: countId,
      p_employee_id: employee.id,
    });

    if (rpcErr) {
      const message = rpcErr.message || '';

      if (message.includes('Count not found')) {
        return NextResponse.json({ error: 'Count not found' }, { status: 404 });
      }
      if (message.includes('not in committable status')) {
        return NextResponse.json(
          { error: message.replace(/^[^:]*:\s*/, 'Count is ') },
          { status: 409 }
        );
      }
      if (message.includes('negative quantity')) {
        const match = message.match(/for product ([a-f0-9-]+)/i);
        const productId = match ? match[1] : null;
        return NextResponse.json(
          {
            error: 'Commit would set negative quantity',
            product_id: productId,
          },
          { status: 400 }
        );
      }

      console.error('[counts/:id/commit] rpc error:', rpcErr);
      return NextResponse.json({ error: 'Failed to commit count' }, { status: 500 });
    }

    const result = rpcResult as { count_id: string; adjustments_created: number };

    const { data: count } = await admin
      .from('stock_counts')
      .select('*')
      .eq('id', countId)
      .single();

    return NextResponse.json({
      count,
      adjustments_created: result?.adjustments_created ?? 0,
    });
  } catch (err) {
    console.error('[counts/:id/commit] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
