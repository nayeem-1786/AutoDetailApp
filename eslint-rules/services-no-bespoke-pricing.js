'use strict';

/**
 * services/no-bespoke-pricing
 *
 * Enforces CLAUDE.md Rule 22: service-pricing math must flow through the
 * canonical engine in `src/lib/services/picker-engine.ts`
 * (`resolveServicePrice` / `resolveServicePriceWithSale`). Prevents future
 * code from re-introducing the bespoke-pricer pattern that produced the
 * silent customer-money bugs Item 15f Layers 3c/3d/3e/4 fixed (missing
 * exotic/classic size_class branches, per_unit returning 0, custom
 * returning 0, etc.).
 *
 * Detection (three smoking-gun signals):
 *
 *   1. **Bespoke function-name pattern.** Functions named EXACTLY one of
 *      `resolveServicePrice`, `resolvePrice`, `getServicePrice`,
 *      `computeServicePrice` defined outside `src/lib/services/`. Catches
 *      the most common drift shape — operator writing a local price helper.
 *
 *   2. **`switch (X.pricing_model)` doing price math without engine call.**
 *      A switch statement whose discriminant is `*.pricing_model`, where
 *      (a) at least one case body reads a money property (`price`,
 *      `sale_price`, `flat_price`, `per_unit_price`, `custom_starting_price`,
 *      or any `vehicle_size_*_price` column) in a NUMERIC-OUTPUT context
 *      (not a comparison like `!= null`, not wrapped in
 *      `formatCurrency()` / `formatMoney()` / `formatMoneyForInput()`),
 *      AND (b) no case body contains a call to `resolveServicePrice` /
 *      `resolveServicePriceWithSale` / `routeServiceTap`. Refined Signal-2:
 *      excludes (i) string/JSX-returning display dispatches (no money
 *      property reads), (ii) classifiers that only compare prices to set
 *      a non-price variable (e.g., coupon-eligibility's `pricingType`
 *      flag), and (iii) label generators that read prices only to format
 *      them through `formatCurrency`. Legitimate thin wrappers (Layer 3d's
 *      `resolvePrice`, Layer 4's migrated `computeExpectedPrice`, the
 *      wizard's `computePrice` / `getServicePriceDisplay`,
 *      `booking-wizard.tsx`'s `reconstructConfig`, `service-card.tsx`'s
 *      `getStartingPrice`, the voice-agent catalog endpoint) all call the
 *      engine in their case bodies and are therefore allowed.
 *
 *   3. **Direct `vehicle_size_*_price` arithmetic read.** A MemberExpression
 *      reading one of the 5 per-size columns, where the parent context is
 *      a return statement OR binary-arithmetic operand. Excluded contexts:
 *      object literal keys (assignments to those columns), comparisons
 *      (`!= null` / `=== null` — column-presence checks like the wizard's
 *      `isVehicleSizeOffered`), and JSX value bindings (admin catalog
 *      editor inputs). Catches the column-extraction-as-final-price pattern.
 *
 * Exemptions:
 *
 *   - Files under `src/lib/services/` (the canonical engine + its
 *     immediate consumers — `service-resolver.ts`, `use-service-picker.ts`,
 *     `edit-services-dialog.tsx`, `custom-price-dialog.tsx`).
 *   - Test files (`__tests__/**`, `*.test.{ts,tsx,js,jsx}`) — tests pin
 *     behavior and may reference internals deliberately.
 *
 * Opt-out: the rule has ONE sanctioned disable comment in the codebase
 * (Item 15a's dead-code `resolveServicePrice` in
 * `src/components/appointments/edit-services-modal.tsx`, scheduled for
 * deletion in Phase 1 Layer 8e). Any other disable is a smell — the fix
 * is to migrate the bespoke pricer to a thin wrapper around
 * `resolveServicePriceWithSale`. See CLAUDE.md Rule 22 + Item 15f in
 * `docs/dev/ROADMAP-13-ITEMS.md`.
 */

