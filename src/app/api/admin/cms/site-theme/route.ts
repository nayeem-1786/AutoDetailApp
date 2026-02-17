import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/site-theme — Get active (or default) site theme settings
// PUT  /api/admin/cms/site-theme — Update site theme settings
// POST /api/admin/cms/site-theme — Create a new named theme
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Try active first, then fall back to default
  const { data: active } = await admin
    .from('site_theme_settings')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (active) {
    return NextResponse.json({ data: active });
  }

  const { data: defaultTheme } = await admin
    .from('site_theme_settings')
    .select('*')
    .eq('is_default', true)
    .maybeSingle();

  return NextResponse.json({ data: defaultTheme });
}

export async function PUT(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.themes.manage');
  if (denied) return denied;

  const body = await request.json();
  const admin = createAdminClient();

  const themeId = body.id;
  if (!themeId) {
    return NextResponse.json({ error: 'Missing theme id' }, { status: 400 });
  }

  // Allowlist of updatable fields
  const allowedFields = [
    'name', 'mode',
    'color_page_bg', 'color_card_bg', 'color_header_bg', 'color_footer_bg', 'color_section_alt_bg',
    'color_text_primary', 'color_text_secondary', 'color_text_muted', 'color_text_on_primary',
    'color_primary', 'color_primary_hover', 'color_accent', 'color_accent_hover',
    'color_link', 'color_link_hover',
    'color_border', 'color_border_light', 'color_divider',
    'color_success', 'color_warning', 'color_error',
    'font_family', 'font_heading_family', 'font_base_size',
    'font_h1_size', 'font_h2_size', 'font_h3_size', 'font_body_size', 'font_small_size',
    'font_line_height', 'font_heading_weight', 'font_body_weight',
    'btn_primary_bg', 'btn_primary_text', 'btn_primary_hover_bg', 'btn_primary_radius', 'btn_primary_padding',
    'btn_secondary_bg', 'btn_secondary_text', 'btn_secondary_border', 'btn_secondary_radius',
    'btn_cta_bg', 'btn_cta_text', 'btn_cta_hover_bg', 'btn_cta_radius',
    'border_radius', 'border_card_radius', 'border_width',
    'spacing_section_padding', 'spacing_card_padding', 'spacing_header_height',
    'is_active',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('site_theme_settings')
    .update(updates)
    .eq('id', themeId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('site-theme');
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
    .from('site_theme_settings')
    .insert({
      name: body.name ?? 'Custom Theme',
      mode: body.mode ?? 'dark',
      is_active: false,
      is_default: false,
      ...Object.fromEntries(
        Object.entries(body).filter(([k]) =>
          k.startsWith('color_') || k.startsWith('font_') ||
          k.startsWith('btn_') || k.startsWith('border_') ||
          k.startsWith('spacing_')
        )
      ),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('site-theme');
  return NextResponse.json({ data }, { status: 201 });
}
