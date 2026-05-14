import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../money-no-unsuffixed-money-prop.js';

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

// The rule name passed to tester.run is purely for display. We use a path
// that does NOT match the test-file skip heuristic so the rule actually
// runs against the snippets.
tester.run('money/no-unsuffixed-money-prop', rule, {
  valid: [
    // ─── LHS already carries the cents suffix ───────────────────────────
    {
      name: 'camelCase suffix: const amountCents = totalCents;',
      code: `const totalCents = 100; const amountCents = totalCents;`,
      filename: 'src/foo.ts',
    },
    {
      name: 'snake_case suffix: const amount_cents = total_cents;',
      code: `const total_cents = 100; const amount_cents = total_cents;`,
      filename: 'src/foo.ts',
    },
    {
      name: 'MemberExpression source → suffixed LHS: const taxCents = row.tax_cents;',
      code: `const row = { tax_cents: 0 }; const taxCents = row.tax_cents;`,
      filename: 'src/foo.ts',
    },
    {
      name: 'toCents call → suffixed LHS: const cents = toCents(17.64); but rename to amountCents',
      code: `function toCents(d) { return d * 100; } const amountCents = toCents(17.64);`,
      filename: 'src/foo.ts',
    },

    // ─── Dollars boundary marker ────────────────────────────────────────
    {
      name: 'Dollars suffix LHS is allowed even though RHS is cents',
      code: `const subtotalCents = 1000; const subtotalDollars = subtotalCents;`,
      filename: 'src/foo.ts',
    },
    {
      name: 'snake_case _dollars suffix allowed',
      code: `const subtotal_cents = 1000; const subtotal_dollars = subtotal_cents;`,
      filename: 'src/foo.ts',
    },

    // ─── Converter / formatter results are not cents-typed by LHS ───────
    {
      name: 'fromCents result → un-suffixed LHS is correct (returns dollars)',
      code: `function fromCents(c) { return c / 100; } const totalCents = 100; const totalDollars = fromCents(totalCents);`,
      filename: 'src/foo.ts',
    },
    {
      name: 'fromCents result → fully un-suffixed LHS is also fine (string-typed)',
      code: `function fromCents(c) { return c / 100; } const totalCents = 100; const display = fromCents(totalCents);`,
      filename: 'src/foo.ts',
    },
    {
      name: 'formatMoney result → un-suffixed LHS is correct (returns string)',
      code: `function formatMoney(c) { return ''; } const totalCents = 100; const label = formatMoney(totalCents);`,
      filename: 'src/foo.ts',
    },

    // ─── Non-money values ──────────────────────────────────────────────
    {
      name: 'non-money RHS: const x = something.name;',
      code: `const customer = { name: 'a' }; const customerName = customer.name;`,
      filename: 'src/foo.ts',
    },
    {
      name: 'plain number literal RHS: const subtotal = 100;',
      code: `const subtotal = 100;`,
      filename: 'src/foo.ts',
    },

    // ─── Test-file skip ────────────────────────────────────────────────
    {
      name: 'test file is skipped (filename heuristic)',
      code: `const totalCents = 100; const dollars = totalCents;`,
      filename: 'src/foo.test.ts',
    },
    {
      name: '__tests__ directory is skipped',
      code: `const totalCents = 100; const dollars = totalCents;`,
      filename: 'src/__tests__/foo.ts',
    },

    // ─── Shorthand destructure keeps source suffix ─────────────────────
    {
      name: 'shorthand destructure: const { amount_cents } = row;',
      code: `const row = { amount_cents: 0 }; const { amount_cents } = row;`,
      filename: 'src/foo.ts',
    },
  ],

  invalid: [
    // ─── Cents source → un-suffixed identifier ──────────────────────────
    {
      name: 'cents Identifier RHS → un-suffixed LHS',
      code: `const subtotalCents = 100; const total = subtotalCents;`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'snake_case _cents source → un-suffixed LHS',
      code: `const subtotal_cents = 100; const total = subtotal_cents;`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'cents column read → un-suffixed LHS',
      code: `const row = { tax_amount_cents: 0 }; const tax = row.tax_amount_cents;`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'toCents call → un-suffixed LHS',
      code: `function toCents(d) { return d * 100; } const total = toCents(17.64);`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'object literal property name lacks suffix when value is cents',
      code: `const subtotalCents = 100; const obj = { total: subtotalCents };`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'destructure-rename strips suffix',
      code: `const row = { subtotal_cents: 0 }; const { subtotal_cents: subtotal } = row;`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
    {
      name: 'AssignmentExpression to un-suffixed identifier',
      code: `let total = 0; const subtotalCents = 100; total = subtotalCents;`,
      filename: 'src/foo.ts',
      errors: [{ messageId: 'unsuffixed' }],
    },
  ],
});
