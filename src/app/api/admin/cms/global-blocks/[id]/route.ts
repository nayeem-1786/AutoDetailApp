import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// DELETE /api/admin/cms/global-blocks/[id] — Permanently delete a global block
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  // Verify this is actually a global block
  const { data: block } = await admin
    .from('page_content_blocks')
    .select('id, is_global')
    .eq('id', id)
    .single();

  if (!block) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }

  if (!block.is_global) {
    return NextResponse.json({ error: 'Not a global block' }, { status: 400 });
  }

  // Placements are CASCADE-deleted via FK
  const { error } = await admin
    .from('page_content_blocks')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ success: true });
}
