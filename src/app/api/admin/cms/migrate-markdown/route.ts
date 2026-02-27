import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { marked } from 'marked';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/migrate-markdown
// One-time migration: convert rich_text blocks from Markdown to HTML
// Supports dry-run mode (default) — pass { dryRun: false } to apply changes
// ---------------------------------------------------------------------------

interface MigrateRequest {
  dryRun?: boolean;
}

interface MigrationResult {
  id: string;
  page_path: string;
  title: string | null;
  contentPreview: string;
  htmlPreview: string;
  wasMarkdown: boolean;
}

function isHtml(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('<') || /<[a-z][\s\S]*>/i.test(trimmed);
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = (await request.json()) as MigrateRequest;
  const dryRun = body.dryRun !== false; // default to dry-run

  const admin = createAdminClient();

  // Fetch all rich_text blocks
  const { data: blocks, error } = await admin
    .from('page_content_blocks')
    .select('id, page_path, title, content, block_type')
    .eq('block_type', 'rich_text')
    .order('page_path', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!blocks || blocks.length === 0) {
    return NextResponse.json({
      data: {
        dryRun,
        totalBlocks: 0,
        markdownBlocks: 0,
        htmlBlocks: 0,
        results: [],
        message: 'No rich_text blocks found',
      },
    });
  }

  // Configure marked for clean HTML output
  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  const results: MigrationResult[] = [];
  let markdownCount = 0;
  let htmlCount = 0;
  let migratedCount = 0;

  for (const block of blocks) {
    const content = (block.content || '').trim();
    if (!content) continue;

    const alreadyHtml = isHtml(content);

    if (alreadyHtml) {
      htmlCount++;
      results.push({
        id: block.id,
        page_path: block.page_path,
        title: block.title,
        contentPreview: content.substring(0, 100),
        htmlPreview: '(already HTML)',
        wasMarkdown: false,
      });
      continue;
    }

    // Convert markdown to HTML
    markdownCount++;
    const html = (await marked.parse(content)).trim();

    results.push({
      id: block.id,
      page_path: block.page_path,
      title: block.title,
      contentPreview: content.substring(0, 100),
      htmlPreview: html.substring(0, 200),
      wasMarkdown: true,
    });

    // Apply migration if not dry-run
    if (!dryRun) {
      const { error: updateError } = await admin
        .from('page_content_blocks')
        .update({ content: html })
        .eq('id', block.id);

      if (!updateError) {
        migratedCount++;
      }
    }
  }

  return NextResponse.json({
    data: {
      dryRun,
      totalBlocks: blocks.length,
      markdownBlocks: markdownCount,
      htmlBlocks: htmlCount,
      migratedCount: dryRun ? 0 : migratedCount,
      results,
      message: dryRun
        ? `Dry run complete. ${markdownCount} block(s) contain Markdown and would be migrated.`
        : `Migration complete. ${migratedCount} block(s) converted from Markdown to HTML.`,
    },
  });
}
