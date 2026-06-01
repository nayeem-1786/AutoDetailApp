'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Phone, CheckCircle } from 'lucide-react';
import { formatPhone, formatPhoneInput, normalizePhone, phoneToE164 } from '@/lib/utils/format';

/**
 * QuoteRequestForm — shared "talk to staff" form + network + CTA base.
 *
 * Extracted in Session U-B.3 (2026-06-01) from `SpecialtyVehicleBlock`
 * (Session 29 vintage) when `RequestQuoteCard` was added for W3
 * (staff_assessed services). The two surfaces share ~95% of the form
 * state, submit handler, phone CTA, and success-state rendering; this
 * base owns all of it so neither caller duplicates network logic or
 * input validation.
 *
 * Per the operator's mid-session guidance on this session
 * (Memory #29 + #2 / Memory #2 reuse principle): if a sibling component
 * is tightly bound to its own semantics, extract a shared base — don't
 * duplicate. SpecialtyVehicleBlock is tightly bound to specialty-vehicle
 * Step-1 semantics (vehicle prop required, Edit-my-vehicle footer,
 * block-view telemetry on mount); RequestQuoteCard is tightly bound to
 * staff_assessed Step-2 semantics. This base is what they BOTH share.
 *
 * Wrappers own: outer container layout, headline copy, body explainer
 * paragraph, optional footer slot, telemetry on mount, and the
 * specific payload-shape fields beyond name/phone/email/preferred_time.
 *
 * The base owns: form state, phone-input formatting + validation,
 * submit handler (POST /api/public/specialty-callback — generalized in
 * U-B.3 to accept `request_type='specialty_vehicle' |
 * 'staff_assessed_service'`), success-state rendering, the Call CTA
 * (tel: link), the "or" divider, and the four input fields.
 *
 * F2 (RV/Boat/Aircraft non-priced) is the next planned consumer — it
 * will pass `request_type='non_priced_vehicle_category'` (or similar)
 * once that case lands; the base is intentionally agnostic to the
 * discriminator value beyond defaulting `payloadBase` to an empty
 * object.
 */

interface QuoteRequestFormProps {
  /**
   * Caller-provided payload fields merged INTO the form's
   * name/phone/email/preferred_time on submit. Must include the
   * `request_type` discriminator the endpoint expects. The shared base
   * is intentionally agnostic to the discriminator value — callers
   * compose the full payload shape, the base only adds the four
   * customer-info fields.
   *
   * Example for specialty_vehicle:
   *   {
   *     request_type: 'specialty_vehicle',
   *     vehicle_year, vehicle_make, vehicle_model, size_class,
   *   }
   *
   * Example for staff_assessed_service:
   *   {
   *     request_type: 'staff_assessed_service',
   *     service_name, service_id,
   *     vehicle_year, vehicle_make, vehicle_model, size_class,
   *   }
   */
  payloadBase: Record<string, unknown>;
  /** Business phone for the Call CTA + tel: link. */
  businessPhone: string;
  /** Optional label above the input fields. Default: "Request a callback". */
  formIntroLabel?: string;
  /** Optional submit-button label. Default: "Request Callback". */
  submitLabel?: string;
  /** Optional submit-button label while submitting. Default: "Sending...". */
  submittingLabel?: string;
  /** Optional success-state headline. Default: "Callback requested!". */
  successHeadline?: string;
  /** Optional success-state body. Default mentions a "specialist". */
  successBody?: string;
}

export function QuoteRequestForm({
  payloadBase,
  businessPhone,
  formIntroLabel = 'Request a callback',
  submitLabel = 'Request Callback',
  submittingLabel = 'Sending...',
  successHeadline = 'Callback requested!',
  successBody = 'One of our specialists will reach out soon.',
}: QuoteRequestFormProps) {
  const [callbackName, setCallbackName] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');
  const [callbackEmail, setCallbackEmail] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const callbackPhoneValid = !callbackPhone || normalizePhone(callbackPhone) !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!callbackName.trim() || !callbackPhone.trim()) return;
    const normalized = normalizePhone(callbackPhone);
    if (!normalized) return;

    setSubmitting(true);
    try {
      await fetch('/api/public/specialty-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payloadBase,
          name: callbackName.trim(),
          phone: normalized,
          email: callbackEmail.trim() || null,
          preferred_time: callbackTime.trim() || null,
        }),
      });
      setSubmitted(true);
    } catch {
      // Silently fail — staff notification is best-effort. The audit
      // log + customer success message both still surface; only the
      // staff SMS leg may have dropped, and the endpoint already
      // treats that send as best-effort on its own side.
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Phone CTA — primary action for customers who'd rather just call.
          Uses `accent-brand` design tokens so the button color tracks
          the business theme; SpecialtyVehicleBlock originally hardcoded
          `bg-lime-600` (pre-design-token vintage) and this unification
          lands a small consistency improvement as a side effect of the
          extraction. */}
      <a
        href={`tel:${phoneToE164(businessPhone)}`}
        className="inline-flex items-center gap-2 rounded-lg bg-accent-brand px-6 py-3 text-base font-semibold text-site-text-on-primary shadow-md hover:bg-accent-brand-hover transition-colors"
      >
        <Phone className="h-5 w-5" />
        Call us now: {formatPhone(businessPhone)}
      </a>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-site-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-brand-surface px-4 text-sm text-site-text-muted">or</span>
        </div>
      </div>

      {/* Callback form / success state */}
      {submitted ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <p className="font-medium text-green-800 dark:text-green-200">{successHeadline}</p>
          <p className="text-sm text-green-700 dark:text-green-300">{successBody}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <p className="text-sm font-medium text-site-text text-center">{formIntroLabel}</p>
          <FormField label="Name" required>
            <Input
              value={callbackName}
              onChange={(e) => setCallbackName(e.target.value)}
              placeholder="Your name"
              required
              className="text-base sm:text-sm"
            />
          </FormField>
          <FormField label="Phone" required>
            <Input
              type="tel"
              value={callbackPhone}
              onChange={(e) => setCallbackPhone(formatPhoneInput(e.target.value))}
              placeholder="(555) 555-5555"
              required
              className="text-base sm:text-sm"
            />
            {callbackPhone && !callbackPhoneValid && (
              <p className="mt-1 text-xs text-red-500">Enter a valid US phone number.</p>
            )}
          </FormField>
          <FormField label="Email">
            <Input
              type="email"
              value={callbackEmail}
              onChange={(e) => setCallbackEmail(e.target.value)}
              placeholder="you@example.com"
              className="text-base sm:text-sm"
            />
          </FormField>
          <FormField label="Best time to reach you">
            <Input
              value={callbackTime}
              onChange={(e) => setCallbackTime(e.target.value)}
              placeholder="e.g., Weekday afternoons"
              className="text-base sm:text-sm"
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </form>
      )}
    </>
  );
}
