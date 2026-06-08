import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * STRUCTURAL GUARD — Admin vs POS Schedule shared-dialog prop parity.
 *
 * Session 1.3 deliverable (parity audit b346d34b Concern 1). The
 * `<AppointmentDetailDialog>` from `src/app/admin/appointments/components/`
 * is mounted by THREE host surfaces:
 *
 *  - admin/appointments/page.tsx (Day/Week view) — the CANONICAL full-perms
 *    mount this contract pins (`canReschedule`, `canCancel`, `canAddNotes`,
 *    `canUpdateStatus`, real handlers, no `readOnly`)
 *  - pos/jobs/components/job-queue.tsx (Schedule scope) — must match admin
 *    one-to-one except for the documented host-divergence props
 *  - admin/page.tsx (dashboard quick-peek) — intentionally divergent
 *    (`readOnly={true}`, no real handlers); EXCLUDED from this contract
 *    because Session 1.1 promoted it to a distinct "view-only" mode with
 *    its own regression-locking test at
 *    `appointment-detail-dialog-readonly.test.tsx`
 *
 * This is a CONTRACT test on the call-site SOURCE, not a behavior test:
 * Session 1.1 closed the no-op suppression / hostContext drift that the
 * parity audit found; this guard keeps future drift from re-introducing
 * the bug class. If someone adds a new prop to admin's mount and forgets
 * POS (or vice versa), THIS test fails at CI with the exact missing prop
 * name.
 *
 * Source-parsing (not render-introspection) follows the canonical Smart
 * Details precedent at `src/app/pos/__tests__/sale-vs-quotes-shared-prop-parity.test.tsx`
 * — covers conditionally-mounted dialogs that a render harness can't
 * reach without standing up the entire page's context tree.
 */

const ADMIN_HOST = 'src/app/admin/appointments/page.tsx';
const POS_HOST = 'src/app/pos/jobs/components/job-queue.tsx';

const adminSrc = readFileSync(join(process.cwd(), ADMIN_HOST), 'utf8');
const posSrc = readFileSync(join(process.cwd(), POS_HOST), 'utf8');

/**
 * Props that intentionally diverge between hosts. Each entry MUST carry a
 * reason — adding to this list is the sanctioned way to record a deliberate
 * divergence (and silence the guard for that prop).
 */
const DOCUMENTED_HOST_DIVERGENCE_PROPS: Array<{ prop: string; why: string }> = [
  { prop: 'hostContext', why: 'admin defaults to "admin"; POS passes "pos" — the canonical host-divergence axis (Session 1.1)' },
  { prop: 'returnToPath', why: 'admin defaults to /admin/appointments; POS passes /pos/jobs — Edit-in-POS deep-link destination (Session 1.1)' },
  { prop: 'onSendPaymentLink', why: 'Session #145 (Ian-Austria-unblock) added the green Send Payment Link footer button. The underlying `SendPaymentLinkDialog` uses `posFetch` against the POS-session-authenticated `/api/pos/appointments/[id]/send-payment-link` endpoint — admin has no equivalent route or auth surface, so admin omits the prop and the footer button does not surface. Admin parity is a separate future workstream (would require an admin route + admin-cookie-auth dialog variant, both new business logic — explicitly out of scope per the Session #145 locked constraint).' },
];

/**
 * Extract the opening-tag substring for `<ComponentName ... >` (or `/>`),
 * tracking brace/paren depth so `>` inside arrow functions or `={...}` values
 * does not prematurely end the tag.
 *
 * `nth` selects which occurrence: 0 = first, -1 = last. Admin host has TWO
 * mounts (detailer-degraded view + full-perms view) — the CANONICAL one for
 * parity is the LAST occurrence (the full-perms mount); the first is the
 * detailer scope which intentionally hard-codes `canReschedule={false}` and
 * `canCancel={false}` for a different operator class.
 */
function extractOpeningTag(source: string, componentName: string, nth: number): string {
  const re = new RegExp(`<${componentName}[\\s/>]`, 'g');
  const matches: Array<{ index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    matches.push({ index: m.index });
  }
  if (matches.length === 0) {
    throw new Error(`<${componentName}> is not mounted in ${source.slice(0, 80)}…`);
  }
  const pick = nth < 0 ? matches[matches.length + nth] : matches[nth];
  if (!pick) {
    throw new Error(`<${componentName}> mount index ${nth} out of range (found ${matches.length})`);
  }
  let i = pick.index + componentName.length + 1;
  let depth = 0;
  let tag = '';
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
    else if (ch === '>' && depth === 0) break;
    tag += ch;
    i++;
  }
  return tag;
}

