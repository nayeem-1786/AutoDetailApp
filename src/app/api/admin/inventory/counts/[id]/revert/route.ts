import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.revert';

interface ProblemProduct {
  product_id: string;
  name: string | null;
  sku: string | null;
  current_qty: number;
  target_qty: number;
}

interface RpcSuccess {
  status: 'success';
  count_id: string;
  reversals_created: number;
  drift_count: number;
  drift_products: number;
}

interface RpcError {
  status: 'error';
  error_code: 'NEGATIVE_QUANTITY';
  problem_products: ProblemProduct[];
}

type RpcResult = RpcSuccess | RpcError;

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

    const body = await request.json().catch(() => ({}));
    const confirmedDrift = body?.confirmed_drift === true;

    const admin = createAdminClient();

    const { data: rpcResult, error: rpcErr } = await admin.rpc('revert_stock_count', {
      p_count_id: countId,
      p_user_id: employee.id,
      p_confirmed_drift: confirmedDrift,
    });

    if (rpcErr) {
      const message = rpcErr.message || '';

      if (message.includes('Count not found')) {
        return NextResponse.json({ error: 'Count not found' }, { status: 404 });
      }
      if (message.includes('not in revertable status')) {
        return NextResponse.json(
          { error: message.replace(/^[^:]*:\s*/, 'Count is ') },
          { status: 409 }
        );
      }
      if (message.includes('Drift detected')) {
        const driftMatch = message.match(/(\d+) adjustment\(s\) on (\d+) product\(s\)/);
        return NextResponse.json(
          {
            error: 'Drift detected — confirm to proceed',
            drift_count: driftMatch ? parseInt(driftMatch[1], 10) : null,
            drift_products: driftMatch ? parseInt(driftMatch[2], 10) : null,
            requires_confirmation: true,
          },
          { status: 400 }
        );
      }

      console.error('[counts/:id/revert] rpc error:', rpcErr);
      return NextResponse.json({ error: 'Failed to revert count' }, { status: 500 });
    }

    const result = rpcResult as RpcResult | null;

    // Structured error path: negative-qty pre-check failed.
    if (result?.status === 'error' && result.error_code === 'NEGATIVE_QUANTITY') {
      return NextResponse.json(
        {
          error: 'NEGATIVE_QUANTITY',
          message: 'Revert would set negative quantity for one or more products',
          problem_products: result.problem_products,
        },
        { status: 409 }
      );
    }

    if (result?.status !== 'success') {
      console.error('[counts/:id/revert] unexpected rpc result:', rpcResult);
      return NextResponse.json({ error: 'Failed to revert count' }, { status: 500 });
    }

    const { data: count } = await admin
      .from('stock_counts')
      .select('*')
      .eq('id', countId)
      .single();

    return NextResponse.json({
      count,
      reversals_created: result.reversals_created ?? 0,
      drift_count: result.drift_count ?? 0,
      drift_products: result.drift_products ?? 0,
    });
  } catch (err) {
    console.error('[counts/:id/revert] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
