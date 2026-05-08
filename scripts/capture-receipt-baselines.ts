#!/usr/bin/env tsx
/**
 * Phase 0b.1 capture script.
 *
 * Renders all 12 baseline ReceiptTransaction inputs through:
 *   - generateReceiptHtml → ${slug}.html
 *   - generateReceiptLines → receiptToPlainText → ${slug}.thermal.txt
 *
 * Outputs go to:
 *   src/lib/data/__tests__/__fixtures__/receipt-baselines/<slug>.html
 *   src/lib/data/__tests__/__fixtures__/receipt-baselines/<slug>.thermal.txt
 *
 * The fixtures become the byte-fidelity baseline for the rest of Phase 0b.1.
 * Re-run only when intentionally adopting a renderer change. After the
 * receipt-data.ts switch (TASK 4), the regression test re-renders the same
 * inputs and asserts byte-match against these files.
 *
 * Usage:
 *   npx tsx scripts/capture-receipt-baselines.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateReceiptHtml,
  generateReceiptLines,
  receiptToPlainText,
} from '../src/app/pos/lib/receipt-template';
import { RECEIPT_SCENARIOS } from '../src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(
  __dirname,
  '..',
  'src',
  'lib',
  'data',
  '__tests__',
  '__fixtures__',
  'receipt-baselines'
);

mkdirSync(FIXTURES_DIR, { recursive: true });

let written = 0;
for (const scenario of RECEIPT_SCENARIOS) {
  const html = generateReceiptHtml(scenario.tx);
  const lines = generateReceiptLines(scenario.tx);
  const thermal = receiptToPlainText(lines);

  const htmlPath = join(FIXTURES_DIR, `${scenario.slug}.html`);
  const thermalPath = join(FIXTURES_DIR, `${scenario.slug}.thermal.txt`);

  writeFileSync(htmlPath, html, 'utf-8');
  writeFileSync(thermalPath, thermal, 'utf-8');

  console.log(`[${String(scenario.id).padStart(2, '0')}] ${scenario.slug}`);
  console.log(`     html    → ${htmlPath} (${html.length} bytes)`);
  console.log(`     thermal → ${thermalPath} (${thermal.length} bytes)`);
  written += 2;
}

console.log(`\nWrote ${written} fixture files to ${FIXTURES_DIR}`);
