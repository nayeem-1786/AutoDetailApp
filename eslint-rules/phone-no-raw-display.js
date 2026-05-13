'use strict';

/**
 * phone/no-raw-display
 *
 * Flags JSX expressions that render a phone-suggestive value (customer.phone,
 * user.phoneNumber, employee.cell, etc.) without wrapping it in one of the
 * canonical phone helpers:
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
 * Does NOT touch non-JSX code. String interpolation outside JSX is fine because
 * those values are typically passed to formatters or normalizers downstream.
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

const PHONE_NAMES = new Set([
  'phone',
  'phone_number',
  'phonenumber',
  'mobile',
  'cell',
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
]);

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

        case 'LogicalExpression':
        case 'BinaryExpression':
          check(node.left);
          check(node.right);
          return;

        case 'ConditionalExpression':
          check(node.test);
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

    return {
      JSXExpressionContainer(node) {
        check(node.expression);
      },
    };
  },
};
