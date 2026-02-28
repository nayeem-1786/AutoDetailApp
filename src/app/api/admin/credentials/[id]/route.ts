import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET    /api/admin/credentials/[id] — Get single credential
// PATCH  /api/admin/credentials/[id] — Update credential
// DELETE /api/admin/credentials/[id] — Delete credential
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('credentials')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { title, description, image_url, sort_order, is_active } = body;

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description || null;
  if (image_url !== undefined) updates.image_url = image_url || null;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (is_active !== undefined) updates.is_active = is_active;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('credentials')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('credentials');

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from('credentials')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('credentials');

  return NextResponse.json({ success: true });
}
