import type { Appointment, Customer, Vehicle, Employee } from '@/lib/supabase/types';

/**
 * Shared appointment relation types — Item 15e Phase 2.
 *
 * Lifted out of `src/app/admin/appointments/types.ts` so both the admin
 * Appointment detail dialog and the POS Schedule-scope reuse of that same
 * dialog can agree on one canonical joined shape (rather than letting the
 * admin `AppointmentWithRelations` and POS `PosAppointment` drift apart).
 * The admin `appointments/types.ts` re-exports these names, so the 5 admin
 * importers continue working unchanged.
 *
 * Note: `PosAppointment` (`src/app/pos/components/appointments/types.ts`) is
 * structurally equivalent to `AppointmentWithRelations` (both extend
 * `Appointment` with the same customer/vehicle/employee/services joins). The
 * only difference is a minor nullability on the nested `service` — POS allows
 * `service: null`. Kept as two named types for now to avoid churn on the POS
 * surface; this module is the place to converge them in a later phase.
 */

export interface AppointmentService {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
  service: {
    id: string;
    name: string;
  };
}

export interface AppointmentWithRelations extends Appointment {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'>;
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'color' | 'size_class'> | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'> | null;
  appointment_services: AppointmentService[];
  // Item 15e Phase 2C-β-2: populated by the single-appointment GET endpoints
  // (admin + POS). True when a non-terminal job exists for this appointment
  // (`jobs.status` NOT IN 'completed', 'closed', 'cancelled'). The admin dialog
  // Save intercept reads this to decide whether reverting the status to an
  // earlier state should un-materialize the job. `undefined` = not populated
  // (don't intercept); `false` = no active job (don't intercept); `true` = intercept.
  has_active_job?: boolean;
}
