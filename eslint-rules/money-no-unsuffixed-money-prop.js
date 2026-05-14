'use strict';

/**
 * money/no-unsuffixed-money-prop
 *
 * Flags assignments where a cents-typed source is bound to an identifier
 * whose name lacks the `Cents` (camelCase) or `_cents` (snake_case) suffix.
 * Codifies the naming convention from docs/dev/MONEY.md: every variable
 * that holds integer cents must say so in its name. The suffix is the
 * type signal — a reader scanning a function should not have to trace
 * provenance to know whether a value is dollars or cents.
 *
 * Detection covers:
 *   - `const foo = someCentsVar;`               (VariableDeclarator)
 *   - `foo = someCentsVar;`                     (AssignmentExpression)
 *   - `{ foo: someCentsVar }`                   (Property in ObjectExpression)
 *   - `const { amount_cents: foo } = row;`      (ObjectPattern destructure-rename)
 *
 * Cents-typed sources:
 *   - Identifier ending in `Cents` (e.g. `amountCents`) or `_cents`
 *     (e.g. `amount_cents`)
 *   - MemberExpression where the property name carries the suffix
 *     (e.g. `row.subtotal_cents`, `tx.totalCents`)
 *   - Call to `toCents(...)` — the canonical dollars→cents converter
 *     (returns cents by definition)
 *
 * Skip patterns:
 *   - Identifiers explicitly suffixed `Dollars` or `_dollars` (boundary
 *     markers — Money-Unify epic convention for explicit unit declaration)
 *   - RHS is a `fromCents(...)` call (returns dollars; the un-suffixed
 *     LHS is correct)
 *   - RHS is a `formatMoney(...)` / `formatMoneyForInput(...)` /
 *     `formatCurrency(...)` call (return a string, not cents)
 *   - JSX attributes (`<Foo bar={cents}>`) — prop name is owned by the
 *     receiving component; renaming the LHS doesn't help. Test files
 *     also skipped via filename heuristic.
 *
 * Severity is `'warn'` through the Money-Unify epic; upgrades to
 * `'error'` at Unify-Final after all family-phase migrations land
 * the remaining warnings. See docs/dev/MONEY.md for full rationale
 * and opt-out instructions.
 *
 * Opt-out: standard ESLint inline disable comment, e.g.
 *   // eslint-disable-next-line money/no-unsuffixed-money-prop
 *   const total = amountCents;
 */

const CENTS_RETURNING_CALLS = new Set(['toCents']);
const STRING_RETURNING_MONEY_CALLS = new Set([
  'formatMoney',
  'formatMoneyForInput',
  'formatCurrency',
]);
const DOLLARS_RETURNING_CALLS = new Set(['fromCents']);

function endsWithCentsSuffix(name) {
  if (typeof name !== 'string') return false;
  return /(?:_cents|Cents)$/.test(name);
}

function endsWithDollarsSuffix(name) {
  if (typeof name !== 'string') return false;
  return /(?:_dollars|Dollars)$/.test(name);
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

function isStringReturningMoneyCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && STRING_RETURNING_MONEY_CALLS.has(callee.name)) {
    return true;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    STRING_RETURNING_MONEY_CALLS.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

function isDollarsReturningCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && DOLLARS_RETURNING_CALLS.has(callee.name)) {
    return true;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    DOLLARS_RETURNING_CALLS.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

function isInsideTestFile(filename) {
  if (!filename) return false;
  return /(?:\.test\.|\.spec\.|[\\/]__tests__[\\/])/.test(filename);
}

function isInsideJsxAttribute(node) {
  // Walk up: VariableDeclarator → ... — we only need to handle expression
  // contexts. JSX attribute contexts don't reach this rule (we only listen
  // for VariableDeclarator / AssignmentExpression / Property / ObjectPattern).
  // Provided for future expansion.
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'JSXAttribute') return true;
    cur = cur.parent;
  }
  return false;
}

