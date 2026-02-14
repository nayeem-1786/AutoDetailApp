import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET /api/admin/cms/terms — Load terms & conditions content
// PATCH /api/admin/cms/terms — Save terms & conditions content
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['terms_and_conditions', 'terms_effective_date']);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  return NextResponse.json({
    sections: settings.terms_and_conditions ?? [],
    effectiveDate: settings.terms_effective_date ?? '',
  });
}

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { sections, effectiveDate } = body;

  const admin = createAdminClient();

  // Upsert both settings
  const upserts = [];

  if (sections !== undefined) {
    upserts.push(
      admin
        .from('business_settings')
        .upsert(
          { key: 'terms_and_conditions', value: sections },
          { onConflict: 'key' }
        )
    );
  }

  if (effectiveDate !== undefined) {
    upserts.push(
      admin
        .from('business_settings')
        .upsert(
          { key: 'terms_effective_date', value: effectiveDate },
          { onConflict: 'key' }
        )
    );
  }

  const results = await Promise.all(upserts);
  for (const result of results) {
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true });
}
