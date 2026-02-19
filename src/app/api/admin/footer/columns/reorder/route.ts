import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// PATCH /api/admin/footer/columns/reorder — Batch reorder columns
// Body: { items: [{ id: string, sort_order: number }] }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { items } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: 'items array is required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Update each column's sort_order
  const results = await Promise.all(
    items.map((item: { id: string; sort_order: number }) =>
      admin
        .from('footer_columns')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ success: true });
}
