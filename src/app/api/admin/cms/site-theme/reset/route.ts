import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/site-theme/reset — Reset to default theme
// Sets all customization fields to NULL on the active record
// ---------------------------------------------------------------------------

const RESETTABLE_FIELDS = [
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
] as const;

export async function POST() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.themes.manage');
  if (denied) return denied;

  const admin = createAdminClient();

  // Deactivate any active custom theme
  await admin
    .from('site_theme_settings')
    .update({ is_active: false })
    .eq('is_active', true);

  // Reset default theme record to all NULLs
  const nullUpdates: Record<string, null | string> = { mode: 'dark' };
  for (const field of RESETTABLE_FIELDS) {
    nullUpdates[field] = null;
  }

  const { data, error } = await admin
    .from('site_theme_settings')
    .update(nullUpdates)
    .eq('is_default', true)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('site-theme');
  return NextResponse.json({ data });
}
