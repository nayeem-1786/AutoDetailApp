import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
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

  // 1. Fetch page-scoped blocks
  const { data: pageBlocks, error: pageErr } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .eq('is_global', false)
    .order('sort_order', { ascending: true });

  if (pageErr) {
    return NextResponse.json({ error: pageErr.message }, { status: 500 });
  }

  // 2. Fetch global block placements for this page
  const { data: placements } = await admin
    .from('page_block_placements')
    .select('id, sort_order, block_id')
    .eq('page_path', pagePath)
    .order('sort_order', { ascending: true });

  let globalWithSort: Array<Record<string, unknown>> = [];

  if (placements && placements.length > 0) {
    const blockIds = placements.map((p) => p.block_id);

    // Fetch the global blocks
    const { data: globalBlocks } = await admin
      .from('page_content_blocks')
      .select('*')
      .in('id', blockIds);

    const blockMap = new Map((globalBlocks ?? []).map((b) => [b.id, b]));

    // Get usage counts
    const { data: allPlacements } = await admin
      .from('page_block_placements')
      .select('block_id')
      .in('block_id', blockIds);

    const usageCounts = new Map<string, number>();
    (allPlacements ?? []).forEach((row) => {
      usageCounts.set(row.block_id, (usageCounts.get(row.block_id) ?? 0) + 1);
    });

    globalWithSort = placements
      .map((p) => {
        const block = blockMap.get(p.block_id);
        if (!block) return null;
        return {
          ...block,
          sort_order: p.sort_order,
          _placement_id: p.id,
          _usage_count: usageCounts.get(p.block_id) ?? 0,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }

  // 3. Merge and sort
  const all = [...(pageBlocks ?? []), ...globalWithSort];
  all.sort((a, b) => (a.sort_order as number) - (b.sort_order as number));

  return NextResponse.json({ data: all });
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { page_path, page_type, block_type, title, content, is_global, global_name } = body;

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
      is_global: is_global || false,
      global_name: global_name || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ data }, { status: 201 });
}
