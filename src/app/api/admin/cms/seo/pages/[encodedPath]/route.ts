import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET   /api/admin/cms/seo/pages/[encodedPath] — Get page_seo for a path
// PATCH /api/admin/cms/seo/pages/[encodedPath] — Update page_seo for a path
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ encodedPath: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { encodedPath } = await params;
  const pagePath = decodeURIComponent(encodedPath);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('page_seo')
    .select('*')
    .eq('page_path', pagePath)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ encodedPath: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { encodedPath } = await params;
  const pagePath = decodeURIComponent(encodedPath);
  const body = await request.json();

  const allowedFields = [
    'seo_title', 'meta_description', 'meta_keywords',
    'og_title', 'og_description', 'og_image_url',
    'canonical_url', 'robots_directive', 'structured_data_overrides',
    'focus_keyword', 'internal_links', 'page_type',
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

  // Mark as manually edited
  updates.is_auto_generated = false;
  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();

  // Upsert: if the page_seo row doesn't exist yet, create it
  const { data: existing } = await admin
    .from('page_seo')
    .select('id')
    .eq('page_path', pagePath)
    .maybeSingle();

  if (existing) {
    const { data, error } = await admin
      .from('page_seo')
      .update(updates)
      .eq('page_path', pagePath)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } else {
    // Create new row
    const { data, error } = await admin
      .from('page_seo')
      .insert({ page_path: pagePath, ...updates })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  }
}
