import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.revert';

interface TopDriftedProduct {
  product_id: string;
  product_name: string;
  sku: string | null;
  adjustment_count: number;
  net_change: number;
}

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

    const { id: countId } = await params;
    const admin = createAdminClient();

    const { data: count, error: countErr } = await admin
      .from('stock_counts')
      .select('id, status, section_label, committed_at')
      .eq('id', countId)
      .single();

    if (countErr || !count) {
      return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    }

    if (count.status !== 'committed') {
      return NextResponse.json({
        count,
        revertable: false,
        reason: `Count is ${count.status}`,
      });
    }

    // Fetch every non-reversal adjustment row written by this count.
    const { data: originalAdjustments, error: adjErr } = await admin
      .from('stock_adjustments')
      .select('product_id, quantity_change')
      .eq('reference_type', 'stock_count')
      .eq('reference_id', countId)
      .not('reason', 'ilike', 'Reversal of%');

    if (adjErr) {
      console.error('[counts/:id/revert-preview] originals query error:', adjErr);
      return NextResponse.json({ error: 'Failed to load preview' }, { status: 500 });
    }

    const affectedProductIds = Array.from(
      new Set((originalAdjustments ?? []).map((r) => r.product_id as string))
    );
    const originalProducts = affectedProductIds.length;
    const reversalsCount = (originalAdjustments ?? []).length;

    let driftAdjustments = 0;
    let driftedProducts = 0;
    let topDrifted: TopDriftedProduct[] = [];

    if (affectedProductIds.length > 0 && count.committed_at) {
      // Drift = non-stock_count activity on affected products since commit.
      const { data: driftRows, error: driftErr } = await admin
        .from('stock_adjustments')
        .select('id, product_id, quantity_change, reference_type')
        .in('product_id', affectedProductIds)
        .gt('created_at', count.committed_at)
        .not('reference_type', 'eq', 'stock_count');

      if (driftErr) {
        console.error('[counts/:id/revert-preview] drift query error:', driftErr);
        return NextResponse.json({ error: 'Failed to load drift data' }, { status: 500 });
      }

      const rows = driftRows ?? [];
      driftAdjustments = rows.length;
      const driftedIds = new Set(rows.map((r) => r.product_id as string));
      driftedProducts = driftedIds.size;

      if (driftedProducts > 0) {
        // Aggregate per product for the top-5 display.
        const perProduct = new Map<string, { count: number; net: number }>();
        for (const r of rows) {
          const pid = r.product_id as string;
          const entry = perProduct.get(pid) ?? { count: 0, net: 0 };
          entry.count += 1;
          entry.net += (r.quantity_change as number) ?? 0;
          perProduct.set(pid, entry);
        }

        const topIds = Array.from(perProduct.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([id]) => id);

        const { data: productRows } = await admin
          .from('products')
          .select('id, name, sku')
          .in('id', topIds);

        const productMap = new Map(
          (productRows ?? []).map((p) => [p.id as string, p])
        );

        topDrifted = topIds.map((id) => {
          const agg = perProduct.get(id)!;
          const prod = productMap.get(id);
          return {
            product_id: id,
            product_name: (prod?.name as string) ?? 'Unknown product',
            sku: (prod?.sku as string | null) ?? null,
            adjustment_count: agg.count,
            net_change: agg.net,
          };
        });
      }
    }

    return NextResponse.json({
      count,
      revertable: true,
      reversals_count: reversalsCount,
      original_products: originalProducts,
      has_drift: driftAdjustments > 0,
      drift_adjustments: driftAdjustments,
      drift_products: driftedProducts,
      top_drifted: topDrifted,
    });
  } catch (err) {
    console.error('[counts/:id/revert-preview] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
