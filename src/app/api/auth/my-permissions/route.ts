import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/auth/my-permissions
 *
 * Returns the resolved permission map, route patterns, and role metadata
 * for the currently authenticated user.
 * Resolution: super_admin bypass → user override → role default → deny.
 *
 * Response:
 * {
 *   employee_id: string,
 *   role: string,
 *   role_id: string,
 *   role_name: string,
 *   is_super: boolean,
 *   can_access_pos: boolean,
 *   permissions: Record<string, boolean>
 * }
 */
export async function GET() {
  try {
    // 1. Authenticate via Supabase session
    const supabaseSession = await createClient();
    const {
      data: { user },
    } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 2. Get employee + role info
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, role, role_id')
      .eq('auth_user_id', user.id)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // 3. Get role metadata + permission definitions in parallel
    const [roleRes, defsRes] = await Promise.all([
      supabase
        .from('roles')
        .select('is_super, can_access_pos, display_name')
        .eq('id', employee.role_id)
        .single(),
      supabase
        .from('permission_definitions')
        .select('key')
        .order('sort_order'),
    ]);

    const isSuper = roleRes.data?.is_super ?? employee.role === 'super_admin';
    const canAccessPos = roleRes.data?.can_access_pos ?? employee.role !== 'detailer';
    const roleName = roleRes.data?.display_name ?? employee.role;
    const allKeys = (defsRes.data || []).map((d: { key: string }) => d.key);

    if (isSuper) {
      // Super admin gets all permissions granted
      const permissions: Record<string, boolean> = {};
      for (const key of allKeys) {
        permissions[key] = true;
      }

      return NextResponse.json({
        employee_id: employee.id,
        role: employee.role,
        role_id: employee.role_id,
        role_name: roleName,
        is_super: true,
        can_access_pos: canAccessPos,
        permissions,
      });
    }

    // 4. Get role defaults and user overrides in parallel
    const [roleDefaultsRes, userOverridesRes] = await Promise.all([
      supabase
        .from('permissions')
        .select('permission_key, granted')
        .eq('role', employee.role)
        .is('employee_id', null),
      supabase
        .from('permissions')
        .select('permission_key, granted')
        .eq('employee_id', employee.id),
    ]);

    // Build lookup maps
    const roleDefaults = new Map<string, boolean>();
    for (const row of roleDefaultsRes.data || []) {
      roleDefaults.set(row.permission_key, row.granted);
    }

    const overrides = new Map<string, boolean>();
    for (const row of userOverridesRes.data || []) {
      overrides.set(row.permission_key, row.granted);
    }

    // 5. Merge: override → role default → false
    const permissions: Record<string, boolean> = {};
    for (const key of allKeys) {
      if (overrides.has(key)) {
        permissions[key] = overrides.get(key)!;
      } else if (roleDefaults.has(key)) {
        permissions[key] = roleDefaults.get(key)!;
      } else {
        permissions[key] = false;
      }
    }

    return NextResponse.json({
      employee_id: employee.id,
      role: employee.role,
      role_id: employee.role_id,
      role_name: roleName,
      is_super: false,
      can_access_pos: canAccessPos,
      permissions,
    });
  } catch (err) {
    console.error('my-permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
