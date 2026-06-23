# Money Handling — Canonical Model + Lint Rule

> Single source of truth for how money is represented, stored, computed,
> and rendered. Established in Phase **Money-Unify-1**; the broader
> Money-Unify epic was **closed permanently on 2026-05-15** (see the
> "Decision (2026-05-15)" section near the end of this doc) — but this
> remains the canonical money model. Read this before adding any new
> money-handling code or changing existing money columns.

## TL;DR

> **The Money-Unify epic was closed permanently on 2026-05-15** (see
> "Decision (2026-05-15)" below). The bullets below describe the
> post-closure canonical model, not an in-progress migration.

- **Storage (per-family):** most money-bearing tables stay
  **`NUMERIC(10,2)` dollars indefinitely** (catalog, transactions,
  payments, cash_drawers, appointments, quotes, coupons, customers, and
  every other table not already migrated). Only the **Inventory family
  (Unify-2)** carries `_cents` columns — it shipped cleanly and is kept.
  No further families migrate to cents.
- **New columns:** a new money column **MUST match the existing unit of
  the family it lives in** — do not add a lone `_cents` column to an
  all-dollars table (that re-creates the dual-unit drift behind the
  Unify-3 rollback).
- **Math (precision-sensitive paths):** compute in **integer cents
  internally, dollars at the I/O boundary** (e.g. `refund-math.ts`, and
  the Phase 1 helpers in `src/lib/data/transaction-totals.ts` such as
  `computeGrandTotal` / `computeBalanceDue`). Convert with `toCents()` /
  `fromCents()` at the boundary.
- **Display:** `formatCurrency(dollars)` for dollar values (the
  dollars-canonical families — kept permanently); `formatMoney(cents)`
  where the value is already integer cents (inventory, helper outputs).
  `formatMoneyForInput(cents)` for controlled cents-edit inputs.
- **Code naming:** a variable that holds cents carries a `Cents`
  (camelCase) or `_cents` (snake_case) suffix; the
  **`money/no-unsuffixed-money-prop`** lint rule flags a cents value
  bound to an un-suffixed name. It does **not** mandate cents for new
  columns.
- **External boundaries:** Stripe & Square take cents
  (`Math.round(dollars * 100)` at the payment-amount boundary); QBO
  takes dollars; Shippo gives dollar strings. Conversion happens once at
  the boundary.

## Canonical helper API

All helpers live in `src/lib/utils/money.ts` (renamed from
`src/lib/utils/refund-math.ts` in Unify-1; the old path survives as a
`@deprecated` re-export shim and is kept post-closure).

| Helper | Signature | Purpose |
| --- | --- | --- |
| `toCents(dollars)` | `(number) => number` | Dollars → cents. Single rounding site via `Math.round`. Use at every dollars-context intake (form submits, Shippo rates, etc.). |
| `fromCents(cents)` | `(number) => number` | Cents → dollars. Use only at boundaries that demand dollars (QBO, legacy renderers). Never inside business logic. |
| `formatMoney(cents)` | `(number) => string` | Canonical formatter. Throws `TypeError` on non-integer / non-finite input. Lives in `src/lib/utils/format.ts`. |
| `formatMoneyForInput(cents)` | `(number) => string` | `"17.64"` form (no `$`, no commas) for controlled `<input>` value bindings. Throws on non-integer input. |
| `formatCurrency(dollars)` | `(number) => string` | **Canonical dollars-display formatter — kept permanently** (post-closure). Use for the dollars-canonical families (catalog, transactions, payments, appointments, quotes, coupons, customers). Not scheduled for removal. |
| `STRIPE_MIN_AMOUNT_CENTS` | `50` | Stripe's minimum charge in cents. Single export consumed by all enforcement sites. |
| `STRIPE_MIN_DOLLARS` | `0.50` | Derived (`STRIPE_MIN_AMOUNT_CENTS / 100`). Use for dollars-context enforcement only. |

Refund-math helpers (`computePerUnitRefundableCents`,
`computeRefundLineAmountCents`, `computeTotalRefundCents`,
`distributeResidualCents`) also live in `money.ts`. Their invariants
are documented at the top of the file.

Cents-context loyalty math uses `LOYALTY.REDEEM_RATE_CENTS = 5`
(cents per point); `LOYALTY.REDEEM_RATE = 0.05` (dollars) serves
dollars-context callers. Both constants coexist permanently post-closure.

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

Both coexist permanently post-closure (2026-05-15). The dollars float
serves dollars-context callers; the cents integer serves cents-context
math. Neither is scheduled for removal.

## Naming convention

Every variable, parameter, object key, or column that holds cents
**must** carry a suffix:

- camelCase: `amountCents`, `subtotalCents`, `taxAmountCents`
- snake_case: `amount_cents`, `subtotal_cents`, `tax_amount_cents`

The `*Dollars` / `*_dollars` identifiers are the explicit
dollars-at-the-boundary marker. Use the dollars suffix when the value is
a dollar number (QBO body field, Shippo intake, dollars-canonical
column, legacy formatter input).

