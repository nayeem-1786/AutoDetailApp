'use strict';

/**
 * phone/no-raw-display
 *
 * Flags JSX expressions that render a phone-suggestive value (customer.phone,
 * user.phoneNumber, employee.cell_phone, etc.) without wrapping it in one of
 * the canonical phone helpers:
 *   - formatPhone          — display formatting
 *   - phoneToE164          — tel:/JSON-LD/href use
 *   - normalizePhone       — storage normalization (rare in JSX, allowed)
 *   - formatPhoneInput     — controlled-input live formatting
 *
 * Detection covers:
 *   - Identifier expressions inside JSXExpressionContainer  (e.g. {phone})
 *   - MemberExpression property access                       (e.g. {customer.phone})
 *   - Computed string property access                        (e.g. {row['phone_number']})
 *   - Template literal substitutions inside JSX              (e.g. `tel:${customer.phone}`)
 *   - Compound expressions: ternary, logical, binary, await, ts as/non-null,
 *     array/object literals, and call arguments of NON-allowed functions
 *
 * Patterns the rule deliberately ignores (Phase Lint-Hardening-1.3):
 *   - Boolean / ternary TEST positions ({x && jsx}, {x ? a : b}, {!x && jsx},
 *     {x || 'fallback'}) — those are tested, not displayed
 *   - The `formatPhone(x) || x` canonical fallback pattern — the right-hand
 *     side raw reference is the documented fallback for unparseable storage
 *   - JSX `key={x}` attributes — keys are never visible
 *   - `<input value={x}>` and `<Input value={x}>` — values track typing,
 *     not storage
 *   - The generic identifiers `cell` and `mobile` alone — those collide with
 *     unrelated semantics (TanStack cell, mobile-fee feature). Compound forms
 *     (`cell_phone`, `mobilePhone`, etc.) are still flagged.
 *
 * Does NOT touch non-JSX code. String interpolation outside JSX is fine
 * because those values are typically passed to formatters or normalizers
 * downstream.
 *
 * Opt-out: standard ESLint inline disable comment, e.g.
 *   {/* eslint-disable-next-line phone/no-raw-display *\/}
 *   {customer.phone}
 */

const ALLOWED_WRAPPERS = new Set([
  'formatPhone',
  'phoneToE164',
  'normalizePhone',
  'formatPhoneInput',
]);

// Phone-suggestive identifier names. Compound forms only — bare `cell` and
// `mobile` removed in Phase Lint-Hardening-1.3 (LOCKED-7) because they
// collide with TanStack Table cell objects and the mobile-fee data model.
const PHONE_NAMES = new Set([
  'phone',
  'phone_number',
  'phonenumber',
  'sms_phone',
  'smsphone',
  'to_phone',
  'tophone',
  'from_phone',
  'fromphone',
  'recipient_phone',
  'recipientphone',
  'business_phone',
  'businessphone',
  'customer_phone',
  'customerphone',
  'cell_phone',
  'cellphone',
  'mobile_phone',
  'mobilephone',
]);

// Recognized input components for which `value={x}` is treated as a binding,
// not a display. Conservative list: native `input` plus the common
// uppercase wrappers used in this codebase.
const INPUT_COMPONENT_NAMES = new Set(['input', 'Input']);

function isPhoneSuggestive(name) {
  return typeof name === 'string' && PHONE_NAMES.has(name.toLowerCase());
}

