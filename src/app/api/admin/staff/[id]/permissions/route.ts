import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

/**
 * GET /api/admin/staff/[id]/permissions
 *
 * Returns role defaults + employee overrides for the given employee.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getEmployeeFromSession();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createAdminClient();

    // Get employee's role info
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('role, role_id')
      .eq('id', id)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Get role display info
    const { data: roleRow } = await supabase
      .from('roles')
      .select('id, display_name, can_access_pos')
      .eq('id', employee.role_id)
      .single();

    // Get all permission definitions (for grouping)
    const { data: definitions } = await supabase
      .from('permission_definitions')
      .select('key, name, description, category, sort_order')
      .order('sort_order');

    // Get role defaults and employee overrides in parallel
    const [roleDefaultsRes, overridesRes] = await Promise.all([
      supabase
        .from('permissions')
        .select('permission_key, granted')
        .eq('role', employee.role)
        .is('employee_id', null),
      supabase
        .from('permissions')
        .select('permission_key, granted')
        .eq('employee_id', id),
    ]);

    const role_defaults: Record<string, boolean> = {};
    for (const row of roleDefaultsRes.data || []) {
      role_defaults[row.permission_key] = row.granted;
    }

    const overrides: Record<string, boolean> = {};
    for (const row of overridesRes.data || []) {
      overrides[row.permission_key] = row.granted;
    }

    return NextResponse.json({
      role: {
        id: roleRow?.id || employee.role_id,
        display_name: roleRow?.display_name || employee.role,
        can_access_pos: roleRow?.can_access_pos ?? false,
      },
      definitions: definitions || [],
      role_defaults,
      overrides,
    });
  } catch (err) {
    console.error('Get employee permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/staff/[id]/permissions
 *
 * Update employee-level permission overrides.
 * Body: { overrides: Array<{ key: string, granted: boolean | null }> }
 *   granted: true  → insert/update override with granted=true
 *   granted: false → insert/update override with granted=false
 *   granted: null  → delete override (revert to role default)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getEmployeeFromSession();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(caller.id, 'settings.roles_permissions');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const { overrides } = body as {
      overrides: Array<{ key: string; granted: boolean | null }>;
    };

    if (!Array.isArray(overrides)) {
      return NextResponse.json({ error: 'Invalid body: overrides must be an array' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify employee exists
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('id', id)
      .single();

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Process each override
    for (const override of overrides) {
      if (override.granted === null) {
        // Delete override — revert to role default
        await supabase
          .from('permissions')
          .delete()
          .eq('employee_id', id)
          .eq('permission_key', override.key);
      } else {
        // Upsert override
        const { error } = await supabase
          .from('permissions')
          .upsert(
            {
              permission_key: override.key,
              employee_id: id,
              role: null,
              granted: override.granted,
            },
            { onConflict: 'permission_key,employee_id' }
          );

        if (error) {
          console.error(`Failed to upsert permission ${override.key}:`, error);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update employee permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