**The suffix marks the unit a value is already in — it does not mandate
which unit to choose.** In a dollars-canonical family (the default
post-closure), money is in dollars and carries no `_cents` suffix; only
add `_cents` when the value is genuinely integer cents (Inventory
columns, `refund-math.ts` intermediates, Stripe-boundary amounts). A
cents literal must be unambiguous at its site
(`STRIPE_MIN_AMOUNT_CENTS = 50` cents, not a bare `50`).

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
necessary for `phone/no-raw-display`. See "How to opt out" below for
the per-line escape hatch.

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

`warn` (not `error`), and it **stays `warn` post-closure (2026-05-15)** —
there is no Unify-Final phase to upgrade it. The rule remains a useful
write-time signal that a cents value has been bound to an un-suffixed
name (relevant for the Inventory family and `refund-math.ts`-style
compute paths), but it does not gate the build and does not mandate
cents for new columns.

## Migration status (post-Unify-1)

Unify-1 established the helper surface and lint rule. The planned
follow-on family phases (Unify-3 onward) were **cancelled when the epic
closed on 2026-05-15** — the 65 `NUMERIC(10,2)` dollar columns and their
dollars-context callers **stay dollars permanently**. Only the Inventory
family (Unify-2) shipped cents. The table below records final per-family
status.

| Family | Tables | Status |
| --- | --- | --- |
| H — Inventory | purchase_order_items, stock_adjustments, vendors | **Migrated (Unify-2) — kept post-closure** — 3 cents columns added, backfilled, CHECK-constrained; `void_transaction()` Postgres function writes cents. Legacy NUMERIC columns retained (the Unify-Final cleanup that would have dropped them is cancelled — no longer scheduled). ~10 `// TODO Unify-D` code shim sites remain orphaned (Family D cleanup cancelled — see flag at session end). |
| D — Catalog | services, service_pricing, products, packages | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently (rollback target of Unify-3; see postmortem above) |
| E — Orders | orders, order_items, shipping_settings | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently (rollback target of Unify-4; see postmortem above) |
| A — POS Transactions | transactions, transaction_items, payments, refunds, cash_drawers | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently per the epic-closure decision below; no cents migration |
| C — Appointments | appointments, appointment_services, mobile_zones, job_addons | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently |
| F — Marketing | coupons, coupon_rewards, campaigns | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently |
| B — Quotes | quotes, quote_items | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently |
| G — Customer Aggregate | customers | **Closed (2026-05-15)** — stays NUMERIC(10,2) dollars permanently |
| — | Cleanup + ADR | **Closed (2026-05-15)** — Unify-Final cancelled; no cleanup phase runs |

See `docs/sessions/money-unify-0-migration-playbook-v2.md` for the
full (now-historical) epic plan — superseded by the 2026-05-15 closure
decision below.

## Lessons learned from the Money-Unify-3 rollback (2026-05-15)

The Unify-3 (Family D / Catalog) and Unify-4 (Family E / Orders) migrations
were rolled back on 2026-05-15 after a 22-hour window during which booking
submissions were silently 400-ing, the e-commerce checkout was creating
PaymentIntents at 100× the cart total, and the booking confirmation screen
was rendering `$7,500` for a `$75` service. No real customer was charged
incorrectly — the failures surfaced in pre-launch self-testing — but the
bug surface was wide enough that fixing forward would have meant 5+ more
sessions across dozens of files. The migration was reverted at both the
code (six git reverts) and database (two DOWN migrations) layers. Six
forward-facing rules emerged from the postmortem; they govern Money-Unify
Attempt 2.

**1. One surface per commit, never an entire family in one commit.**
`ff2d51a1` touched 80+ files across POS, admin, e-commerce, booking,
voice-agent, account, and migration UI. Reverting was all-or-nothing
because surfaces were entangled — a forward fix on one surface couldn't be
shipped without dragging the others along. A future migration must touch
one surface (one route, one page, one component) per commit. Schema change
+ caller migration may share a commit only if the caller set is genuinely
small (1–3 files). The discipline is for the rollback path: if any surface
breaks, only that surface gets reverted, not the whole family.

**2. Branded types must precede the migration, not follow it.** Both
`formatMoney` and `formatCurrency` accept `number` — the compiler couldn't
tell which unit was being passed. Every bug we found was a unit-mismatch
at a function boundary that the type system silently allowed. Future cents
migrations require `Cents` and `Dollars` branded types as a compile-time
barrier introduced BEFORE any column rename. With branded types in place,
the entire class of `* 100`-scaler bugs (forward AND inverse) becomes
impossible to compile, not merely unlikely.

**3. Wire-contract tests at every API boundary.** The booking wizard's
POST body and `bookingSubmitSchema` diverged silently for 22 hours because
no test asserted they matched. Session 1.5a added
`src/app/api/book/__tests__/wire-contract.test.ts` as the pattern: build
the exact body the client sends, run it through the Zod schema, assert
success. Every money-touching endpoint must have one of these BEFORE the
schema is renamed — the test is the lock that prevents the client/server
drift from going undetected.

