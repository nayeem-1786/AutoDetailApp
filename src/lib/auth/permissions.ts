import type { UserRole, Permission } from '@/lib/supabase/types';

// Permission resolution order:
// 1. User-level override (employee_id set) → highest priority
// 2. Role-level default (role set) → fallback
// 3. Deny → if no matching permission found
// Super-Admin always returns true regardless.

export function hasPermission(
  permissionKey: string,
  role: UserRole,
  employeeId: string,
  permissions: Permission[]
): boolean {
  // Super-Admin always has full access
  if (role === 'super_admin') return true;

  // Check user-level override first
  const userOverride = permissions.find(
    (p) => p.permission_key === permissionKey && p.employee_id === employeeId
  );
  if (userOverride) return userOverride.granted;

  // Check role-level default
  const roleDefault = permissions.find(
    (p) => p.permission_key === permissionKey && p.role === role
  );
  if (roleDefault) return roleDefault.granted;

  // Default deny
  return false;
}

// Batch check multiple permissions
export function hasAnyPermission(
  permissionKeys: string[],
  role: UserRole,
  employeeId: string,
  permissions: Permission[]
): boolean {
  return permissionKeys.some((key) =>
    hasPermission(key, role, employeeId, permissions)
  );
}

export function hasAllPermissions(
  permissionKeys: string[],
  role: UserRole,
  employeeId: string,
  permissions: Permission[]
): boolean {
  return permissionKeys.every((key) =>
    hasPermission(key, role, employeeId, permissions)
  );
}
