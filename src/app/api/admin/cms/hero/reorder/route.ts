import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// PATCH /api/admin/cms/hero/reorder — Batch update sort_order
// Body: { items: [{ id: string, sort_order: number }] }
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.hero.manage');
  if (denied) return denied;

  const body = await request.json();
  const items = body.items as { id: string; sort_order: number }[];

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Items array required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Update each slide's sort_order
  const updates = items.map((item) =>
    admin
      .from('hero_slides')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
  );

  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
