import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/ads/creatives — List all ad creatives
// POST /api/admin/cms/ads/creatives — Create a new ad creative
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_creatives')
    .select('*')
    .order('created_at', { ascending: false });

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

  const denied = await requirePermission(employee.id, 'cms.ads.manage');
  if (denied) return denied;

  const body = await request.json();

  if (!body.name || !body.image_url || !body.ad_size) {
    return NextResponse.json(
      { error: 'Missing required fields: name, image_url, ad_size' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_creatives')
    .insert({
      name: body.name,
      image_url: body.image_url,
      image_url_mobile: body.image_url_mobile ?? null,
      link_url: body.link_url ?? null,
      alt_text: body.alt_text ?? null,
      ad_size: body.ad_size,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
