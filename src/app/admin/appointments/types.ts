import type { AppointmentStatus } from '@/lib/supabase/types';

// Item 15e Phase 2A — STATUS_TRANSITIONS, AppointmentService, and
// AppointmentWithRelations were lifted to src/lib/appointments/ so the POS
// Schedule-scope reuse of the admin Appointment detail dialog can share one
// canonical source. Re-exported here for backward compatibility: the 5 admin
// files that import these names from this module need no edits.
export { STATUS_TRANSITIONS } from '@/lib/appointments/status-transitions';
export type {
  AppointmentService,
  AppointmentWithRelations,
} from '@/lib/appointments/types';

// Colors for calendar dots — admin-only (consumed by appointment-calendar.tsx).
// Intentionally NOT lifted in Phase 2A; Phase 2B decides whether the POS
// Schedule pending-pill needs to share this taxonomy.
export const STATUS_DOT_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-400',
  confirmed: 'bg-blue-400',
  in_progress: 'bg-blue-600',
  completed: 'bg-green-400',
  cancelled: 'bg-red-400',
  no_show: 'bg-gray-400',
};
