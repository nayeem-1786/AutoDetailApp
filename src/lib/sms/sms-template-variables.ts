import type { VariableDefinition } from '@/lib/email/variables';

// ---------------------------------------------------------------------------
// SMS template variable definitions (per slug)
// Used by the admin UI to render variable inserter chips
// ---------------------------------------------------------------------------

export const SMS_TEMPLATE_VARIABLES: Record<string, VariableDefinition[]> = {
  appointment_confirmed: [
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'appointment_summary', description: 'Caller-built: "Your appointment is scheduled:" + service line + date/time line + optional total line', sample: 'Your appointment is scheduled:\nCeramic Coating\nMonday, March 28, 2026 at 10:30 AM\nTotal: $299.00' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  appointment_confirmed_postcall: [
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
  ],
  booking_confirmed: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'services', description: 'Comma-separated service names', sample: 'Ceramic Coating, Interior Detail' },
    { key: 'vehicle_description', description: 'Vehicle year/make/model', sample: '2024 Tesla Model 3' },
    { key: 'service_total', description: 'Total amount', sample: '$499.00' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
  appointment_cancelled: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_accepted_single: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'item_name', description: 'Service/item name', sample: 'Ceramic Coating' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_accepted_multi: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_accepted_staff_notify: [
    { key: 'customer_name', description: 'Customer full name', sample: 'John Smith' },
    { key: 'quote_number', description: 'Quote number', sample: 'Q-001234' },
    { key: 'service_total', description: 'Quote total amount', sample: '$492.19' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating, Interior Detail' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  booking_reminder: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Primary service name', sample: 'Ceramic Coating' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_reminder: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'short_url', description: 'Short link to quote', sample: 'https://sdas.co/q1234' },
  ],
  quote_viewed_followup: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'short_url', description: 'Short link to quote', sample: 'https://sdas.co/q1234' },
  ],
  job_complete: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'vehicle_description', description: 'Vehicle make/model', sample: 'Tesla Model 3' },
    { key: 'gallery_link', description: 'Photo gallery link', sample: 'https://sdas.co/g5678' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_address', description: 'Business address', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'hours_line', description: "Today's business hours", sample: 'Open today until 6:00 PM' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
  addon_approved: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Add-on service/product name', sample: 'Paint Correction' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  addon_declined: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Add-on service/product name', sample: 'Paint Correction' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  booking_staff_notify: [
    { key: 'customer_name', description: 'Customer full name', sample: 'John Smith' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating, Interior Detail' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'deposit_info', description: 'Deposit status', sample: 'Deposit paid.' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  staff_notification: [
    { key: 'customer_name', description: 'Customer name from the call', sample: 'John Smith' },
    { key: 'customer_phone', description: 'Customer phone (formatted)', sample: '(310) 555-1234' },
    { key: 'reason_label', description: 'Escalation reason', sample: 'Custom Quote Needed' },
    { key: 'reason_code', description: 'Reason code', sample: 'custom_quote' },
    { key: 'details', description: 'Details from agent', sample: 'Customer wants ceramic coating for a fleet of 5 vehicles' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
  ],
  detailer_job_assigned: [
    { key: 'job_summary', description: 'Caller-built: services list, optionally with " – vehicle_description" suffix when a vehicle is attached', sample: 'Ceramic Coating – 2024 Tesla Model 3' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'address', description: 'Mobile service address', sample: '123 Main St, Torrance, CA' },
    { key: 'service_total', description: 'Total amount', sample: '$299.00' },
  ],
  payment_receipt: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'transaction_greeting', description: 'Caller-built context-aware greeting (e.g. "Your Honda Civic is all set." or "We appreciate your purchase.")', sample: 'Your Honda Civic is all set. You earned 23 loyalty points today.' },
    { key: 'receipt_link', description: 'Short URL to view receipt', sample: 'https://sdas.co/r5678' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
  ],
  loyalty_milestone: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'loyalty_points_balance', description: 'Current loyalty points balance', sample: '250' },
    { key: 'loyalty_cash_value', description: 'Cash value of points balance, formatted', sample: '$5' },
    { key: 'booking_link', description: 'Short URL to book next appointment', sample: 'https://sdas.co/b9012' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
  ],
};

