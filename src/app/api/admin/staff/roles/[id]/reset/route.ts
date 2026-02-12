import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ROLE_PERMISSION_DEFAULTS } from '@/lib/utils/role-defaults';

/**
 * POST /api/admin/staff/roles/[id]/reset
 * Reset a role's permissions to their seeded defaults.
 * System roles reset to their original seed values.
 * Custom roles reset to all-denied.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify super_admin
    const { data: caller } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!caller || caller.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Fetch the role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, is_super')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (role.is_super) {
      return NextResponse.json(
        { error: 'Super Admin permissions cannot be modified' },
        { status: 400 }
      );
    }

    // Get defaults — system roles use seed values, custom roles use all-denied
    const defaults = ROLE_PERMISSION_DEFAULTS[role.name];

    // Get all permission definitions to know which keys exist
    const { data: permDefs } = await supabase
      .from('permission_definitions')
      .select('key');

    if (!permDefs) {
      return NextResponse.json({ error: 'Failed to load permission definitions' }, { status: 500 });
    }

    // Build the target permissions map
    const targetPerms: Record<string, boolean> = {};
    for (const def of permDefs) {
      targetPerms[def.key] = defaults?.[def.key] ?? false;
    }

    // Update all permission rows for this role
    for (const [key, granted] of Object.entries(targetPerms)) {
      const { data: existing } = await supabase
        .from('permissions')
        .select('id')
        .eq('permission_key', key)
        .eq('role_id', id)
        .is('employee_id', null)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('permissions')
          .update({ granted, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('permissions')
          .insert({ permission_key: key, role_id: id, granted });
      }
    }

    return NextResponse.json({ success: true, permissions: targetPerms });
  } catch (err) {
    console.error('POST /api/admin/staff/roles/[id]/reset error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