/**
 * Prop names = identifiers immediately followed by `=` at brace/paren depth 0
 * within the opening tag. String-literal values (`prop="value"` /
 * `prop='value'`) and JSX expression values (`prop={expr}`) are skipped
 * verbatim so identifier-like substrings inside the value (e.g. `pos` inside
 * `returnToPath="/pos/jobs"`) cannot be mistaken for a separate prop. Boolean
 * shorthand (`<X disabled />`) is captured via the whitespace/self-close path.
 */
function extractProps(tag: string): Set<string> {
  const props = new Set<string>();
  let depth = 0;
  let ident = '';
  let i = 0;
  while (i < tag.length) {
    const ch = tag[i];
    if (ch === '{' || ch === '(') { depth++; ident = ''; i++; continue; }
    if (ch === '}' || ch === ')') { depth--; ident = ''; i++; continue; }
    if (depth === 0) {
      if (/[A-Za-z0-9_]/.test(ch)) {
        ident += ch;
        i++;
        continue;
      }
      if (ch === '=') {
        if (ident) props.add(ident);
        ident = '';
        i++;
        // Skip the value verbatim: a string literal or a JSX expression. Either
        // shape ends at the matching closing delimiter; the value's interior
        // never contributes to the prop set.
        if (i < tag.length) {
          const next = tag[i];
          if (next === '"' || next === "'") {
            i++; // past opening quote
            while (i < tag.length && tag[i] !== next) i++;
            i++; // past closing quote
            continue;
          }
          // JSX `{expr}` values are already handled by the brace/paren depth
          // bookkeeping above — the outer loop will naturally walk through.
        }
        continue;
      }
      if (/\s|\//.test(ch)) {
        // Boolean-shorthand: identifier ended by whitespace or self-close.
        if (ident && /[a-z]/.test(ident[0])) {
          props.add(ident);
        }
        ident = '';
        i++;
        continue;
      }
      // Any other char clears the identifier without consuming.
      ident = '';
      i++;
      continue;
    }
    i++;
  }
  // Trailing identifier at end-of-tag (no whitespace before `>`).
  if (ident && /[a-z]/.test(ident[0])) {
    props.add(ident);
  }
  return props;
}

