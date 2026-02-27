import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/utils/revalidate';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermission } from '@/lib/auth/require-permission';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// ---------------------------------------------------------------------------
// GET  /api/admin/team-members — List all team members (ordered by sort_order)
// POST /api/admin/team-members — Create a new team member
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET() {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = await requirePermission(employee.id, 'cms.pages.manage');
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('team_members')
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
  const { name, role, bio, photo_url, years_of_service, certifications, is_active } = body;

  if (!name || !role) {
    return NextResponse.json({ error: 'name and role are required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Generate slug and ensure uniqueness
  let slug = toSlug(name);
  if (!slug) {
    return NextResponse.json({ error: 'Cannot generate slug from name' }, { status: 400 });
  }

  const { data: existingSlug } = await admin
    .from('team_members')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingSlug) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  // Auto-calculate sort_order
  const { data: existing } = await admin
    .from('team_members')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  const sortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await admin
    .from('team_members')
    .insert({
      name,
      slug,
      role,
      bio: bio || null,
      photo_url: photo_url || null,
      years_of_service: years_of_service ?? null,
      certifications: certifications || [],
      sort_order: sortOrder,
      is_active: is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('team-members');

  return NextResponse.json({ data }, { status: 201 });
}
