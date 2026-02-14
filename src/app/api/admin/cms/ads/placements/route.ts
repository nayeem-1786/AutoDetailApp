import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/ads/placements — List all placements with creative data
// POST /api/admin/cms/ads/placements — Create a new placement
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_placements')
    .select('*, ad_creative:ad_creatives(*)')
    .order('page_path', { ascending: true })
    .order('zone_id', { ascending: true });

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

  if (!body.ad_creative_id || !body.page_path || !body.zone_id) {
    return NextResponse.json(
      { error: 'Missing required fields: ad_creative_id, page_path, zone_id' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ad_placements')
    .insert({
      ad_creative_id: body.ad_creative_id,
      page_path: body.page_path,
      zone_id: body.zone_id,
      device: body.device ?? 'all',
      priority: body.priority ?? 0,
      is_active: body.is_active ?? true,
    })
    .select('*, ad_creative:ad_creatives(*)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
