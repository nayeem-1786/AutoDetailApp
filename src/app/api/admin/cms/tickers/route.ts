import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/tickers — List all tickers
// POST /api/admin/cms/tickers — Create a new ticker
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcement_tickers')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.tickers.manage');
  if (denied) return denied;

  const body = await request.json();
  const admin = createAdminClient();

  // Get next sort_order
  const { data: last } = await admin
    .from('announcement_tickers')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from('announcement_tickers')
    .insert({
      message: body.message ?? 'New announcement',
      link_url: body.link_url ?? null,
      link_text: body.link_text ?? null,
      placement: body.placement ?? 'top_bar',
      section_position: body.section_position ?? null,
      bg_color: body.bg_color ?? '#1e3a5f',
      text_color: body.text_color ?? '#ffffff',
      scroll_speed: body.scroll_speed ?? 'normal',
      font_size: body.font_size ?? 'sm',
      target_pages: body.target_pages ?? null,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      is_active: body.is_active ?? true,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
