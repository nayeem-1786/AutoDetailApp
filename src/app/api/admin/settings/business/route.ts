import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// GET  /api/admin/settings/business?key=xxx — Read a single business setting
// PATCH /api/admin/settings/business       — Upsert a business setting
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data?.value ?? null });
}

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { key, value } = body;

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid key' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('business_settings')
    .upsert(
      {
        key,
        value,
        updated_by: employee.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Revalidate CMS toggles cache so public layout picks up changes immediately
  revalidateTag('cms-toggles');

  return NextResponse.json({ success: true });
}
