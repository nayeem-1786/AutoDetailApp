import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { normalizeGooglePlaceId } from '@/lib/utils/google-place-id';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/homepage-settings — Read all homepage settings
// PUT  /api/admin/cms/homepage-settings — Save all homepage settings
// ---------------------------------------------------------------------------

const HOMEPAGE_KEYS = [
  'homepage_differentiators',
  'google_place_id',
  'homepage_cta_before_image',
  'homepage_cta_after_image',
  'homepage_team_heading',
  'homepage_credentials_heading',
  'homepage_hero_tagline',
  'homepage_cta_title',
  'homepage_cta_description',
  'homepage_cta_button_text',
  'homepage_services_description',
  'services_page_description',
] as const;

export async function GET(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const denied = await requirePermission(employee.id, 'cms.hero.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', [...HOMEPAGE_KEYS]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return NextResponse.json({ data: settings });
}

export async function PUT(request: NextRequest) {
  const employee = await getEmployeeFromSession(request);
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const deniedPut = await requirePermission(employee.id, 'cms.hero.manage');
  if (deniedPut) return deniedPut;

  const body = await request.json();
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Only upsert keys that were provided in the request
  const rows: { key: string; value: string; updated_at: string }[] = [];
  for (const key of HOMEPAGE_KEYS) {
    if (!(key in body)) continue;

    let toStore = body[key];

    // google_place_id is the only key with structured format gating —
    // operators historically saved quoted values and full Google Maps URLs
    // that round-tripped through the form and reached Google's API as-is.
    if (key === 'google_place_id' && toStore != null && toStore !== '') {
      const normalized = normalizeGooglePlaceId(toStore);
      if (!normalized.value) {
        return NextResponse.json(
          {
            error:
              'Invalid Place ID format. Expected format starts with ChIJ followed by alphanumeric and underscore/dash characters.',
          },
          { status: 400 }
        );
      }
      toStore = normalized.value;
    }

    rows.push({
      key,
      value: JSON.stringify(toStore),
      updated_at: now,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid keys provided' }, { status: 400 });
  }

  const { error } = await admin
    .from('business_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAudit({
    userId: employee.auth_user_id,
    userEmail: employee.email,
    employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
    action: 'update',
    entityType: 'settings',
    entityId: 'homepage_settings',
    entityLabel: 'Homepage Settings',
    details: { keys: rows.map((r) => r.key) },
    ipAddress: getRequestIp(request),
    source: 'admin',
  });

  return NextResponse.json({ success: true });
}