// ---------------------------------------------------------------------------
// INTENTIONALLY_HARDCODED_SMS — the canonical exemption list for the
// "chip-by-default" SMS rule (CLAUDE.md Rule 20).
//
// All customer-facing SMS sends MUST go through `renderSmsTemplate()` with a
// slug-keyed row in the `sms_templates` table — UNLESS the message falls into
// one of the three documented exemption classes below. Any new SMS sender
// outside the chip system must justify in code comments which class applies.
//
// Renamed from UNSAFE_SMS_TEMPLATES in Session 42AB. The "unsafe" framing
// predisposed readers to think the chip system was dangerous — the inverse is
// true. These slugs are NOT unsafe; they are *exempt* from the chip system
// for documented reasons that fall into one of three classes:
//
//   (a) FREE-TEXT TWO-WAY CONVERSATIONS
//       The body IS the variable. A chip template would degenerate to
//       `{message_body}` and provide zero authoring value. The operator (or
//       AI) is already the author. Sites:
//         - src/app/api/messaging/send/route.ts
//         - src/app/api/messaging/conversations/[id]/messages/route.ts
//         - src/app/api/webhooks/twilio/inbound/route.ts (AI auto-reply chunk)
//       These are NOT in the array below — they don't have slugs at all.
//
//   (b) MARKETING / LIFECYCLE / DRIP — PARALLEL CHIP SYSTEM
//       Already chip-templated, but persisted in `campaigns.sms_template`,
//       `lifecycle_rules.sms_template_id`, `drip_steps.sms_template` columns
//       (different storage, different lifecycle: per-campaign bodies, A/B
//       variants, lifecycle delay metadata). Out of scope for `sms_templates`.
//       NOT in the array below — separate system entirely.
//
//   (c) ENGINE-FEATURE GAPS
//       Currently only `receipt_sms`'s strict 160-char truncation logic. The
//       chip engine has no per-template length budget feature. Migration
//       requires either an engine extension OR caller-side fit-then-substitute
//       (recommended — see Session 42Z audit Cluster D7).
//
// The slugs listed below are class (c)-shaped exemptions PLUS legacy
// hardcoded sites that pre-date the chip-by-default rule. The five non-(c)
// entries are migration candidates for sessions 42AC–42AF (see roadmap).
//
// Cross-references:
//   docs/audits/SMS_COMPLETE_INVENTORY_SESSION42Z.md — current state of the world
//   docs/audits/SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md — why the chip system exists
//   CLAUDE.md Rule 20 — the chip-by-default convention
// ---------------------------------------------------------------------------

export const INTENTIONALLY_HARDCODED_SMS = [
  'addon_authorization',        // src/app/api/pos/jobs/[id]/addons/route.ts — HMAC crypto token URL (legacy; migration candidate for 42AC)
  'addon_authorization_resend', // src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts — fresh token + MMS photo (legacy; 42AC)
  'addon_authorization_expired', // src/app/api/webhooks/twilio/inbound/route.ts — static "authorization expired" (legacy, trivial migration; 42AC)
  'quote_sms_admin',            // src/lib/quotes/send-service.ts — short link + optional MMS PDF attachment (legacy; 42AD)
  'quote_sms_postcall',         // src/lib/services/voice-post-call.ts — short link (legacy; 42AD)
  'quote_sms_midcall',          // src/app/api/voice-agent/send-quote-sms/route.ts — short link + service list (legacy; 42AD)
  'receipt_sms',                // src/app/api/pos/receipts/sms/route.ts — class (c) engine gap: strict 160-char truncation
] as const;
