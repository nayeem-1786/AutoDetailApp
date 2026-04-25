import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * UUIDs of synthetic employees used as `created_by` on audit rows
 * written from contexts without an authenticated user (webhooks, cron
 * jobs, system-initiated migrations).
 *
 * Seeded by `supabase/migrations/20260424000004_extend_stock_adjustments_for_orders.sql`.
 *
 * If the seed migration was applied to a database where the email
 * `system@smartdetailsautospa.com` already existed under a different
 * UUID, this constant will not match the live row. Call
 * `verifySystemEmployee()` at boot (or before relying on this id) to
 * detect the mismatch and surface a clear error.
 */
export const SYSTEM_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000001';

export const SYSTEM_EMPLOYEE_EMAIL = 'system@smartdetailsautospa.com';

/**
 * Confirms the seeded system employee row exists at the expected UUID.
 * Returns the live id (which should equal SYSTEM_EMPLOYEE_ID). Throws if
 * no row exists at the expected email — that means the seed migration
 * never ran and any audit-row insert using SYSTEM_EMPLOYEE_ID will fail
 * the FK constraint.
 */
export async function verifySystemEmployee(
  supabase: SupabaseClient
): Promise<string> {
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('email', SYSTEM_EMPLOYEE_EMAIL)
    .maybeSingle();

  if (error) {
    throw new Error(
      `verifySystemEmployee: query failed — ${error.message}`
    );
  }
  if (!data) {
    throw new Error(
      `verifySystemEmployee: no employee row at email ${SYSTEM_EMPLOYEE_EMAIL}. ` +
        `Run migration 20260424000004 to seed.`
    );
  }
  if (data.id !== SYSTEM_EMPLOYEE_ID) {
    console.warn(
      `[system-actors] SYSTEM_EMPLOYEE_ID drift: expected ${SYSTEM_EMPLOYEE_ID}, ` +
        `found ${data.id}. Update the constant or the seed row.`
    );
  }
  return data.id;
}
