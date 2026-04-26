// SMS composite chip builders.
//
// "Composite" chips are caller-built strings that the SMS engine treats as
// regular chip values (not multi-chip combinations the engine itself assembles).
// They exist because the engine has no conditional rendering — every conditional
// fragment of an SMS template body has to live in caller code that always emits
// a non-empty string (or empty, when the optional_variables REMOVE_LINE pass is
// supposed to strip a line).
//
// All builders here are pure: no DB, no async, no I/O. They centralize patterns
// that were previously inlined (sometimes byte-duplicated across multiple
// callsites). Extraction is intentionally byte-identical with the original
// inline behavior — extracted in Session 2A as Phase 1 infrastructure work.

import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';

// ---------------------------------------------------------------------------
// buildJobSummary — `job_summary` chip for #17 detailer_job_assigned
// ---------------------------------------------------------------------------

/**
 * Build the job_summary chip used by detailer_job_assigned (slug #17).
 * Format: "<services>" or "<services> – <vehicleStr>".
 *
 * Pass `vehicleStr: undefined` (NOT empty string) to skip the dash portion.
 * Passing `vehicleStr: ''` deliberately yields "<services> – " (preserves
 * pre-extraction behavior where `vehicle` was the gate, not `vehicleStr`).
 *
 * Used by both notify routes (admin + POS).
 */
export function buildJobSummary(params: {
  serviceNames: string;
  vehicleStr?: string;
}): string {
  return params.vehicleStr !== undefined
    ? `${params.serviceNames} – ${params.vehicleStr}`
    : params.serviceNames;
}

// ---------------------------------------------------------------------------
// buildTransactionGreeting — `transaction_greeting` chip for #15 payment_receipt
// ---------------------------------------------------------------------------

/**
 * Build the transaction_greeting chip used by payment_receipt (slug #15).
 * Two branches:
 *   - services + vehicle attached  → "Your <vehicleDesc> is looking great."
 *   - otherwise (product-only or services-without-vehicle)
 *                                  → "We appreciate your purchase."
 *
 * The 2-branch shape is deliberate: services-without-vehicle and product-only
 * fall to the same generic prose because there's no meaningful per-product
 * narrative to inject.
 */
export function buildTransactionGreeting(params: {
  hasServices: boolean;
  vehicleDesc?: string;
}): string {
  return params.hasServices && params.vehicleDesc
    ? `Your ${params.vehicleDesc} is looking great.`
    : 'We appreciate your purchase.';
}

// ---------------------------------------------------------------------------
// buildPaymentInfo — `payment_info` chip for #4 booking_confirmed
// ---------------------------------------------------------------------------

/**
 * Build the payment_info chip used by booking_confirmed (slug #4).
 * When `hasDeposit` is true, both `depositAmount` and `balanceDue` MUST be
 * supplied (callers compute these together). When false, both are ignored.
 */
export function buildPaymentInfo(params: {
  hasDeposit: boolean;
  depositAmount?: string;
  balanceDue?: string;
}): string {
  return params.hasDeposit
    ? `Deposit paid: ${params.depositAmount}. Balance due at service: ${params.balanceDue}.`
    : 'Payment due at time of service.';
}

// ---------------------------------------------------------------------------
// buildDepositInfo — `deposit_info` chip for #6 booking_staff_notify
// ---------------------------------------------------------------------------

/**
 * Build the deposit_info chip used by booking_staff_notify (slug #6).
 * Distinct from payment_info — staff audience, no amounts shown.
 */
export function buildDepositInfo(params: { hasPayment: boolean }): string {
  return params.hasPayment ? 'Deposit paid.' : 'Pay on site.';
}

// ---------------------------------------------------------------------------
// buildSummaryLine — length-aware composite for #25 receipt_sms (hardcoded)
// ---------------------------------------------------------------------------

/**
 * Build the summary_line composite used by receipt_sms (slug #25, hardcoded).
 * Length-aware: truncates the vehicle prefix when needed to keep the assembled
 * SMS body within the 160-char single-segment budget.
 *
 * Layout assumed by the budget computation:
 *   "<businessName>\n<summary>\nThank you! View receipt:\n<shortUrl>"
 * The fixed-prose surround ("\nThank you! View receipt:\n" + " — " separator)
 * adds ~30 chars; the truncation budget reserves that.
 *
 * Slug #25 is hardcoded today; this helper centralizes the length-aware build
 * so that when #25 is migrated to chip-driven (future session), the budget
 * logic moves with it.
 */
