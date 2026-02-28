import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET    /api/admin/cms/content/[id]  — Get single block
// PATCH  /api/admin/cms/content/[id]  — Update block
// DELETE /api/admin/cms/content/[id]  — Delete block
// ---------------------------------------------------------------------------

const ALLOWED_FIELDS = ['title', 'content', 'block_type', 'is_active', 'sort_order', 'global_name'];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('page_content_blocks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  // Filter to allowed fields only
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('page_content_blocks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.seo.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin
    .from('page_content_blocks')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-content');

  return NextResponse.json({ success: true });
}
