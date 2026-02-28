import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/navigation?placement=header  — List nav items
// POST /api/admin/cms/navigation  — Create a nav item
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const placement = request.nextUrl.searchParams.get('placement');
  const pageId = request.nextUrl.searchParams.get('page_id');

  const admin = createAdminClient();
  let query = admin
    .from('website_navigation')
    .select('*')
    .order('sort_order', { ascending: true });

  if (placement) {
    query = query.eq('placement', placement);
  }

  if (pageId) {
    query = query.eq('page_id', pageId);
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

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { placement, label, url, page_id, parent_id, target, icon, is_active } = body;

  if (!placement || !label) {
    return NextResponse.json({ error: 'placement and label are required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('website_navigation')
    .select('sort_order')
    .eq('placement', placement)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('website_navigation')
    .insert({
      placement,
      label,
      url: url || '#',
      page_id: page_id || null,
      parent_id: parent_id || null,
      target: target || '_self',
      icon: icon || null,
      is_active: is_active ?? true,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-navigation');
  revalidateTag('footer-data');

  return NextResponse.json({ data }, { status: 201 });
}
