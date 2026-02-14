import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/hero/config — Get hero carousel config
// PATCH /api/admin/cms/hero/config — Update hero carousel config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  mode: 'single' as const,
  interval_ms: 5000,
  transition: 'fade' as const,
  pause_on_hover: true,
};

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'hero_carousel_config')
    .maybeSingle();

  const config = data?.value
    ? { ...DEFAULT_CONFIG, ...(data.value as Record<string, unknown>) }
    : DEFAULT_CONFIG;

  return NextResponse.json({ data: config });
}

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.hero.manage');
  if (denied) return denied;

  const body = await request.json();

  // Only allow specific config keys
  const allowed = ['mode', 'interval_ms', 'transition', 'pause_on_hover'];
  const config: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      config[key] = body[key];
    }
  }

  const admin = createAdminClient();

  // Read existing config, merge
  const { data: existing } = await admin
    .from('business_settings')
    .select('value')
    .eq('key', 'hero_carousel_config')
    .maybeSingle();

  const merged = {
    ...DEFAULT_CONFIG,
    ...(existing?.value as Record<string, unknown> ?? {}),
    ...config,
  };

  const { error } = await admin
    .from('business_settings')
    .upsert(
      { key: 'hero_carousel_config', value: merged as unknown },
      { onConflict: 'key' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: merged });
}