function isAllowedWrapperCall(node) {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type === 'Identifier' && ALLOWED_WRAPPERS.has(callee.name)) return true;
  if (
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    ALLOWED_WRAPPERS.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

// Detect the canonical `formatPhone(x) || fallback` pattern. When matched,
// the rule treats the entire LogicalExpression's right side as
// fallback-only — references there are intentional.
function isFormatPhoneFallback(node) {
  return (
    node &&
    node.type === 'LogicalExpression' &&
    node.operator === '||' &&
    node.left &&
    node.left.type === 'CallExpression' &&
    node.left.callee &&
    node.left.callee.type === 'Identifier' &&
    node.left.callee.name === 'formatPhone'
  );
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow rendering raw phone values in JSX without formatPhone() or other canonical helpers.',
      recommended: false,
      url: 'docs/dev/PHONE_LINT.md',
    },
    schema: [],
    messages: {
      rawPhone:
        'Raw phone reference "{{name}}" rendered in JSX. Wrap with formatPhone() (display), phoneToE164() (tel:/JSON-LD), or formatPhoneInput() (input). To intentionally bypass, add: // eslint-disable-next-line phone/no-raw-display',
    },
  },

  create(context) {
    function check(node) {
      if (!node || typeof node !== 'object') return;

      // Allowed wrapper call short-circuits the whole subtree — its arguments
      // are intentionally raw.
      if (node.type === 'CallExpression' && isAllowedWrapperCall(node)) {
        return;
      }

      // Phase Lint-Hardening-1.3 (LOCKED-4): formatPhone(x) || fallback —
      // the canonical staff-facing fallback pattern. Don't inspect the
      // right side; references there are intentional safety nets.
      if (isFormatPhoneFallback(node)) {
        check(node.left);
        return;
      }

      switch (node.type) {
        case 'Identifier': {
          if (isPhoneSuggestive(node.name)) {
            context.report({
              node,
              messageId: 'rawPhone',
              data: { name: node.name },
            });
          }
          return;
        }

        case 'MemberExpression': {
          const prop = node.property;
          if (
            !node.computed &&
            prop &&
            prop.type === 'Identifier' &&
            isPhoneSuggestive(prop.name)
          ) {
            context.report({
              node,
              messageId: 'rawPhone',
              data: { name: prop.name },
            });
            return;
          }
          if (
            node.computed &&
            prop &&
            prop.type === 'Literal' &&
            typeof prop.value === 'string' &&
            isPhoneSuggestive(prop.value)
          ) {
            context.report({
              node,
              messageId: 'rawPhone',
              data: { name: prop.value },
            });
            return;
          }
          // Don't recurse into the object — accessing a non-phone property of
          // something like `customer.phone.formatted` (hypothetical) is fine.
          return;
        }

        case 'CallExpression': {
          // Non-allowed call: walk the arguments. The user might be passing a
          // raw phone to a non-canonical function inside JSX (still a leak).
          for (const arg of node.arguments) check(arg);
          return;
        }

        case 'TemplateLiteral': {
          for (const expr of node.expressions) check(expr);
          return;
        }

        case 'LogicalExpression': {
          // Phase Lint-Hardening-1.3 (LOCKED-3 + LOCKED-4):
          //
          // `&&` truthy guard: `{x && jsx}` — left is purely a test and
          //   never renders text; skip it, walk the right (the JSX subtree).
          //
          // `||` fallback: behavior is asymmetric.
          //   - If left is the canonical `formatPhone(...)` wrapper, treat
          //     the whole expression as the canonical staff-facing fallback
          //     pattern (`formatPhone(x) || x`). The right is intentional.
          //   - Else if the right is a plain Literal (e.g. `|| 'No phone'`,
          //     `|| '—'`), the left is the test position of the placeholder
          //     idiom — skip it.
          //   - Else (e.g. `customer.phone || formatPhone(customer.phone)`,
          //     a wrong-order swap, or `format(x) || customer.phone` where
          //     both halves leak), inspect both sides.
          if (node.operator === '&&') {
            check(node.right);
            return;
          }
          // operator === '||'
          if (node.right && node.right.type === 'Literal') {
            return;
          }
          check(node.left);
          check(node.right);
          return;
        }

        case 'BinaryExpression':
          check(node.left);
          check(node.right);
          return;

        case 'ConditionalExpression':
          // Phase Lint-Hardening-1.3 (LOCKED-3): ternary test is a check,
          // not a display. Inspect the two branches, not the test.
          check(node.consequent);
          check(node.alternate);
          return;

        case 'ChainExpression':
          check(node.expression);
          return;

        case 'TSNonNullExpression':
        case 'TSAsExpression':
        case 'TSTypeAssertion':
          check(node.expression);
          return;

        case 'AwaitExpression':
        case 'UnaryExpression':
          check(node.argument);
          return;

        case 'ArrayExpression':
          for (const el of node.elements) {
            if (el) check(el);
          }
          return;

        case 'ObjectExpression':
          for (const p of node.properties) {
            if (p.type === 'Property') check(p.value);
          }
          return;

        case 'SpreadElement':
          check(node.argument);
          return;

        default:
          return;
      }
    }

    // Phase Lint-Hardening-1.3 (LOCKED-5, LOCKED-6): some JSXAttribute
    // contexts never represent visible display:
    //   - `key={...}`            (React key, internal only)
    //   - `<input value={...}>`  (form binding, tracks state)
    //   - `<Input value={...}>`  (same — shadcn/Radix wrappers)
    function shouldSkipAttribute(jsxAttrNode) {
      if (!jsxAttrNode || jsxAttrNode.type !== 'JSXAttribute') return false;
      const name = jsxAttrNode.name && jsxAttrNode.name.name;
      if (name === 'key') return true;
      if (name === 'value') {
        const opening = jsxAttrNode.parent;
        if (opening && opening.type === 'JSXOpeningElement') {
          const elName = opening.name && opening.name.name;
          if (typeof elName === 'string' && INPUT_COMPONENT_NAMES.has(elName)) {
            return true;
          }
        }
      }
      return false;
    }

    return {
      JSXExpressionContainer(node) {
        // If the container sits inside a skip-able JSXAttribute, ignore it.
        if (node.parent && shouldSkipAttribute(node.parent)) return;
        check(node.expression);
      },
    };
  },
};
