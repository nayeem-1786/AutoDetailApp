'use strict';

/**
 * money/no-format-currency-with-cents-args
 *
 * Flags `formatCurrency(...)` calls whose argument looks like cents.
 *
 * `formatCurrency` expects dollars (e.g. `19.99`). Passing cents
 * (`1999`) silently produces "$1,999.00" instead of "$19.99" — the
 * Family D rendering bug that surfaced in production after Phase
 * Money-Unify-3. This rule structurally prevents the bug class from
 * re-introducing itself while `formatCurrency` survives the
 * Money-Unify epic.
 *
 * Use `formatMoney(cents)` for cents-typed values.
 *
 * Detection (same shape as `money/no-unsuffixed-money-prop`):
 *   - argument is an Identifier ending in `_cents` or `Cents`
 *   - argument is a MemberExpression whose property carries the suffix
 *     (e.g. `row.subtotal_cents`, `tx.totalCents`)
 *   - argument is a CallExpression to `toCents(...)` (returns cents)
 *
 * The rule does NOT inspect arithmetic expressions (e.g.
 * `formatCurrency(amountCents / 100)`). Those are legitimate manual
 * conversions to dollars; they're caught and rewritten by the
 * companion grep in `docs/sessions/family-d-fix-phase-3.1a/` not by
 * this rule. Catching them would generate false positives on the
 * legitimate `formatCurrency(legacyDollarColumn)` pattern that
 * survives until each family migration.
 *
 * Severity is `'error'` from introduction. `formatCurrency` is
 * deleted at Unify-Final; this rule retires alongside it.
 *
 * Opt-out: there is no legitimate opt-out. If you genuinely need to
 * format a cents value, switch to `formatMoney(cents)`.
 */

const CENTS_RETURNING_CALLS = new Set(['toCents']);

function endsWithCentsSuffix(name) {
  if (typeof name !== 'string') return false;
  return /(?:_cents|Cents)$/.test(name);
}

function isCentsTypedExpression(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Identifier':
      return endsWithCentsSuffix(node.name);
    case 'MemberExpression':
      if (!node.computed && node.property && node.property.type === 'Identifier') {
        return endsWithCentsSuffix(node.property.name);
      }
      if (
        node.computed &&
        node.property &&
        node.property.type === 'Literal' &&
        typeof node.property.value === 'string'
      ) {
        return endsWithCentsSuffix(node.property.value);
      }
      return false;
    case 'CallExpression': {
      const callee = node.callee;
      if (callee.type === 'Identifier' && CENTS_RETURNING_CALLS.has(callee.name)) {
        return true;
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.property &&
        callee.property.type === 'Identifier' &&
        CENTS_RETURNING_CALLS.has(callee.property.name)
      ) {
        return true;
      }
      return false;
    }
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      return isCentsTypedExpression(node.expression);
    default:
      return false;
  }
}

function isFormatCurrencyCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && callee.name === 'formatCurrency') {
    return true;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'formatCurrency'
  ) {
    return true;
  }
  return false;
}

function isTestFile(filename) {
  if (!filename) return false;
  return (
    filename.includes('/__tests__/') ||
    /\.(test|spec)\.[jt]sx?$/.test(filename)
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow formatCurrency(cents) — silent 100× over-display. Use formatMoney(cents) for cents-typed values.',
    },
    schema: [],
    messages: {
      centsArg:
        'formatCurrency expects dollars but received {{name}}, which looks like cents (matches /_cents|Cents$/ or toCents(...)). Use formatMoney({{name}}) instead. See docs/sessions/family-d-rendering-bug for context.',
    },
  },

  create(context) {
    // The test file that intentionally cross-checks formatMoney vs
    // formatCurrency for byte-equivalence imports both formatters and
    // passes integer cents to formatCurrency on purpose. Allow tests.
    const filename = context.getFilename();
    if (isTestFile(filename)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (!isFormatCurrencyCall(node)) return;
        if (!node.arguments || node.arguments.length === 0) return;
        const arg = node.arguments[0];
        if (!isCentsTypedExpression(arg)) return;

        // Best-effort name extraction for the error message.
        let name = 'cents';
        if (arg.type === 'Identifier') {
          name = arg.name;
        } else if (
          arg.type === 'MemberExpression' &&
          !arg.computed &&
          arg.property &&
          arg.property.type === 'Identifier'
        ) {
          name = `${
            arg.object && arg.object.type === 'Identifier' ? arg.object.name : 'x'
          }.${arg.property.name}`;
        } else if (arg.type === 'CallExpression') {
          name = 'toCents(...)';
        }

        context.report({
          node,
          messageId: 'centsArg',
          data: { name },
        });
      },
    };
  },
};
