import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.manage';

// Session 42D-2. Only supports 'active' → 'review' for now.
// Demotion ('review' → 'active') and any other transitions are deliberately
// rejected. Commit + cancel have their own endpoints.
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['review'],
};

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
    const body = await request.json();
    const { target_status } = body;

    if (typeof target_status !== 'string') {
      return NextResponse.json({ error: 'target_status is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: existing, error: findErr } = await admin
      .from('stock_counts')
      .select('id, status')
      .eq('id', countId)
      .single();

    if (findErr || !existing) {
      return NextResponse.json({ error: 'Count not found' }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(target_status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${existing.status} to ${target_status}`,
        },
        { status: 409 }
      );
    }

    const { data: count, error: updateErr } = await admin
      .from('stock_counts')
      .update({ status: target_status })
      .eq('id', countId)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[counts/:id/transition] update error:', updateErr);
      return NextResponse.json({ error: 'Failed to transition count' }, { status: 500 });
    }

    return NextResponse.json({ count });
  } catch (err) {
    console.error('[counts/:id/transition] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