// Bespoke pricer names — exact-match. Substring matches (e.g.,
// `getServicePriceDisplay`, `computePrice`) are intentionally NOT in this
// list because they identify migrated thin wrappers, not drift candidates.
const BESPOKE_FUNCTION_NAMES = new Set([
  'resolveServicePrice',
  'resolvePrice',
  'getServicePrice',
  'computeServicePrice',
]);

// Engine-call identifiers. A switch over pricing_model that calls any of
// these in at least one case body is a thin wrapper, not a bespoke pricer.
const ENGINE_CALL_NAMES = new Set([
  'resolveServicePrice',
  'resolveServicePriceWithSale',
  'routeServiceTap',
  'getServicePriceRange',
]);

// Per-size columns on `service_pricing`. The engine reads these via its
// switch-over-VehicleSizeClass dispatch; nothing else should.
const PER_SIZE_COLUMNS = new Set([
  'vehicle_size_sedan_price',
  'vehicle_size_truck_suv_price',
  'vehicle_size_suv_van_price',
  'vehicle_size_exotic_price',
  'vehicle_size_classic_price',
]);

// Money-typed property names on `services` / `service_pricing` rows. A
// MemberExpression reading any of these in a NUMERIC-OUTPUT context inside
// a `switch (pricing_model)` case body is the bespoke-pricer signature.
const MONEY_PROPERTIES = new Set([
  'price',
  'sale_price',
  'flat_price',
  'per_unit_price',
  'custom_starting_price',
  'vehicle_size_sedan_price',
  'vehicle_size_truck_suv_price',
  'vehicle_size_suv_van_price',
  'vehicle_size_exotic_price',
  'vehicle_size_classic_price',
]);

// Formatter calls that consume a money read for display purposes. A
// MemberExpression nested under one of these calls' arguments is a
// display-only read, not price math.
const MONEY_FORMATTER_CALLS = new Set([
  'formatCurrency',
  'formatMoney',
  'formatMoneyForInput',
]);

// Filename-based exemption: files under `src/lib/services/`. Accepts
// both absolute (`/Users/.../src/lib/services/foo.ts`) and relative
// (`src/lib/services/foo.ts`) paths so RuleTester fixtures work too.
function isEngineFile(filename) {
  if (typeof filename !== 'string') return false;
  const normalized = filename.replace(/\\/g, '/');
  return /(?:^|\/)src\/lib\/services\//.test(normalized);
}

// Test-file exemption.
function isTestFile(filename) {
  if (typeof filename !== 'string') return false;
  const normalized = filename.replace(/\\/g, '/');
  return (
    /(?:^|\/)__tests__\//.test(normalized) ||
    /\.test\.(ts|tsx|js|jsx)$/.test(normalized)
  );
}

// Does a node tree contain a CallExpression to one of the canonical
// engine functions? Walks the AST shallowly enough to catch case-body
// calls without crossing function boundaries (a nested function defined
// inside a case body doesn't count).
function containsEngineCall(node) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    return node.some(containsEngineCall);
  }
  if (typeof node.type !== 'string') return false;

  // CallExpression: check the callee identifier.
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    if (callee && callee.type === 'Identifier' && ENGINE_CALL_NAMES.has(callee.name)) {
      return true;
    }
    if (
      callee &&
      callee.type === 'MemberExpression' &&
      callee.property &&
      callee.property.type === 'Identifier' &&
      ENGINE_CALL_NAMES.has(callee.property.name)
    ) {
      return true;
    }
  }

  // Descend into nested arrow / function expressions — `.map((p) =>
  // resolveServicePriceWithSale(p, ...))` is a legitimate engine-call
  // pattern in a case body. Skipping the callback would force ugly
  // for-loop rewrites to satisfy the rule.

  for (const key in node) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (child && typeof child === 'object') {
      if (containsEngineCall(child)) return true;
    }
  }
  return false;
}

