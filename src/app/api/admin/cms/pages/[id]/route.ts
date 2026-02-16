import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET    /api/admin/cms/pages/[id]  — Get single page
// PATCH  /api/admin/cms/pages/[id]  — Update page
// DELETE /api/admin/cms/pages/[id]  — Delete page
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await context.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('website_pages')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.json();
  const admin = createAdminClient();

  // Build update object with only provided fields
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const allowedFields = [
    'title', 'slug', 'page_template', 'parent_id', 'content',
    'is_published', 'show_in_nav', 'sort_order',
    'meta_title', 'meta_description', 'og_image_url',
  ];

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await admin
    .from('website_pages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A page with this slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Handle show_in_nav toggle — auto-create or delete nav entry
  if ('show_in_nav' in body) {
    if (body.show_in_nav) {
      // Check if nav entry already exists for this page
      const { data: existingNav } = await admin
        .from('website_navigation')
        .select('id')
        .eq('page_id', id)
        .maybeSingle();

      if (!existingNav) {
        await admin.from('website_navigation').insert({
          placement: 'header',
          label: data.title,
          url: `/p/${data.slug}`,
          page_id: id,
          sort_order: 99,
        });
      }
    } else {
      // Delete any linked nav entries
      await admin
        .from('website_navigation')
        .delete()
        .eq('page_id', id);
    }
  }

  revalidateTag('cms-pages');
  revalidateTag('cms-navigation');

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await context.params;
  const admin = createAdminClient();

  const { error } = await admin
    .from('website_pages')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-pages');
  revalidateTag('cms-navigation');

  return NextResponse.json({ success: true });
}
