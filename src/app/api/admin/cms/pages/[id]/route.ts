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

  // Fetch current page to detect slug changes
  const { data: currentPage } = await admin
    .from('website_pages')
    .select('slug')
    .eq('id', id)
    .single();

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

  // Clear preview token when publishing (page is now live, token unnecessary)
  if (body.is_published === true) {
    updates.preview_token = null;
    updates.preview_token_expires_at = null;
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

  // If slug changed, update associated nav item URL
  if ('slug' in body && currentPage && body.slug !== currentPage.slug) {
    await admin
      .from('website_navigation')
      .update({ url: `/p/${data.slug}` })
      .eq('page_id', id);
  }

  // --- Auto-save revision snapshot ---
  try {
    // Fetch content blocks for this page
    const { data: blocks } = await admin
      .from('page_content_blocks')
      .select('*')
      .eq('page_path', `/p/${data.slug}`)
      .order('sort_order');

    // Get the previous revision for change summary comparison
    const { data: lastRevision } = await admin
      .from('page_revisions')
      .select('revision_number, snapshot')
      .eq('page_id', id)
      .order('revision_number', { ascending: false })
      .limit(1)
      .single();

    const nextNumber = (lastRevision?.revision_number || 0) + 1;

    const snapshot = {
      page: data,
      blocks: blocks || [],
      savedAt: new Date().toISOString(),
    };

    const changeSummary = generateChangeSummary(
      lastRevision?.snapshot as Record<string, unknown> | null,
      snapshot
    );

    await admin.from('page_revisions').insert({
      page_id: id,
      revision_number: nextNumber,
      snapshot,
      change_summary: changeSummary,
      created_by: employee.id,
    });

    // Prune old revisions — keep only last 20 per page
    if (nextNumber > 20) {
      await admin
        .from('page_revisions')
        .delete()
        .eq('page_id', id)
        .lt('revision_number', nextNumber - 19);
    }
  } catch {
    // Non-critical — don't fail the page save if revision tracking errors
    console.error('Failed to save page revision');
  }

  revalidateTag('cms-pages');
  revalidateTag('cms-navigation');

  return NextResponse.json({ data });
}

// ---------------------------------------------------------------------------
// generateChangeSummary — compare old and new snapshots to describe changes
// ---------------------------------------------------------------------------
function generateChangeSummary(
  oldSnapshot: Record<string, unknown> | null,
  newSnapshot: { page: Record<string, unknown>; blocks: unknown[] }
): string {
  if (!oldSnapshot) return 'Initial revision';

  const changes: string[] = [];
  const oldPage = (oldSnapshot.page || {}) as Record<string, unknown>;
  const newPage = newSnapshot.page;

  if (oldPage.title !== newPage.title) changes.push('Updated title');
  if (oldPage.content !== newPage.content) changes.push('Updated content');
  if (oldPage.meta_title !== newPage.meta_title) changes.push('Updated meta title');
  if (oldPage.meta_description !== newPage.meta_description) changes.push('Updated meta description');
  if (oldPage.is_published !== newPage.is_published) {
    changes.push(newPage.is_published ? 'Published' : 'Unpublished');
  }
  if (oldPage.page_template !== newPage.page_template) changes.push('Changed template');
  if (oldPage.slug !== newPage.slug) changes.push('Changed slug');

  const oldBlockCount = Array.isArray(oldSnapshot.blocks) ? oldSnapshot.blocks.length : 0;
  const newBlockCount = newSnapshot.blocks.length;
  if (newBlockCount > oldBlockCount) changes.push(`Added ${newBlockCount - oldBlockCount} block(s)`);
  if (newBlockCount < oldBlockCount) changes.push(`Removed ${oldBlockCount - newBlockCount} block(s)`);

  return changes.length > 0 ? changes.join(', ') : 'Minor changes';
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
