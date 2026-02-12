import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/supabase/types';

interface PermissionCheckResult {
  granted: boolean;
  reason: 'super_admin_bypass' | 'user_override' | 'role_default' | 'denied';
}

/**
 * Check if an employee has a specific permission.
 * Resolution order:
 * 1. super_admin role (roles.is_super) -> always granted (bypass)
 * 2. User-level override (employee_id match) -> highest priority
 * 3. Role-level default (role match) -> fallback
 * 4. No match -> denied
 */
export async function checkPermission(
  employeeId: string,
  permissionKey: string
): Promise<PermissionCheckResult> {
  const admin = createAdminClient();

  // Get employee with role info
  const { data: employee } = await admin
    .from('employees')
    .select('id, role, role_id')
    .eq('id', employeeId)
    .single();

  if (!employee) return { granted: false, reason: 'denied' };

  // 1. Super admin bypass — check via roles table
  if (employee.role === 'super_admin') {
    return { granted: true, reason: 'super_admin_bypass' };
  }

  // 2+3. Fetch both user override and role default in a single query
  const { data: permissions } = await admin
    .from('permissions')
    .select('granted, employee_id, role')
    .eq('permission_key', permissionKey)
    .or(`employee_id.eq.${employeeId},and(role.eq.${employee.role},employee_id.is.null)`);

  if (!permissions || permissions.length === 0) {
    return { granted: false, reason: 'denied' };
  }

  // User-level override takes priority
  const userOverride = permissions.find((p) => p.employee_id === employeeId);
  if (userOverride) {
    return { granted: userOverride.granted, reason: 'user_override' };
  }

  // Role-level default
  const roleDefault = permissions.find(
    (p) => p.role === (employee.role as UserRole) && p.employee_id === null
  );
  if (roleDefault) {
    return { granted: roleDefault.granted, reason: 'role_default' };
  }

  return { granted: false, reason: 'denied' };
}

/**
 * Check multiple permissions (OR logic - any one granted = pass)
 */
export async function checkAnyPermission(
  employeeId: string,
  permissionKeys: string[]
): Promise<boolean> {
  for (const key of permissionKeys) {
    const result = await checkPermission(employeeId, key);
    if (result.granted) return true;
  }
  return false;
}

/**
 * Check multiple permissions (AND logic - all must be granted)
 */
export async function checkAllPermissions(
  employeeId: string,
  permissionKeys: string[]
): Promise<boolean> {
  for (const key of permissionKeys) {
    const result = await checkPermission(employeeId, key);
    if (!result.granted) return false;
  }
  return true;
}
