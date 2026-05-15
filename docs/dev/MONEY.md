# Money Handling — Canonical Model + Lint Rule

> Single source of truth for how money is represented, stored, computed,
> and rendered. Established in Phase **Money-Unify-1** as the foundation
> of the Money-Unify epic. Read this before adding any new money-handling
> code or changing existing money columns.

## TL;DR

- **Storage:** all money columns hold **integer cents** with a `_cents`
  column-name suffix (e.g. `subtotal_cents`). The 12 columns that
  already carry cents stay; the 65 NUMERIC(10,2) dollar columns migrate
  to cents in the family phases that follow Unify-1.
- **Code:** every variable that holds cents carries a `Cents`
  (camelCase) or `_cents` (snake_case) suffix. The lint rule
  **`money/no-unsuffixed-money-prop`** catches violations at write time.
- **Math:** all arithmetic happens on integer cents. No `* 100` /
  `/ 100` outside the converter helpers.
- **Display:** `formatMoney(cents)` for all customer- and staff-facing
  output. `formatMoneyForInput(cents)` for controlled dollar-edit
  inputs. The legacy `formatCurrency(dollars)` survives the epic and is
  removed at Unify-Final.
- **External boundaries:** Stripe, Square cents in; QBO dollars out;
  Shippo dollar strings in. Conversion happens once at the boundary.

## Canonical helper API

All helpers live in `src/lib/utils/money.ts` (renamed from
`src/lib/utils/refund-math.ts` in Unify-1; the old path survives as a
`@deprecated` re-export shim through the epic).

| Helper | Signature | Purpose |
| --- | --- | --- |
| `toCents(dollars)` | `(number) => number` | Dollars → cents. Single rounding site via `Math.round`. Use at every dollars-context intake (form submits, Shippo rates, etc.). |
| `fromCents(cents)` | `(number) => number` | Cents → dollars. Use only at boundaries that demand dollars (QBO, legacy renderers). Never inside business logic. |
| `formatMoney(cents)` | `(number) => string` | Canonical formatter. Throws `TypeError` on non-integer / non-finite input. Lives in `src/lib/utils/format.ts`. |
| `formatMoneyForInput(cents)` | `(number) => string` | `"17.64"` form (no `$`, no commas) for controlled `<input>` value bindings. Throws on non-integer input. |
| `formatCurrency(dollars)` | `(number) => string` | **Legacy.** Survives the epic so per-family caller rewrites stay tractable. At Unify-Final, `formatMoney` is renamed to `formatCurrency` and this dollars-input version is deleted. |
| `STRIPE_MIN_AMOUNT_CENTS` | `50` | Stripe's minimum charge in cents. Single export consumed by all enforcement sites. |
| `STRIPE_MIN_DOLLARS` | `0.50` | Derived (`STRIPE_MIN_AMOUNT_CENTS / 100`). Use for dollars-context enforcement only. |

Refund-math helpers (`computePerUnitRefundableCents`,
`computeRefundLineAmountCents`, `computeTotalRefundCents`,
`distributeResidualCents`) also live in `money.ts`. Their invariants
are documented at the top of the file.

Cents-context loyalty math uses `LOYALTY.REDEEM_RATE_CENTS = 5`
(cents per point); the legacy `LOYALTY.REDEEM_RATE = 0.05` survives
through the epic for dollars-context callers.

## Cross-system synchronization points

The following values must be kept in sync across multiple layers.
Changing any one of them requires updating all the others as part of
the same change.

### Stripe minimum charge ($0.50 USD = 50 cents)

- `STRIPE_MIN_AMOUNT_CENTS` in `src/lib/utils/money.ts` (cents constant)
- `STRIPE_MIN_DOLLARS` in `src/lib/utils/money.ts` (derived; do not
  edit independently)
- `appointments.payment_link_amount_cents_check` DB CHECK constraint
  (hardcoded `>= 50`; requires a migration to change)

If Stripe changes the minimum (extremely unlikely), update the cents
constant and ship a migration that drops + recreates the CHECK with
the new floor. The derived dollars constant updates automatically.

### Loyalty redeem rate ($0.05 per point = 5 cents per point)

