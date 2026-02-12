'use client';

import { usePermissionContext } from '@/lib/auth/permission-context';

/**
 * Hook to check if the current user has a specific permission.
 * Reads from the PermissionProvider context (loaded once at session start).
 *
 * Resolution: super_admin bypass → user override → role default → deny
 */
export function usePermission(permissionKey: string): {
  granted: boolean;
  loading: boolean;
} {
  const { permissions, isSuper, loading } = usePermissionContext();

  if (loading) return { granted: false, loading: true };
  if (isSuper) return { granted: true, loading: false };

  return { granted: permissions[permissionKey] ?? false, loading: false };
}

/**
 * Check multiple permissions (OR logic — granted if ANY key is true)
 */
export function useAnyPermission(permissionKeys: string[]): {
  granted: boolean;
  loading: boolean;
} {
  const { permissions, isSuper, loading } = usePermissionContext();

  if (loading) return { granted: false, loading: true };
  if (isSuper) return { granted: true, loading: false };

  const granted = permissionKeys.some((key) => permissions[key] ?? false);
  return { granted, loading: false };
}

/**
 * Check multiple permissions (AND logic — granted only if ALL keys are true)
 */
export function useAllPermissions(permissionKeys: string[]): {
  granted: boolean;
  loading: boolean;
} {
  const { permissions, isSuper, loading } = usePermissionContext();

  if (loading) return { granted: false, loading: true };
  if (isSuper) return { granted: true, loading: false };

  const granted = permissionKeys.every((key) => permissions[key] ?? false);
  return { granted, loading: false };
}

export function useIsSuperAdmin(): boolean {
  const { isSuper } = usePermissionContext();
  return isSuper;
}

export function useIsAdminOrAbove(): boolean {
  const { isSuper, permissions } = usePermissionContext();
  if (isSuper) return true;
  // Admin-or-above: check if they have broad admin permissions
  // For simplicity, use settings.manage_users as a proxy for admin-level access
  return permissions['settings.manage_users'] ?? false;
}
