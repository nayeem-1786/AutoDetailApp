import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// GET /api/admin/staff/roles — List all roles with permissions and employee counts
export async function GET() {
  try {
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify caller has settings.roles_permissions permission (super_admin check)
    const { data: caller } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!caller || caller.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all roles
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*')
      .order('is_super', { ascending: false })
      .order('is_system', { ascending: false })
      .order('name');

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 500 });
    }

    // Fetch all permission definitions
    const { data: permissionDefs, error: defsError } = await supabase
      .from('permission_definitions')
      .select('*')
      .order('sort_order');

    if (defsError) {
      return NextResponse.json({ error: defsError.message }, { status: 500 });
    }

    // Fetch all role-level permissions (role_id IS NOT NULL, employee_id IS NULL)
    const { data: permissions, error: permsError } = await supabase
      .from('permissions')
      .select('permission_key, role_id, granted')
      .not('role_id', 'is', null)
      .is('employee_id', null);

    if (permsError) {
      return NextResponse.json({ error: permsError.message }, { status: 500 });
    }

    // Fetch employee counts per role
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('role')
      .in('status', ['active', 'inactive']);

    if (empError) {
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }

    // Build employee count map
    const employeeCounts: Record<string, number> = {};
    for (const emp of employees || []) {
      employeeCounts[emp.role] = (employeeCounts[emp.role] || 0) + 1;
    }

    // Build permissions map: role_id -> { permission_key: granted }
    const permsByRole: Record<string, Record<string, boolean>> = {};
    for (const perm of permissions || []) {
      if (!perm.role_id) continue;
      if (!permsByRole[perm.role_id]) permsByRole[perm.role_id] = {};
      permsByRole[perm.role_id][perm.permission_key] = perm.granted;
    }

    // Assemble response
    const rolesWithPerms = (roles || []).map((role) => ({
      id: role.id,
      name: role.name,
      display_name: role.display_name,
      description: role.description,
      is_system: role.is_system,
      is_super: role.is_super,
      can_access_pos: role.can_access_pos,
      permissions: permsByRole[role.id] || {},
      employee_count: employeeCounts[role.name] || 0,
    }));

    return NextResponse.json({
      roles: rolesWithPerms,
      permission_definitions: permissionDefs,
    });
  } catch (err) {
    console.error('GET /api/admin/staff/roles error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/staff/roles — Create a custom role
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { display_name, description, can_access_pos, permissions: permGrants } = body;

    if (!display_name || typeof display_name !== 'string' || display_name.trim().length === 0) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    // Generate slug from display_name
    const name = display_name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (!name) {
      return NextResponse.json({ error: 'Invalid display name — must contain at least one letter or number' }, { status: 400 });
    }

    // Check name uniqueness
    const { data: existing } = await supabase
      .from('roles')
      .select('id')
      .eq('name', name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `A role with the name "${name}" already exists` }, { status: 409 });
    }

    // Create role
    const { data: newRole, error: roleError } = await supabase
      .from('roles')
      .insert({
        name,
        display_name: display_name.trim(),
        description: description?.trim() || null,
        is_system: false,
        is_super: false,
        can_access_pos: can_access_pos ?? false,
      })
      .select()
      .single();

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    // Get all permission definitions to create rows for each
    const { data: permDefs } = await supabase
      .from('permission_definitions')
      .select('key');

    if (permDefs && permDefs.length > 0) {
      const permRows = permDefs.map((def) => ({
        permission_key: def.key,
        role_id: newRole.id,
        granted: permGrants?.[def.key] === true,
      }));

      const { error: permError } = await supabase
        .from('permissions')
        .insert(permRows);

      if (permError) {
        console.error('Error inserting permissions for new role:', permError);
      }
    }

    return NextResponse.json({ data: newRole }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/staff/roles error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
