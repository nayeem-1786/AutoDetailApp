// Static display list for the admin SMS Templates page (Session 2E.1b).
// Each entry corresponds to a hardcoded SMS body in the codebase that
// hasn't yet migrated to the chip-driven contract model. Sessions 3A-3D
// migrate these to sms_templates rows; until then the admin UI surfaces
// them as read-only entries so operators see they exist and understand
// they're not yet customizable.
//
// Session 3A migrated `addon_authorization_expired` and `quote_sms_postcall`.
// Session 3B migrated `addon_authorization` and `addon_authorization_resend`.
// Session 3C migrated `quote_sms_admin` and `quote_sms_midcall`.
// 1 hardcoded slug remains: receipt_sms (scheduled for 3D).
//
// Source-of-truth pointers — keep in sync with the actual sendSms callsite
// when the body changes. Cross-checked at Session 2E.1b Phase 0:
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
