import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// POST   /api/admin/cms/global-blocks/[id]/place — Place a global block on a page
// DELETE /api/admin/cms/global-blocks/[id]/place — Remove a global block from a page
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id: blockId } = await params;
  const body = await request.json();
  const { page_path, page_type } = body;

  if (!page_path) {
    return NextResponse.json({ error: 'page_path is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify block exists and is global
  const { data: block } = await admin
    .from('page_content_blocks')
    .select('id, is_global')
    .eq('id', blockId)
    .single();

  if (!block || !block.is_global) {
    return NextResponse.json({ error: 'Global block not found' }, { status: 404 });
  }

  // Check if already placed on this page
  const { data: existing } = await admin
    .from('page_block_placements')
    .select('id')
    .eq('page_path', page_path)
    .eq('block_id', blockId)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Block already on this page' }, { status: 409 });
  }

  // Calculate sort_order — after all existing blocks on this page
  // Check both page-scoped blocks and existing placements
  const { data: pageBlocks } = await admin
    .from('page_content_blocks')
    .select('sort_order')
    .eq('page_path', page_path)
    .eq('is_global', false)
    .order('sort_order', { ascending: false })
    .limit(1);

  const { data: existingPlacements } = await admin
    .from('page_block_placements')
    .select('sort_order')
    .eq('page_path', page_path)
    .order('sort_order', { ascending: false })
    .limit(1);

  const maxPageBlock = pageBlocks?.[0]?.sort_order ?? -1;
  const maxPlacement = existingPlacements?.[0]?.sort_order ?? -1;
  const sortOrder = Math.max(maxPageBlock, maxPlacement) + 1;

  const { data: placement, error } = await admin
    .from('page_block_placements')
    .insert({
      page_path,
      page_type: page_type || 'page',
      block_id: blockId,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ data: placement }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id: blockId } = await params;
  const { searchParams } = request.nextUrl;
  const placementId = searchParams.get('placementId');

  if (!placementId) {
    return NextResponse.json({ error: 'placementId is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('page_block_placements')
    .delete()
    .eq('id', placementId)
    .eq('block_id', blockId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ success: true });
}
