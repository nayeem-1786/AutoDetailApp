import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/global-blocks — List all global blocks with usage counts
// POST /api/admin/cms/global-blocks — Create a new global block
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const admin = createAdminClient();

  const { data: blocks, error } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('is_global', true)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!blocks || blocks.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Get usage counts
  const blockIds = blocks.map((b) => b.id);
  const { data: placements } = await admin
    .from('page_block_placements')
    .select('block_id')
    .in('block_id', blockIds);

  const usageCounts = new Map<string, number>();
  (placements ?? []).forEach((row) => {
    usageCounts.set(row.block_id, (usageCounts.get(row.block_id) ?? 0) + 1);
  });

  // Get page paths for each block
  const { data: placementDetails } = await admin
    .from('page_block_placements')
    .select('block_id, page_path')
    .in('block_id', blockIds);

  const pagesMap = new Map<string, string[]>();
  (placementDetails ?? []).forEach((row) => {
    const arr = pagesMap.get(row.block_id) ?? [];
    if (!arr.includes(row.page_path)) arr.push(row.page_path);
    pagesMap.set(row.block_id, arr);
  });

  const enriched = blocks.map((b) => ({
    ...b,
    _usage_count: usageCounts.get(b.id) ?? 0,
    _pages: pagesMap.get(b.id) ?? [],
  }));

  return NextResponse.json({ data: enriched });
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { block_type, title, content, global_name } = body;

  if (!block_type || !global_name) {
    return NextResponse.json(
      { error: 'block_type and global_name are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('page_content_blocks')
    .insert({
      page_path: '__global__',
      page_type: 'global',
      block_type,
      title: title || null,
      content: content || '',
      sort_order: 0,
      is_global: true,
      global_name,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ data }, { status: 201 });
}
