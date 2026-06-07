import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential appointment number (A-XXXXX, 5-digit,
 * starting at A-10001 + N where N is the number of appointments backfilled
 * by Migration 20260607061603 — the post-Theme-A sequence continues from
 * the highest backfilled value with no gap).
 *
 * Phase 3 Theme A (AC-10 v1.4): `appointments.appointment_number` is a
 * greenfield human-readable column added in Migration 20260607061602. Every
 * appointment-creating callsite (online booking, walk-in atomic create,
 * voice agent, quote conversion) MUST call this helper and supply the
 * returned value in the INSERT payload — the column is NOT NULL, so an
 * omitted column would raise a constraint violation.
 */
export async function generateAppointmentNumber(
  supabase?: SupabaseClient | ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data, error } = await client.rpc('next_identifier', {
    p_entity_type: 'appointment',
  });

  if (error || !data) {
    throw new Error(
      `Failed to generate appointment_number: ${error?.message ?? 'no value returned'}`
    );
  }

  return data as string;
}
