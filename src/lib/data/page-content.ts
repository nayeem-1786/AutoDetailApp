import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PageContentBlock, ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Page Content Blocks — Data Access Layer
// ---------------------------------------------------------------------------

/**
 * Get all active content blocks for a page (public-facing, sorted).
 */
export async function getPageContentBlocks(pagePath: string): Promise<PageContentBlock[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load page content blocks:', error);
    return [];
  }

  return data as PageContentBlock[];
}

/**
 * Get all content blocks for a page including inactive (admin).
 */
export async function getPageContentBlocksAdmin(pagePath: string): Promise<PageContentBlock[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('page_path', pagePath)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Failed to load page content blocks (admin):', error);
    return [];
  }

  return data as PageContentBlock[];
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
  updates: Partial<Pick<PageContentBlock, 'title' | 'content' | 'block_type' | 'is_active' | 'sort_order' | 'ai_generated' | 'ai_last_generated_at'>>
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
 */
export async function reorderContentBlocks(pagePath: string, orderedIds: string[]): Promise<void> {
  const admin = createAdminClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from('page_content_blocks')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('page_path', pagePath);

    if (error) throw new Error(`Failed to reorder block ${orderedIds[i]}: ${error.message}`);
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
