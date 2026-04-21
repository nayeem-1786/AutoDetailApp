import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

const PERMISSION_KEY = 'inventory.counts.manage';
const VALID_STATUSES = ['active', 'review', 'committed', 'cancelled'] as const;
const VALID_COUNT_TYPES = ['full', 'sectional'] as const;

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { count_type, section_label, notes } = body;

    if (!VALID_COUNT_TYPES.includes(count_type)) {
      return NextResponse.json(
        { error: `count_type must be one of: ${VALID_COUNT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: count, error } = await admin
      .from('stock_counts')
      .insert({
        count_type,
        section_label: section_label || null,
        notes: notes || null,
        started_by: employee.id,
        status: 'active',
      })
      .select('*')
      .single();

    if (error) {
      console.error('[counts][POST] insert error:', error);
      return NextResponse.json({ error: 'Failed to create count' }, { status: 500 });
    }

    return NextResponse.json({ count }, { status: 201 });
  } catch (err) {
    console.error('[counts][POST] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');

    const admin = createAdminClient();

    let query = admin
      .from('stock_counts')
      .select(`
        *,
        started_by_employee:employees!stock_counts_started_by_fkey(id, first_name, last_name),
        committed_by_employee:employees!stock_counts_committed_by_fkey(id, first_name, last_name),
        items_count:stock_count_items(count)
      `)
      .order('started_at', { ascending: false })
      .limit(50);

    if (statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)) {
      query = query.eq('status', statusParam);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[counts][GET] query error:', error);
      return NextResponse.json({ error: 'Failed to load counts' }, { status: 500 });
    }

    const counts = (data ?? []).map((row: Record<string, unknown>) => {
      const itemsCount = row.items_count as Array<{ count: number }> | null;
      return {
        ...row,
        items_count: itemsCount?.[0]?.count ?? 0,
      };
    });

    return NextResponse.json({ counts });
  } catch (err) {
    console.error('[counts][GET] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
