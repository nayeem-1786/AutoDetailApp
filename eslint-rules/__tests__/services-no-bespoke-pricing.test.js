import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../services-no-bespoke-pricing.js';

// RuleTester uses mocha-style globals; bridge them to vitest.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
});

// Non-engine, non-test filename — the rule applies here.
const APP_FILE = 'src/app/pos/components/example.ts';
// Engine filename — the rule is exempt.
const ENGINE_FILE = 'src/lib/services/example.ts';
// Test filename — the rule is exempt.
const TEST_FILE = 'src/components/example/__tests__/foo.test.ts';

tester.run('services/no-bespoke-pricing', rule, {
  valid: [
    // ─────────────────────────────────────────────────────────────────────
    // Signal 1 — function-name pattern: exempt cases
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'engine file: bespoke-named function is allowed (the engine defines them)',
      filename: ENGINE_FILE,
      code: `export function resolveServicePrice() { return 0; }`,
    },
    {
      name: 'test file: bespoke-named function is allowed (tests pin behavior)',
      filename: TEST_FILE,
      code: `function resolveServicePrice() { return 0; }`,
    },
    {
      name: 'app file: non-matching function names are fine',
      filename: APP_FILE,
      code: `function computePrice() { return 0; } function getServicePriceDisplay() { return ''; }`,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Signal 2 — switch over pricing_model
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'app file: switch over pricing_model that calls the canonical engine in a case body',
      filename: APP_FILE,
      code: `
        import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
        function f(service, tier) {
          switch (service.pricing_model) {
            case 'flat':
              return resolveServicePriceWithSale(tier, null, {}).effectivePrice;
            case 'vehicle_size':
              return resolveServicePriceWithSale(tier, 'sedan', {}).effectivePrice;
            default:
              return 0;
          }
        }
      `,
    },
    {
      name: 'app file: switch over pricing_model that calls engine inside a .map callback (callback is the case body logic)',
      filename: APP_FILE,
      code: `
        import { resolveServicePriceWithSale } from '@/lib/services/picker-engine';
        function f(service, tiers, saleWindow) {
          let pricing;
          switch (service.pricing_model) {
            case 'vehicle_size':
              pricing = tiers.map((p) => resolveServicePriceWithSale(p, null, saleWindow));
              break;
          }
          return pricing;
        }
      `,
    },
    {
      name: 'app file: display-only dispatch switch returning element calls — no money reads',
      filename: APP_FILE,
      code: `
        function ServicePricingDisplay({ service, h }) {
          switch (service.pricing_model) {
            case 'vehicle_size':
              return h(VehicleSizePricing, { service });
            case 'flat':
              return h(FlatPricing, { service });
            default:
              return h('p', null, 'Contact for pricing');
          }
        }
      `,
    },
    {
      name: 'app file: classifier switch reading prices only in comparison context',
      filename: APP_FILE,
      code: `
        function classify(svc) {
          let pricingType = 'standard';
          switch (svc.pricing_model) {
            case 'flat':
              if (svc.sale_price != null && svc.flat_price != null && svc.sale_price < svc.flat_price) {
                pricingType = 'sale';
              }
              break;
            case 'per_unit':
              if (svc.sale_price != null && svc.per_unit_price != null && svc.sale_price < svc.per_unit_price) {
                pricingType = 'sale';
              }
              break;
          }
          return pricingType;
        }
      `,
    },
    {
      name: 'app file: label-generator switch wrapping price reads in formatCurrency',
      filename: APP_FILE,
      code: `
        function ogLabel(service) {
          switch (service.pricing_model) {
            case 'flat':
              return service.flat_price != null ? formatCurrency(service.flat_price) : null;
            case 'custom':
              return service.custom_starting_price != null
                ? \`Starting from \${formatCurrency(service.custom_starting_price)}\`
                : null;
            default:
              return null;
          }
        }
      `,
    },

    // ─────────────────────────────────────────────────────────────────────
    // Signal 3 — per-size column reads
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'app file: column-presence check via != null is allowed (display/visibility)',
      filename: APP_FILE,
      code: `
        function isOffered(tier, sc) {
          if (sc === 'sedan') return tier.vehicle_size_sedan_price != null;
          if (sc === 'exotic') return tier.vehicle_size_exotic_price != null;
          return false;
        }
      `,
    },
    {
      name: 'engine file: per-size column reads in arithmetic context are allowed (this IS the engine)',
      filename: ENGINE_FILE,
      code: `
        function resolve(tier, sc) {
          if (sc === 'sedan') return tier.vehicle_size_sedan_price ?? tier.price;
          return 0;
        }
      `,
    },
    {
      name: 'app file: object literal key assignments to per-size columns (admin catalog editor writes)',
      filename: APP_FILE,
      code: `
        const row = {
          vehicle_size_sedan_price: form.sedan,
          vehicle_size_truck_suv_price: form.truck,
          vehicle_size_suv_van_price: form.van,
          vehicle_size_exotic_price: form.exotic,
          vehicle_size_classic_price: form.classic,
        };
      `,
    },
  ],

  invalid: [
    // ─────────────────────────────────────────────────────────────────────
    // Signal 1 — function-name pattern
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'app file: function declaration named resolveServicePrice',
      filename: APP_FILE,
      code: `function resolveServicePrice(svc, sizeClass) { return 0; }`,
      errors: [{ messageId: 'bespokeFunctionName', data: { name: 'resolveServicePrice' } }],
    },
    {
      name: 'app file: function declaration named resolvePrice',
      filename: APP_FILE,
      code: `function resolvePrice(svc) { return 0; }`,
      errors: [{ messageId: 'bespokeFunctionName', data: { name: 'resolvePrice' } }],
    },
    {
      name: 'app file: arrow function assigned to const named getServicePrice',
      filename: APP_FILE,
      code: `const getServicePrice = (svc) => 0;`,
      errors: [{ messageId: 'bespokeFunctionName', data: { name: 'getServicePrice' } }],
    },
    {
      name: 'app file: function expression assigned to const named computeServicePrice',
      filename: APP_FILE,
      code: `const computeServicePrice = function(svc) { return 0; };`,
      errors: [{ messageId: 'bespokeFunctionName', data: { name: 'computeServicePrice' } }],
    },

    // ─────────────────────────────────────────────────────────────────────
    // Signal 2 — switch over pricing_model with money math, no engine call
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'app file: switch over pricing_model reading prices in numeric context, no engine call',
      filename: APP_FILE,
      code: `
        function f(service) {
          let price = 0;
          switch (service.pricing_model) {
            case 'flat':
              price = service.flat_price;
              break;
            case 'per_unit':
              price = service.per_unit_price;
              break;
          }
          return price;
        }
      `,
      errors: [{ messageId: 'pricingModelSwitchWithoutEngineCall' }],
    },
    {
      name: 'app file: switch reading vehicle_size_*_price column in ConditionalExpression, no engine call',
      filename: APP_FILE,
      code: `
        function f(service, tier, vehicleSize) {
          let price = 0;
          switch (service.pricing_model) {
            case 'scope':
              price = vehicleSize === 'sedan'
                ? tier.vehicle_size_sedan_price
                : tier.vehicle_size_truck_suv_price;
              break;
          }
          return price;
        }
      `,
      errors: [{ messageId: 'pricingModelSwitchWithoutEngineCall' }],
    },

    // ─────────────────────────────────────────────────────────────────────
    // Signal 3 — direct per-size column read in arithmetic / return context
    // ─────────────────────────────────────────────────────────────────────
    {
      name: 'app file: returning a per-size column value directly from a function',
      filename: APP_FILE,
      code: `
        function getSedanPrice(tier) {
          return tier.vehicle_size_sedan_price;
        }
      `,
      errors: [{
        messageId: 'directPerSizeColumnRead',
        data: { column: 'vehicle_size_sedan_price' },
      }],
    },
    {
      name: 'app file: arithmetic on a per-size column read',
      filename: APP_FILE,
      code: `
        function f(tier, surcharge) {
          const total = tier.vehicle_size_exotic_price + surcharge;
          return total;
        }
      `,
      errors: [{
        messageId: 'directPerSizeColumnRead',
        data: { column: 'vehicle_size_exotic_price' },
      }],
    },
  ],
});
