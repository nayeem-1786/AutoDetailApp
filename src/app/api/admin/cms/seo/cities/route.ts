import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/seo/cities — List all city landing pages
// POST /api/admin/cms/seo/cities — Create a new city landing page
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('city_landing_pages')
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

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const admin = createAdminClient();

  // Validate required fields
  if (!body.city_name || !body.slug || !body.state) {
    return NextResponse.json(
      { error: 'city_name, slug, and state are required' },
      { status: 400 }
    );
  }

  // Check for duplicate slug
  const { data: existing } = await admin
    .from('city_landing_pages')
    .select('id')
    .eq('slug', body.slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'A city with this slug already exists' },
      { status: 409 }
    );
  }

  // Get next sort_order
  const { data: last } = await admin
    .from('city_landing_pages')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from('city_landing_pages')
    .insert({
      city_name: body.city_name,
      slug: body.slug,
      state: body.state,
      distance_miles: body.distance_miles ?? null,
      heading: body.heading ?? null,
      intro_text: body.intro_text ?? null,
      service_highlights: body.service_highlights ?? null,
      local_landmarks: body.local_landmarks ?? null,
      meta_title: body.meta_title ?? null,
      meta_description: body.meta_description ?? null,
      focus_keywords: body.focus_keywords ?? null,
      is_active: body.is_active ?? true,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
