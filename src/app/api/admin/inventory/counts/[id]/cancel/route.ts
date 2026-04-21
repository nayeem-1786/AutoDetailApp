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

    const { data: existing, error: findErr } = await admin
      .from('stock_counts')
      .select('id, status')
      .eq('id', countId)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    }

    if (!['active', 'review'].includes(existing.status)) {
      return NextResponse.json(
        { error: `Count is ${existing.status}, cannot cancel` },
        { status: 409 }
      );
    }

    const { data: count, error: updateErr } = await admin
      .from('stock_counts')
      .update({
        status: 'cancelled',
        cancelled_by: employee.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', countId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[counts/:id/cancel] update error:', updateErr);
      return NextResponse.json({ error: 'Failed to cancel count' }, { status: 500 });
    }

    return NextResponse.json({ count });
  } catch (err) {
    console.error('[counts/:id/cancel] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
