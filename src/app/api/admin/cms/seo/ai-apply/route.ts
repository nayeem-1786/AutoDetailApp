import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/seo/ai-apply
// Apply AI-generated (or admin-edited) SEO to page_seo table
// ---------------------------------------------------------------------------

interface ApplyPage {
  pagePath: string;
  seo_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  focus_keyword?: string;
  og_title?: string;
  og_description?: string;
}

interface ApplyRequest {
  pages: ApplyPage[];
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = (await request.json()) as ApplyRequest;
  const { pages } = body;

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return NextResponse.json({ error: 'pages array is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const results: Array<{ pagePath: string; status: 'success' | 'error'; error?: string }> = [];

  for (const page of pages) {
    const updates: Record<string, unknown> = {
      is_auto_generated: false,
      updated_at: new Date().toISOString(),
    };

    if (page.seo_title !== undefined) updates.seo_title = page.seo_title || null;
    if (page.meta_description !== undefined) updates.meta_description = page.meta_description || null;
    if (page.meta_keywords !== undefined) updates.meta_keywords = page.meta_keywords || null;
    if (page.focus_keyword !== undefined) updates.focus_keyword = page.focus_keyword || null;
    if (page.og_title !== undefined) updates.og_title = page.og_title || null;
    if (page.og_description !== undefined) updates.og_description = page.og_description || null;

    // Check if row exists
    const { data: existing } = await admin
      .from('page_seo')
      .select('id')
      .eq('page_path', page.pagePath)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('page_seo')
        .update(updates)
        .eq('page_path', page.pagePath);

      if (error) {
        results.push({ pagePath: page.pagePath, status: 'error', error: error.message });
      } else {
        results.push({ pagePath: page.pagePath, status: 'success' });
      }
    } else {
      // Create new row
      const { error } = await admin
        .from('page_seo')
        .insert({ page_path: page.pagePath, ...updates });

      if (error) {
        results.push({ pagePath: page.pagePath, status: 'error', error: error.message });
      } else {
        results.push({ pagePath: page.pagePath, status: 'success' });
      }
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;

  revalidateTag('cms-seo');
  return NextResponse.json({
    data: {
      applied: successCount,
      failed: errorCount,
      results,
    },
    message: `Applied SEO to ${successCount} page${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
  });
}
