import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/cms/about — Load team members, credentials, about text
// PATCH /api/admin/cms/about — Save team members, credentials, about text
// ---------------------------------------------------------------------------

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Read all about-related keys from business_settings
  const { data } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['team_members', 'credentials', 'about_text']);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  return NextResponse.json({
    team_members: (settings.team_members as Array<{
      name: string;
      role: string;
      bio: string;
      photo_url: string | null;
    }>) ?? [],
    credentials: (settings.credentials as Array<{
      title: string;
      description: string;
      image_url: string | null;
    }>) ?? [],
    about_text: (settings.about_text as string) ?? '',
  });
}

export async function PATCH(request: Request) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.about.manage');
  if (denied) return denied;

  const body = await request.json();
  const admin = createAdminClient();
  const errors: string[] = [];

  const allowedKeys = ['team_members', 'credentials', 'about_text'];

  for (const key of allowedKeys) {
    if (key in body) {
      const { error } = await admin
        .from('business_settings')
        .upsert(
          { key, value: body[key] },
          { onConflict: 'key' }
        );
      if (error) errors.push(`${key}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