**4. The audit happens BEFORE the migration ships, not after.** The
`MONEY_UNIFY_3_COMPREHENSIVE_BUG_AUDIT.md` document was built in response
to bugs already in production. Every finding was a regression, not a
pre-flight catch. For future migrations: a read-only audit of every money
render site, every Stripe SDK call, and every DB write path on the target
family is a hard gate. The audit produces an inventory; only then does
code change. The Phase 2 audit appendix (preserved in
`docs/dev/MONEY_UNIFY_LESSONS_PHASE_2_AUDIT.md`) is the methodology
template.

**5. Dual-column transitional state requires drift enforcement.** Unify-3
kept legacy NUMERIC columns alongside new `_cents` columns "for rollback
safety" — which is exactly what saved the rollback today. But nothing
prevented application code from writing to one column and not the other,
and that drift was a latent integrity bomb. Future migrations using the
two-phase commit pattern need either (a) a DB trigger that keeps both
columns in sync until Unify-Final, or (b) a CI check that grep-asserts only
one column is referenced in writes. Without enforcement, the rollback
safety net becomes the drift surface.

**6. Inverse-direction bugs exist and are undetected by the integer check.**
`formatMoney(125)` interprets `125` as 125 cents and renders `"$1.25"`. When
the source is `service_addon_suggestions.combo_price` (NUMERIC dollars,
value `125` meaning $125.00), the result is 100× too small in the
customer-facing UI. The `formatMoney` safety net (`if (!Number.isInteger(cents)) throw`)
passes because `125` IS an integer — the throw only catches non-integer
floats like `125.50`. The original audit enumerated the forward direction
(cents fed to `formatCurrency`, 100× too high) but missed the inverse
(dollars fed to `formatMoney`, 100× too low). Future audits must enumerate
BOTH directions explicitly; branded types (rule 2) catch the inverse pattern
at compile time.

> The cents-canonical destination remains the right architectural target.
> The Unify-3 attempt failed not because cents-canonical is wrong, but
> because the migration shipped without compile-time enforcement, without
> per-surface isolation, and with an audit that came after the migration
> rather than before. These six rules are the methodology for Money-Unify
> Attempt 2, planned via Option A: branded types first, then
> one-surface-at-a-time migration with audit-and-validate between each
> surface.


## Decision (2026-05-15) — Money-Unify epic closed

After completing the Money-Unify-3 rollback and reviewing the cost-benefit of
continuing the epic, the decision is to **close Money-Unify permanently**. Future
references in this file to "Money-Unify Attempt 2" or "Option A (branded types
first)" should be understood as the path that was considered and **not taken**.

**Final state and forward rules:**

- Storage layer stays as `NUMERIC(10,2)` dollars for catalog (services,
  service_pricing, products, packages), orders + order_items, transactions,
  appointments, quotes, coupons, customers, and all other money-bearing tables
  not already migrated.
- Inventory family (Unify-2) stays on `_cents` columns — it shipped cleanly,
  works correctly, and reverting it would be unnecessary churn.
- Money-Unify-1 helpers (`toCents`, `fromCents`, `formatMoney`, `formatCurrency`)
  and the `money/no-unsuffixed-money-prop` ESLint rule remain available for use,
  but are not the canonical storage pattern.
- `refund-math.ts` integer-cents pattern is preserved for the one math path
  where precision matters (partial refund calculations). Any future
  computation module with similar precision requirements should follow this
  same pattern: integer cents internally, dollars at the I/O boundaries.
- Stripe-rail conversions use `Math.round(dollars * 100)` consistently at the
  payment-amount boundary. This is the established pattern; new code should
  follow it.

**Rationale (summarized — full reasoning in CHANGELOG 2026-05-15 postmortem):**

For this business's scale and operational profile — sub-$500 average transactions,
whole/half-dollar pricing, simple tax math (single rate, single boundary), Stripe
and Square enforcing integer cents at the payment rail — the dollar/cent drift
problem the migration was intended to solve has zero observed incidence in 18+
months of operation. The 40-60 hour cost of completing the migration via Option A
is not justified by the expected value of bugs prevented. The hours are better
spent on customer-facing features.

This decision applies indefinitely. It can be revisited if the business changes
shape — e.g., expansion into multi-currency, subscription billing with proration,
complex multi-rate tax compliance, or material increase in transaction volume —
but none of those are on the current roadmap.

**Lessons-learned section above (six rules) is preserved as reference material
in case any future limited-scope cents migration is considered (e.g., a single
computation module rather than a full family). The rules remain valid; the
question of whether to apply them at all is the decision recorded here.**


## Files

- Canonical helpers: `src/lib/utils/money.ts`
- Format helpers: `src/lib/utils/format.ts` (`formatMoney`,
  `formatMoneyForInput`, legacy `formatCurrency`)
- Loyalty constants: `src/lib/utils/constants.ts` (`LOYALTY.REDEEM_RATE`,
  `LOYALTY.REDEEM_RATE_CENTS`)
- Deprecated re-export shim: `src/lib/utils/refund-math.ts`
  (`@deprecated`; kept post-closure, not scheduled for deletion)
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
