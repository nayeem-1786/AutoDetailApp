import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { setFeatureFlag } from '@/lib/utils/feature-flags';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/themes/[id]/deactivate — Deactivate theme
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

  const { data, error } = await admin
    .from('seasonal_themes')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if any themes are still active — if not, disable the feature flag
  const { count } = await admin
    .from('seasonal_themes')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (count === 0) {
    await setFeatureFlag('seasonal_themes', false);
  }

  revalidateTag('cms-theme');
  revalidateTag('cms-toggles');
  return NextResponse.json({ data });
}
