import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { revalidateTag } from '@/lib/utils/revalidate';

// ---------------------------------------------------------------------------
// GET    /api/admin/cms/ads/creatives/[id] — Get single creative
// PATCH  /api/admin/cms/ads/creatives/[id] — Update creative
// DELETE /api/admin/cms/ads/creatives/[id] — Delete creative (hard delete)
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_creatives')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.ads.manage');
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    'name', 'image_url', 'image_url_mobile', 'link_url', 'alt_text',
    'ad_size', 'starts_at', 'ends_at', 'is_active',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_creatives')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('cms-ads');
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.ads.manage');
  if (denied) return denied;

  const { id } = await params;
  const admin = createAdminClient();

  // Fetch creative to find images to clean up from storage
  const { data: creative } = await admin
    .from('ad_creatives')
    .select('image_url, image_url_mobile')
    .eq('id', id)
    .single();

  const { error } = await admin
    .from('ad_creatives')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clean up storage images (best-effort)
  if (creative) {
    const imageUrls = [creative.image_url, creative.image_url_mobile].filter(Boolean) as string[];
    const storagePaths = imageUrls
      .map((url) => {
        const match = url.match(/cms-assets\/(.+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];
    if (storagePaths.length > 0) {
      await admin.storage.from('cms-assets').remove(storagePaths).catch(() => {});
    }
  }

  revalidateTag('cms-ads');
  return NextResponse.json({ success: true });
}
