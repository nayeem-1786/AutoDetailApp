import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Check if a POS employee has a specific permission via DB lookup.
 *
 * Resolution order:
 * 1. super_admin → always true
 * 2. Employee-level override → highest priority
 * 3. Role-level default → fallback
 * 4. Deny (default)
 *
 * Used by POS API routes for server-side permission enforcement.
 */
export async function checkPosPermission(
  supabase: SupabaseClient,
  role: string,
  employeeId: string,
  permissionKey: string
): Promise<boolean> {
  if (role === 'super_admin') return true;

  // Check employee-level override first
  const { data: override } = await supabase
    .from('permissions')
    .select('granted')
    .eq('permission_key', permissionKey)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (override) return override.granted;

  // Check role-level default
  const { data: roleDefault } = await supabase
    .from('permissions')
    .select('granted')
    .eq('permission_key', permissionKey)
    .eq('role', role)
    .is('employee_id', null)
    .maybeSingle();

  return roleDefault?.granted ?? false;
}