export function buildSummaryLine(params: {
  vehicle?: { year?: number | null; make?: string | null; model?: string | null } | null;
  total: string;
  businessName: string;
  shortUrl: string;
}): string {
  const { vehicle, total, businessName, shortUrl } = params;
  if (vehicle?.year || vehicle?.make || vehicle?.model) {
    const vehicleStr = cleanVehicleDescription({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
    });
    let summaryLine = `${vehicleStr} — ${total}`;
    const testMsg = `${businessName}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}`;
    if (testMsg.length > 160) {
      const maxVehicle = 160 - businessName.length - total.length - shortUrl.length - 30;
      const truncated = vehicleStr.slice(0, Math.max(10, maxVehicle)) + '...';
      summaryLine = `${truncated} — ${total}`;
    }
    return summaryLine;
  }
  return `Your total — ${total}`;
}

// ---------------------------------------------------------------------------
// buildFirstNameGreeting — `, ${firstName}` fragment used in voice flows
// ---------------------------------------------------------------------------

/**
 * Build the leading-comma name fragment used inline in #2 appointment_confirmed_postcall
 * fallback prose and #23 quote_sms_postcall (hardcoded). Returns the empty
 * string when no name is provided so the surrounding prose reads naturally
 * without an orphaned comma.
 */
export function buildFirstNameGreeting(firstName?: string): string {
  return firstName ? `, ${firstName}` : '';
}

// ---------------------------------------------------------------------------
// buildJobCancelledLine — `job_cancelled_line` chip for #26 transaction_voided
// ---------------------------------------------------------------------------

/**
 * Build the job_cancelled_line composite used by transaction_voided (slug #26,
 * hardcoded). Returns the leading-space SMS variant — the email branch in
 * send-void-notification.ts uses a different shape (no leading space, period
 * + double-newline tail) and intentionally stays inline.
 *
 * Slug #26 is hardcoded today; helper extracted so #26's future migration
 * inherits the conditional shape.
 */
export function buildJobCancelledLine(jobCancelled: boolean): string {
  return jobCancelled ? ' Your scheduled service has been cancelled.' : '';
}

// ---------------------------------------------------------------------------
// buildReasonLine — `reason_line` chip for #26 transaction_voided
// ---------------------------------------------------------------------------

/**
 * Build the reason_line composite. Today consumed only by the email branch in
 * send-void-notification.ts (textBody assembly); the SMS branch doesn't include
 * a reason today. When #26 transaction_voided SMS is migrated (future session),
 * the SMS template body will reference {reason_line} too and this helper is
 * already in place.
 */
export function buildReasonLine(reason?: string): string {
  return reason ? ` Reason: ${reason}.` : '';
}

// ---------------------------------------------------------------------------
// buildAppointmentSummary — inner block of buildAppointmentConfirmationSms
// ---------------------------------------------------------------------------

/**
 * Build the inner "appointment scheduled" block used by appointment_confirmed
 * (slug #1) fallback prose. Excludes the business header and signoff — those
 * are applied by the caller (buildAppointmentConfirmationSms) since they vary
 * by entry path. Trailing newline is intentional: the caller appends a blank
 * line + signoff after the totalLine.
 *
 * In Phase 1 this only refactors the existing inline build inside
 * buildAppointmentConfirmationSms with no behavior change. Future sessions
 * may promote {appointment_summary} to a first-class chip in slug #1's body.
 */
export function buildAppointmentSummary(params: {
  date: string;
  time: string;
  serviceName?: string;
  total?: string;
  firstName?: string;
}): string {
  const { date, time, serviceName, total, firstName } = params;
  const greeting = firstName ? `Hi ${firstName}, your` : 'Your';
  const serviceLine = serviceName ? `${serviceName}\n` : '';
  const totalLine = total ? `Total: ${total}\n` : '';
  return `${greeting} appointment is scheduled:\n${serviceLine}${date} at ${time}\n${totalLine}`;
}
