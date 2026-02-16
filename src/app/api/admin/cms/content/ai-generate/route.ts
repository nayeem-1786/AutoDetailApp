import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import {
  generatePageContent,
  getBusinessContext,
  buildCityContext,
  buildServiceContext,
  type ContentWriterContext,
  type ContentWriterResult,
} from '@/lib/services/ai-content-writer';
import type { ContentBlockType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/content/ai-generate
// Modes: full_page, single_block, improve, batch_cities
// ---------------------------------------------------------------------------

interface GenerateRequest {
  mode: 'full_page' | 'single_block' | 'improve' | 'batch_cities';
  pagePath?: string;
  pageType?: string;
  blockType?: ContentBlockType;
  existingContent?: string;
  additionalInstructions?: string;
  focusKeywords?: string[];
  targetWordCount?: number;
  autoSave?: boolean; // If true, save blocks to DB immediately
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = (await request.json()) as GenerateRequest;
  const { mode, pagePath, pageType, blockType, existingContent, additionalInstructions, focusKeywords, targetWordCount, autoSave } = body;

  if (!mode) {
    return NextResponse.json({ error: 'mode is required' }, { status: 400 });
  }

  const biz = await getBusinessContext();

  // ---------------------------------------------------------------------------
  // BATCH CITIES MODE
  // ---------------------------------------------------------------------------
  if (mode === 'batch_cities') {
    const admin = createAdminClient();

    // Get all active cities
    const { data: cities } = await admin
      .from('city_landing_pages')
      .select('slug, city_name, distance_miles, local_landmarks, focus_keywords')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!cities || cities.length === 0) {
      return NextResponse.json({ data: { totalCities: 0, results: [] } });
    }

    // Filter to cities without content blocks
    const cityPaths = cities.map((c) => `/areas/${c.slug}`);
    const { data: existingBlocks } = await admin
      .from('page_content_blocks')
      .select('page_path')
      .in('page_path', cityPaths);

    const pathsWithContent = new Set(
      (existingBlocks ?? []).map((b) => b.page_path)
    );

    const citiesWithoutContent = cities.filter(
      (c) => !pathsWithContent.has(`/areas/${c.slug}`)
    );

    if (citiesWithoutContent.length === 0) {
      return NextResponse.json({
        data: { totalCities: 0, results: [], message: 'All cities already have content blocks' },
      });
    }

    const results: Array<{
      pagePath: string;
      cityName: string;
      status: 'success' | 'error';
      blocks?: ContentWriterResult['blocks'];
      error?: string;
    }> = [];

    // Generate sequentially to avoid rate limits
    for (const city of citiesWithoutContent) {
      const cityPath = `/areas/${city.slug}`;
      try {
        const cityFocusKeywords: string[] = [];
        if (city.focus_keywords) {
          cityFocusKeywords.push(
            ...city.focus_keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
          );
        }

        const ctx: ContentWriterContext = {
          ...biz,
          pagePath: cityPath,
          pageType: 'city_landing',
          contentType: 'full_page',
          cityName: city.city_name,
          cityDistance: city.distance_miles ? `${city.distance_miles} miles from Lomita` : undefined,
          localLandmarks: typeof city.local_landmarks === 'string' ? city.local_landmarks : undefined,
          focusKeywords: cityFocusKeywords.length > 0 ? cityFocusKeywords : undefined,
          additionalInstructions,
        };

        const result = await generatePageContent(ctx);

        // Auto-save blocks
        if (autoSave !== false) {
          const now = new Date().toISOString();
          const rows = result.blocks.map((b) => ({
            page_path: cityPath,
            page_type: 'city_landing',
            block_type: b.block_type,
            title: b.title,
            content: b.content,
            sort_order: b.sort_order,
            ai_generated: true,
            ai_last_generated_at: now,
          }));

          await admin.from('page_content_blocks').insert(rows);
        }

        results.push({
          pagePath: cityPath,
          cityName: city.city_name,
          status: 'success',
          blocks: result.blocks,
        });
      } catch (err) {
        results.push({
          pagePath: cityPath,
          cityName: city.city_name,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    revalidateTag('cms-content');

    return NextResponse.json({
      data: {
        totalCities: citiesWithoutContent.length,
        successCount: results.filter((r) => r.status === 'success').length,
        results,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // SINGLE PAGE MODES (full_page, single_block, improve)
  // ---------------------------------------------------------------------------

  if (!pagePath) {
    return NextResponse.json({ error: 'pagePath is required' }, { status: 400 });
  }

  const resolvedPageType = pageType || 'custom';

  // Build page-specific context
  let pageCtx: Partial<ContentWriterContext> = {};
  if (resolvedPageType === 'city_landing') {
    const citySlug = pagePath.replace('/areas/', '');
    pageCtx = await buildCityContext(citySlug);
  } else if (resolvedPageType === 'service_detail') {
    const match = pagePath.match(/^\/services\/([^/]+)\/([^/]+)$/);
    if (match) {
      pageCtx = await buildServiceContext(match[1], match[2]);
    }
  }

  const contentType = mode === 'improve' ? 'improve' as const :
    mode === 'single_block' ? 'section' as const :
    'full_page' as const;

  const ctx: ContentWriterContext = {
    ...biz,
    ...pageCtx,
    pagePath,
    pageType: resolvedPageType,
    contentType,
    blockType: blockType || 'rich_text',
    existingContent,
    additionalInstructions,
    focusKeywords: focusKeywords || pageCtx.focusKeywords,
    targetWordCount,
  };

  try {
    const result = await generatePageContent(ctx);

    // Auto-save if requested
    if (autoSave && result.blocks.length > 0) {
      const admin = createAdminClient();
      const now = new Date().toISOString();

      // For full_page mode, delete existing AI blocks first
      if (mode === 'full_page') {
        await admin
          .from('page_content_blocks')
          .delete()
          .eq('page_path', pagePath)
          .eq('ai_generated', true);
      }

      const rows = result.blocks.map((b) => ({
        page_path: pagePath,
        page_type: resolvedPageType,
        block_type: b.block_type,
        title: b.title,
        content: b.content,
        sort_order: b.sort_order,
        ai_generated: true,
        ai_last_generated_at: now,
      }));

      await admin.from('page_content_blocks').insert(rows);
    }

    revalidateTag('cms-content');

    return NextResponse.json({
      data: {
        pagePath,
        blocks: result.blocks,
        seoNotes: result.seoNotes,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI generation failed' },
      { status: 500 }
    );
  }
}
