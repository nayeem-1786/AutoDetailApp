import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/hero — List all hero slides
// POST /api/admin/cms/hero — Create a new hero slide
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('hero_slides')
    .select('*')
    .order('sort_order', { ascending: true });

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

  const denied = await requirePermission(employee.id, 'cms.hero.manage');
  if (denied) return denied;

  const body = await request.json();

  const admin = createAdminClient();

  // Get next sort_order
  const { data: lastSlide } = await admin
    .from('hero_slides')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastSlide?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from('hero_slides')
    .insert({
      title: body.title ?? 'New Slide',
      subtitle: body.subtitle ?? null,
      cta_text: body.cta_text ?? null,
      cta_url: body.cta_url ?? null,
      content_type: body.content_type ?? 'image',
      image_url: body.image_url ?? null,
      image_url_mobile: body.image_url_mobile ?? null,
      image_alt: body.image_alt ?? null,
      video_url: body.video_url ?? null,
      video_thumbnail_url: body.video_thumbnail_url ?? null,
      before_image_url: body.before_image_url ?? null,
      after_image_url: body.after_image_url ?? null,
      before_label: body.before_label ?? 'Before',
      after_label: body.after_label ?? 'After',
      overlay_opacity: body.overlay_opacity ?? 40,
      text_alignment: body.text_alignment ?? 'left',
      sort_order: nextOrder,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
