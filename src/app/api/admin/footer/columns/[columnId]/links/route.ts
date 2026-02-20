import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { checkIdempotency, saveIdempotency } from '@/lib/utils/idempotency';

// ---------------------------------------------------------------------------
// GET    /api/admin/footer/columns/[columnId]/links — List links for a column
// POST   /api/admin/footer/columns/[columnId]/links — Create a link
// PATCH  /api/admin/footer/columns/[columnId]/links — Update a link
// DELETE /api/admin/footer/columns/[columnId]/links — Delete a link
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { columnId } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('website_navigation')
    .select('*')
    .eq('footer_column_id', columnId)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const idempotencyKey = request.headers.get('x-idempotency-key');
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached;

  const { columnId } = await params;
  const body = await request.json();
  const { label, url, target } = body;

  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('website_navigation')
    .select('sort_order')
    .eq('footer_column_id', columnId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('website_navigation')
    .insert({
      placement: 'footer_quick_links',
      label,
      url: url || '#',
      target: target || '_self',
      footer_column_id: columnId,
      sort_order: sortOrder,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This link already exists in this column' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');
  revalidateTag('cms-navigation');

  const responseBody = { data };
  await saveIdempotency(idempotencyKey, responseBody, 201);

  return NextResponse.json(responseBody, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  await params; // ensure params resolved

  const body = await request.json();
  const { id, label, url, target, is_active, sort_order } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (url !== undefined) updates.url = url;
  if (target !== undefined) updates.target = target;
  if (typeof is_active === 'boolean') updates.is_active = is_active;
  if (typeof sort_order === 'number') updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('website_navigation')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');
  revalidateTag('cms-navigation');

  return NextResponse.json({ data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ columnId: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  await params; // ensure params resolved

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('website_navigation')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('footer-data');
  revalidateTag('cms-navigation');

  return NextResponse.json({ success: true });
}
