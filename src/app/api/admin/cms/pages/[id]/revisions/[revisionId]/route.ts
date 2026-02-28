import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET /api/admin/cms/pages/[id]/revisions/[revisionId] — full snapshot
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string; revisionId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id, revisionId } = await context.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('page_revisions')
    .select('*')
    .eq('id', revisionId)
    .eq('page_id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}
