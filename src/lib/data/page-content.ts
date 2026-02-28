import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PageContentBlock, ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Page Content Blocks — Data Access Layer
// ---------------------------------------------------------------------------

/**
 * Get all active content blocks for a page (public-facing, sorted).
 * Merges page-scoped blocks AND global blocks placed on this page.
 */
export const getPageContentBlocks = unstable_cache(
  async (pagePath: string): Promise<PageContentBlock[]> => {
    const supabase = createAdminClient();

    // 1. Fetch page-scoped blocks
    const { data: pageBlocks, error: pageErr } = await supabase
      .from('page_content_blocks')
      .select('*')
      .eq('page_path', pagePath)
      .eq('is_global', false)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (pageErr) {
      console.error('Failed to load page content blocks:', pageErr);
      return [];
    }

    // 2. Fetch global block placements for this page
    const { data: placements, error: placementErr } = await supabase
      .from('page_block_placements')
      .select('id, sort_order, block_id')
      .eq('page_path', pagePath)
      .order('sort_order', { ascending: true });

    if (placementErr) {
      console.error('Failed to load global block placements:', placementErr);
      return (pageBlocks ?? []) as PageContentBlock[];
    }

    if (!placements || placements.length === 0) {
      return (pageBlocks ?? []) as PageContentBlock[];
    }

    // 3. Fetch the global blocks themselves
    const blockIds = placements.map((p) => p.block_id);
    const { data: globalBlocks, error: globalErr } = await supabase
      .from('page_content_blocks')
      .select('*')
      .in('id', blockIds)
      .eq('is_active', true);

    if (globalErr) {
      console.error('Failed to load global blocks:', globalErr);
      return (pageBlocks ?? []) as PageContentBlock[];
    }

    // Map block_id → block for quick lookup
    const blockMap = new Map((globalBlocks ?? []).map((b) => [b.id, b]));

    // Build merged list: use placement sort_order for global blocks
    const globalWithSort: PageContentBlock[] = placements
      .map((p) => {
        const block = blockMap.get(p.block_id);
        if (!block) return null;
        return { ...block, sort_order: p.sort_order } as PageContentBlock;
      })
      .filter(Boolean) as PageContentBlock[];

    // 4. Merge & sort
    const all = [...(pageBlocks ?? []) as PageContentBlock[], ...globalWithSort];
    all.sort((a, b) => a.sort_order - b.sort_order);

    return all;
  },
  ['page-content-blocks'],
  { revalidate: 300, tags: ['cms-content'] }
);

/**
 * Get all content blocks for a page including inactive (admin).
 * Merges page-scoped blocks AND global blocks placed on this page.
 */
export async function getPageContentBlocksAdmin(pagePath: string): Promise<PageContentBlock[]> {
  const admin = createAdminClient();

  // 1. Fetch page-scoped blocks
  const { data: pageBlocks, error: pageErr } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .eq('is_global', false)
    .order('sort_order', { ascending: true });

  if (pageErr) {
    console.error('Failed to load page content blocks (admin):', pageErr);
    return [];
  }

  // 2. Fetch global block placements for this page
  const { data: placements, error: placementErr } = await admin
    .from('page_block_placements')
    .select('id, sort_order, block_id')
    .eq('page_path', pagePath)
    .order('sort_order', { ascending: true });

  if (placementErr || !placements || placements.length === 0) {
    return (pageBlocks ?? []) as PageContentBlock[];
  }

  // 3. Fetch the global blocks
  const blockIds = placements.map((p) => p.block_id);
  const { data: globalBlocks } = await admin
    .from('page_content_blocks')
    .select('*')
    .in('id', blockIds);

  const blockMap = new Map((globalBlocks ?? []).map((b) => [b.id, b]));

  // 4. Get usage counts for these global blocks
  const usageCounts = await getGlobalBlockUsageCounts(blockIds);

  const globalWithSort: PageContentBlock[] = placements
    .map((p) => {
      const block = blockMap.get(p.block_id);
      if (!block) return null;
      return {
        ...block,
        sort_order: p.sort_order,
        _placement_id: p.id,
        _usage_count: usageCounts.get(p.block_id) ?? 0,
      } as PageContentBlock;
    })
    .filter(Boolean) as PageContentBlock[];

  // 5. Merge & sort
  const all = [...(pageBlocks ?? []) as PageContentBlock[], ...globalWithSort];
  all.sort((a, b) => a.sort_order - b.sort_order);

  return all;
}

/**
 * Get usage counts for global blocks (how many pages reference each).
 */
async function getGlobalBlockUsageCounts(blockIds: string[]): Promise<Map<string, number>> {
  if (blockIds.length === 0) return new Map();
  const admin = createAdminClient();

  const { data } = await admin
    .from('page_block_placements')
    .select('block_id')
    .in('block_id', blockIds);

  const counts = new Map<string, number>();
  (data ?? []).forEach((row) => {
    counts.set(row.block_id, (counts.get(row.block_id) ?? 0) + 1);
  });
  return counts;
}

