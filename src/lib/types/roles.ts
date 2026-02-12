// Role management types — re-exports from supabase types + derived types
import type { Role, PermissionDefinition, Permission, UserRole } from '@/lib/supabase/types';
import type { PermissionCategory } from '@/lib/utils/constants';

export type { Role, PermissionDefinition, Permission };

/** A permission definition grouped with its granted status for a specific role */
export interface RolePermission {
  key: string;
  name: string;
  description: string | null;
  category: PermissionCategory;
  sort_order: number;
  granted: boolean;
}

/** A role with its full permission map */
export interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

/** Permission defaults keyed by role name, then permission key */
export type PermissionMatrix = Record<string, Record<string, boolean>>;

/** System role names (matches user_role enum values) */
export const SYSTEM_ROLE_NAMES = ['super_admin', 'admin', 'cashier', 'detailer'] as const;
export type SystemRoleName = typeof SYSTEM_ROLE_NAMES[number];

/** Check if a role name is a system role */
export function isSystemRole(name: string): name is SystemRoleName {
  return (SYSTEM_ROLE_NAMES as readonly string[]).includes(name);
}
