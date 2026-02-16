import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/pages  — List all pages
// POST /api/admin/cms/pages  — Create a new page
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('website_pages')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { title, slug, page_template, parent_id, content, is_published, show_in_nav, meta_title, meta_description, og_image_url } = body;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Build the final slug: if parent, prefix with parent slug
  let finalSlug = slug || toSlug(title);
  if (parent_id) {
    const { data: parent } = await admin
      .from('website_pages')
      .select('slug')
      .eq('id', parent_id)
      .single();
    if (parent) {
      // Only prefix if not already prefixed
      if (!finalSlug.startsWith(parent.slug + '/')) {
        finalSlug = `${parent.slug}/${finalSlug}`;
      }
    }
  }

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('website_pages')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('website_pages')
    .insert({
      title,
      slug: finalSlug,
      page_template: page_template || 'content',
      parent_id: parent_id || null,
      content: content || '',
      is_published: is_published ?? false,
      show_in_nav: show_in_nav ?? false,
      sort_order: sortOrder,
      meta_title: meta_title || null,
      meta_description: meta_description || null,
      og_image_url: og_image_url || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A page with this slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If show_in_nav is true, auto-create a header nav entry
  if (show_in_nav && data) {
    await admin.from('website_navigation').insert({
      placement: 'header',
      label: title,
      url: `/p/${finalSlug}`,
      page_id: data.id,
      sort_order: 99,
    });
  }

  revalidateTag('cms-pages');
  revalidateTag('cms-navigation');

  return NextResponse.json({ data }, { status: 201 });
}
