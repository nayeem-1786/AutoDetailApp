/**
 * canSendPaymentLink — predicate shared across every surface that mounts a
 * "Send Payment Link" affordance. Extracted from the inline expression that
 * had lived in `job-detail.tsx:874-881` (Send Payment Link visibility gate).
 *
 * Three call sites consume this predicate after the Ian-Austria-unblock
 * commit:
 *   1. `<JobDetail>` — POS job-detail header button (original site).
 *   2. `<AppointmentDetailDialog>` footer — new Send Payment Link button
 *      sitting between Cancel Appointment and Save Changes (replaces the
 *      removed Close button).
 *   3. `<UnstartedAppointmentCard>` — POS Jobs unstarted-strip card's middle
 *      pill in the [Cancel | Send Link | Start Intake] row.
 *
 * Surfaces 2 + 3 expose the affordance on appointments that have NO
 * materialized job yet — the same predicate evaluates correctly because
 * every field it reads (appointment payment_status / status / customer
 * email / customer phone) lives on the appointment row, NOT on the job row.
 * The "only day-of" behavior the operator observed pre-commit was a scope
 * artifact of JobDetail mounting only for materialized jobs (post-Stage-2,
 * Start-Intake-driven); it was never a date gate inside the predicate.
 *
 * Args are structural (a single anonymous-shape object) so every caller's
 * source type — JobDetailData / AppointmentWithRelations / PosUnstartedAppointment —
 * threads through without an import-time coupling to a single concrete type.
 *
 * Validation chain mirrors `sendPaymentLink`'s server-side check (`src/lib/
 * payment-link/send.ts:111-117`) — UI gate matches server gate, preventing
 * the misleading-button class where a UI offers an action the server rejects.
 */
export interface PaymentLinkEligibilityArgs {
  /** appointments.id — when null, the appointment was never created (synthetic
   *  pre-materialize state, or the linked-job's appointment column is null on
   *  the rare legacy pre-Phase-0a walk-in path). The payment-link helper keys
   *  off `appointment_id`; nothing to send without it. */
  appointmentId: string | null;
  /** appointments.payment_status — 'paid' short-circuits (no link for a
   *  fully-paid appointment). NULL or any other value passes the gate; the
   *  server-side helper's remaining-balance check is the load-bearing gate
   *  for partial-pay cases. */
  paymentStatus: string | null | undefined;
  /** appointments.status — `cancelled` and `no_show` short-circuit. The
   *  server-side helper rejects these explicitly; matching here keeps the
   *  button from rendering for already-resolved appointments. */
  appointmentStatus: string | null | undefined;
  /** customer.email — at least one of email/phone must be present. The send
   *  route's `method` body field selects the channel(s); without a contact
   *  address on the chosen channel the server returns a per-channel error. */
  customerEmail: string | null | undefined;
  /** customer.phone — see customerEmail. */
  customerPhone: string | null | undefined;
}

export function canSendPaymentLink(args: PaymentLinkEligibilityArgs): boolean {
  return !!(
    args.appointmentId &&
    args.paymentStatus !== 'paid' &&
    args.appointmentStatus !== 'cancelled' &&
    args.appointmentStatus !== 'no_show' &&
    (args.customerEmail || args.customerPhone)
  );
}
