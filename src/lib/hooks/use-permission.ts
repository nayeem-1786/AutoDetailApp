'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@/lib/auth/permissions';

// Client-side permission hook for conditional rendering
// Elements without permission are hidden (not grayed out)

export function usePermission(permissionKey: string): boolean {
  const { role, employee, permissions } = useAuth();

  if (!role || !employee) return false;

  return hasPermission(permissionKey, role, employee.id, permissions);
}

export function useAnyPermission(permissionKeys: string[]): boolean {
  const { role, employee, permissions } = useAuth();

  if (!role || !employee) return false;

  return hasAnyPermission(permissionKeys, role, employee.id, permissions);
}

export function useAllPermissions(permissionKeys: string[]): boolean {
  const { role, employee, permissions } = useAuth();

  if (!role || !employee) return false;

  return hasAllPermissions(permissionKeys, role, employee.id, permissions);
}

export function useIsSuperAdmin(): boolean {
  const { role } = useAuth();
  return role === 'super_admin';
}

export function useIsAdminOrAbove(): boolean {
  const { role } = useAuth();
  return role === 'super_admin' || role === 'admin';
}
