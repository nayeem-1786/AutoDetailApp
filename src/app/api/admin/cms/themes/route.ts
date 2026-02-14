import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/themes — List all themes
// POST /api/admin/cms/themes — Create a new theme
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('seasonal_themes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.themes.manage');
  if (denied) return denied;

  const body = await request.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('seasonal_themes')
    .insert({
      name: body.name ?? 'New Theme',
      slug: body.slug ?? `theme-${Date.now()}`,
      description: body.description ?? null,
      color_overrides: body.color_overrides ?? {},
      gradient_overrides: body.gradient_overrides ?? {},
      particle_effect: body.particle_effect ?? null,
      particle_intensity: body.particle_intensity ?? 50,
      particle_color: body.particle_color ?? null,
      ticker_message: body.ticker_message ?? null,
      ticker_bg_color: body.ticker_bg_color ?? null,
      ticker_text_color: body.ticker_text_color ?? null,
      themed_ad_creative_id: body.themed_ad_creative_id ?? null,
      hero_bg_image_url: body.hero_bg_image_url ?? null,
      body_bg_color: body.body_bg_color ?? null,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      auto_activate: body.auto_activate ?? false,
      is_active: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
