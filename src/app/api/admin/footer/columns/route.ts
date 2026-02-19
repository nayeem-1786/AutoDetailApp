import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const MAX_COLUMNS_PER_SECTION = 4;

// ---------------------------------------------------------------------------
// GET    /api/admin/footer/columns?section_id=xxx — List columns for a section
// POST   /api/admin/footer/columns — Create a new column
// PATCH  /api/admin/footer/columns — Update a column
// DELETE /api/admin/footer/columns — Delete a column
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const sectionId = request.nextUrl.searchParams.get('section_id');
  const admin = createAdminClient();

  let query = admin
    .from('footer_columns')
    .select('*')
    .order('sort_order', { ascending: true });

  if (sectionId) {
    query = query.eq('section_id', sectionId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { section_id, title, content_type, html_content, config } = body;

  if (!section_id) {
    return NextResponse.json(
      { error: 'section_id is required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check column limit
  const { count } = await admin
    .from('footer_columns')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', section_id);

  if ((count ?? 0) >= MAX_COLUMNS_PER_SECTION) {
    return NextResponse.json(
      { error: `Maximum ${MAX_COLUMNS_PER_SECTION} columns per section` },
      { status: 400 }
    );
  }

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('footer_columns')
    .select('sort_order')
    .eq('section_id', section_id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('footer_columns')
    .insert({
      section_id,
      title: title || '',
      content_type: content_type || 'links',
      html_content: html_content || '',
      sort_order: sortOrder,
      ...(config ? { config } : {}),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { id, title, content_type, html_content, sort_order, is_enabled, config } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (content_type !== undefined) updates.content_type = content_type;
  if (html_content !== undefined) updates.html_content = html_content;
  if (typeof sort_order === 'number') updates.sort_order = sort_order;
  if (typeof is_enabled === 'boolean') updates.is_enabled = is_enabled;
  if (config !== undefined && typeof config === 'object') updates.config = config;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('footer_columns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('footer_columns')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ success: true });
}
