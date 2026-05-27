import type { AppointmentStatus } from '@/lib/supabase/types';

/**
 * Valid next-states for each appointment status.
 *
 * Pure data with zero UI-context coupling — shared between the admin
 * Appointment detail dialog and the POS Schedule-scope detail dialog
 * (Item 15e Phase 2). The admin `appointments/types.ts` re-exports this
 * for backward compatibility, so existing admin importers need no edits.
 *
 * The map drives the dialog's "recommended" vs "override" status option
 * groups and is enforced server-side by both the admin PATCH
 * (`/api/appointments/[id]`) and the POS PATCH (`/api/pos/appointments/[id]`).
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};
