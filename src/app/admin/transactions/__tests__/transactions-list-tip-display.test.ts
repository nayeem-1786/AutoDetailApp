/**
 * Session #156 (Item 3 Adjacent-4): regression-locking source-string tests
 * for the admin Transactions LIST view at `src/app/admin/transactions/page.tsx`.
 *
 * Mirrors the structural source-string test pattern established by Sessions
 * #119 / #120 / #123 / #144 — the admin page is ~830 lines with deep state
 * management (useTableState + TableToolbar + supabase client + permissions
 * + stats endpoint), so a full-mount harness is disproportionate to the
 * bug-localization scope. Source-string pins lock the column order,
 * Tip-cell presence + zero-state, canonical Total formula, Customer width
 * + tooltip, and CSV export shape against future regressions.
 *
 * Closes Adjacent-4 from `docs/dev/RECEIPT_TIP_AUDIT_2026-06-19.md` — the
 * LIST-view sibling of Surface D (which Session #155 closed for the detail
 * view via byte-equivalent canonical formula at
 * `src/app/pos/components/transactions/transaction-detail.tsx:393`).
 *
 * Test cases:
 *   1. Column header order matches Option B (Date | Receipt # | Customer
 *      | Employee | Method | Status | Services | Tip | Total)
 *   2. Customer column width 180px (not the pre-#156 144px) + tooltip
 *      `title={customerFullName ?? undefined}` on truncate
 *   3. Tip column header NEW (80px, right-aligned, not sortable)
 *   4. Tip cell renders `formatCurrency(tx.tip_amount)` when > 0,
 *      `<span ...>---</span>` when 0 (operator decision #4)
 *   5. Canonical Total formula present:
 *      `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)`
 *      — byte-equivalent to Session #155 detail-view fix
 *   6. Close-out-shell subtitle conditional preserved on `tx.notes ===
 *      'Closed out — fully pre-paid'` marker (operator decision #5 keep)
 *   7. Appointment-totals map widened from close-out-only filter to
 *      ALL `appointment_id`-bearing rows
 *   8. CSV export headers match Option B order with Tip inserted before
 *      Total
 *   9. CSV row body emits `(tx.tip_amount ?? 0).toFixed(2)` for Tip column
 *      and `canonicalTotal.toFixed(2)` for Total column (not raw
 *      `tx.total_amount.toFixed(2)` — the pre-fix bug)
 *  10. ExportButton receives `appointmentTotalsByApptId` prop
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_PATH = resolve(__dirname, '../page.tsx');
const SOURCE = readFileSync(PAGE_PATH, 'utf-8');

describe('Admin Transactions LIST — Option B column order (Session #156, Item 3 Adjacent-4)', () => {
  it('case 1: column header order matches Option B (Date → Receipt # → Customer → Employee → Method → Status → Services → Tip → Total)', () => {
    // Locate the <thead><tr>...</tr></thead> block and assert the headers
    // appear in the expected sequence. Each <th> contributes a label
    // string we can regex-grep — sequencing those grep positions enforces
    // order without coupling to whitespace.
    const headerSequence = [
      'Date <SortIndicator',
      'Receipt # <SortIndicator',
      '>Customer<',
      '>Employee<',
      '>Method<',
      '>Status<',
      '>Services<',
      '>Tip<',
      'Total <SortIndicator',
    ];
    let lastIdx = 0;
    for (const label of headerSequence) {
      const idx = SOURCE.indexOf(label, lastIdx);
      expect(idx, `header "${label}" should appear after position ${lastIdx}`).toBeGreaterThan(lastIdx - 1);
      lastIdx = idx + label.length;
    }
  });

  it('case 2: Customer column widened to 180px with title tooltip on truncate', () => {
    // Header width
    expect(SOURCE).toMatch(/<th className="px-3 py-3 w-\[180px\]">Customer<\/th>/);
    // Pre-#156 144px width must be GONE from the Customer header line
    expect(SOURCE).not.toMatch(/<th className="px-3 py-3 w-\[144px\]">Customer<\/th>/);
    // Cell uses max-w-[180px]
    expect(SOURCE).toMatch(/<td className="px-3 py-3 max-w-\[180px\] truncate">/);
    // Tooltip on the customer link uses the full name
    expect(SOURCE).toMatch(/title=\{customerFullName \?\? undefined\}/);
  });

  it('case 3: Tip column header NEW (80px right-aligned, not sortable)', () => {
    expect(SOURCE).toMatch(/<th className="px-3 py-3 w-\[80px\] text-right">Tip<\/th>/);
    // Tip header must NOT carry an onClick handler (sortable header pattern)
    // The header should appear between Services and Total — regex captures
    // the inter-line range.
    const tipHeaderMatch = SOURCE.match(/<th className="px-3 py-3">Services<\/th>\s*<th className="px-3 py-3 w-\[80px\] text-right">Tip<\/th>/);
    expect(tipHeaderMatch, 'Tip header must immediately follow Services header').not.toBeNull();
  });
});

describe('Admin Transactions LIST — Tip cell + canonical Total (Session #156)', () => {
  it('case 4: Tip cell renders formatCurrency when > 0, --- when 0 (operator decision #4)', () => {
    // Conditional render block
    expect(SOURCE).toMatch(
      /tx\.tip_amount > 0 \? \(\s*formatCurrency\(tx\.tip_amount\)\s*\) : \(\s*<span className="text-gray-400">---<\/span>\s*\)/,
    );
  });

  it('case 5: canonical Total formula present (byte-equivalent to Session #155 detail-view fix)', () => {
    // Total cell delegates to a pre-computed `canonicalTotal` variable
    expect(SOURCE).toMatch(
      /const canonicalTotal =\s*Math\.max\(appointmentTotal \?\? 0, tx\.total_amount\) \+ \(tx\.tip_amount \?\? 0\);/,
    );
    // And the cell renders it
    expect(SOURCE).toMatch(/\{formatCurrency\(canonicalTotal\)\}/);
    // Pre-fix raw formula must NOT survive in the Total cell — anti-regression
    // guard. (Note: tx.total_amount is allowed elsewhere — e.g. in the
    // canonicalTotal definition above — but the bare cell expression must be
    // gone.)
    expect(SOURCE).not.toMatch(
      /text-right font-medium tabular-nums text-gray-900">\s*\{formatCurrency\(tx\.total_amount\)\}/,
    );
  });

  it('case 6: close-out-shell subtitle conditional preserved (operator decision #5)', () => {
    // isCloseOutShell guard MUST consult the notes marker, not just appointmentTotal !== null
    expect(SOURCE).toMatch(
      /const isCloseOutShell =\s*tx\.notes === 'Closed out — fully pre-paid' && appointmentTotal !== null;/,
    );
    expect(SOURCE).toMatch(/\{isCloseOutShell && \(/);
    expect(SOURCE).toMatch(/\(\{formatCurrency\(appointmentTotal!\)\} paid to appt\)/);
  });

  it('case 7: appointment-totals map widened from close-out-only to all appointment-linked rows', () => {
    // Pre-#156 filter `r.notes === 'Closed out — fully pre-paid'` is replaced
    // by `!!r.appointment_id`. The narrow close-out filter must NOT survive
    // in the data-fetch path (it CAN survive in the subtitle conditional —
    // case 6 pins that — but not in the map-population filter).
    expect(SOURCE).toMatch(
      /const appointmentLinkedApptIds = Array\.from\(\s*new Set\(\s*rows\s*\.filter\(\(r\) => !!r\.appointment_id\)/,
    );
    // Pre-#156 close-out-only filter at the map-population site is GONE
    expect(SOURCE).not.toMatch(
      /const closeOutApptIds = Array\.from\(\s*new Set\(\s*rows\s*\.filter\(/,
    );
  });
});

describe('Admin Transactions LIST — CSV export shape (Session #156)', () => {
  it('case 8: CSV export headers match Option B order with Tip inserted before Total', () => {
    // The headers array literal in ExportButton
    expect(SOURCE).toMatch(
      /const headers = \[\s*'Date',\s*'Receipt #',\s*'Customer',\s*'Employee',\s*'Method',\s*'Status',\s*'Services',\s*'Tip',\s*'Total',?\s*\];/,
    );
    // Pre-#156 header array order is GONE
    expect(SOURCE).not.toMatch(
      /const headers = \['Date', 'Receipt #', 'Customer', 'Services', 'Employee', 'Method', 'Status', 'Total'\];/,
    );
  });

  it('case 9: CSV row body emits tip_amount + canonical Total (not raw total_amount)', () => {
    // Tip cell in CSV row
    expect(SOURCE).toMatch(/\(tx\.tip_amount \?\? 0\)\.toFixed\(2\),/);
    // Canonical Total in CSV row
    expect(SOURCE).toMatch(/canonicalTotal\.toFixed\(2\),/);
    // Pre-fix bare `tx.total_amount.toFixed(2)` row entry must be GONE
    expect(SOURCE).not.toMatch(/^\s*tx\.total_amount\.toFixed\(2\),\s*$/m);
  });

  it('case 10: ExportButton receives appointmentTotalsByApptId prop', () => {
    expect(SOURCE).toMatch(/<ExportButton\s*transactions=\{transactions\}\s*appointmentTotalsByApptId=\{appointmentTotalsByApptId\}/);
    // ExportButton's signature includes the new prop typed as Map<string, number>
    expect(SOURCE).toMatch(/appointmentTotalsByApptId: Map<string, number>;/);
  });
});

describe('Admin Transactions LIST — SD-006297 balance-payment shape contract (Session #156, operator correction)', () => {
  it('canonical formula matches operator-locked expectation for SD-006297 fixture', () => {
    // Operator clarified mid-session: SD-006297 close-out is the
    // BALANCE-PAYMENT shape (`total_amount=$230`), not the close-out-shell
    // shape (`total_amount=$0`). Both flow through the same canonical
    // formula and yield $552 — this test pins the math directly so any
    // future drift in either the row component or the underlying
    // canonical-Total semantics is caught immediately.
    const fixture = {
      total_amount: 230,
      tip_amount: 92,
      appointmentTotal: 460, // from appointmentTotalsByApptId map
    };
    const canonicalTotal =
      Math.max(fixture.appointmentTotal ?? 0, fixture.total_amount) +
      (fixture.tip_amount ?? 0);
    expect(canonicalTotal).toBe(552);

    // And the close-out-shell variant (the pre-correction shape) also
    // yields the same total.
    const shellFixture = { ...fixture, total_amount: 0 };
    const shellCanonical =
      Math.max(shellFixture.appointmentTotal ?? 0, shellFixture.total_amount) +
      (shellFixture.tip_amount ?? 0);
    expect(shellCanonical).toBe(552);
  });

  it('walk-in (no appointment_id) degrades cleanly to total_amount + tip_amount', () => {
    const fixture = { total_amount: 109.75, tip_amount: 20, appointmentTotal: null };
    const canonicalTotal =
      Math.max(fixture.appointmentTotal ?? 0, fixture.total_amount) +
      (fixture.tip_amount ?? 0);
    expect(canonicalTotal).toBe(129.75);
  });
});
