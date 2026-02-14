import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { getKnownPages } from '@/lib/seo/known-pages';
import type { PageSeoType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/seo/pages — List all page_seo rows with optional filters
// POST /api/admin/cms/seo/pages — Auto-populate missing pages
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { searchParams } = request.nextUrl;
  const pageType = searchParams.get('page_type');
  const hasFocusKeyword = searchParams.get('has_focus_keyword');

  const admin = createAdminClient();
  let query = admin
    .from('page_seo')
    .select('*')
    .order('page_path', { ascending: true });

  if (pageType) {
    query = query.eq('page_type', pageType);
  }

  if (hasFocusKeyword === 'true') {
    query = query.not('focus_keyword', 'is', null).neq('focus_keyword', '');
  } else if (hasFocusKeyword === 'false') {
    query = query.or('focus_keyword.is.null,focus_keyword.eq.');
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const body = await request.json();
  const { pages } = body as { pages?: Array<{ path: string; page_type: PageSeoType; title: string }> };

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    // Auto-populate: discover all known pages and create missing rows
    const knownPages = await getKnownPages();
    const admin = createAdminClient();

    // Get existing paths
    const { data: existing } = await admin
      .from('page_seo')
      .select('page_path');

    const existingPaths = new Set((existing ?? []).map((r) => r.page_path));
    const missing = knownPages.filter((p) => !existingPaths.has(p.path));

    if (missing.length === 0) {
      return NextResponse.json({ data: [], message: 'All pages already have SEO entries' });
    }

    const rows = missing.map((p) => ({
      page_path: p.path,
      page_type: p.page_type,
      seo_title: p.title,
      is_auto_generated: true,
    }));

    const { data: inserted, error } = await admin
      .from('page_seo')
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: inserted,
      message: `Created ${inserted?.length ?? 0} SEO entries`,
    }, { status: 201 });
  }

  // Manual creation with provided pages
  const admin = createAdminClient();
  const rows = pages.map((p) => ({
    page_path: p.path,
    page_type: p.page_type,
    seo_title: p.title,
    is_auto_generated: true,
  }));

  const { data: inserted, error } = await admin
    .from('page_seo')
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}
