import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/content?pagePath=/areas/torrance  — List blocks for a page
// POST /api/admin/cms/content  — Create a new content block
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const pagePath = searchParams.get('pagePath');

  if (!pagePath) {
    return NextResponse.json({ error: 'pagePath is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .order('sort_order', { ascending: true });

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

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { page_path, page_type, block_type, title, content } = body;

  if (!page_path || !page_type || !content) {
    return NextResponse.json(
      { error: 'page_path, page_type, and content are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('page_content_blocks')
    .select('sort_order')
    .eq('page_path', page_path)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('page_content_blocks')
    .insert({
      page_path,
      page_type,
      block_type: block_type || 'rich_text',
      title: title || null,
      content,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
