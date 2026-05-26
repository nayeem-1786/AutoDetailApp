import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D46 (Issue 41) adoption pins for the 15 per-line visual rendering
 * surfaces inventoried by `docs/dev/ISSUE_41_TIER_VISUAL_SURFACES_AUDIT.md`.
 *
 * Each surface must:
 *   1. Import `renderTierToken` from `@/lib/quotes/tier-display` (the
 *      D45 helper) — directly or transitively via a shared composer
 *      whose call site is in the same file.
 *   2. No longer render the raw snake_case `tier_name` slug to humans
 *      (no `{item.tier_name}` / `${tier_name}` / `(${tier_name})` /
 *      ` — ${tier_name}` patterns in user-visible output).
 *
 * The grep patterns below are deliberately conservative: they match the
 * exact pre-D46 shapes the audit cited so the pins flip ONLY on real
 * regression, not on cosmetic re-formatting.
 *
 * Memory #15 (4 receipt surfaces): receipt-template.ts covers 3 of 4
 * receipt consumers via the two render paths (thermal
 * generateReceiptLines + HTML generateReceiptHtml). The 4th — SMS
 * receipt via `buildSummaryLine` in src/lib/sms/composites.ts —
 * renders no tier_name today; verified-no-change sentinel below.
 */

const ROOT = resolve(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('D46 adoption pins — visual surfaces import renderTierToken', () => {
  it('receipt-template.ts (surfaces 1+2: thermal + HTML) imports renderTierToken', () => {
    const src = read('src/app/pos/lib/receipt-template.ts');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toContain('renderTierToken');
  });

  it('receipt-template.ts no longer renders raw tier_name in thermal displayName', () => {
    const src = read('src/app/pos/lib/receipt-template.ts');
    // Pre-D46: `${item.item_name} - ${item.tier_name}` (thermal)
    expect(src).not.toMatch(/\$\{item\.item_name\}\s*-\s*\$\{item\.tier_name\}/);
  });

  it('receipt-template.ts no longer renders raw tier_name in HTML displayName', () => {
    const src = read('src/app/pos/lib/receipt-template.ts');
    // Pre-D46: `${esc(item.item_name)} - ${esc(item.tier_name)}`
    expect(src).not.toMatch(
      /\$\{esc\(item\.item_name\)\}\s*-\s*\$\{esc\(item\.tier_name\)\}/,
    );
  });

  it('public receipt page (surface 3) imports renderTierToken and removed raw em-dash slug', () => {
    const src = read('src/app/(public)/receipt/[token]/page.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: ` — {item.tier_name}` em-dash em-space slug
    expect(src).not.toMatch(/—\s*\{item\.tier_name\}/);
  });

  it('admin appointment notify route (surfaces 5-7) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/api/appointments/[id]/notify/route.ts');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    expect(src).toContain('attachTierMetaToItems');
    // Pre-D46: `(${s.tier_name})` template literal in 3 places
    expect(src).not.toMatch(/\(\$\{s\.tier_name\}\)/);
    // Pre-D46: ` ${s.tier_name ? ... <span ...>(${s.tier_name})` HTML
    expect(src).not.toMatch(/\(\s*\{s\.tier_name\}\s*\)/);
  });

  it('POS appointment notify route (surfaces 8-9) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/api/pos/appointments/[id]/notify/route.ts');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    expect(src).toContain('attachTierMetaToItems');
    expect(src).not.toMatch(/\(\$\{s\.tier_name\}\)/);
  });

  it('public quote page (surface 10) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/(public)/quote/[token]/page.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: `<div className="...">{displayItem.tier_name}</div>`
    expect(src).not.toMatch(/\{displayItem\.tier_name\}<\/div>/);
  });

  it('public pay page (surface 11) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/(public)/pay/[token]/page.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: ` — {line.tier_name}` em-dash slug
    expect(src).not.toMatch(/—\s*\{line\.tier_name\}/);
  });

  it('admin quote slide-over (surface 12) imports renderTierToken', () => {
    const src = read('src/app/admin/quotes/components/quote-slide-over.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: `({item.tier_name})` parens slug
    expect(src).not.toMatch(/\(\{item\.tier_name\}\)/);
  });

  it('admin quote detail page (surface 13) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/admin/quotes/[id]/page.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    expect(src).toContain('attachTierMetaToItems');
    // Pre-D46: `<div className="...">{item.tier_name}</div>`
    expect(src).not.toMatch(/text-gray-500['"]>\{item\.tier_name\}<\/div>/);
  });

  it('POS quote detail (surface 14) imports renderTierToken', () => {
    const src = read('src/app/pos/components/quotes/quote-detail.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: `<p className="...">{item.tier_name}</p>`
    expect(src).not.toMatch(/text-gray-400['"]>\{item\.tier_name\}<\/p>/);
  });

  it('POS transaction detail (surface 15) imports renderTierToken', () => {
    const src = read('src/app/pos/components/transactions/transaction-detail.tsx');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toContain('renderTierToken');
    // Pre-D46: `<span className="...">({item.tier_name})</span>`
    expect(src).not.toMatch(/\(\{item\.tier_name\}\)/);
  });

  it('quote PDF (surface 16) imports renderTierToken + attachTierMetaToItems', () => {
    const src = read('src/app/api/quotes/[id]/pdf/route.ts');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/tier-display['"]/);
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('renderTierToken');
    expect(src).toContain('attachTierMetaToItems');
    // Pre-D46: `doc.text(item.tier_name || '-', colTier, …)`
    expect(src).not.toMatch(/doc\.text\(item\.tier_name\s*\|\|/);
  });
});

describe('D46 enrichment plumbing — central paths route through attachTierMetaToItems', () => {
  it('quote-service.getQuoteById enriches items via attachTierMetaToItems', () => {
    const src = read('src/lib/quotes/quote-service.ts');
    expect(src).toMatch(/from\s+['"]\.\/attach-tier-meta['"]/);
    expect(src).toContain('attachTierMetaToItems');
  });

  it('receipt-data.mapTransactionRow enriches items via attachTierMetaToItems (memory #15 — 3 of 4 receipt surfaces covered here)', () => {
    const src = read('src/lib/data/receipt-data.ts');
    expect(src).toMatch(/from\s+['"]@\/lib\/quotes\/attach-tier-meta['"]/);
    expect(src).toContain('attachTierMetaToItems');
  });
});

describe('D46 memory #15 sentinel — SMS receipt buildSummaryLine renders no tier_name (verified-no-change)', () => {
  it('buildSummaryLine in composites.ts does not reference tier_name', () => {
    const src = read('src/lib/sms/composites.ts');
    // Locate the function body for buildSummaryLine and verify no
    // tier_name reference exists within it. Whole-file check is
    // sufficient — the function is small and adding tier rendering
    // anywhere in the file would require touching this body anyway.
    expect(src).toContain('buildSummaryLine');
    // Pin: the SMS receipt path renders vehicle + total only. If
    // someone adds tier rendering to buildSummaryLine in the future,
    // this pin flips and Memory #15 needs re-verification.
    const bodyMatch = src.match(/export function buildSummaryLine[\s\S]*?\n\}/);
    expect(bodyMatch).not.toBeNull();
    if (bodyMatch) {
      expect(bodyMatch[0]).not.toContain('tier_name');
      expect(bodyMatch[0]).not.toContain('tier_label');
      expect(bodyMatch[0]).not.toContain('qty_label');
    }
  });
});

describe('D46 helper layer — attachTierMetaToItems contract', () => {
  it('exports the function and TierMetaInput / TierMetaFields types', () => {
    const src = read('src/lib/quotes/attach-tier-meta.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+attachTierMetaToItems/);
    expect(src).toMatch(/export\s+interface\s+TierMetaInput/);
    expect(src).toMatch(/export\s+interface\s+TierMetaFields/);
  });

  it('preserves D45 helpers unchanged (byte-identical contract)', () => {
    // Pin D45 helper exports remain intact — D46 must NOT modify them.
    const tierDisplay = read('src/lib/quotes/tier-display.ts');
    expect(tierDisplay).toMatch(/export\s+function\s+renderTierToken/);
    expect(tierDisplay).toMatch(/export\s+interface\s+TierDisplayItem/);

    const servicesSummary = read('src/lib/quotes/services-summary.ts');
    expect(servicesSummary).toMatch(/export\s+function\s+formatServicesSummary/);
    expect(servicesSummary).toMatch(/export\s+async\s+function\s+enrichItemsWithTierMeta/);
  });
});
