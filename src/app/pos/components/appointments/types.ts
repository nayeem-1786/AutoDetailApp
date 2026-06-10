import type {
  Appointment,
  Customer,
  Vehicle,
  Employee,
} from '@/lib/supabase/types';

export interface PosAppointmentService {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
  service: {
    id: string;
    name: string;
  } | null;
}

export interface PosAppointment extends Appointment {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'>;
  vehicle: Pick<
    Vehicle,
    'id' | 'year' | 'make' | 'model' | 'color' | 'size_class'
  > | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'> | null;
  appointment_services: PosAppointmentService[];
  /** Session #145 — server-computed remaining-balance cents, optionally
   *  attached by callers that need accurate payment-link math (see
   *  `/api/pos/jobs/[id]:attachAmountDueCents` for the canonical compute
   *  shape). Currently NOT populated by `/api/pos/appointments/[id]` GET —
   *  consumers (the strip's Send Payment Link flow) fall back to
   *  `total_amount * 100` when this field is absent, and the operator
   *  selects a custom amount through `<PaymentLinkAmountModal>` if a prior
   *  deposit needs to be subtracted. A future enhancement may extract the
   *  attachAmountDueCents helper and call it from this endpoint too. */
  amount_due_cents?: number | null;
  /** Session #147 Commit B — canonical sum of completed transactions'
   *  (total_amount + tip_amount) in cents, server-computed by
   *  `/api/pos/appointments/[id]` GET. Single source of truth used by
   *  CancelAppointmentDialog to switch between Mode A (===0, no-payment
   *  chip-based UX) and Mode B (>0, Refund Pathway UX). The orchestrator
   *  re-computes the same value server-side on submit, so a stale UI
   *  snapshot never affects the actual money-handling decision. */
  amount_paid_cents?: number | null;
}

export interface PosStaff {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  job_count_today: number;
  is_busy: boolean;
}