function getLhsName(lhsNode) {
  if (!lhsNode) return null;
  if (lhsNode.type === 'Identifier') return lhsNode.name;
  if (lhsNode.type === 'Property' && lhsNode.key) {
    if (lhsNode.key.type === 'Identifier') return lhsNode.key.name;
    if (lhsNode.key.type === 'Literal' && typeof lhsNode.key.value === 'string') {
      return lhsNode.key.value;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow binding a cents-typed value to an identifier whose name lacks the Cents/_cents suffix.',
      recommended: false,
      url: 'docs/dev/MONEY.md',
    },
    schema: [],
    messages: {
      unsuffixed:
        'Cents-typed value assigned to "{{name}}" — identifier should end in "Cents" or "_cents". The suffix is the type signal for integer-cent values (Money-Unify naming convention). If "{{name}}" intentionally holds dollars or a non-money value, rename or add: // eslint-disable-next-line money/no-unsuffixed-money-prop',
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename?.() || '';
    if (isInsideTestFile(filename)) return {};

    function report(node, name) {
      context.report({ node, messageId: 'unsuffixed', data: { name } });
    }

    function checkBinding(lhsNode, rhsNode) {
      if (!lhsNode || !rhsNode) return;
      const name = getLhsName(lhsNode);
      if (!name) return;
      if (endsWithCentsSuffix(name)) return;
      if (endsWithDollarsSuffix(name)) return;
      // Don't flag converter and string-formatter results — those are
      // intentionally NOT cents in the LHS sense.
      if (isStringReturningMoneyCall(rhsNode)) return;
      if (isDollarsReturningCall(rhsNode)) return;
      // JSX attribute skip (defensive; current listeners don't reach JSX).
      if (isInsideJsxAttribute(lhsNode)) return;
      if (!isCentsTypedExpression(rhsNode)) return;
      report(lhsNode, name);
    }

    return {
      VariableDeclarator(node) {
        if (!node.init) return;
        // Plain identifier LHS only — destructuring handled below.
        if (node.id && node.id.type === 'Identifier') {
          checkBinding(node.id, node.init);
        }
      },

      AssignmentExpression(node) {
        if (node.operator !== '=') return;
        if (node.left && node.left.type === 'Identifier') {
          checkBinding(node.left, node.right);
        }
      },

      Property(node) {
        // Object-literal property: { foo: someCents } — LHS is the key
        // name. Skip shorthand (foo: foo) since the value is the
        // identifier itself, already checked elsewhere.
        if (node.shorthand) return;
        if (!node.key || !node.value) return;
        // Only object expressions, not patterns (destructure-renames
        // handled below).
        if (node.parent && node.parent.type !== 'ObjectExpression') return;
        const name = getLhsName(node);
        if (!name) return;
        if (endsWithCentsSuffix(name)) return;
        if (endsWithDollarsSuffix(name)) return;
        if (isStringReturningMoneyCall(node.value)) return;
        if (isDollarsReturningCall(node.value)) return;
        if (isInsideJsxAttribute(node)) return;
        if (!isCentsTypedExpression(node.value)) return;
        report(node.key, name);
      },

      // Destructure-rename: const { amount_cents: total } = row;
      //   key   = amount_cents (cents-typed by name)
      //   value = total (LHS-name to check)
      ObjectPattern(node) {
        for (const prop of node.properties) {
          if (prop.type !== 'Property') continue;
          if (prop.shorthand) continue; // shorthand keeps source suffix
          if (!prop.key || !prop.value) continue;
          if (prop.value.type !== 'Identifier') continue;
          const lhsName = prop.value.name;
          if (endsWithCentsSuffix(lhsName)) continue;
          if (endsWithDollarsSuffix(lhsName)) continue;
          const keyName =
            prop.key.type === 'Identifier'
              ? prop.key.name
              : prop.key.type === 'Literal' && typeof prop.key.value === 'string'
                ? prop.key.value
                : null;
          if (!keyName) continue;
          if (!endsWithCentsSuffix(keyName)) continue;
          report(prop.value, lhsName);
        }
      },
    };
  },
};