- `LOYALTY.REDEEM_RATE` in `src/lib/utils/constants.ts` (dollars,
  legacy float)
- `LOYALTY.REDEEM_RATE_CENTS` in `src/lib/utils/constants.ts`
  (cents, integer — added in Unify-1)

Both coexist through the Money-Unify epic. At Unify-Final, the
dollars-context float is removed and `REDEEM_RATE_CENTS` becomes the
sole source.

## Naming convention

Every variable, parameter, object key, or column that holds cents
**must** carry a suffix:

- camelCase: `amountCents`, `subtotalCents`, `taxAmountCents`
- snake_case: `amount_cents`, `subtotal_cents`, `tax_amount_cents`

The 14 existing `*Dollars` / `*_dollars` identifiers survive as the
explicit dollars-at-the-boundary marker. Use the dollars suffix when
you genuinely need a dollar number (QBO body field, Shippo intake,
legacy formatter input).

Unnamed numeric literals carry cents. Write `amount: 5000`, not
`amount: 50`. Dollar-literal constants must be re-expressed when they
appear (`STRIPE_MIN_AMOUNT_CENTS = 50`, not `STRIPE_MINIMUM = 0.50`).

## The lint rule — `money/no-unsuffixed-money-prop`

The rule fires whenever a **cents-typed source** is bound to an
identifier whose name lacks the `Cents` / `_cents` suffix.

**Cents-typed sources:**

- Identifiers ending in `Cents` or `_cents`
  (e.g. `totalCents`, `tax_amount_cents`)
- Member expressions where the property name carries the suffix
  (`row.subtotal_cents`, `tx.totalCents`)
- Return values of `toCents(...)`

**Triggers when** the source appears as the right-hand side of:

- A `const` / `let` / `var` declaration with a plain identifier LHS
- An assignment (`x = source`)
- An object-literal property where the key name lacks the suffix
  (`{ total: subtotalCents }`)
- A destructure-rename that strips the suffix
  (`const { amount_cents: total } = row`)

**Patterns the rule deliberately ignores:**

| Pattern | Why skipped |
| --- | --- |
| LHS suffixed `Dollars` or `_dollars` | Explicit boundary marker; the rename is intentional |
| RHS is `fromCents(...)` | Returns dollars; un-suffixed LHS is correct |
| RHS is `formatMoney(...)` / `formatMoneyForInput(...)` / `formatCurrency(...)` | Returns a string, not a money value |
| File under `__tests__/` or named `*.test.*` / `*.spec.*` | Test fixtures often shadow source naming |
| Shorthand destructure `const { amount_cents } = row` | Local binding keeps the source name |
| JSX attribute pass-through `<Foo bar={cents}>` | Receiving prop name is owned by the component, not the caller |

The skip patterns mirror the conservative defaults that proved
necessary for `phone/no-raw-display`. They will likely expand as the
family phases surface real-world false positives — see "How to opt
out" below for the per-line escape hatch.

## How to fix a violation

Three usual fixes:

```ts
// ❌ flagged — un-suffixed LHS holds cents
const total = subtotalCents;

// ✅ rename LHS to carry the suffix
const totalCents = subtotalCents;

// ✅ convert if you genuinely need dollars
const totalDollars = fromCents(subtotalCents);

// ✅ format if you're about to render it
const label = formatMoney(subtotalCents);
```

If the variable holds an array of cents or a mixed value where the
name "Cents" would mislead, refactor the surrounding code so the
boundary is explicit. If you can't, see "How to opt out".

## How to opt out

Use the standard ESLint inline disable comment on the line above:

```ts
// eslint-disable-next-line money/no-unsuffixed-money-prop
const legacy = row.amount_cents;
```

Reserve this for cases where the rename genuinely doesn't help — for
example, a configuration record where the key name is fixed by an
external contract. If you find yourself reaching for the disable in
new code, that's a signal that something should be refactored instead.

## Severity

Currently configured as **`warn`** in `eslint.config.mjs`.

`warn` (not `error`) because the family phases that follow Unify-1
will surface a wave of warnings as they migrate dollar columns to
cents. Each family phase brings its warning count down. When the count
hits zero — or each remaining warning has a justified
`eslint-disable-next-line` — the **Unify-Final** phase upgrades the
rule to `error` and locks the convention.

