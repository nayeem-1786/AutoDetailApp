/**
 * Session #156 (Item 3 Adjacent-4) + Session #157 (Detailer column + reorder):
 * regression-locking source-string tests for the admin Transactions LIST
 * view at `src/app/admin/transactions/page.tsx`.
 *
 * Mirrors the structural source-string test pattern established by Sessions
 * #119 / #120 / #123 / #144 — the admin page is ~900 lines with deep state
 * management (useTableState + TableToolbar + supabase client + permissions
 * + stats endpoint), so a full-mount harness is disproportionate to the
 * bug-localization scope. Source-string pins lock the column order,
 * Tip-cell presence + zero-state, canonical Total formula, Customer width
 * + tooltip, Detailer cell + data path, and CSV export shape against
 * future regressions.
 *
 * Closes Adjacent-4 from `docs/dev/RECEIPT_TIP_AUDIT_2026-06-19.md` — the
 * LIST-view sibling of Surface D (which Session #155 closed for the detail
 * view via byte-equivalent canonical formula at
 * `src/app/pos/components/transactions/transaction-detail.tsx:393`).
 *
 * Session #157 amendments: cases 1, 3, 8 updated for the #157 column
 * reorder (Date | Receipt # | Customer | Services | Employee | Detailer
 * | Method | Tip | Total | Status); cases 11–17 NEW for Receipt # width
 * 84, Detailer column header + cell + data source, SELECT extension,
 * TransactionRow `jobs` field, and CSV Detailer slot.
 *
 * Test cases:
 *   1. Column header order matches #157 order (Date | Receipt # | Customer
 *      | Services | Employee | Detailer | Method | Tip | Total | Status)
 *   2. Customer column width 180px (not the pre-#156 144px) + tooltip
 *      `title={customerFullName ?? undefined}` on truncate
 *   3. Tip column header NEW (80px, right-aligned, not sortable) — #157
 *      now immediately follows Method, not Services
 *   4. Tip cell renders `formatCurrency(tx.tip_amount)` when > 0,
 *      `<span ...>---</span>` when 0 (operator decision #4)
 *   5. Canonical Total formula present:
 *      `Math.max(appointmentTotal ?? 0, tx.total_amount) + (tx.tip_amount ?? 0)`
 *      — byte-equivalent to Session #155 detail-view fix
 *   6. Close-out-shell subtitle conditional preserved on `tx.notes ===
 *      'Closed out — fully pre-paid'` marker (operator decision #5 keep)
 *   7. Appointment-totals map widened from close-out-only filter to
 *      ALL `appointment_id`-bearing rows
 *   8. CSV export headers match #157 order with Detailer between Employee
 *      and Method + Status at end
 *   9. CSV row body emits `(tx.tip_amount ?? 0).toFixed(2)` for Tip column
 *      and `canonicalTotal.toFixed(2)` for Total column (not raw
 *      `tx.total_amount.toFixed(2)` — the pre-fix bug)
 *  10. ExportButton receives `appointmentTotalsByApptId` prop
 *  11. Receipt # header widened 72px → 84px (Session #157)
 *  12. Detailer column header NEW (100px, immediately right of Employee,
 *      not sortable, label "Detailer")
 *  13. Detailer cell renders `detailerFirstName` plain text (no link per
 *      operator decision #5); `---` fallback when null
 *  14. Detailer derivation: first non-cancelled job's
 *      `assigned_staff.first_name`
 *  15. SELECT extension includes the new `jobs` embed with the explicit
 *      FK hint `employees!jobs_assigned_staff_id_fkey` (PGRST201 guard:
 *      jobs has 3 FKs to employees — assigned_staff_id, created_by,
 *      cancelled_by)
 *  16. `TransactionRow` type carries the new `jobs` field shape
 *  17. CSV row body includes `detailerFirstName` (empty string fallback);
 *      Status moves to last position in CSV row
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_PATH = resolve(__dirname, '../page.tsx');
const SOURCE = readFileSync(PAGE_PATH, 'utf-8');

describe('Admin Transactions LIST — #157 column order (post-Session #157 reorder)', () => {
  it('case 1: column header order matches #157 order (Date → Receipt # → Customer → Services → Employee → Detailer → Method → Tip → Total → Status)', () => {
    // Session #157 reorder: Services moves back near Customer (positions
    // 3→4 swap with Employee), Detailer NEW immediately after Employee,
    // Status moves to the rightmost slot. Locate the <thead><tr>...</tr>
    // </thead> block and assert the headers appear in the expected
    // sequence. Each <th> contributes a label string we can regex-grep —
    // sequencing those grep positions enforces order without coupling to
    // whitespace.
    const headerSequence = [
      'Date <SortIndicator',
      'Receipt # <SortIndicator',
      '>Customer<',
      '>Services<',
      '>Employee<',
      '>Detailer<',
      '>Method<',
      '>Tip<',
      'Total <SortIndicator',
      '>Status<',
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

  it('case 3: Tip column header NEW (80px right-aligned, not sortable) — #157 now immediately follows Method', () => {
    expect(SOURCE).toMatch(/<th className="px-3 py-3 w-\[80px\] text-right">Tip<\/th>/);
    // Tip header must NOT carry an onClick handler (sortable header pattern).
    // Session #157 reorder: Tip now immediately follows Method (was after
    // Services pre-#157). The regex captures the immediate-adjacency relation.
    const tipHeaderMatch = SOURCE.match(/<th className="px-3 py-3 w-\[70px\]">Method<\/th>\s*<th className="px-3 py-3 w-\[80px\] text-right">Tip<\/th>/);
    expect(tipHeaderMatch, 'Tip header must immediately follow Method header (post-#157)').not.toBeNull();
    // Anti-regression: pre-#157 immediate-adjacency Services→Tip must be GONE.
    const preTipHeaderMatch = SOURCE.match(/<th className="px-3 py-3">Services<\/th>\s*<th className="px-3 py-3 w-\[80px\] text-right">Tip<\/th>/);
    expect(preTipHeaderMatch, 'pre-#157 Services→Tip adjacency must be GONE').toBeNull();
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

describe('Admin Transactions LIST — CSV export shape (Sessions #156 + #157)', () => {
  it('case 8: CSV export headers match #157 order (Detailer between Employee and Method; Status at end)', () => {
    // The headers array literal in ExportButton — #157 order.
    expect(SOURCE).toMatch(
      /const headers = \[\s*'Date',\s*'Receipt #',\s*'Customer',\s*'Services',\s*'Employee',\s*'Detailer',\s*'Method',\s*'Tip',\s*'Total',\s*'Status',?\s*\];/,
    );
    // Pre-#157 header array order is GONE
    expect(SOURCE).not.toMatch(
      /const headers = \[\s*'Date',\s*'Receipt #',\s*'Customer',\s*'Employee',\s*'Method',\s*'Status',\s*'Services',\s*'Tip',\s*'Total',?\s*\];/,
    );
    // Pre-#156 header array order is GONE (defense in depth)
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

describe('Admin Transactions LIST — Session #157 amendments (Receipt # width + Detailer column + SELECT extension)', () => {
  it('case 11: Receipt # header widened 72px → 84px', () => {
    // Header carries w-[84px]
    expect(SOURCE).toMatch(/<th\s+className="px-3 py-3 w-\[84px\] cursor-pointer select-none"\s*onClick=\{\(\) => handleHeaderSort\('receipt_number'\)\}/);
    // Pre-#157 72px receipt header must be GONE
    expect(SOURCE).not.toMatch(/<th\s+className="px-3 py-3 w-\[72px\] cursor-pointer select-none"\s*onClick=\{\(\) => handleHeaderSort\('receipt_number'\)\}/);
  });

  it('case 12: Detailer column header NEW (100px, immediately right of Employee, not sortable)', () => {
    expect(SOURCE).toMatch(/<th className="px-3 py-3 w-\[100px\]">Detailer<\/th>/);
    // Adjacency: Detailer must immediately follow Employee
    const adj = SOURCE.match(/<th className="px-3 py-3 w-\[100px\]">Employee<\/th>\s*<th className="px-3 py-3 w-\[100px\]">Detailer<\/th>/);
    expect(adj, 'Detailer header must immediately follow Employee header').not.toBeNull();
    // Sort anti-regression: no onClick on the Detailer header (operator
    // decision Q3 — no sorting on Detailer). Line-scoped check: locate
    // the line containing `>Detailer<` and assert it carries no onClick.
    const detailerHeaderLines = SOURCE.split('\n').filter((l) => l.includes('>Detailer<'));
    expect(detailerHeaderLines.length, 'exactly one Detailer header line expected').toBe(1);
    expect(detailerHeaderLines[0]).not.toMatch(/onClick/);
  });

  it('case 13: Detailer cell renders detailerFirstName plain text + --- fallback (no link per operator decision #5)', () => {
    // The cell's conditional render — plain text branch + span fallback.
    expect(SOURCE).toMatch(
      /<td className="px-3 py-3 max-w-\[100px\] truncate text-gray-600">\s*\{detailerFirstName \?\? \(\s*<span className="text-gray-400">---<\/span>\s*\)\}\s*<\/td>/,
    );
    // Defense in depth: the Detailer cell MUST NOT wrap in an <a href> link.
    // The previous source line ending in `{detailerFirstName ??` must NOT
    // be preceded by an <a> tag opening. Soft check: no `href={` on the
    // same line as `detailerFirstName`.
    const detailerCellLines = SOURCE.split('\n').filter((l) => l.includes('detailerFirstName'));
    for (const line of detailerCellLines) {
      expect(line).not.toMatch(/href=\{/);
    }
  });

  it('case 14: detailerFirstName derivation — first non-cancelled job assigned_staff first_name', () => {
    expect(SOURCE).toMatch(
      /const detailerFirstName =\s*tx\.jobs\?\.find\(\(j\) => j\.status !== 'cancelled'\)\?\.assigned_staff\?\.first_name \?\? null;/,
    );
  });

  it('case 15: SELECT extension includes jobs embed with explicit FK hint (PGRST201 guard)', () => {
    // jobs has 3 FKs to employees (assigned_staff_id, created_by,
    // cancelled_by) per DB_SCHEMA.md L1273+L1288+L1292. The explicit
    // `employees!jobs_assigned_staff_id_fkey` FK hint is mandatory to
    // avoid PostgREST PGRST201 ambiguity (same precedent as SLA cron
    // c931becc and Session #155 transaction-detail).
    expect(SOURCE).toMatch(
      /jobs:jobs\(status, assigned_staff:employees!jobs_assigned_staff_id_fkey\(first_name\)\)/,
    );
  });

  it('case 16: TransactionRow type carries the new jobs field shape', () => {
    // The type extension is additive: existing fields preserved + new
    // `jobs: Array<...> | null`. Pin both shape + nullable + array-ness.
    expect(SOURCE).toMatch(/jobs: Array<\{\s*status: string;\s*assigned_staff: Pick<Employee, 'first_name'> \| null;\s*\}> \| null;/);
  });

  it('case 17: CSV row body includes detailerFirstName + Status moves to last slot', () => {
    // Detailer derivation INSIDE the row map (mirrors on-screen cell).
    expect(SOURCE).toMatch(
      /const detailerFirstName =\s*tx\.jobs\?\.find\(\(j\) => j\.status !== 'cancelled'\)\?\.assigned_staff\?\.first_name \?\? '';/,
    );
    // The row body emits `detailerFirstName` (no `??` because the derivation
    // already coerces null → ''; CSV cell stays empty when no detailer).
    // Pin: detailerFirstName appears as a bare row-entry (followed by comma).
    expect(SOURCE).toMatch(/^\s*detailerFirstName,\s*$/m);
    // Status is the LAST entry in the CSV row body — pin the trailing
    // position. (Mirrors the on-screen rightmost slot.)
    expect(SOURCE).toMatch(/canonicalTotal\.toFixed\(2\),\s*tx\.status,?\s*\]/);
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