// Walks a node tree looking for a MemberExpression reading a money property
// in a NUMERIC-OUTPUT context. Returns true when the read flows out as a
// number (not wrapped in a formatter, not a comparison operand). Used by
// Signal 2 to distinguish bespoke pricers from display dispatches.
function containsNumericMoneyRead(root) {
  let found = false;

  function isComparisonContext(parent) {
    if (!parent) return false;
    if (parent.type !== 'BinaryExpression') return false;
    const op = parent.operator;
    return (
      op === '==' || op === '!=' ||
      op === '===' || op === '!==' ||
      op === '<' || op === '<=' ||
      op === '>' || op === '>='
    );
  }

  function isMoneyFormatterCall(node) {
    if (!node || node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (callee && callee.type === 'Identifier' && MONEY_FORMATTER_CALLS.has(callee.name)) {
      return true;
    }
    if (
      callee &&
      callee.type === 'MemberExpression' &&
      callee.property &&
      callee.property.type === 'Identifier' &&
      MONEY_FORMATTER_CALLS.has(callee.property.name)
    ) {
      return true;
    }
    return false;
  }

  function walk(node, parent, ancestorIsFormatter) {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, parent, ancestorIsFormatter);
      return;
    }
    if (typeof node.type !== 'string') return;

    // Don't descend into nested function definitions — those are their
    // own scopes with their own price-math contracts.
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      return;
    }

    // Set the formatter flag for descendants if this is a formatter call.
    const formatterHere = ancestorIsFormatter || isMoneyFormatterCall(node);

    // Check this node: is it a money-property MemberExpression?
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property &&
      node.property.type === 'Identifier' &&
      MONEY_PROPERTIES.has(node.property.name)
    ) {
      // Skip if read is in a comparison or inside a formatter call's args.
      if (!isComparisonContext(parent) && !formatterHere) {
        found = true;
        return;
      }
    }

    for (const key in node) {
      if (key === 'parent' || key === 'loc' || key === 'range') continue;
      walk(node[key], node, formatterHere);
    }
  }

  walk(root, null, false);
  return found;
}

// Is this MemberExpression access to a per-size column?
function isPerSizeColumnAccess(node) {
  if (!node || node.type !== 'MemberExpression') return false;
  if (node.computed) return false;
  if (!node.property || node.property.type !== 'Identifier') return false;
  return PER_SIZE_COLUMNS.has(node.property.name);
}

