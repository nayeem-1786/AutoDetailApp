import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// PATCH /api/admin/credentials/reorder — Batch update sort_order
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { orderedIds } = body;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds array is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('credentials')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  revalidateTag('credentials');

  return NextResponse.json({ success: true });
}
