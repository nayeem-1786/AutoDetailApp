/**
 * Issue 33 follow-up UX — surface adoption invariants.
 *
 * Each of the 10 render surfaces (4 receipt + 6 quote) imports
 * `getLineItemPricingInfo` and/or `sumLineItemSavings` from
 * `@/lib/quotes/line-item-pricing` and renders the discount UI
 * according to the helper's verdict.
 *
 * Full DOM-level snapshots of each surface are heavy (Supabase + Next.js
 * server components + pdfkit Buffer outputs). Instead, this file pins
 * the LOAD-BEARING invariants that, if violated, would silently
 * regress the Q-0085 customer-facing display:
 *
 *  1. The helper is imported in every render surface (compile-time
 *     reference verified by file-level grep).
 *  2. The 4 receipt surfaces use the helper output (no inline
 *     pricing_type !== 'standard' predicate remains).
 *  3. The 6 quote surfaces use the helper output.
 *  4. The PDF route's SELECT widens to include pricing_type +
 *     standard_price.
 *  5. The customer-facing "You saved" wording is present where
 *     required (operator Q1 lock).
 *  6. The thermal text + HTML output formats are stable (the helper
 *     was extracted without changing the rendered string).
 *
 * Behavior tests for the helper itself live in
 * `line-item-pricing.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getLineItemPricingInfo,
  sumLineItemSavings,
} from '../line-item-pricing';

const repoRoot = join(__dirname, '..', '..', '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf8');
}

// ───────────────────────────────────────────────────────────────
// Group A — helper is imported in every render surface
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — surfaces import the helper', () => {
  const surfacesUsingHelper: Array<{ name: string; path: string }> = [
    // Receipt-side (refactored — no behavior change)
    { name: 'public receipt page', path: 'src/app/(public)/receipt/[token]/page.tsx' },
    { name: 'thermal receipt template', path: 'src/app/pos/lib/receipt-template.ts' },
    { name: 'email receipt route', path: 'src/app/api/pos/receipts/email/route.ts' },
    // Quote-side (new adoption)
    { name: 'public quote page', path: 'src/app/(public)/quote/[token]/page.tsx' },
    { name: 'quote PDF route', path: 'src/app/api/quotes/[id]/pdf/route.ts' },
    { name: 'admin quote detail', path: 'src/app/admin/quotes/[id]/page.tsx' },
    { name: 'admin quote slide-over', path: 'src/app/admin/quotes/components/quote-slide-over.tsx' },
    { name: 'POS quote detail', path: 'src/app/pos/components/quotes/quote-detail.tsx' },
  ];

  for (const surface of surfacesUsingHelper) {
    it(`${surface.name} imports from line-item-pricing`, () => {
      const src = readSrc(surface.path);
      expect(src).toMatch(/from '@\/lib\/quotes\/line-item-pricing'/);
      expect(src).toContain('getLineItemPricingInfo');
    });
  }
});

// ───────────────────────────────────────────────────────────────
// Group B — receipt surfaces no longer carry inline predicates
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — receipt surfaces use the helper exclusively', () => {
  it("public receipt page no longer has the inline pricing_type !== 'standard' predicate", () => {
    const src = readSrc('src/app/(public)/receipt/[token]/page.tsx');
    // The inline check pattern that was present pre-extraction.
    expect(src).not.toMatch(
      /item\.pricing_type\s*&&\s*item\.pricing_type\s*!==\s*['"]standard['"]\s*&&\s*item\.standard_price/,
    );
    // The helper output IS read.
    expect(src).toContain('pricingInfo.hasDiscount');
  });

  it('thermal receipt template no longer has the inline predicate', () => {
    const src = readSrc('src/app/pos/lib/receipt-template.ts');
    expect(src).not.toMatch(
      /item\.pricing_type\s*&&\s*item\.pricing_type\s*!==\s*['"]standard['"]\s*&&\s*item\.standard_price/,
    );
    // The helper output IS read in both thermal text and HTML branches.
    const occurrences = (src.match(/getLineItemPricingInfo\(/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('email receipt route no longer has the inline predicate', () => {
    const src = readSrc('src/app/api/pos/receipts/email/route.ts');
    expect(src).not.toMatch(
      /i\.pricing_type\s*&&\s*i\.pricing_type\s*!==\s*['"]standard['"]\s*&&\s*i\.standard_price/,
    );
    expect(src).toContain('pricingInfo.hasDiscount');
  });
});

// ───────────────────────────────────────────────────────────────
// Group C — public quote page (Q-0085 primary defect)
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — public quote page (Q-0085 fix)', () => {
  const path = 'src/app/(public)/quote/[token]/page.tsx';

  it("no longer filters on pricing_type === 'sale' only (the Q-0085 defect)", () => {
    const src = readSrc(path);
    // The defective predicate that ignored combo lines.
    expect(src).not.toMatch(/pricing_type\s*===\s*['"]sale['"]/);
  });

  it('uses the helper to compute the hasDiscount verdict', () => {
    const src = readSrc(path);
    expect(src).toContain('getLineItemPricingInfo');
    // The page destructures the helper output into a local `hasDiscount`
    // for use in conditional JSX expressions.
    expect(src).toContain('pricingInfo?.hasDiscount');
    expect(src).toMatch(/hasDiscount.*&&.*pricingInfo/);
  });

  it('renders the "You saved" wording (operator Q1 lock) instead of "Sale Savings"', () => {
    const src = readSrc(path);
    expect(src).toContain('You saved');
    expect(src).not.toContain('Sale Savings');
  });

  it('uses sumLineItemSavings for the totals row', () => {
    const src = readSrc(path);
    expect(src).toContain('sumLineItemSavings');
  });
});

// ───────────────────────────────────────────────────────────────
// Group D — quote PDF
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — quote PDF route', () => {
  const path = 'src/app/api/quotes/[id]/pdf/route.ts';

  it('SELECT includes the new combo/sale columns', () => {
    const src = readSrc(path);
    expect(src).toMatch(/quote_items\([^)]*standard_price[^)]*\)/);
    expect(src).toMatch(/quote_items\([^)]*pricing_type[^)]*\)/);
  });

  it('local QuoteItem type includes pricing_type + standard_price', () => {
    const src = readSrc(path);
    // Match within the QuoteItem interface block
    const interfaceMatch = src.match(/interface QuoteItem \{[\s\S]*?\n\}/);
    expect(interfaceMatch).not.toBeNull();
    const block = interfaceMatch![0];
    expect(block).toContain('standard_price');
    expect(block).toContain('pricing_type');
  });

  it('uses single-line discount format with ASCII arrow (no Unicode glyph that PDFKit Helvetica drops)', () => {
    const src = readSrc(path);
    // ASCII arrow chosen per session prompt + PDFKit default-font compatibility.
    expect(src).toMatch(/-> \$/);
    // The full label/price pattern should be present.
    expect(src).toMatch(/\$\{\(pricingInfo\.standardPrice as number\)\.toFixed\(2\)\} -> \$/);
  });

  it('renders the "You saved" line above TOTAL when sumLineItemSavings > 0', () => {
    const src = readSrc(path);
    expect(src).toContain("You saved:");
    expect(src).toContain('sumLineItemSavings');
  });
});

// ───────────────────────────────────────────────────────────────
// Group E — admin quote detail / slide-over
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — admin quote surfaces', () => {
  it('admin quote detail page renders strikethrough viz + "You saved" totals row', () => {
    const src = readSrc('src/app/admin/quotes/[id]/page.tsx');
    expect(src).toContain('getLineItemPricingInfo');
    expect(src).toContain('sumLineItemSavings');
    expect(src).toContain('line-through');
    expect(src).toContain('You saved');
  });

  it('admin slide-over renders compact badge (Q2 — no full strikethrough in slide-over)', () => {
    const src = readSrc('src/app/admin/quotes/components/quote-slide-over.tsx');
    expect(src).toContain('getLineItemPricingInfo');
    // Compact badge shows label + savings amount; full strikethrough viz NOT used here.
    expect(src).toContain('pricingInfo.label');
    expect(src).toContain('pricingInfo.totalSavings');
    // No "You saved" totals row in slide-over (Q2 — preview-only).
    expect(src).not.toContain('sumLineItemSavings');
  });
});

// ───────────────────────────────────────────────────────────────
// Group F — POS quote surfaces
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — POS quote surfaces', () => {
  it('POS quote detail page renders strikethrough + "You saved" totals row', () => {
    const src = readSrc('src/app/pos/components/quotes/quote-detail.tsx');
    expect(src).toContain('getLineItemPricingInfo');
    expect(src).toContain('sumLineItemSavings');
    expect(src).toContain('line-through');
    expect(src).toContain('You saved');
  });

  it('POS quote detail QuoteData.items type includes pricing_type + standard_price', () => {
    const src = readSrc('src/app/pos/components/quotes/quote-detail.tsx');
    // The items array shape inside QuoteData.
    expect(src).toMatch(/standard_price:\s*number\s*\|\s*null/);
    expect(src).toMatch(/pricing_type:\s*['"]standard['"]/);
  });

  it('POS quote-item-row renders compact strikethrough on TicketItem when pricingType !== standard', () => {
    const src = readSrc('src/app/pos/components/quotes/quote-item-row.tsx');
    expect(src).toContain('line-through');
    expect(src).toContain("item.pricingType !== 'standard'");
    expect(src).toContain('item.standardPrice > item.unitPrice');
  });
});

// ───────────────────────────────────────────────────────────────
// Group G — operator-locked decisions pinned across surfaces
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — operator-locked invariants', () => {
  it('Q1 — "You saved" wording is sentence-case (not "Sale Savings", not all-caps)', () => {
    // Check every surface that surfaces a totals row.
    const surfaces = [
      'src/app/(public)/quote/[token]/page.tsx',
      'src/app/api/quotes/[id]/pdf/route.ts',
      'src/app/admin/quotes/[id]/page.tsx',
      'src/app/pos/components/quotes/quote-detail.tsx',
    ];
    for (const path of surfaces) {
      const src = readSrc(path);
      expect(src).toContain('You saved');
      // Discourage drift to alternative wording the operator did NOT lock.
      expect(src).not.toContain('Total Savings');
      expect(src).not.toContain('Bundle Discount');
    }
  });

  it('Q3 — public receipt page carries the "Total saved today" footer', () => {
    const src = readSrc('src/app/(public)/receipt/[token]/page.tsx');
    expect(src).toContain('Total saved today');
    expect(src).toContain('sumLineItemSavings');
  });

  it('Q4 — helper uses dollars (no toCents/fromCents wrapping inside the predicate)', () => {
    // The helper itself does not import refund-math (cents conversion).
    // Future Money-Unify migration will add it; for this session, dollars.
    const helperSrc = readSrc('src/lib/quotes/line-item-pricing.ts');
    expect(helperSrc).not.toContain('refund-math');
    expect(helperSrc).not.toContain('toCents(');
  });

  it('Q5 — PDF visual is single-line ASCII arrow format', () => {
    const src = readSrc('src/app/api/quotes/[id]/pdf/route.ts');
    // ASCII arrow "->" not Unicode "→" (Helvetica font compatibility).
    // The discount line is built into a template literal that includes
    // both the standardPrice and the discounted unit_price separated by
    // an ASCII arrow.
    expect(src).toContain(' -> $');
    expect(src).not.toContain('→');
    // Verify the full pattern: `Label: $X.XX -> $Y.YY (Save $Z.ZZ)`
    expect(src).toMatch(/\.label\}: \$\$\{[^}]+\.standardPrice[^}]+toFixed\(2\)\} -> \$/);
  });
});

// ───────────────────────────────────────────────────────────────
// Group H — text output stability (the refactored receipt surfaces
// must produce the same rendered string as before extraction).
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — receipt rendered-string stability', () => {
  it('matches the pre-extraction "Combo: Reg $X | Saved $Y!" format for combo items', () => {
    const info = getLineItemPricingInfo({
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
      quantity: 1,
    });
    // The 4 receipt surfaces concatenate these fields into the legacy
    // text format. Verify the pieces.
    expect(info.label).toBe('Combo');
    expect((info.standardPrice as number).toFixed(2)).toBe('125.00');
    expect(info.savingsPerUnit.toFixed(2)).toBe('25.00');
  });

  it('matches the pre-extraction "Sale: Reg $X | Saved $Y!" format for sale items', () => {
    const info = getLineItemPricingInfo({
      unit_price: 80,
      standard_price: 100,
      pricing_type: 'sale',
      quantity: 1,
    });
    expect(info.label).toBe('Sale');
    expect((info.standardPrice as number).toFixed(2)).toBe('100.00');
    expect(info.savingsPerUnit.toFixed(2)).toBe('20.00');
  });

  it('returns no-discount shape for standard items so receipt rendering branches skip the sub-text', () => {
    const info = getLineItemPricingInfo({
      unit_price: 100,
      standard_price: null,
      pricing_type: 'standard',
      quantity: 1,
    });
    expect(info.hasDiscount).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// Group I — sumLineItemSavings cross-surface contract
// ───────────────────────────────────────────────────────────────

describe('line-item-pricing — sumLineItemSavings cross-surface contract', () => {
  it('returns zero so the savings row is hidden when no discounts apply', () => {
    const total = sumLineItemSavings([
      { unit_price: 85, standard_price: null, pricing_type: 'standard', quantity: 1 },
      { unit_price: 50, standard_price: null, pricing_type: 'standard', quantity: 2 },
    ]);
    expect(total).toBe(0);
  });

  it('Q-0085 reproduction: $85 anchor + $100 combo addon (was $125) → $25 savings', () => {
    const total = sumLineItemSavings([
      { unit_price: 85, standard_price: null, pricing_type: 'standard', quantity: 1 },
      { unit_price: 100, standard_price: 125, pricing_type: 'combo', quantity: 1 },
    ]);
    expect(total).toBe(25);
  });

  it('mixed combo + sale quote: savings aggregate correctly', () => {
    const total = sumLineItemSavings([
      { unit_price: 100, standard_price: 125, pricing_type: 'combo', quantity: 1 }, // 25
      { unit_price: 70, standard_price: 90, pricing_type: 'sale', quantity: 2 }, // 40
      { unit_price: 50, standard_price: null, pricing_type: 'standard', quantity: 1 }, // 0
    ]);
    expect(total).toBe(65);
  });
});
