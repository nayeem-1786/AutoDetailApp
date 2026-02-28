import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// POST /api/admin/cms/pages/[id]/preview — Generate a preview token
// ---------------------------------------------------------------------------

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const { id } = await context.params;
  const admin = createAdminClient();

  // Generate a new preview token with 1-hour expiry
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('website_pages')
    .update({
      preview_token: token,
      preview_token_expires_at: expiresAt,
    })
    .eq('id', id)
    .select('slug')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const url = `/p/${data.slug}?preview=true&token=${token}`;

  return NextResponse.json({ token, url });
}
