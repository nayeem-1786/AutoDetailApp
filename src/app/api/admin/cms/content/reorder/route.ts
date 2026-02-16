import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// PATCH /api/admin/cms/content/reorder — Reorder blocks
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { pagePath, orderedIds } = body;

  if (!pagePath || !orderedIds || !Array.isArray(orderedIds)) {
    return NextResponse.json(
      { error: 'pagePath and orderedIds array are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('page_content_blocks')
      .update({ sort_order: i, updated_at: now })
      .eq('id', orderedIds[i])
      .eq('page_path', pagePath);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  revalidateTag('cms-content');

  return NextResponse.json({ success: true, reordered: orderedIds.length });
}
