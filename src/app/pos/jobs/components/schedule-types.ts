import type { AppointmentStatus, AppointmentChannel } from '@/lib/supabase/types';

/**
 * PosScheduleEntry — a FUTURE (not-yet-materialized) appointment surfaced in
 * the POS Jobs "Schedule" scope (Item 15e Phase 1A).
 *
 * Distinct from `JobListItem` (the Today-scope materialized-job shape in
 * `job-queue.tsx`). The `scope: 'schedule'` literal is the discriminator so
 * Phase 1B client code can narrow cleanly between a materialized job and a
 * forward-looking appointment.
 *
 * Returned by `GET /api/pos/jobs/schedule`. That endpoint reads `appointments`
 * directly and NEVER materializes a job — surfacing a future appointment must
 * not create a `jobs` row (the load-bearing invariant of the Item 15e retire
 * arc). See docs/dev/ITEM_15E_POS_JOBS_UNIFIED_OPERATIONS_AUDIT.md.
 *
 * Field-shape notes (deviations from the Phase 1 brief's draft type, all to
 * match real columns / the canonical embed shapes used elsewhere in POS):
 * - `detailer` mirrors the `employees!employee_id(id, first_name, last_name)`
 *   join used across POS (no `full_name` column exists).
 * - `deposit_amount` matches the real `appointments.deposit_amount` column
 *   (the brief sketched `deposit_paid`, which is not a column).
 * - `customer` / `vehicle` / `scheduled_end_time` are nullable to match the
 *   DB + the existing `JobListItem` convention.
 */
export interface PosScheduleEntry {
  id: string; // appointments.id
  scheduled_date: string; // YYYY-MM-DD
  scheduled_start_time: string; // HH:MM:00
  scheduled_end_time: string | null; // HH:MM:00
  status: AppointmentStatus;
  channel: AppointmentChannel; // origin badge + (Phase 3) origin filter
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
  detailer: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  appointment_services: Array<{
    id: string;
    service_id: string;
    price_at_booking: number;
    tier_name: string | null;
    quantity: number; // D48-aware — surfaced proactively so Phase 2 needs no SELECT widening
    service: { id: string; name: string } | null;
  }>;
  total_amount: number;
  deposit_amount: number | null;
  scope: 'schedule'; // discriminator for client narrowing vs. JobListItem
}

/**
 * PosUnstartedAppointment — Session 2.2 (AC-3 second half).
 *
 * A confirmed/in_progress appointment for TODAY that has not yet been
 * materialized into a job. Returned by `GET /api/pos/jobs` alongside the
 * existing `data: jobs[]` array, as a NEW `unstarted_appointments: []` field.
 *
 * Distinct from `PosScheduleEntry` (future appointments) and from `JobListItem`
 * (materialized jobs). The `scope: 'today_unstarted'` literal is the
 * discriminator so the Today scope can render appointment cards (with a
 * Start Intake button) alongside job cards without a type union conflict.
 *
 * Shape mirrors `PosScheduleEntry` field-for-field so the existing schedule
 * card render primitives (customer / vehicle / services / time formatters)
 * apply without translation — Memory #2 (reuse existing patterns).
 */
export interface PosUnstartedAppointment {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string | null;
  status: AppointmentStatus;
  channel: AppointmentChannel;
  customer: PosScheduleEntry['customer'];
  vehicle: PosScheduleEntry['vehicle'];
  detailer: PosScheduleEntry['detailer'];
  appointment_services: PosScheduleEntry['appointment_services'];
  total_amount: number;
  deposit_amount: number | null;
  scope: 'today_unstarted';
}
