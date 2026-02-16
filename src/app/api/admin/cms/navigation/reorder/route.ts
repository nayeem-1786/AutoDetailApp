import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// PATCH /api/admin/cms/navigation/reorder  — Reorder nav items
// Body: { placement: string, orderedIds: string[] }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { placement, orderedIds } = body;

  if (!placement || !Array.isArray(orderedIds)) {
    return NextResponse.json(
      { error: 'placement and orderedIds are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('website_navigation')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('placement', placement);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  revalidateTag('cms-navigation');

  return NextResponse.json({ success: true });
}
