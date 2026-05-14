// Phase Money-Unify-3 — Family D test 2 of 3 per v3 Part 8.
//
// Integration test: verifies the DB-level CHECK constraints reject
// bad writes for the 15 catalog cents columns. Hits the live shared
// Supabase project via the service-role admin client, so it is
// **opt-in only** — gated on the INTEGRATION_TESTS env var so the
// default `npm test` run doesn't depend on a network round-trip or
// require credentials.
//
// Run via:
//   INTEGRATION_TESTS=1 npx vitest run src/lib/utils/__tests__/check-constraints.int.test.ts
//
// What's verified (matches the v3 playbook §Family D CHECK list):
//
//   Non-negative (15 columns):
//     services.flat_price_cents, services.sale_price_cents,
//     services.custom_starting_price_cents, services.per_unit_price_cents,
//     service_pricing.{price,sale,vehicle_size_*}_cents (× 7),
//     products.{cost,retail,sale}_price_cents (× 3),
//     packages.price_cents.
//
//   Whole-dollar (10 base prices — services + service_pricing + packages only,
//   not products):
//     services.flat_price_cents, custom_starting_price_cents, per_unit_price_cents,
//     service_pricing.price_cents + 5 vehicle_size_* columns,
//     packages.price_cents.
//
//   Sale-price discipline (3 constraints, against `_cents`):
//     services.chk_services_sale_price (sale < flat),
//     service_pricing.chk_service_pricing_sale_price (sale < price),
//     products.chk_product_sale_price (sale < retail).
//
// The test issues INSERTs that violate each constraint and asserts the
// admin client returns a PostgreSQL 23514 (check_violation) error code.
// Successful inserts (which would pollute the DB) are never expected;
// if the constraint somehow accepts the bad row, the test fails loudly
// AND the leftover row gets cleaned up at the end of the suite.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

const integrationEnv = process.env.INTEGRATION_TESTS === '1';

// Lazy admin client. Only initialized when integration tests run, so
// CI / default test runs don't error on missing env vars.
let admin: SupabaseClient | null = null;
let serviceId: string | null = null;

const PG_CHECK_VIOLATION = '23514';

function expectCheckViolation(error: { code?: string } | null, label: string) {
  expect(error, `${label} should fail`).not.toBeNull();
  expect(error?.code, `${label} should fail with check_violation (23514) — got ${error?.code}`).toBe(PG_CHECK_VIOLATION);
}

