import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/credentials — List all credentials (ordered by sort_order)
// POST /api/admin/credentials — Create a new credential
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
    .from('credentials')
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
  const { title, description, image_url, is_active } = body;

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('credentials')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('credentials')
    .insert({
      title: title.trim(),
      description: description || null,
      image_url: image_url || null,
      sort_order: sortOrder,
      is_active: is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('credentials');

  return NextResponse.json({ data }, { status: 201 });
}
