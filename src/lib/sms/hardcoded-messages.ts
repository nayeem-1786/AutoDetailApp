// Static display list for the admin SMS Templates page (Session 2E.1b).
// Each entry corresponds to a hardcoded SMS body in the codebase that
// hasn't yet migrated to the chip-driven contract model. Sessions 3A-3D
// migrated all of them; this list is now empty.
//
// Session 3A migrated `addon_authorization_expired` and `quote_sms_postcall`.
// Session 3B migrated `addon_authorization` and `addon_authorization_resend`.
// Session 3C migrated `quote_sms_admin` and `quote_sms_midcall`.
// Session 3D migrated `receipt_sms`.
// ZERO hardcoded slugs remain — Path B Phase 2 closed by Session 3D.
//
// All 27 SMS slugs in the system are now chip-driven and operator-editable
// via Admin > Settings > Messaging > SMS Templates. The Hardcoded Messages
// section in the admin UI now renders empty (or hidden, depending on the
// page's empty-state branch).
//
// `INTENTIONALLY_HARDCODED_SMS` is derived from this list (Session 2E.2).
// Previously lived in src/lib/sms/sms-template-variables.ts (now deleted).
//
// The interface and exports are retained (typed-empty) so that any future
// hardcoded SMS introduced in the codebase can be added back to this list
// with no infrastructure changes; the admin UI will surface it again the
// moment an entry appears.

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

export const HARDCODED_SMS_MESSAGES: HardcodedMessageEntry[] = [];

/**
 * Slug list of hardcoded SMS sends — derived from `HARDCODED_SMS_MESSAGES`.
 * Documentary surface preserved for code search; structurally impossible to
 * drift from `HARDCODED_SMS_MESSAGES` because it's a `.map()` of the same array.
 *
 * Pre-2E.2: hand-maintained `as const` tuple in `sms-template-variables.ts`.
 * Post-2E.2: derived. Tuple-literal narrowing (e.g. switch on individual slug
 * literals) was unused; intentionally not preserved.
 *
 * Post-3D: empty. All slugs are chip-driven.
 */
export const INTENTIONALLY_HARDCODED_SMS: readonly string[] = HARDCODED_SMS_MESSAGES.map((e) => e.slug);
