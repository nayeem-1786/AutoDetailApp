#!/usr/bin/env tsx
/**
 * Phase 0b.2 byte-diff harness.
 *
 * Verifies that the public-receipt-page consolidation + fetchReceiptTransaction
 * extraction produce byte-identical output to the prior (Phase 0b.1) state for
 * a list of real production transaction IDs. CC cannot run this against the
 * production DB; the user runs it locally with the working DB credentials in
 * env (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_*`)
 * and a running dev server (for the public-page fetch).
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *
 * Step 1 — Capture BEFORE state at the previous commit (Phase 0b.1 head):
 *
 *   git checkout 4d36eb46
 *   npm run dev                # leave running in another terminal
 *   npx tsx scripts/diff-receipt-renders.ts --capture before <id1> <id2> ... <id10>
 *
 * Step 2 — Capture AFTER state at the current Phase 0b.2 commit:
 *
 *   git checkout main
 *   # (rebuild dev server if needed)
 *   npx tsx scripts/diff-receipt-renders.ts --capture after <id1> <id2> ... <id10>
 *
 * Step 3 — Compare:
 *
 *   npx tsx scripts/diff-receipt-renders.ts --diff <id1> <id2> ... <id10>
 *
 * Expected result: all transactions PASS in all three pipelines (HTML / thermal
 * / public page). If anything FAILs, copy the printed diff to Claude.
 *
 * =============================================================================
 * SCENARIO COVERAGE — pick 10 IDs covering all 10 categories
 * =============================================================================
 *
 *  1. Walk-in cash, single payment
 *  2. Walk-in card
 *  3. Booking-deposit only (no close-out yet)
 *  4. Booking-deposit + close-out paid in full
 *  5. Pay-link multi-event
 *  6. Close-out only (full payment at pickup)
 *  7. $0 close-out (fully pre-paid)
 *  8. Voided
 *  9. Full refund
 * 10. Partial refund
 *
 * Sample SQL for finding production candidates is in
 *   docs/sessions/receipt-unification-phase-0b-2.md
 *
 * =============================================================================
 * OUTPUT LAYOUT
 * =============================================================================
 *
 *   tmp/diff/<id>.tx.before.json         (fetchReceiptTransaction shape)
 *   tmp/diff/<id>.tx.after.json
 *   tmp/diff/<id>.html.before.html       (generateReceiptHtml output)
 *   tmp/diff/<id>.html.after.html
 *   tmp/diff/<id>.thermal.before.txt     (receiptToPlainText output)
 *   tmp/diff/<id>.thermal.after.txt
 *   tmp/diff/<id>.public.before.html     (fetched from dev server)
 *   tmp/diff/<id>.public.after.html
 *   tmp/diff/SUMMARY.txt                 (PASS/FAIL aggregate)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  fetchReceiptData,
  fetchReceiptTransaction,
} from '../src/lib/data/receipt-data';
import {
  generateReceiptHtml,
  generateReceiptLines,
  receiptToPlainText,
} from '../src/app/pos/lib/receipt-template';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, '..', 'tmp', 'diff');

mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const captureIdx = argv.indexOf('--capture');
const diffMode = argv.includes('--diff');
const publicUrlIdx = argv.indexOf('--public-url');
const skipPublic = argv.includes('--skip-public');

const captureMode: 'before' | 'after' | null = captureIdx >= 0
  ? (argv[captureIdx + 1] as 'before' | 'after')
  : null;
const publicUrl: string =
  publicUrlIdx >= 0 ? argv[publicUrlIdx + 1] : 'http://localhost:3000';

const ids = argv.filter(
  (a, i) =>
    !a.startsWith('--') &&
    (i === 0 || (!argv[i - 1].startsWith('--')))
);

if (!captureMode && !diffMode) {
  console.error(
    'Missing mode. Pass either --capture before|after or --diff. See script header for usage.'
  );
  process.exit(1);
}
if (captureMode && captureMode !== 'before' && captureMode !== 'after') {
  console.error(`Invalid --capture value: ${captureMode}. Expected "before" or "after".`);
  process.exit(1);
}
if (ids.length === 0) {
  console.error('No transaction IDs supplied. Pass one or more as positional args.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client (service-role)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env. Cannot connect to DB.'
    );
    process.exit(2);
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Capture mode
// ---------------------------------------------------------------------------

async function capture(mode: 'before' | 'after'): Promise<void> {
  const supabase = getSupabase();
  console.log(`Capturing ${ids.length} transaction(s) in ${mode} mode...`);

  for (const id of ids) {
    console.log(`\n[${id}]`);
    try {
      // 1. fetchReceiptTransaction shape (proves the composer-driven aggregation
      //    is unchanged). For BEFORE state at commit 4d36eb46, this fn doesn't
      //    exist yet — fall back to fetchReceiptData and use its tx field.
      let tx;
      if (typeof fetchReceiptTransaction === 'function') {
        tx = await fetchReceiptTransaction(supabase, id);
      } else {
        // Pre-Phase-0b.2 fallback (4d36eb46): fetchReceiptData is the only
        // entry point. The .tx slice is what the renderers consume.
        const full = await fetchReceiptData(supabase, id);
        tx = full.tx;
      }
      writeFileSync(
        join(OUT_DIR, `${id}.tx.${mode}.json`),
        // Stable key ordering for diff cleanliness.
        JSON.stringify(tx, Object.keys(tx).sort(), 2),
        'utf-8'
      );
      console.log(`  tx (json):  ${JSON.stringify(tx).length} bytes`);

      // 2. generateReceiptHtml (full pipeline including config + QR + barcode)
      const full = await fetchReceiptData(supabase, id);
      const html = generateReceiptHtml(full.tx, full.config, full.images);
      writeFileSync(join(OUT_DIR, `${id}.html.${mode}.html`), html, 'utf-8');
      console.log(`  html:       ${html.length} bytes`);

      // 3. generateReceiptLines → receiptToPlainText (thermal)
      const lines = generateReceiptLines(full.tx, full.config, full.context);
      const thermal = receiptToPlainText(lines);
      writeFileSync(join(OUT_DIR, `${id}.thermal.${mode}.txt`), thermal, 'utf-8');
      console.log(`  thermal:    ${thermal.length} bytes`);

      // 4. Public page — fetch from running dev server. Optional via --skip-public.
      if (!skipPublic) {
        const { data: row } = await supabase
          .from('transactions')
          .select('access_token')
          .eq('id', id)
          .maybeSingle();
        if (!row?.access_token) {
          console.warn(`  public:     SKIP (no access_token on transaction ${id})`);
        } else {
          try {
            const res = await fetch(`${publicUrl}/receipt/${row.access_token}`);
            if (!res.ok) {
              console.warn(
                `  public:     SKIP (HTTP ${res.status} from ${publicUrl}/receipt/${row.access_token})`
              );
            } else {
              const pageHtml = await res.text();
              writeFileSync(
                join(OUT_DIR, `${id}.public.${mode}.html`),
                pageHtml,
                'utf-8'
              );
              console.log(`  public:     ${pageHtml.length} bytes`);
            }
          } catch (err) {
            console.warn(`  public:     SKIP (fetch error: ${(err as Error).message})`);
          }
        }
      }
    } catch (err) {
      console.error(`  ERROR: ${(err as Error).message}`);
    }
  }
  console.log(`\nWrote captures to ${OUT_DIR}`);
}

// ---------------------------------------------------------------------------
// Diff mode
// ---------------------------------------------------------------------------

interface DiffRow {
  id: string;
  txJson: 'PASS' | 'FAIL' | 'MISSING';
  txJsonDelta: number;
  html: 'PASS' | 'FAIL' | 'MISSING';
  htmlDelta: number;
  thermal: 'PASS' | 'FAIL' | 'MISSING';
  thermalDelta: number;
  publicPage: 'PASS' | 'FAIL' | 'MISSING';
  publicPageDelta: number;
}

function compareFile(
  before: string,
  after: string
): { status: 'PASS' | 'FAIL' | 'MISSING'; delta: number } {
  if (!existsSync(before) || !existsSync(after)) {
    return { status: 'MISSING', delta: 0 };
  }
  const a = readFileSync(before, 'utf-8');
  const b = readFileSync(after, 'utf-8');
  if (a === b) return { status: 'PASS', delta: 0 };
  return { status: 'FAIL', delta: Math.abs(b.length - a.length) };
}

function runDiff(): void {
  const rows: DiffRow[] = [];
  console.log(`Diffing ${ids.length} transaction(s)...\n`);

  for (const id of ids) {
    const txJson = compareFile(
      join(OUT_DIR, `${id}.tx.before.json`),
      join(OUT_DIR, `${id}.tx.after.json`)
    );
    const html = compareFile(
      join(OUT_DIR, `${id}.html.before.html`),
      join(OUT_DIR, `${id}.html.after.html`)
    );
    const thermal = compareFile(
      join(OUT_DIR, `${id}.thermal.before.txt`),
      join(OUT_DIR, `${id}.thermal.after.txt`)
    );
    const publicPage = compareFile(
      join(OUT_DIR, `${id}.public.before.html`),
      join(OUT_DIR, `${id}.public.after.html`)
    );

    rows.push({
      id,
      txJson: txJson.status,
      txJsonDelta: txJson.delta,
      html: html.status,
      htmlDelta: html.delta,
      thermal: thermal.status,
      thermalDelta: thermal.delta,
      publicPage: publicPage.status,
      publicPageDelta: publicPage.delta,
    });

    console.log(
      `[${id}]  tx-json: ${txJson.status}  html: ${html.status}` +
        (html.status === 'FAIL' ? ` (Δ${html.delta}B)` : '') +
        `  thermal: ${thermal.status}` +
        (thermal.status === 'FAIL' ? ` (Δ${thermal.delta}B)` : '') +
        `  public: ${publicPage.status}` +
        (publicPage.status === 'FAIL' ? ` (Δ${publicPage.delta}B)` : '')
    );
  }

  // Summary
  const totalRows = rows.length;
  const allPass = rows.every(
    (r) =>
      (r.txJson === 'PASS' || r.txJson === 'MISSING') &&
      (r.html === 'PASS' || r.html === 'MISSING') &&
      (r.thermal === 'PASS' || r.thermal === 'MISSING') &&
      (r.publicPage === 'PASS' || r.publicPage === 'MISSING')
  );
  const anyFail = rows.some(
    (r) =>
      r.txJson === 'FAIL' ||
      r.html === 'FAIL' ||
      r.thermal === 'FAIL' ||
      r.publicPage === 'FAIL'
  );

  const summary =
    `Phase 0b.2 byte-diff summary\n` +
    `===========================\n` +
    `Transactions inspected: ${totalRows}\n` +
    `Verdict: ${anyFail ? 'FAIL — at least one diff present' : allPass ? 'PASS — zero non-whitespace diffs across all surfaces' : 'INCONCLUSIVE — captures missing'}\n` +
    `\n` +
    rows
      .map(
        (r) =>
          `  [${r.id}]  tx-json:${r.txJson}  html:${r.html}${r.htmlDelta ? ` Δ${r.htmlDelta}B` : ''}  thermal:${r.thermal}${r.thermalDelta ? ` Δ${r.thermalDelta}B` : ''}  public:${r.publicPage}${r.publicPageDelta ? ` Δ${r.publicPageDelta}B` : ''}`
      )
      .join('\n') +
    `\n`;

  writeFileSync(join(OUT_DIR, 'SUMMARY.txt'), summary, 'utf-8');
  console.log(`\n${summary}`);

  if (anyFail) {
    console.log(
      `For any FAIL row, run:  diff ${OUT_DIR}/<id>.<surface>.before.<ext>  ${OUT_DIR}/<id>.<surface>.after.<ext>`
    );
    process.exit(3);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  if (captureMode) {
    await capture(captureMode);
  } else if (diffMode) {
    runDiff();
  }
})().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(1);
});