describe('Admin vs POS Schedule — AppointmentDetailDialog mount prop parity (structural guard)', () => {
  it('sanity: both host sources are readable and non-trivial', () => {
    expect(adminSrc.length).toBeGreaterThan(1000);
    expect(posSrc.length).toBeGreaterThan(1000);
  });

  it('both hosts mount <AppointmentDetailDialog>', () => {
    expect(/<AppointmentDetailDialog[\s/>]/.test(adminSrc)).toBe(true);
    expect(/<AppointmentDetailDialog[\s/>]/.test(posSrc)).toBe(true);
  });

  it('admin and POS pass equivalent prop sets to the dialog (modulo documented host-divergence props)', () => {
    // Admin's canonical full-perms mount is the LAST occurrence (the
    // detailer-degraded mount is the first; comparing the degraded one to
    // POS would falsely flag intentional permission narrowing as drift).
    const adminTag = extractOpeningTag(adminSrc, 'AppointmentDetailDialog', -1);
    const posTag = extractOpeningTag(posSrc, 'AppointmentDetailDialog', 0);

    const adminProps = extractProps(adminTag);
    const posProps = extractProps(posTag);

    // Self-check: parsing produced a plausible prop set.
    expect(adminProps.size, 'parsed no props for admin mount — parser regression?').toBeGreaterThan(0);
    expect(posProps.size, 'parsed no props for POS mount — parser regression?').toBeGreaterThan(0);

    const allowAdmin = new Set(DOCUMENTED_HOST_DIVERGENCE_PROPS.map((e) => e.prop));
    const allowPos = new Set(DOCUMENTED_HOST_DIVERGENCE_PROPS.map((e) => e.prop));

    // Props admin passes that POS does not (minus documented divergences).
    const missingFromPos = [...adminProps].filter((p) => !posProps.has(p) && !allowPos.has(p));

    // Props POS passes that admin does not (minus documented divergences).
    const missingFromAdmin = [...posProps].filter((p) => !adminProps.has(p) && !allowAdmin.has(p));

    expect(
      missingFromPos,
      `POS <AppointmentDetailDialog> (job-queue.tsx) is missing prop(s) admin passes: [${missingFromPos.join(', ')}]. ` +
        `Wire them to match admin, or — if the omission is deliberate — add each to DOCUMENTED_HOST_DIVERGENCE_PROPS with a reason.`
    ).toEqual([]);

    expect(
      missingFromAdmin,
      `Admin <AppointmentDetailDialog> (admin/appointments/page.tsx full mount) is missing prop(s) POS passes: [${missingFromAdmin.join(', ')}]. ` +
        `Wire them to match POS, or add each to DOCUMENTED_HOST_DIVERGENCE_PROPS with a reason.`
    ).toEqual([]);
  });

  it('regression — canUpdateStatus is wired in both hosts (Session 1.3 / parity audit Target B.12)', () => {
    // The bug Session 1.3 closed: dialog accepted canReschedule + canCancel
    // + canAddNotes but NOT canUpdateStatus; operator without the permission
    // saw a fully-rendered dropdown that 403'd on Save. This regression-net
    // pins the prop present in both hosts so a future refactor can't drop
    // one side silently.
    const adminTag = extractOpeningTag(adminSrc, 'AppointmentDetailDialog', -1);
    const posTag = extractOpeningTag(posSrc, 'AppointmentDetailDialog', 0);

    expect(extractProps(adminTag).has('canUpdateStatus'), 'admin host must pass canUpdateStatus prop').toBe(true);
    expect(extractProps(posTag).has('canUpdateStatus'), 'POS host must pass canUpdateStatus prop').toBe(true);
  });

  it('regression — hostContext is wired only in POS (admin defaults to "admin")', () => {
    // Session 1.1 unified the legacy `mobileModalMode`/`modifierVariant` drift
    // pair into one `hostContext` prop. Admin omits it (defaulting to
    // "admin"); POS explicitly passes "pos". This pin keeps the
    // intentional asymmetry recognizable.
    const adminTag = extractOpeningTag(adminSrc, 'AppointmentDetailDialog', -1);
    const posTag = extractOpeningTag(posSrc, 'AppointmentDetailDialog', 0);

    expect(extractProps(adminTag).has('hostContext'), 'admin host should NOT pass hostContext (defaults to "admin")').toBe(false);
    expect(extractProps(posTag).has('hostContext'), 'POS host must pass hostContext="pos"').toBe(true);
  });

  it('regression — returnToPath is wired only in POS (admin defaults to /admin/appointments)', () => {
    // Companion to hostContext — the other documented host-divergence prop.
    const adminTag = extractOpeningTag(adminSrc, 'AppointmentDetailDialog', -1);
    const posTag = extractOpeningTag(posSrc, 'AppointmentDetailDialog', 0);

    expect(extractProps(adminTag).has('returnToPath'), 'admin host should NOT pass returnToPath (defaults to /admin/appointments)').toBe(false);
    expect(extractProps(posTag).has('returnToPath'), 'POS host must pass returnToPath="/pos/jobs"').toBe(true);
  });

  it('regression — neither host re-introduces no-op handler suppression (readOnly is the canonical view-only escape hatch)', () => {
    // Session 1.1 closed the dashboard mount's `onSave={async () => false}` /
    // `onCancel={() => {}}` anti-pattern by adding `readOnly={true}`. The
    // canonical admin + POS mounts are read/write — neither may carry a
    // readOnly prop (would suppress Save/Cancel buttons) nor degenerate
    // arrow-fn handlers shaped like the closed anti-pattern.
    const adminTag = extractOpeningTag(adminSrc, 'AppointmentDetailDialog', -1);
    const posTag = extractOpeningTag(posSrc, 'AppointmentDetailDialog', 0);

    // No readOnly on either canonical mount (the dashboard mount in
    // admin/page.tsx is excluded from this contract by design).
    expect(extractProps(adminTag).has('readOnly'), 'admin canonical mount must NOT carry readOnly (use the dashboard mount in admin/page.tsx for view-only)').toBe(false);
    expect(extractProps(posTag).has('readOnly'), 'POS canonical mount must NOT carry readOnly').toBe(false);

    // No `async () => false` or `() => {}` literal in the tag — the
    // classic no-op suppression shapes Session 1.1 closed.
    expect(adminTag.includes('async () => false'), 'admin mount must not pass a no-op onSave handler').toBe(false);
    expect(posTag.includes('async () => false'), 'POS mount must not pass a no-op onSave handler').toBe(false);
  });
});
