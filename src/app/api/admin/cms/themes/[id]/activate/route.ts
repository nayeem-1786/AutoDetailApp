import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/themes/[id]/activate — Activate theme (deactivates others)
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.themes.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  // Deactivate all themes first
  await admin
    .from('seasonal_themes')
    .update({ is_active: false })
    .neq('id', id);

  // Activate the selected theme
  const { data, error } = await admin
    .from('seasonal_themes')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