/**
 * Create a new content block.
 */
export async function createContentBlock(data: {
  page_path: string;
  page_type: string;
  block_type: ContentBlockType;
  title?: string | null;
  content: string;
  sort_order?: number;
  is_active?: boolean;
  is_global?: boolean;
  global_name?: string | null;
  ai_generated?: boolean;
}): Promise<PageContentBlock> {
  const admin = createAdminClient();

  // Auto-calculate sort_order if not provided
  if (data.sort_order === undefined) {
    const { data: existing } = await admin
      .from('page_content_blocks')
      .select('sort_order')
      .eq('page_path', data.page_path)
      .order('sort_order', { ascending: false })
      .limit(1);

    data.sort_order = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
  }

  const { data: block, error } = await admin
    .from('page_content_blocks')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create content block: ${error.message}`);
  return block as PageContentBlock;
}

/**
 * Update a content block.
 */
export async function updateContentBlock(
  id: string,
  updates: Partial<Pick<PageContentBlock, 'title' | 'content' | 'block_type' | 'is_active' | 'sort_order' | 'ai_generated' | 'ai_last_generated_at' | 'global_name'>>
): Promise<PageContentBlock> {
  const admin = createAdminClient();

  const { data: block, error } = await admin
    .from('page_content_blocks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update content block: ${error.message}`);
  return block as PageContentBlock;
}

/**
 * Delete a content block.
 */
export async function deleteContentBlock(id: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('page_content_blocks')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete content block: ${error.message}`);
}

/**
 * Reorder content blocks for a page.
 * Handles both page-scoped blocks (update page_content_blocks.sort_order)
 * and global blocks on this page (update page_block_placements.sort_order).
 */
export async function reorderContentBlocks(
  pagePath: string,
  orderedIds: string[],
  placementMap?: Record<string, string> // blockId → placementId
): Promise<void> {
  const admin = createAdminClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const blockId = orderedIds[i];
    const placementId = placementMap?.[blockId];

    if (placementId) {
      // Global block — update placement sort_order
      const { error } = await admin
        .from('page_block_placements')
        .update({ sort_order: i })
        .eq('id', placementId);

      if (error) throw new Error(`Failed to reorder placement ${placementId}: ${error.message}`);
    } else {
      // Page-scoped block — update block sort_order
      const { error } = await admin
        .from('page_content_blocks')
        .update({ sort_order: i, updated_at: new Date().toISOString() })
        .eq('id', blockId)
        .eq('page_path', pagePath);

      if (error) throw new Error(`Failed to reorder block ${blockId}: ${error.message}`);
    }
  }
}

/**
 * Bulk insert content blocks for a page (used by AI generation).
 */
export async function bulkCreateContentBlocks(
  pagePath: string,
  pageType: string,
  blocks: Array<{
    block_type: ContentBlockType;
    title: string | null;
    content: string;
    sort_order: number;
  }>
): Promise<PageContentBlock[]> {
  const admin = createAdminClient();

  const rows = blocks.map((b) => ({
    page_path: pagePath,
    page_type: pageType,
    block_type: b.block_type,
    title: b.title,
    content: b.content,
    sort_order: b.sort_order,
    ai_generated: true,
    ai_last_generated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin
    .from('page_content_blocks')
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to bulk create content blocks: ${error.message}`);
  return data as PageContentBlock[];
}

/**
 * Get all global blocks with usage counts (for management view).
 */
export async function getAllGlobalBlocks(): Promise<PageContentBlock[]> {
  const admin = createAdminClient();

  const { data: blocks, error } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('is_global', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to load global blocks:', error);
    return [];
  }

  if (!blocks || blocks.length === 0) return [];

  // Get usage counts
  const blockIds = blocks.map((b) => b.id);
  const usageCounts = await getGlobalBlockUsageCounts(blockIds);

  return blocks.map((b) => ({
    ...b,
    _usage_count: usageCounts.get(b.id) ?? 0,
  })) as PageContentBlock[];
}

/**
 * Place a global block on a page.
 */
export async function placeGlobalBlock(pagePath: string, pageType: string, blockId: string, sortOrder: number): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('page_block_placements')
    .insert({ page_path: pagePath, page_type: pageType, block_id: blockId, sort_order: sortOrder });

  if (error) throw new Error(`Failed to place global block: ${error.message}`);
}

/**
 * Remove a global block from a page (does NOT delete the block itself).
 */
export async function removeGlobalBlockPlacement(placementId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('page_block_placements')
    .delete()
    .eq('id', placementId);

  if (error) throw new Error(`Failed to remove block placement: ${error.message}`);
}

/**
 * Permanently delete a global block and all its placements.
 */
export async function deleteGlobalBlock(blockId: string): Promise<void> {
  const admin = createAdminClient();

  // Placements are CASCADE-deleted via FK
  const { error } = await admin
    .from('page_content_blocks')
    .delete()
    .eq('id', blockId)
    .eq('is_global', true);

  if (error) throw new Error(`Failed to delete global block: ${error.message}`);
}
