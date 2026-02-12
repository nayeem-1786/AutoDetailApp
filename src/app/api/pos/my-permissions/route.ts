import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/pos/my-permissions
 *
 * Returns the resolved permission map for the POS session employee.
 * Uses POS HMAC auth (X-POS-Session header).
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get employee role info
    const { data: employee } = await supabase
      .from('employees')
      .select('id, role, role_id')
      .eq('id', posEmployee.employee_id)
      .single();

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Check if super_admin
    const { data: roleRow } = await supabase
      .from('roles')
      .select('is_super')
      .eq('id', employee.role_id)
      .single();

    const isSuper = roleRow?.is_super ?? employee.role === 'super_admin';

    // Get all permission definition keys
    const { data: definitions } = await supabase
      .from('permission_definitions')
      .select('key')
      .order('sort_order');

    const allKeys = (definitions || []).map((d: { key: string }) => d.key);

    if (isSuper) {
      const permissions: Record<string, boolean> = {};
      for (const key of allKeys) {
        permissions[key] = true;
      }
      return NextResponse.json({
        employee_id: employee.id,
        role: employee.role,
        is_super: true,
        permissions,
      });
    }

    // Get role defaults and user overrides
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

    const roleDefaults = new Map<string, boolean>();
    for (const row of roleDefaultsRes.data || []) {
      roleDefaults.set(row.permission_key, row.granted);
    }

    const overrides = new Map<string, boolean>();
    for (const row of userOverridesRes.data || []) {
      overrides.set(row.permission_key, row.granted);
    }

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
      is_super: false,
      permissions,
    });
  } catch (err) {
    console.error('POS my-permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