// Is the parent context arithmetic / return (i.e., the column read flows
// into a numeric output), or a comparison / object-key / JSX (allowed)?
function isFinalPriceContext(node, parent) {
  if (!parent) return false;

  switch (parent.type) {
    case 'ReturnStatement':
      // `return tier.vehicle_size_sedan_price;` — flowing out as the
      // function's price contribution.
      return parent.argument === node;

    case 'BinaryExpression':
      // Comparisons (`==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=`) are
      // column-presence / ordering checks — allowed.
      if (
        parent.operator === '==' ||
        parent.operator === '!=' ||
        parent.operator === '===' ||
        parent.operator === '!==' ||
        parent.operator === '<' ||
        parent.operator === '<=' ||
        parent.operator === '>' ||
        parent.operator === '>='
      ) {
        return false;
      }
      // Arithmetic (`+`, `-`, `*`, `/`, `%`, `**`) flowing the column read
      // into a numeric computation — bespoke price math.
      return true;

    case 'UnaryExpression':
      // `-tier.vehicle_size_sedan_price` (negation as part of arithmetic).
      // `!tier.vehicle_size_sedan_price` is a presence check — allow.
      return parent.operator === '-' || parent.operator === '+';

    default:
      return false;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce CLAUDE.md Rule 22: service-pricing math flows through the canonical engine (resolveServicePrice / resolveServicePriceWithSale).',
      recommended: false,
      url: 'docs/dev/ROADMAP-13-ITEMS.md#item-15f',
    },
    schema: [],
    messages: {
      bespokeFunctionName:
        'Function "{{name}}" defined outside src/lib/services/ matches the bespoke service-pricing pattern. Move the math to the canonical engine (resolveServicePrice / resolveServicePriceWithSale from src/lib/services/picker-engine.ts) and import it here. See CLAUDE.md Rule 22.',
      pricingModelSwitchWithoutEngineCall:
        'switch over "pricing_model" without a call to resolveServicePrice / resolveServicePriceWithSale / routeServiceTap in any case body. This is the bespoke-pricer pattern. Delegate the math to the canonical engine; the switch is permitted only as a thin dispatcher that calls the engine per case. See CLAUDE.md Rule 22.',
      directPerSizeColumnRead:
        'Direct read of "{{column}}" flowing into a numeric output (return / arithmetic). The canonical engine in src/lib/services/picker-engine.ts owns per-size column dispatch. Pass the tier + size_class to resolveServicePrice instead. See CLAUDE.md Rule 22.',
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename?.() || '';
    if (isEngineFile(filename) || isTestFile(filename)) {
      return {};
    }

    function reportBespokeFunctionName(idNode) {
      context.report({
        node: idNode,
        messageId: 'bespokeFunctionName',
        data: { name: idNode.name },
      });
    }

    return {
      // Signal 1 — bespoke function-name pattern.
      FunctionDeclaration(node) {
        if (node.id && BESPOKE_FUNCTION_NAMES.has(node.id.name)) {
          reportBespokeFunctionName(node.id);
        }
      },
      VariableDeclarator(node) {
        // `const resolveServicePrice = (...) => ...` / `function expr`.
        if (
          node.id &&
          node.id.type === 'Identifier' &&
          BESPOKE_FUNCTION_NAMES.has(node.id.name) &&
          node.init &&
          (node.init.type === 'ArrowFunctionExpression' ||
            node.init.type === 'FunctionExpression')
        ) {
          reportBespokeFunctionName(node.id);
        }
      },

      // Signal 2 — switch over pricing_model doing price math without
      // engine call. Refined to exclude string/JSX display dispatches +
      // price classifiers + label-only formatters (see rule doc for the
      // 3 excluded patterns).
      SwitchStatement(node) {
        const disc = node.discriminant;
        if (
          !disc ||
          disc.type !== 'MemberExpression' ||
          disc.computed ||
          !disc.property ||
          disc.property.type !== 'Identifier' ||
          disc.property.name !== 'pricing_model'
        ) {
          return;
        }
        // Exemption: at least one case body calls the canonical engine.
        // Thin wrappers (Layer 3d/4 migrations) all match this — the
        // switch is permitted as a per-model dispatcher into the engine.
        const hasEngineCall = node.cases.some((c) =>
          (c.consequent || []).some(containsEngineCall),
        );
        if (hasEngineCall) return;

        // Smoking gun: at least one case body reads a money property
        // (price / sale_price / flat_price / per_unit_price /
        // custom_starting_price / vehicle_size_*_price) in a numeric-
        // output context. If no case body has such a read, the switch is
        // a display dispatch or non-price classifier — allowed.
        const hasNumericMoneyRead = node.cases.some((c) =>
          (c.consequent || []).some(containsNumericMoneyRead),
        );
        if (!hasNumericMoneyRead) return;

        context.report({
          node,
          messageId: 'pricingModelSwitchWithoutEngineCall',
        });
      },

      // Signal 3 — direct per-size column read in numeric context.
      MemberExpression(node) {
        if (!isPerSizeColumnAccess(node)) return;
        const parent = node.parent;
        if (!isFinalPriceContext(node, parent)) return;
        context.report({
          node,
          messageId: 'directPerSizeColumnRead',
          data: { column: node.property.name },
        });
      },
    };
  },
};
