// Static display list for the admin SMS Templates page (Session 2E.1b).
// Each entry corresponds to a hardcoded SMS body in the codebase that
// hasn't yet migrated to the chip-driven contract model. Sessions 3A-3D
// migrate these to sms_templates rows; until then the admin UI surfaces
// them as read-only entries so operators see they exist and understand
// they're not yet customizable.
//
// Session 3A migrated `addon_authorization_expired` and `quote_sms_postcall`
// to chip-driven slugs in sms_templates (entries removed from this list);
// 5 hardcoded slugs remain.
//
// Source-of-truth pointers — keep in sync with the actual sendSms callsite
// when the body changes. Cross-checked at Session 2E.1b Phase 0:
//   addon_authorization          src/app/api/pos/jobs/[id]/addons/route.ts
//   addon_authorization_resend   src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts
//   quote_sms_admin              src/lib/quotes/send-service.ts
//   quote_sms_midcall            src/app/api/voice-agent/send-quote-sms/route.ts
//   receipt_sms                  src/app/api/pos/receipts/sms/route.ts
//
// `INTENTIONALLY_HARDCODED_SMS` is derived from this list (Session 2E.2).
// Previously lived in src/lib/sms/sms-template-variables.ts (now deleted).

export interface HardcodedMessageEntry {
  /** Slug identifier (parallels chip-driven slugs in sms_templates). */
  slug: string;
  /** Operator-friendly display name. */
  name: string;
  /** What this message does and when it fires. */
  description: string;
  /** Sample body in the form a customer would receive, with placeholders shown as {chip_name}. */
  sampleBody: string;
}

export const HARDCODED_SMS_MESSAGES: HardcodedMessageEntry[] = [
  {
    slug: 'addon_authorization',
    name: 'Add-on Authorization Request',
    description: 'Sent to the customer when a detailer identifies additional work during a service and proposes an add-on with photos and pricing.',
    sampleBody: [
      'Hi {first_name}, while working on your {vehicle_description} we noticed {issue_text}.',
      'We recommend {friendly_name} for an additional ${final_price} — shall we go ahead?',
      'View pictures and approve or decline here: {authorize_url}',
      '{detailer_name}',
      '{business_name}',
    ].join('\n'),
  },
  {
    slug: 'addon_authorization_resend',
    name: 'Add-on Authorization Resend',
    description: 'Sent when staff resends an add-on authorization request, optionally with an updated photo and operator-typed message.',
    sampleBody: '{message_to_customer}\n\nApprove or decline here: {authorize_url}\n\n— {business_name}',
  },
  {
    slug: 'quote_sms_admin',
    name: 'Quote — Sent from Admin',
    description: 'Sent when a quote is delivered to the customer from the admin Quotes page; includes the quote PDF as an MMS attachment when possible.',
    sampleBody: 'Estimate {quote_number} from {business_name}\nTotal: {total_amount}\n\nView Your Estimate: {short_url}',
  },
  {
    slug: 'quote_sms_midcall',
    name: 'Quote — Voice Agent Mid-Call',
    description: 'Sent to the customer mid-call when the voice agent delivers a quote during the conversation.',
    sampleBody: "Here's your quote from {business_name} for {services}: {short_url}",
  },
  {
    slug: 'receipt_sms',
    name: 'POS Receipt',
    description: 'Sent when the customer requests an SMS copy of their POS receipt; uses length-aware truncation to fit a 160-character SMS.',
    sampleBody: '{business_name}\n{summary_line}\nThank you! View receipt:\n{short_url}',
  },
];

/**
 * Slug list of hardcoded SMS sends — derived from `HARDCODED_SMS_MESSAGES`.
 * Documentary surface preserved for code search; structurally impossible to
 * drift from `HARDCODED_SMS_MESSAGES` because it's a `.map()` of the same array.
 *
 * Pre-2E.2: hand-maintained `as const` tuple in `sms-template-variables.ts`.
 * Post-2E.2: derived. Tuple-literal narrowing (e.g. switch on individual slug
 * literals) was unused; intentionally not preserved.
 */
export const INTENTIONALLY_HARDCODED_SMS: readonly string[] = HARDCODED_SMS_MESSAGES.map((e) => e.slug);
