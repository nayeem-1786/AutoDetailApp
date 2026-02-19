import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET    /api/admin/footer/bottom-links — List all bottom bar links
// POST   /api/admin/footer/bottom-links — Create a new bottom link
// PATCH  /api/admin/footer/bottom-links — Update a bottom link
// DELETE /api/admin/footer/bottom-links — Delete a bottom link
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('footer_bottom_links')
    .select('*')
    .order('sort_order', { ascending: true });

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
  const { label, url, open_in_new_tab } = body;

  if (!label || !url) {
    return NextResponse.json(
      { error: 'label and url are required' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('footer_bottom_links')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('footer_bottom_links')
    .insert({
      label,
      url,
      sort_order: sortOrder,
      open_in_new_tab: open_in_new_tab ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const body = await request.json();
  const { id, label, url, sort_order, is_enabled, open_in_new_tab } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (url !== undefined) updates.url = url;
  if (typeof sort_order === 'number') updates.sort_order = sort_order;
  if (typeof is_enabled === 'boolean') updates.is_enabled = is_enabled;
  if (typeof open_in_new_tab === 'boolean') updates.open_in_new_tab = open_in_new_tab;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('footer_bottom_links')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('footer_bottom_links')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');

  return NextResponse.json({ success: true });
}
