import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * D45 (Issue 39) adoption pins.
 *
 * These tests assert that each chip-composing call site IMPORTS the
 * shared `formatServicesSummary` (and `enrichItemsWithTierMeta` for the
 * sites that need the batched lookup) from `@/lib/quotes/services-summary`
 * AND no longer contains the naive `items.map(i => i.item_name).join`
 * pattern.
 *
 * They catch silent regressions where a future session removes the
 * import or rolls back to the inline composition.
 *
 * Per session brief Hard Rule: `book/route.ts` adoption is OPTIONAL
 * because the online booking widget cannot produce multi-tier
 * same-service quotes today (verified in `booking-wizard.tsx` —
 * primary service + array of DISTINCT addon services). It is DEFERRED
 * with documentation; if a future booking redesign enables multi-tier
 * same-service input, adoption becomes mandatory and a pin test should
 * be added then.
 */

const ROOT = resolve(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('D45 adoption pins — chip-composing call sites import the shared helper', () => {
  it('send-quote-sms/route.ts imports formatServicesSummary', () => {
    const src = read('src/app/api/voice-agent/send-quote-sms/route.ts');
    expect(src).toMatch(
      /from\s+['"]@\/lib\/quotes\/services-summary['"]/,
    );
    expect(src).toContain('formatServicesSummary');
  });

  it('send-quote-sms/route.ts no longer composes serviceList via items.map().join(, )', () => {
    const src = read('src/app/api/voice-agent/send-quote-sms/route.ts');
    // The pre-D45 pattern was:
    //   const serviceList = quoteItems.map((i) => i.item_name).join(', ');
    // Pin that the literal RHS shape is gone (single source of truth is
    // now formatServicesSummary).
    expect(src).not.toMatch(
      /const\s+serviceList\s*=\s*quoteItems\.map\(\(i\)\s*=>\s*i\.item_name\)\.join/,
    );
  });

  it('quotes/[id]/accept/route.ts imports formatServicesSummary + enrichItemsWithTierMeta', () => {
    const src = read('src/app/api/quotes/[id]/accept/route.ts');
    expect(src).toMatch(
      /from\s+['"]@\/lib\/quotes\/services-summary['"]/,
    );
    expect(src).toContain('formatServicesSummary');
    expect(src).toContain('enrichItemsWithTierMeta');
  });

  it('quotes/[id]/accept/route.ts no longer composes serviceList via inline map().join(, )', () => {
    const src = read('src/app/api/quotes/[id]/accept/route.ts');
    // Pre-D45: const serviceList = items.map((i) => i.item_name).join(', ') || 'Services';
    expect(src).not.toMatch(
      /const\s+serviceList\s*=\s*items\.map\(\(i\)\s*=>\s*i\.item_name\)\.join/,
    );
  });

  it('pos/jobs/[id]/cancel/route.ts imports formatServicesSummary + enrichItemsWithTierMeta', () => {
    const src = read('src/app/api/pos/jobs/[id]/cancel/route.ts');
    expect(src).toMatch(
      /from\s+['"]@\/lib\/quotes\/services-summary['"]/,
    );
    expect(src).toContain('formatServicesSummary');
    expect(src).toContain('enrichItemsWithTierMeta');
  });

  it('pos/jobs/[id]/cancel/route.ts no longer composes serviceNames via inline map().join(, )', () => {
    const src = read('src/app/api/pos/jobs/[id]/cancel/route.ts');
    expect(src).not.toMatch(
      /const\s+serviceNames\s*=\s*services\s*\.\s*map\(\(s\)\s*=>\s*s\.service\?\.name\s*\|\|\s*['"]Service['"]\)\.join/,
    );
  });

  it('convert-service.ts imports formatServicesSummary + enrichItemsWithTierMeta (cascades to voice-agent/appointments via result.serviceNames)', () => {
    const src = read('src/lib/quotes/convert-service.ts');
    // Same-package import resolves via relative path here.
    expect(src).toMatch(
      /from\s+['"](?:\.\/services-summary|@\/lib\/quotes\/services-summary)['"]/,
    );
    expect(src).toContain('formatServicesSummary');
    expect(src).toContain('enrichItemsWithTierMeta');
  });

  it('convert-service.ts no longer composes serviceNames via inline map().join(, )', () => {
    const src = read('src/lib/quotes/convert-service.ts');
    expect(src).not.toMatch(
      /const\s+serviceNames\s*=\s*serviceItems\s*\.\s*map\(\(item:\s*\{[^}]+\}\)\s*=>\s*item\.item_name\s*\|\|\s*['"]Service['"]\)\.join/,
    );
  });

  it('book/route.ts adoption DEFERRED — widget cannot produce multi-tier same-service today (verified in booking-wizard.tsx)', () => {
    // Sentinel pin: book/route.ts still uses the pre-D45 naive join
    // intentionally. If a future booking redesign allows multi-tier
    // same-service input via the widget, this pin must flip and the
    // adoption test above must be added.
    const src = read('src/app/api/book/route.ts');
    // The naive composition is still present (no D45 import yet).
    expect(src).not.toContain("from '@/lib/quotes/services-summary'");
    expect(src).toMatch(/allServices\.join\(['"], ['"]\)/);
  });

  it('voice-agent/appointments/route.ts inherits the chip via result.serviceNames from convertQuote() — no direct helper import needed', () => {
    // Voice-agent appointments consumes `result.serviceNames` from
    // `convertQuote()`. Adopting at `convert-service.ts` automatically
    // propagates the fix here. Verify this site does NOT import the
    // helper directly (would be redundant) AND still uses
    // result.serviceNames downstream.
    const src = read('src/app/api/voice-agent/appointments/route.ts');
    expect(src).toContain('result.serviceNames');
    // The current site does not need a direct import — pin that no
    // accidental dual-import sneaks in.
    expect(src).not.toContain("from '@/lib/quotes/services-summary'");
  });
});