The TODO comment in `eslint.config.mjs` marks the exact line for the
upgrade.

## Migration status (post-Unify-1)

Unify-1 establishes the helper surface and lint rule. It does **not**
migrate any of the 65 NUMERIC(10,2) dollar columns or the 437
dollars-context callers in the codebase — those are owned by the
family phases that follow.

| Family | Tables | Status |
| --- | --- | --- |
| H — Inventory | purchase_order_items, stock_adjustments, vendors | **Migrated (Unify-2)** — 3 cents columns added, backfilled, CHECK-constrained; legacy NUMERIC columns retained until Unify-Final; `void_transaction()` Postgres function writes cents; 9 `// TODO Unify-D` shim sites tagged for Family D to clean up (cleared in Unify-3). |
| D — Catalog | services, service_pricing, products, packages | **Migrated (Unify-3)** — 15 cents columns added, backfilled (D-1 lax rounding of 4 whole-dollar pre-violators), CHECK-constrained (28 new constraints: non-negative, whole-dollar on services/service_pricing/packages, sale-price-discipline against `_cents`); legacy NUMERIC columns retained nullable until Unify-Final. New `services.chk_services_sale_price` enforces `sale_price_cents < flat_price_cents`. `void_transaction()` rewritten to read/write `cost_price_cents` directly. All 9 Unify-D shims cleared from `src/`. New shim markers `// TODO Unify-5/6/7/8` (28 total) tag conversion boundaries at Family A/C/F/B reads — cleaned up at the corresponding family phases. Form-state pattern: `service-pricing-form.tsx` interfaces hold dollars; admin pages convert at load/save boundaries (mirrors Unify-2 vendor pattern). Booking wire (`bookingSubmitSchema.price_cents` + `bookingAddonSchema.price_cents`) is cents; `mobile_surcharge` + `coupon_discount` stay dollars until Family C/F. POS reducers convert cents → dollars at the `resolveServicePriceWithSale()` boundary to keep `TicketItem.unitPrice` in dollars until Family A migrates. |
| E — Orders | orders, order_items, shipping_settings | Pending (Unify-4) |
| A — POS Transactions | transactions, transaction_items, payments, refunds, cash_drawers | Pending (Unify-5) |
| C — Appointments | appointments, appointment_services, mobile_zones, job_addons | Pending (Unify-6) |
| F — Marketing | coupons, coupon_rewards, campaigns | Pending (Unify-7) |
| B — Quotes | quotes, quote_items | Pending (Unify-8) |
| G — Customer Aggregate | customers | Pending (Unify-9) |
| — | Cleanup + ADR | Pending (Unify-Final) |

See `docs/sessions/money-unify-0-migration-playbook-v2.md` for the
full epic plan, decision recap, and per-family reconciliation
strategies.

## Files

- Canonical helpers: `src/lib/utils/money.ts`
- Format helpers: `src/lib/utils/format.ts` (`formatMoney`,
  `formatMoneyForInput`, legacy `formatCurrency`)
- Loyalty constants: `src/lib/utils/constants.ts` (`LOYALTY.REDEEM_RATE`,
  `LOYALTY.REDEEM_RATE_CENTS`)
- Deprecated re-export shim: `src/lib/utils/refund-math.ts` (deleted
  at Unify-Final)
- Lint rule: `eslint-rules/money-no-unsuffixed-money-prop.js`
- Lint rule tests: `eslint-rules/__tests__/money-no-unsuffixed-money-prop.test.js`
- Helper tests: `src/lib/utils/__tests__/money.test.ts`,
  `src/lib/utils/__tests__/format-money.test.ts`,
  `src/lib/utils/__tests__/refund-math.test.ts` (continues to run via
  the deprecated path)
- Registered in: `eslint.config.mjs` under the `money` plugin namespace

Run the lint over the codebase with:

```sh
npm run lint -- src/
```

Run the rule's own tests with:

```sh
npx vitest run eslint-rules/__tests__/money-no-unsuffixed-money-prop.test.js
```