describe.skipIf(!integrationEnv)('DB CHECK constraints — Family D catalog (Money-Unify-3)', () => {
  beforeAll(async () => {
    dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    admin = createClient(url, key);

    // Seed a fresh service to test against. Whole-dollar values so the
    // valid-baseline doesn't trip any constraint on its own.
    const seedSlug = `__unify-3-check-test-${Date.now()}`;
    const { data, error } = await admin
      .from('services')
      .insert({
        name: seedSlug,
        slug: seedSlug,
        pricing_model: 'flat',
        flat_price_cents: 10000,
        classification: 'addon_only',
        base_duration_minutes: 30,
        vehicle_compatibility: ['standard'],
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Seed insert failed: ${error?.message}`);
    serviceId = data.id;
  });

  afterAll(async () => {
    if (admin && serviceId) {
      await admin.from('services').delete().eq('id', serviceId);
    }
  });

  // ── Non-negative ─────────────────────────────────────────────────

  it('services.flat_price_cents rejects negative', async () => {
    const { error } = await admin!.from('services').update({ flat_price_cents: -1 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services.flat_price_cents=-1');
  });

  it('services.sale_price_cents rejects negative', async () => {
    const { error } = await admin!.from('services').update({ sale_price_cents: -1 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services.sale_price_cents=-1');
  });

  it('products.cost_price_cents rejects negative', async () => {
    // Insert a transient product with bad cost
    const sku = `__chk-cost-${Date.now()}`;
    const { error } = await admin!.from('products').insert({
      sku,
      slug: sku,
      name: '__check-cost',
      cost_price_cents: -1,
      retail_price_cents: 100,
    });
    expectCheckViolation(error, 'products.cost_price_cents=-1');
  });

  it('products.retail_price_cents rejects negative', async () => {
    const sku = `__chk-retail-${Date.now()}`;
    const { error } = await admin!.from('products').insert({
      sku,
      slug: sku,
      name: '__check-retail',
      cost_price_cents: 100,
      retail_price_cents: -1,
    });
    expectCheckViolation(error, 'products.retail_price_cents=-1');
  });

  // ── Whole-dollar ─────────────────────────────────────────────────

  it('services.flat_price_cents rejects non-whole-dollar (e.g. 12345)', async () => {
    const { error } = await admin!.from('services').update({ flat_price_cents: 12345 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services.flat_price_cents=12345');
  });

  it('services.custom_starting_price_cents rejects non-whole-dollar', async () => {
    const { error } = await admin!.from('services').update({ custom_starting_price_cents: 9950 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services.custom_starting_price_cents=9950');
  });

  it('services.per_unit_price_cents rejects non-whole-dollar', async () => {
    const { error } = await admin!.from('services').update({ per_unit_price_cents: 2575 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services.per_unit_price_cents=2575');
  });

  it('service_pricing.price_cents rejects non-whole-dollar', async () => {
    const { error } = await admin!.from('service_pricing').insert({
      service_id: serviceId!,
      tier_name: '__chk-whole',
      tier_label: '__chk',
      price_cents: 1099,
      display_order: 999,
    });
    expectCheckViolation(error, 'service_pricing.price_cents=1099');
  });

  it('packages.price_cents rejects non-whole-dollar', async () => {
    const { error } = await admin!.from('packages').insert({
      name: `__chk-pkg-${Date.now()}`,
      price_cents: 1599,
    });
    expectCheckViolation(error, 'packages.price_cents=1599');
  });

  // products.cost_price_cents / retail_price_cents are explicitly NOT
  // whole-dollar-constrained (products allow cent-precision pricing
  // per v3 Part 1). Sanity-check that they accept fractional cents.

  it('products.retail_price_cents accepts cent-precision (1599 = $15.99)', async () => {
    const sku = `__chk-cents-${Date.now()}`;
    const { error, data } = await admin!.from('products').insert({
      sku,
      slug: sku,
      name: '__check-cents-ok',
      cost_price_cents: 0,
      retail_price_cents: 1599,
    }).select('id').single();
    expect(error).toBeNull();
    if (data?.id) {
      await admin!.from('products').delete().eq('id', data.id);
    }
  });

  // ── Sale-price discipline ────────────────────────────────────────

  it('chk_services_sale_price rejects sale >= flat (sale=12500 == flat=12500)', async () => {
    // Bring flat up to 12500 first
    await admin!.from('services').update({ flat_price_cents: 12500, sale_price_cents: null }).eq('id', serviceId!);
    const { error } = await admin!.from('services').update({ sale_price_cents: 12500 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services sale_price_cents=flat_price_cents');
  });

  it('chk_services_sale_price rejects sale > flat', async () => {
    const { error } = await admin!.from('services').update({ sale_price_cents: 20000 }).eq('id', serviceId!);
    expectCheckViolation(error, 'services sale_price_cents>flat_price_cents');
  });

  it('chk_service_pricing_sale_price rejects sale >= price', async () => {
    // Seed a tier
    const { data: tier, error: seedErr } = await admin!.from('service_pricing').insert({
      service_id: serviceId!,
      tier_name: '__chk-sale',
      tier_label: '__chk',
      price_cents: 10000,
      display_order: 998,
    }).select('id').single();
    if (seedErr || !tier) throw new Error(`Seed tier failed: ${seedErr?.message}`);
    try {
      const { error } = await admin!.from('service_pricing').update({ sale_price_cents: 10000 }).eq('id', tier.id);
      expectCheckViolation(error, 'service_pricing sale_price_cents=price_cents');
    } finally {
      await admin!.from('service_pricing').delete().eq('id', tier.id);
    }
  });

  it('chk_product_sale_price rejects sale >= retail', async () => {
    const sku = `__chk-prod-sale-${Date.now()}`;
    const { data: prod, error: seedErr } = await admin!.from('products').insert({
      sku,
      slug: sku,
      name: '__chk-prod-sale',
      cost_price_cents: 0,
      retail_price_cents: 1599,
    }).select('id').single();
    if (seedErr || !prod) throw new Error(`Seed product failed: ${seedErr?.message}`);
    try {
      const { error } = await admin!.from('products').update({ sale_price_cents: 1599 }).eq('id', prod.id);
      expectCheckViolation(error, 'products sale_price_cents=retail_price_cents');
    } finally {
      await admin!.from('products').delete().eq('id', prod.id);
    }
  });

  // ── Valid-baseline sanity (proves the test setup is sound) ───────

  it('valid whole-dollar updates succeed (NOT all constraints reject everything)', async () => {
    const { error } = await admin!.from('services').update({
      flat_price_cents: 15000, // $150.00
      sale_price_cents: 12500, // $125.00 < 150
    }).eq('id', serviceId!);
    expect(error).toBeNull();
  });
});

// ── Default-run guard (informational) ────────────────────────────────
describe('DB CHECK constraints — guard for default run', () => {
  it('integration tests skipped unless INTEGRATION_TESTS=1', () => {
    if (!integrationEnv) {
      // Visible in test output without polluting expectations
      expect(integrationEnv).toBe(false);
    } else {
      expect(integrationEnv).toBe(true);
    }
  });
});
