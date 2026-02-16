import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { generateSeoByPath, type AiSeoResult } from '@/lib/services/ai-seo';
import { getKnownPages } from '@/lib/seo/known-pages';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/seo/ai-generate
// Modes: single (one page), global (all pages), batch (specific pages)
// ---------------------------------------------------------------------------

interface GenerateRequest {
  mode: 'single' | 'global' | 'batch';
  pagePath?: string;
  pagePaths?: string[];
  overwriteExisting?: boolean;
}

interface PageResult {
  pagePath: string;
  generated: AiSeoResult;
  current: {
    seo_title: string | null;
    meta_description: string | null;
    meta_keywords: string | null;
    focus_keyword: string | null;
    og_title: string | null;
    og_description: string | null;
  };
  status: 'success' | 'error';
  error?: string;
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = (await request.json()) as GenerateRequest;
  const { mode, pagePath, pagePaths, overwriteExisting = false } = body;

  if (!mode || !['single', 'global', 'batch'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode. Must be single, global, or batch.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch business info for AI context
  const { data: settings } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['business_name', 'business_address']);

  const s: Record<string, unknown> = {};
  for (const row of settings ?? []) s[row.key] = row.value;
  const addr = typeof s.business_address === 'object' && s.business_address !== null
    ? s.business_address as { city: string; state: string }
    : { city: 'Lomita', state: 'CA' };
  const businessName = (s.business_name as string) || 'Smart Detail Auto Spa & Supplies';
  const businessLocation = `${addr.city}, ${addr.state}`;

  // ---------------------------------------------------------------------------
  // SINGLE MODE
  // ---------------------------------------------------------------------------
  if (mode === 'single') {
    if (!pagePath) {
      return NextResponse.json({ error: 'pagePath is required for single mode' }, { status: 400 });
    }

    // Get current SEO
    const { data: currentRow } = await admin
      .from('page_seo')
      .select('*')
      .eq('page_path', pagePath)
      .maybeSingle();

    const currentSeo = currentRow ? {
      seo_title: currentRow.seo_title,
      meta_description: currentRow.meta_description,
      meta_keywords: currentRow.meta_keywords,
      focus_keyword: currentRow.focus_keyword,
      og_title: currentRow.og_title,
      og_description: currentRow.og_description,
    } : undefined;

    try {
      const generated = await generateSeoByPath(
        pagePath,
        currentRow?.page_type || 'custom',
        currentRow?.seo_title || pagePath,
        businessName,
        businessLocation,
        currentSeo
      );

      return NextResponse.json({
        data: {
          pagePath,
          generated,
          current: currentSeo || {
            seo_title: null,
            meta_description: null,
            meta_keywords: null,
            focus_keyword: null,
            og_title: null,
            og_description: null,
          },
        },
      });
    } catch (err) {
      return NextResponse.json({
        error: err instanceof Error ? err.message : 'AI generation failed',
      }, { status: 500 });
    }
  }

  // ---------------------------------------------------------------------------
  // GLOBAL / BATCH MODE
  // ---------------------------------------------------------------------------
  let targetPaths: string[] = [];

  if (mode === 'global') {
    // Get all known pages
    const knownPages = await getKnownPages();
    const allPaths = knownPages.map(p => p.path);

    if (!overwriteExisting) {
      // Only generate for pages with empty/auto-generated SEO
      const { data: existing } = await admin
        .from('page_seo')
        .select('page_path, is_auto_generated, seo_title, meta_description, focus_keyword')
        .in('page_path', allPaths);

      const existingMap = new Map(
        (existing ?? []).map(e => [e.page_path, e])
      );

      targetPaths = allPaths.filter(path => {
        const row = existingMap.get(path);
        if (!row) return true; // No SEO entry at all
        if (row.is_auto_generated) return true; // Auto-generated
        if (!row.meta_description && !row.focus_keyword) return true; // Empty
        return false;
      });
    } else {
      targetPaths = allPaths;
    }
  } else if (mode === 'batch') {
    if (!pagePaths || !Array.isArray(pagePaths) || pagePaths.length === 0) {
      return NextResponse.json({ error: 'pagePaths is required for batch mode' }, { status: 400 });
    }
    targetPaths = pagePaths;
  }

  if (targetPaths.length === 0) {
    return NextResponse.json({
      data: { totalPages: 0, results: [], errors: [] },
    });
  }

  // Fetch current SEO for all target pages
  const { data: currentRows } = await admin
    .from('page_seo')
    .select('*')
    .in('page_path', targetPaths);

  const currentMap = new Map(
    (currentRows ?? []).map(r => [r.page_path, r])
  );

  // Fetch known pages for type/title info
  const knownPages = await getKnownPages();
  const knownMap = new Map(knownPages.map(p => [p.path, p]));

  // Generate SEO for each page sequentially (to avoid rate limits)
  const results: PageResult[] = [];
  const errors: Array<{ pagePath: string; error: string }> = [];

  for (const path of targetPaths) {
    const currentRow = currentMap.get(path);
    const knownPage = knownMap.get(path);

    const currentSeo = currentRow ? {
      seo_title: currentRow.seo_title,
      meta_description: currentRow.meta_description,
      meta_keywords: currentRow.meta_keywords,
      focus_keyword: currentRow.focus_keyword,
      og_title: currentRow.og_title,
      og_description: currentRow.og_description,
    } : undefined;

    try {
      const generated = await generateSeoByPath(
        path,
        currentRow?.page_type || knownPage?.page_type || 'custom',
        currentRow?.seo_title || knownPage?.title || path,
        businessName,
        businessLocation,
        overwriteExisting ? currentSeo : undefined
      );

      results.push({
        pagePath: path,
        generated,
        current: currentSeo || {
          seo_title: null,
          meta_description: null,
          meta_keywords: null,
          focus_keyword: null,
          og_title: null,
          og_description: null,
        },
        status: 'success',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push({ pagePath: path, error: errorMsg });
      results.push({
        pagePath: path,
        generated: {
          seo_title: '',
          meta_description: '',
          meta_keywords: '',
          focus_keyword: '',
          og_title: '',
          og_description: '',
          suggestions: [],
        },
        current: currentSeo || {
          seo_title: null,
          meta_description: null,
          meta_keywords: null,
          focus_keyword: null,
          og_title: null,
          og_description: null,
        },
        status: 'error',
        error: errorMsg,
      });
    }
  }

  return NextResponse.json({
    data: {
      totalPages: targetPaths.length,
      results,
      errors,
    },
  });
}
