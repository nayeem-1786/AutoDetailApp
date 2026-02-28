import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/pages/[id]/revisions/[revisionId]/restore
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string; revisionId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id, revisionId } = await context.params;
  const admin = createAdminClient();

  // 1. Fetch the revision snapshot
  const { data: revision, error: revError } = await admin
    .from('page_revisions')
    .select('*')
    .eq('id', revisionId)
    .eq('page_id', id)
    .single();

  if (revError || !revision) {
    return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  }

  const snapshot = revision.snapshot as {
    page: Record<string, unknown>;
    blocks: Array<Record<string, unknown>>;
  };

  // 2. Update website_pages with the snapshot's page data
  const pageData = snapshot.page;
  const { error: updateError } = await admin
    .from('website_pages')
    .update({
      title: pageData.title,
      slug: pageData.slug,
      page_template: pageData.page_template,
      parent_id: pageData.parent_id || null,
      content: pageData.content || '',
      is_published: pageData.is_published,
      show_in_nav: pageData.show_in_nav,
      meta_title: pageData.meta_title || null,
      meta_description: pageData.meta_description || null,
      og_image_url: pageData.og_image_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // 3. Delete all current content blocks for this page
  const pagePath = `/p/${pageData.slug}`;
  await admin
    .from('page_content_blocks')
    .delete()
    .eq('page_path', pagePath);

  // 4. Re-insert all content blocks from the snapshot (new UUIDs to avoid conflicts)
  if (snapshot.blocks && snapshot.blocks.length > 0) {
    const blocksToInsert = snapshot.blocks.map((block) => ({
      page_path: pagePath,
      page_type: block.page_type || 'custom',
      block_type: block.block_type || 'rich_text',
      title: block.title || null,
      content: block.content || '',
      sort_order: block.sort_order ?? 0,
      is_active: block.is_active ?? true,
      ai_generated: block.ai_generated ?? false,
    }));

    await admin.from('page_content_blocks').insert(blocksToInsert);
  }

  // 5. Create a new revision recording the restore
  const { data: lastRevision } = await admin
    .from('page_revisions')
    .select('revision_number')
    .eq('page_id', id)
    .order('revision_number', { ascending: false })
    .limit(1)
    .single();

  const nextNumber = (lastRevision?.revision_number || 0) + 1;

  // Re-fetch the restored page for snapshot
  const { data: restoredPage } = await admin
    .from('website_pages')
    .select('*')
    .eq('id', id)
    .single();

  const { data: restoredBlocks } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .order('sort_order');

  await admin.from('page_revisions').insert({
    page_id: id,
    revision_number: nextNumber,
    snapshot: {
      page: restoredPage,
      blocks: restoredBlocks || [],
      savedAt: new Date().toISOString(),
    },
    change_summary: `Restored to revision #${revision.revision_number}`,
    created_by: employee.id,
  });

  revalidateTag('cms-pages');

  return NextResponse.json({ success: true });
}
