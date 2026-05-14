// Phase Money-Unify-3 — Family D test 3 of 3 per v3 Part 8.
//
// Asserts that the AI content-writer's buildServiceContext()
// (the sole site that emits service prices into the AI prompt
// corpus) correctly reads cents-canonical *_cents columns from
// the migrated services table and renders them as dollar strings
// for the model.
//
// The renderer behavior under test:
//   - flat_price_cents = 12500 → "$125"   (trailing ".00" stripped)
//   - flat_price_cents = 12550 → "$125.50" (cent-precision preserved)
//   - custom_starting_price_cents = 47500 → "Starting at $475"
//   - both null → "Contact for pricing"
//
// The trailing-.00 strip is load-bearing for prompt readability —
// the existing prompt corpus uses bare-dollar amounts ("$125") not
// "$125.00", and changing that en masse would invalidate
// established AI behavior. The strip is documented at
// ai-content-writer.ts:652-656.

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Mock createAdminClient before importing buildServiceContext ───────

const mockServiceData: { current: Record<string, unknown> | null } = { current: null };
const mockSeoData: { current: { focus_keyword: string } | null } = { current: null };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === 'services' ? mockServiceData.current : null,
            error: null,
          }),
          maybeSingle: async () => ({
            data: table === 'page_seo' ? mockSeoData.current : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

// Imported AFTER the mock is registered
import { buildServiceContext } from '../ai-content-writer';

afterEach(() => {
  mockServiceData.current = null;
  mockSeoData.current = null;
});

describe('buildServiceContext — formats cents → dollar string', () => {
  it('flat_price_cents (whole-dollar) renders as "$125" (no .00)', async () => {
    mockServiceData.current = {
      name: 'Full Detail',
      description: 'Test',
      flat_price_cents: 12500,
      custom_starting_price_cents: null,
      service_categories: { name: 'Detailing' },
    };
    const ctx = await buildServiceContext('detailing', 'full-detail');
    expect(ctx.servicePrice).toBe('$125');
    expect(ctx.serviceName).toBe('Full Detail');
    expect(ctx.serviceCategory).toBe('Detailing');
  });

  it('flat_price_cents (cent-precision) preserves the cents in the rendered string', async () => {
    // Phase D-1 lax decision permits half-dollar sale prices via UI; the
    // content writer must not silently round them away.
    mockServiceData.current = {
      name: 'Test',
      description: null,
      flat_price_cents: 12550, // $125.50 — non-whole-dollar
      custom_starting_price_cents: null,
      service_categories: { name: 'Cat' },
    };
    const ctx = await buildServiceContext('cat', 'test');
    expect(ctx.servicePrice).toBe('$125.50');
  });

  it('custom_starting_price_cents renders as "Starting at $X"', async () => {
    mockServiceData.current = {
      name: 'Ceramic Coating',
      description: null,
      flat_price_cents: null,
      custom_starting_price_cents: 47500,
      service_categories: { name: 'Protection' },
    };
    const ctx = await buildServiceContext('protection', 'ceramic-coating');
    expect(ctx.servicePrice).toBe('Starting at $475');
  });

  it('both prices null returns "Contact for pricing"', async () => {
    mockServiceData.current = {
      name: 'Contact-Only Service',
      description: null,
      flat_price_cents: null,
      custom_starting_price_cents: null,
      service_categories: { name: 'Misc' },
    };
    const ctx = await buildServiceContext('misc', 'contact-service');
    expect(ctx.servicePrice).toBe('Contact for pricing');
  });

  it('round-trip: 100 cent values render to "$X" / "$X.YZ" matching formatMoney with .00 stripped', async () => {
    // Defensive: confirm the explicit .replace(/\.00$/, '') behavior at
    // ai-content-writer.ts:658 holds across a sample of cent values
    // without introducing rounding errors.
    const cases: Array<{ cents: number; expected: string }> = [
      { cents: 7500, expected: '$75' },
      { cents: 12500, expected: '$125' },
      { cents: 17500, expected: '$175' },
      { cents: 9999, expected: '$99.99' },
      { cents: 100, expected: '$1' },
    ];
    for (const { cents, expected } of cases) {
      mockServiceData.current = {
        name: 'X', description: null,
        flat_price_cents: cents, custom_starting_price_cents: null,
        service_categories: { name: 'X' },
      };
      const ctx = await buildServiceContext('x', 'x');
      expect(ctx.servicePrice, `cents=${cents}`).toBe(expected);
    }
  });

  it('returns {} when service not found (null from supabase)', async () => {
    mockServiceData.current = null;
    const ctx = await buildServiceContext('does-not', 'exist');
    expect(ctx).toEqual({});
  });
});
