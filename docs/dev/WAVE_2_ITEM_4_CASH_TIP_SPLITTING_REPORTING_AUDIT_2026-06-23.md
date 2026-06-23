# Wave 2 · Item 4 — Cash Tip Capture + Tip Splitting + Tip Reporting — Audit

> **Status:** DRAFT — pending operator review (no code changes; audit-only)
> **Date:** 2026-06-23
> **Branch:** `audit/wave-2-item-4-cash-tip-splitting-reporting`
> **Scope:** Read-only empirical scoping of Item 4 (Wave 2 tip cluster, final item). Items 1–3 of the cluster are shipped.
> **Method:** 7 parallel domain readers (primary-source, `file:line`) → 9 adversarial verifiers on the critical gap claims → reuse-first synthesis. Headline findings spot-checked by the author against primary sources.
> **Principles applied:** REUSE-FIRST (every proposed new column/table/helper survives "does existing infra cover this?") · PRIMARY-SOURCE (`file:line` for every claim) · FLAG-don't-fix for latent bugs (Appendix A).

---

## 1. Executive Summary

**Item 4 is three intertwined sub-features** layered on the POS: (4a) capture cash tips, (4b) split a ticket's tip across staff, (4c) report tips per employee / period / method. The 2026-05-15 roadmap spec for Item 4 (`docs/dev/ROADMAP-13-ITEMS.md:2781-2876`) predates Items 1–3 shipping; this audit validates it against current code and reuse-firsts it.

**Top-level findings (all critical gap claims were adversarially verified):**

1. **Cash tips are entirely uncaptured today.** The cash checkout flow hardcodes `tip_amount: 0` at both the transaction grain (`cash-payment.tsx:88`) and the payment-row grain (`:123`); the offline path writes no tip field at all (and `sync-offline-transaction/route.ts:85` re-hardcodes `0` on replay). **Card (Stripe Terminal on-reader) and the public payment-link are the only methods with real tip capture.** Check and digital also write `0`. *(Verified — author spot-checked `cash-payment.tsx`.)*
2. **There is no per-employee tip attribution anywhere** — not in the schema, not in any surface. Tips live only as five `NUMERIC(10,2)` **dollar** scalars across three tables (`transactions.tip_amount`, `payments.tip_amount`/`tip_net`, `cash_drawers.cash_tips`/`total_tips`). `payments` has no `employee_id`; `transactions.employee_id` is the **cashier**, not the detailer; `appointment_services` has no detailer column. The only staff↔work link is `jobs.assigned_staff_id` (single detailer per job), never joined to a tip.
3. **No tip-splitting structure exists** — no `tip_splits`/`tip_allocation`/`tip_pool`/`tip_distribution` table or JSONB column anywhere (zero matches across migrations + src).
4. **No per-employee tip report exists.** The only Reports subpage is `/admin/reports/payments`. The seeded `reports.employee_tips` / `reports.own_tips` permissions are wired but back only a single business-wide aggregate "Tips" stat card.
5. **`roles` has no tip-percentage column** and the Role Management editor has no numeric field (boolean toggles only). *(Verified — author spot-checked the `roles` migration.)*
6. **QuickBooks sync is tip-blind** — `tip_amount` isn't even SELECTed; tips are dropped, never reaching QBO. Because `total_amount` is pre-tip, there's no double-count today, but QBO under-reports actual cash received by the full tip on every tipped ticket.
7. **No post-completion tip-edit path exists** — the `transactions/[id]` PATCH handler is void-only (`:129`, else "Unknown action" `:243`). The roadmap's "Add Cash Tip" button needs a net-new PATCH branch. *(Verified — author spot-checked the route.)*

**BLOCKING doc conflict (resolve before any new column ships):** CLAUDE.md rule #20 still frames Money-Unify as "in progress" and mandates integer `_cents` for all new money code, while `docs/dev/MONEY.md:292-313` declares the epic **permanently closed (2026-05-15)** with `transactions`/`payments` staying `NUMERIC(10,2)` dollars indefinitely. The two canonical docs prescribe **opposite units** for a new tip column. (MONEY.md also contains a stale `Family A … Pending (Unify-5)` row at `:197` that contradicts its own closure decision.) *(Verified — author spot-checked MONEY.md.)*

**Recommended sub-feature ordering** (revised from the spec's B/C/E/F, made dependency-respecting and incrementally shippable):

1. **4a-cash** — in-checkout cash tip capture. Zero schema change (columns exist); recovers lost revenue data; improves every existing surface. **Highest value, lowest risk.**
2. **4a-post** — post-completion "Add Cash Tip" (new PATCH branch + loyalty recalc + audit).
3. **4c-global** — Tips report (global + per-method). Clone of the Payments Report; nav slot + permissions already exist; works on already-captured card+cash tips, no attribution needed.
4. **4b** — role `tip_pct` + attribution/split engine (the only schema-heavy, attribution-blocked slice).
5. **4c-employee** — per-employee rows in the report (strictly downstream of 4b).

**Reuse-first headline:** following the audit's recommended defaults (compute-on-read splits, single-detailer scope, dollars-now, QBO deferred), Item 4 needs only **2 new columns** — `transactions.tip_payment_method` and `roles.tip_pct` — far less than the 2026-05-15 spec implied, because `tip_amount`, `jobs.assigned_staff_id`, `payments.method`, the seeded tip permissions, the Payments-report template, the Reports nav slot, `computeGrandTotal`, and `logAudit` all already exist.

**14 latent bugs / hazards flagged** (Appendix A) — none fixed; all out of scope per the audit mandate.

---

## 2. Current Tip Infrastructure Inventory

The reuse-first foundation: what tip data exists, where it is captured, where it is displayed, where it is reported. All amounts are `NUMERIC(10,2)` **dollars** (legacy, pre-Money-Unify-closure).

### 2.1 Storage — every tip-touching column in the DB

| Column | Table | Type | Grain / semantics | Cite |
|---|---|---|---|---|
| `tip_amount` | `transactions` | `NUMERIC(10,2)` DEFAULT 0 | Canonical per-transaction tip total | `migrations/20260201000016_create_transactions.sql:12` |
| `tip_amount` | `payments` | `NUMERIC(10,2)` DEFAULT 0 | Per-payment-row tip (split payments → multiple rows) | `migrations/20260201000018_create_payments.sql:6` |
| `tip_net` | `payments` | `NUMERIC(10,2)` DEFAULT 0 | Tip minus CC fee (card only; = `tip_amount` for non-card). **Write-only — zero readers** | `migrations/20260201000018_create_payments.sql:7` |
| `cash_tips` | `cash_drawers` | `NUMERIC(10,2)` DEFAULT 0 | Per-drawer-session cash tip aggregate | `migrations/20260201000042_create_cash_drawers.sql:13` |
| `total_tips` | `cash_drawers` | `NUMERIC(10,2)` DEFAULT 0 | Per-drawer-session all-method tip aggregate | `migrations/20260201000042_create_cash_drawers.sql:18` |

- **`payment_method` enum:** `cash | card | split | digital | check` (`migrations/20260201000001_create_enums.sql:10` + `20260510000001` + `20260201000044`; validated `src/lib/utils/validation.ts:569`). Recorded at both `transactions.payment_method` and per-row `payments.method`.
- **No `employee_id` on `payments`** (`database.types.ts:3529-3544`); `transactions.employee_id` is the cashier (`pos/transactions/route.ts:189`). **No detailer column on `appointment_services`** (`migrations/20260201000015:31-38`). Only staff↔work link: `jobs.assigned_staff_id` single FK (`migrations/20260212000003:18`); `jobs.appointment_id` is UNIQUE → one appt = one job = one detailer.
- **`roles`:** 10 columns, all boolean/text — no numeric/tip column (`migrations/20260211000007:10-21`). **`employees`:** only `hourly_rate`, no commission/tip-eligibility (`database.types.ts:1906-1923`).
- **`get_transaction_stats` RPC:** returns `tips = SUM(tip_amount)` globally; the `paymentMethods` sub-aggregate groups only on `SUM(total_amount)`, never on tip (`migrations/20260208000001:14`).

### 2.2 Capture matrix — per payment method

| Method | Tip captured? | Where (file:line) | Stored to | Notes |
|---|---|---|---|---|
| **Card — Stripe Terminal** | **Yes** (on-reader) | `card-payment.tsx:74-109` | `transactions.tip_amount`, `payments[].tip_amount` | Tip extracted from PI amount difference; `setTip` at `:109` |
| **Card — manual entry** | n/a | — | — | No manual card-entry UI in POS |
| **Cash** | **No** (hard gap) | `cash-payment.tsx` — no tip UI | `tip_amount: 0` at `:88` + `:123`; offline path no tip field (`:155-189`) | Confirmed; `checkout-context` carries `tipAmount` but cash never reads it |
| **Check** | **No** | `check-payment.tsx` (check # only) | `tip_amount: 0` at `:36` + `:71` | — |
| **Digital** (Zelle/Venmo/…) | **No** | `digital-payment.tsx` (platform picker) | `tip_amount: 0` at `:81` + `:116` | — |
| **Split — cash leg** | **No** | `split-payment.tsx:293` | cash row `tip_amount: 0` | Cash leg always 0 |
| **Split — card leg** | **Yes** (on-reader) | `split-payment.tsx:296-299` | card row `tip_amount`, txn `tip_amount` at `:310` | Txn tip = card-leg tip, **not** SUM of rows |
| **Public payment-link** | **Yes** (UI selector) | `pay-form.tsx:52-192` | webhook inserts `tip_amount`/`tip_net` (`webhooks/stripe/route.ts:213-265`) | `tip_cents` in PI metadata; Item 2 / Session #159 |

- **`tip_net` math:** `p.method === 'card' ? Math.round(p.tip_amount*(1-CC_FEE_RATE)*100)/100 : p.tip_amount` (`pos/transactions/route.ts:387-389`; `CC_FEE_RATE = 0.05`, `constants.ts:12`). Card-only deduction; non-card stores gross = net.
- **Split-sum invariant is emergent, not enforced:** `transactions.tip_amount` is written from a client scalar (`route.ts:193 ← split-payment.tsx:310`), never computed as `SUM(payments.tip_amount)`; no DB CHECK/trigger reconciles them.
- **No post-completion edit:** `transactions/[id]` PATCH is void-only (`:129`, "Unknown action" `:243`); no `transactions.update()` anywhere touches `tip_amount`.

### 2.3 Display matrix — where tip renders

| Surface | Renders tip? | Format | Gate | Cite |
|---|---|---|---|---|
| Thermal receipt (print) | Yes | inline `$X.XX` | `tip_amount > 0` | `pos/lib/receipt-template.ts:704-710` |
| HTML receipt (email body / browser print / copier) | Yes | inline `$X.XX` | `> 0` | `receipt-template.ts:1180` |
| Public receipt page | Yes | `formatCurrency` | `> 0` | `(public)/receipt/[token]/page.tsx:319-325` |
| POS transaction detail | Yes (per-payment **and** per-txn) | `formatCurrency` | `> 0` | `pos/components/transactions/transaction-detail.tsx:343-347, 390-397` |
| Admin transactions LIST + CSV | Yes (Tip column, Session #156) | `formatCurrency` / `.toFixed(2)`; `---` when 0 | `> 0` | `admin/transactions/page.tsx:643, 843-847, 911, 948` |
| Admin "Tips" stat card | Yes (global SUM) | `formatCurrency` | `showTips` permission | `revenue-stats.tsx:21, 35, 45` |
| Email receipt (comms route) | Yes (Tip line) | inline `$X.XX` | `> 0` | `api/pos/receipts/email/route.ts:81` |
| SMS receipt (comms route) | **No standalone line** (folded into total) | — | — | `api/pos/receipts/sms/route.ts:97-115` |
| Customer portal transactions LIST | **No Tip column** | — | — | `(account)/account/transactions/page.tsx:152-210` |
| Customer portal detail dialog | Yes (inside rendered receipt HTML) | as receipt | `> 0` | renders `receipt-template` HTML |

- **Canonical total:** `computeGrandTotal = max(appointment_total, total_amount) + tip` (`src/lib/data/transaction-totals.ts:56-65`); used consistently (Sessions #155/#156). **`balance_due` deliberately excludes tip** (`:228-229`).
- **No per-employee tip display anywhere.** Cash vs card tip render **identically** — no surface branches on method. `payments.tip_net` is never displayed.

### 2.4 Reporting matrix

| Surface | Tip treatment | Granularity | Cite |
|---|---|---|---|
| Admin "Tips" stat card | `formatCurrency(stats.tips)` | Global SUM, method- & employee-agnostic | `revenue-stats.tsx:21,44-45` ← `page.tsx:523` |
| `get_transaction_stats` RPC | `COALESCE(SUM(tip_amount),0)` | Global SUM; no per-method/employee tip | `migrations/20260208000001:14` |
| POS End-of-Day close | `total_tips` (all) + `cash_tips` (method=cash) → `cash_drawers` | Per-drawer-session, single-day | `api/pos/end-of-day/route.ts:59, 74, 124, 128` |
| POS EOD summary GET | `total_tips` + `payments_by_method.{cash,card}.tips` | Single-day, **split by method only** | `api/pos/end-of-day/summary/route.ts:75, 92, 106` |
| `/admin/reports/payments` | groups payments by `(method, digital_platform)` — **no tip column** | — | `admin/reports/payments/page.tsx:22-54, 106-134` |
| **Per-employee tip report** | **does not exist** | — | — |

- **Permissions** `reports.employee_tips` / `reports.own_tips` seeded (`migrations/20260211000007:151-152`), read at `admin/transactions/page.tsx:156-157`, but gate **only** the aggregate card (`:527`).
- **Reports nav parent** exists with one child today and a "future reports land as siblings" comment (`src/lib/auth/roles.ts:26-39`).

### 2.5 QuickBooks Online

Tips are **entirely absent** from QBO. `tip_amount` is not in the transaction SELECT (`src/lib/qbo/sync-transaction.ts:176-180`); the SalesReceipt `Line` array is built only from `transaction_items` + an optional `DiscountLineDetail` (`:279-300`); `rg "tip" src/lib/qbo` → zero matches; `QBO_INTEGRATION.md:17-25` mapping table has no tip row. Because `total_amount` is pre-tip, the tip-free receipt is internally consistent (no double-count) — but tips are silently dropped.

---

## 3. Cash Tip Capture — Gap + Design

### 3.1 Confirmed Gap — cash captures no tip today

The cash checkout flow has **no tip prompt and writes `tip_amount = 0` at both the transaction and payment grain**. This is confirmed primary-source, not inferred:

- `src/app/pos/components/checkout/cash-payment.tsx:88` — transaction-level POST body hardcodes `tip_amount: 0`.
- `src/app/pos/components/checkout/cash-payment.tsx:123` — the single cash payment row hardcodes `tip_amount: 0`.
- `src/app/pos/components/checkout/cash-payment.tsx:155-189` — the offline-queue path writes **no tip field at all** (no `tip_amount` key in the queued payload).
- The only money UI in the component is the cash-tendered keypad, denomination chips, and change/short display (`cash-payment.tsx:33-46`, `:272-378`). There is **no tip preset, no custom-tip input, and no read of `checkout.tipAmount`** — even though `checkout-context.tsx:24-25,62-63,100` carries `tipAmount`/`tipPercent` state + `setTip`.

The server honors whatever the client sends — it does **not** inject a tip independently: `src/app/api/pos/transactions/route.ts:193` (`tip_amount: data.tip_amount`) and `:386` (`tip_amount: p.tip_amount`). So the client-sent `0` persists. The offline replay path **also re-hardcodes** `tip_amount: 0` (`sync-offline-transaction/route.ts:85`), so even a fixed cash UI would lose the tip on sync unless the queue payload is extended (see §3.8 row 6 + Appendix A bug #2).

**Card is the only POS method with real tip capture today** (Stripe Terminal on-reader tipping, `card-payment.tsx:76-109`), which makes the cash omission a genuine per-method gap rather than a global absence. Even in a true split, the cash leg is hardcoded to `0`: `split-payment.tsx:293` (cash row `tip_amount: 0`) while only the card row at `:297` carries the tip.

> **Dead-code note (do not reuse blindly):** `src/app/pos/components/checkout/tip-screen.tsx` is a fully-built `TipScreen` with presets + custom input that calls `setTip`, but it is **orphaned** — not imported by `checkout-overlay.tsx` (the live step renderer, which switches on PaymentMethod/Cash/Card/Check/Split/Digital/PaymentComplete only), and `CheckoutStep` (`checkout-context.tsx:12-19`) has no `'tip'` member. It is a viable UI starting point but is currently unwired.

### 3.2 UI placement options for the cash-tip prompt

| Option | Placement | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. During-checkout, inline on CashPayment** | A "Tip" sub-section above/beside the cash-tendered keypad in `cash-payment.tsx` | Single-write path (tip flows into the same `POST /api/pos/transactions` insert at `:80-129`); no PATCH/loyalty-recalc complexity; cash drawer reconciliation is correct at close-out | Cashier must ask before tendering; awkward where customer hands cash then decides on tip | **Primary path** — lowest risk, reuses the existing insert |
| **B. During-checkout, dedicated step (revive TipScreen)** | Wire `tip-screen.tsx` as a real `CheckoutStep` before method screens | Reuses an already-built presets+custom component; method-agnostic | Requires extending `CheckoutStep` + `checkout-overlay.tsx`; tip-before-method also affects card (Stripe already prompts on-reader → double-prompt risk) | Secondary — only if a unified pre-method tip UX is wanted |
| **C. Post-completion "Add Cash Tip"** | Button on a recently-completed transaction (POS transaction detail / PaymentComplete) | Matches operator reality (tip handed over after the receipt prints); explicitly in the spec (4a) | **No PATCH path exists** (§3.7) — net-new write branch + loyalty recalc + audit + `cash_drawers` drift | **Required complement to A** per the locked spec decision (post-completion add allowed, 2026-05-15) |

**Recommendation:** ship **A + C**. A covers "tip at checkout" via the existing single insert; C covers "tip handed over after close." B (TipScreen revival) is not needed and risks a double-prompt against the card on-reader flow.

### 3.3 Optional vs. required-confirm-$0

- The cash-tip input MUST be **optional** — a $0 tip is the common case and must require **zero extra taps**. A required-confirm-$0 modal on every cash sale would tax the highest-volume path.
- **Recommendation:** default tip to `0`, no confirmation gate. "$0 = no tip" is implicit (mirrors how every display surface gates the Tip line on `tip_amount > 0` — `receipt-template.ts:704`, `transaction-detail.tsx:390`, `admin/transactions/page.tsx:843`).

### 3.4 Does cash tip get the `tip_net` deduction?

**No.** `tip_net` ("tip minus CC fee," `payments` migration `20260201000018:7`) is gated strictly on card:

- `pos/transactions/route.ts:387-389` — `tip_net = p.method === 'card' ? Math.round(p.tip_amount*(1-CC_FEE_RATE)*100)/100 : p.tip_amount`. The **else branch (cash/digital/check) already writes `tip_net = tip_amount`** (full gross).
- `constants.ts:12` — `CC_FEE_RATE = 0.05; // 5% CC fee deducted from card tips`.

**Recommendation:** for cash, persist `tip_net = tip_amount` — already the exact behavior of the non-card branch, so **no special-casing is required**.

> **Latent observation (flag only):** `payments.tip_net` is **write-only** — set by 5 writers, read by **zero** consumers. A cash-tip feature need not change this; just be aware the column is currently inert (Appendix A bug #8).

### 3.5 Distinguishing cash vs. card tip in data — REUSE-FIRST

**Reuse `payments.method`. Do NOT add a new flag column for the pure cases.**

- `payments.method` is `NOT NULL payment_method` (`20260201000018:4`) — **every tip-bearing row already records its concrete method**, giving an implicit per-payment cash-vs-card attribution. A separate flag is redundant if you read `payments.method`.
- The drawer split already exists: `cash_drawers.cash_tips` vs `total_tips` (`20260201000042:13,18`); EOD derives `cash_tips` by summing `payments.tip_amount` where `method='cash'` (`end-of-day/route.ts:74`).
- The spec itself offers "new column **or** via payment-method check" (`ROADMAP:2803`). The reuse-first answer is the payment-method check.

**The one wrinkle (argues for a marker, not a new amount column):** post-completion cash-tip-add (§3.7) can create a **mixed-method** transaction (a card sale that later receives a cash tip). If the cash tip is appended as a **new `payments` row with `method='cash'`**, `payments.method` still cleanly distinguishes it — preserving the reuse-first model **without** a `tip_payment_method` flag. A transaction-grain marker is only needed if a single classification per ticket is wanted for reporting (§10 item 1).

### 3.6 Data-model verification — can existing columns capture cash tip with NO schema change?

**Yes — `payments.tip_amount` + `payments.method` + `transactions.tip_amount` capture a cash tip with zero schema change.** Sample — a $40 cash sale with a $5 cash tip (Option A):

```jsonc
// transactions row
{ "total_amount": 40.00, "tip_amount": 5.00, "payment_method": "cash" }
// payments row (1 row)
{ "method": "cash", "amount": 40.00, "tip_amount": 5.00, "tip_net": 5.00,
  "cash_tendered": 50.00, "change_given": 5.00 }  // see UAT §3.8 on change math
```

The only code change for Option A is removing the two hardcoded `0`s in `cash-payment.tsx` and wiring a tip input into the existing POST body.

### 3.7 Post-completion edit path — none exists; obligations for a new PATCH

**Confirmed: no PATCH/edit path adds or updates a tip on a completed transaction.** `transactions/[id]/route.ts:113` PATCH supports **only** `action === 'void'` (`:129`); anything else returns `400 'Unknown action'` (`:243`). Every `tip_amount` write is an `.insert()` at creation time.

A new `action: 'add_cash_tip'` branch (mirroring the void branch at `:129`) must:

1. **Permission gate** — mirror `requirePermission(...)` used by the void branch.
2. **Write the tip** — set `transactions.tip_amount` AND **append a new** `payments` row (`method='cash'`, `tip_amount`, `tip_net = tip_amount`) rather than mutating a card row — keeps `payments.method` attribution clean and avoids the `transactions.tip_amount` vs `SUM(payments.tip_amount)` drift (Appendix A bug #3).
3. **Loyalty recalc** — spec requires "recalculates loyalty points." Reuse the existing earn path (`loyalty/earn/route.ts:107-109`); do not inline a bespoke calc. *(Note: loyalty earn is computed on after-discount spend and should remain tip-independent — verify it is not inflated by the added tip.)*
4. **`audit_log`** — record via canonical `logAudit` (`src/lib/services/audit.ts:21`, already imported into this route) with `buildChangeDetails(before, after, ['tip_amount'])` (`:55`).
5. **`cash_drawers` consistency** — a post-completion add after EOD close will not be reflected in `cash_tips`/`total_tips`. The PATCH must either reject adds against a closed drawer or document the drift.

### 3.8 UAT scenarios

| # | Scenario | Expected | Assertion points |
|---|---|---|---|
| **1** | Cash sale + $5 tip (Option A) | `transactions.tip_amount=5.00`; one cash `payments` row `tip_amount=5.00, tip_net=5.00`; Tip line on receipt + admin list; total = `total_amount + 5` | replace hardcoded `0` at `cash-payment.tsx:88,123`; `tip_net` auto-gross `route.ts:387` else-branch; `computeGrandTotal` `transaction-totals.ts:60-65` |
| **2** | Cash sale + $0 tip | No friction; `tip_amount=0`; Tip line suppressed; `---` in admin list | gate `>0` `receipt-template.ts:704`, `transaction-detail.tsx:390`, `admin/transactions/page.tsx:843-847`; no $0-confirm modal |
| **3** | Split: $30 card (tip $4 on reader) + $20 cash (tip $3) | `transactions.tip_amount=7.00`; two rows — card `tip_amount=4, tip_net=3.80`, cash `tip_amount=3, tip_net=3`; `cash_tips` counts only $3 | requires fixing `split-payment.tsx:293` (cash leg hardcoded 0); **txn tip is NOT SUM(payments) — client must send 7.00** (`route.ts:193`, no reconciliation) |
| **4** | Post-completion "Add Cash Tip" $5 on a completed cash sale (Option C) | new PATCH `action='add_cash_tip'` sets txn tip, appends cash row, recalcs loyalty, writes audit | PATCH branch net-new — currently `400 'Unknown action'` (`transactions/[id]/route.ts:243`); `logAudit` reuse; loyalty earn reuse |
| **5** | Post-completion add after EOD close-out | Rejected, or drift surfaced — drawer `cash_tips` won't auto-update | `cash_drawers` rollup is close-time only (`20260201000042:13,18`) |
| **6** | Offline cash sale + tip | Tip persisted in queue and replayed on sync | offline path writes no tip (`cash-payment.tsx:155-189`); must extend the queue payload AND `sync-offline-transaction/route.ts:85` (currently `tip_amount: 0`) |

**Cross-cutting:** `change_given` is computed on `amountDue` (service total), **not** `amountDue + tip` (`cash-payment.tsx:43`). If the cash-tip UX expects the customer to tender service + tip, the change math at `:43` must be revisited. Lock this before implementing Option A.

---

## 4. Tip Splitting — Gap + Design

### 4.1 Where a tip goes today: unattributed at every grain

A tip is captured and persisted **only at the money-document level, with zero link to the staff member who earned it.** Five tip columns across three tables, all `NUMERIC(10,2)` dollars, none carrying an employee reference:

| Column | Grain | Source |
|---|---|---|
| `transactions.tip_amount` | per-transaction (ticket) | `migrations/20260201000016:12` |
| `payments.tip_amount` | per-payment-row | `migrations/20260201000018:6` |
| `payments.tip_net` | per-payment-row (card-fee-adjusted, write-only) | `migrations/20260201000018:7` |
| `cash_drawers.cash_tips` | per-drawer-session | `migrations/20260201000042:13` |
| `cash_drawers.total_tips` | per-drawer-session | `migrations/20260201000042:18` |

`payments` has **no `employee_id`/`staff_id`/`performed_by`** (`database.types.ts:3529-3544`). The only employee FK on a tip-bearing row is `transactions.employee_id` — the **cashier** (`pos/transactions/route.ts:189`), not the detailer. No splitting infrastructure exists (`tip_split`/`tip_share`/`tip_pool`/`tip_distribution`/`tip_allocation`/`tip_recipient` → zero hits). The seeded `reports.employee_tips`/`reports.own_tips` permissions (`20260211000007:151-152`) anticipate per-employee data that does not exist. **Net: a tip is unattributed.**

### 4.2 The attribution backbone splitting must build on

One transaction→detailer path, **single-valued**:

```
transactions.appointment_id → jobs (jobs.appointment_id / jobs.transaction_id) → jobs.assigned_staff_id → employees
```

- `jobs.assigned_staff_id` single nullable FK (`20260212000003:18`; `database.types.ts:2445`).
- `jobs.appointment_id` UNIQUE (`database.types.ts:2530`) → one appt = one job = one `assigned_staff_id`.
- `appointment_services` has **no detailer column** (`20260201000015:31-38`) → a ticket cannot record different detailers per service.

The admin Transactions page already wires this backbone into the same SELECT as `tip_amount` (`admin/transactions/page.tsx:259`), deriving `detailerFirstName = tx.jobs?.find(j => j.status!=='cancelled')?.assigned_staff?.first_name` (`:768`). Because `jobs.transaction_id` is non-unique, the embed returns an array and uses a "first non-cancelled wins" heuristic — non-deterministic if a transaction has two active jobs (Appendix A bug #12).

**Operator decision (D-ATTR-1) — who is the tip recipient?** Cashier (`transactions.employee_id`, today) — contradicted by the pay-form copy "100% of tips go to your detailer" (`(public)/pay/[token]/pay-form.tsx:241`); Single detailer (`jobs.assigned_staff_id`, today) — matches intent, one person only; Multiple detailers — **not representable today** (needs schema). **Reuse verdict: none found.**

**Operator decision (D-ATTR-2) — ticketless sales.** Walk-in/retail (`appointment_id = NULL`) → no job → no detailer (`page.tsx:765-767`). How are these tips attributed? (Default: cashier, or excluded from the detailer pool.)

### 4.3 Schema gap — REUSE-FIRST verdict

| Option | Reuse? | Phase-3 re-parent risk | Verdict |
|---|---|---|---|
| **Derive-on-read** (detailer from `jobs.assigned_staff_id` + role Tip% at report time) | Reuses existing columns entirely | **Zero** — nothing keyed to a transaction row | **Recommended for v1** |
| **New `tip_splits` table** (`transaction_id`, `employee_id`, `share_cents`, `share_basis`) | Mirrors `payments` per-row shape; no existing tip-line table | **High** — rows keyed to deposit/balance/close-out rows need re-parenting when Phase 3 collapses them | Only if immutable payroll snapshots required |
| **JSONB on `payments`/`transactions`** (`tip_distribution`) | None found; loses per-row queryability + CHECK integrity | Medium | Reject |

**Recommendation: derive-on-read for v1.** A split is a pure function of `transactions.tip_amount` + recipient set (`jobs.assigned_staff_id`, optionally cashier `transactions.employee_id`) + role Tip% (§4.4). **Zero Phase-3 re-parenting risk** because Phase 3 keeps `transactions.tip_amount` as the column, only changing its parent row (`ROADMAP:36`). If persistence is required, use a `tip_splits` table keyed by `transaction_id` mirroring the `payments` FK shape so Phase 3 re-parents it identically:

```sql
CREATE TABLE tip_splits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE SET NULL,
  share_cents     INTEGER NOT NULL,          -- IF cents chosen (see D-MONEY-1); else NUMERIC(10,2) dollars
  share_basis     TEXT NOT NULL,             -- 'role_pct' | 'equal_detailer' | 'manual'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Money-unit conflict (must be operator-resolved first — D-MONEY-1).** CLAUDE.md #20 mandates integer `_cents`; `MONEY.md:292-313` declares the epic permanently closed with `transactions`/`payments` staying `NUMERIC(10,2)` dollars. A lone `share_cents` inside an all-dollars tip family re-creates the dual-unit-at-a-boundary drift that triggered the Unify-3 rollback (`MONEY.md:262-280`). See §11.

### 4.4 Role Tip% config — reuse the `roles` table

`roles` is access-control-only — 10 columns, all boolean/text, **no numeric field** (`20260211000007:10-21`; `database.types.ts:4550-4560`). A "Tip %" is a **net-new numeric column** (e.g. `roles.tip_pct NUMERIC(5,2)`) — **reuse verdict: none found** for storage. The Role Management editor (`admin/staff/roles/page.tsx`) has no numeric input either (boolean toggles `:688-699`).

**A numeric-input pattern to clone DOES exist** — `employees.hourly_rate` (`admin/staff/[id]/page.tsx:643-651`): `<FormField>` + `<Input type="number" step min>` + react-hook-form `register`. Clone this for a role Tip% (`step="1"`/`max="100"`). **Operator decision (D-TIP%-1):** Tip% on `roles` (per-role weight; spec says role-level) or `employees` (per-person)? Spec → `roles`, the cleaner anchor.

### 4.5 Design decisions (surfaced for operator)

| ID | Decision | Options | Spec lean (2026-05-15) |
|---|---|---|---|
| D-SPLIT-1 | Split unit | % vs fixed-$ vs operator-choice | Role-level **%** (Cashier 0 / Detailer 100) |
| D-SPLIT-2 | Default basis | equal-among-detailers / all-to-primary / prompt | Detailer share split **equally** |
| D-SPLIT-3 | When decided | checkout / job-complete / report time | Derive-on-read ⇒ report time |
| D-SPLIT-4 | Who can edit | role-gated / manager-PIN | Open — recommend manager-PIN |
| D-ROUND-1 | Penny round-off | residual → primary / cashier / largest-share | **Recommend penny-to-primary** |

With integer cents, `floor(tip_cents × pct)` per recipient leaves a residual ≤ N−1 cents; assigning it to the primary keeps the allocation summing exactly to `tip_amount`.

### 4.6 Edge cases (each an operator decision where unresolved)

1. **Zero assigned staff / walk-in product sale** — `appointment_id = NULL` → no detailer. **(E-1):** attribute to cashier, or exclude from detailer pool. Must not silently drop from the business total.
2. **Tip on a refunded transaction** — refunds touch only `status` (`pos/refunds/route.ts`), so a refunded txn keeps `tip_amount`. **(E-2):** include `refunded`/`partial_refund` in the split report? Note the existing window inconsistency (Appendix A bug #7) — pick one and apply uniformly.
3. **Split modified after close-out** — reuse `logAudit` (`audit.ts:21`, `buildChangeDetails` `:55`); add a `'tip_split'` `AuditEntityType`. **(E-3):** are post-close-out edits allowed, or frozen like payroll?
4. **Split ≠ 100% validation** — role weights could sum ≠100%. **(E-4):** validate at config time, or normalize at compute time (`weight / Σweights`). Compute-time normalization is more robust and pairs with D-ROUND-1.

---

## 5. Tip Reporting — Gap + Design

### 5.1 Existing reporting infrastructure and its tip treatment

Tips are surfaced today **only as global (un-attributed) dollar aggregates** in three places. None break tips down per-employee; only EOD splits by method.

| Surface | Tip treatment | Granularity | Cite |
|---|---|---|---|
| Admin "Tips" stat card | `formatCurrency(tips)` over the date range | Global SUM, method- & employee-agnostic | `revenue-stats.tsx:21, 44-45` ← `page.tsx:523` |
| `get_transaction_stats` RPC | `COALESCE(SUM(tip_amount),0)` | Global SUM; `paymentMethods` groups only on `total_amount` | `migrations/20260208000001:14` |
| POS EOD close + summary | `total_tips` (all) + `cash_tips` (cash rows); summary returns `payments_by_method.{cash,card}.tips` | Per-drawer-session, single-day, **method-only** | close `end-of-day/route.ts:59,74,124`; summary `summary/route.ts:75,92,106` |

The stat card is gated by `showTips = canViewEmployeeTips || canViewOwnTips` (`page.tsx:156-157,527`). Both permissions are **seeded but functionally dead beyond toggling this one card** (`20260211000007:151-152`); `reports.employee_tips` ("View tip reports for all employees") **overpromises** — it gates a business-wide aggregate.

**Adjacent surface (not a report):** Session #157 added a per-row **Detailer** column to the Transactions list (`page.tsx:259, 768`, CSV `:946-948`). It places a detailer name on the same row as `tip_amount` but performs **no grouping/summation** — one-row-per-transaction display only. The recipient dimension is already joined into the SELECT, just not tip-aware.

### 5.2 New reporting needs

1. **Per-employee daily/weekly/monthly tip totals** — **blocked at the data layer** (no employee↔tip link; §2.1 / §4). Impossible until attribution exists.
2. **Per-ticket distribution** (date, txn#, detailer, method, tip, detailer share, cashier share) — the share columns depend on §4's split engine.
3. **Cash-vs-card breakdown** — **already derivable** from `payments.method` per row and `cash_drawers.cash_tips`/`total_tips`. *Inherit-guard:* the EOD status windows disagree (`['completed','partial_refund']` close vs `+ 'refunded'` summary — Appendix A bug #7); a Tips report must pick one and document it.

### 5.3 Surface-location decision

**Decision: new `/admin/reports/tips` page**, cloned from the Payments Report.

| Option | Verdict | Rationale |
|---|---|---|
| Extend `revenue-stats` Tips card | Reject | Single scalar (`revenue-stats.tsx:44-45`); per-employee × period × method is tabular/grouped/exportable |
| Employee detail page widget | Reject (for all-employee view) | Fine for the `own_tips` slice; the cross-employee report needs date + method filters + CSV |
| **New `/admin/reports/tips`** | **Adopt** | Reports parent built for siblings (`roles.ts:26-39`); one-line nav addition |

**Closest template:** `admin/reports/payments/page.tsx` — date `from`/`to` (`:58-59`), Supabase fetch joined to transactions for date filtering (`:73-80`), `useMemo` grouping, totals row, client-side CSV (`:139-170`), permission gate. A Tips report swaps the GROUP key from `(method, digital_platform)` to `employee` (or `(employee, method)`). **Blocked until §4 supplies tip→employee attribution**; without it, only the cash-vs-card and per-ticket-without-share slices render.

### 5.4 Filter UX reuse

- **Raw `from`/`to` `<input type=date>`** — Payments Report pattern (`payments/page.tsx:185-209`) with PST helpers `todayPst()`/`firstOfMonthPst()` (`:37-45`). **Simplest reuse.**
- **Preset helper `computeDateRange`** (Today/Week/Month/Year/All) — defined **inline** in `admin/transactions/page.tsx:102-133`, **not exported**. Reusing means extracting to `src/lib/utils` (REUSE-FIRST: one util, two consumers).
- **Do NOT reuse** `src/lib/utils/schedule-date-range.ts` — future-only-clamped + 31-day-capped (`:13-18`), structurally unable to express a historical range.

### 5.5 CSV export reuse

| Pattern | Cite | Escaping | Fit |
|---|---|---|---|
| Payments Report hand-rolled `downloadCsv` | `payments/page.tsx:139-170` | **None** (`:149-159`) | Closest shape, **but inherits a CSV-injection bug** (Appendix A bug #14) — detailer names like "Smith, Jr." corrupt rows |
| `DataTable.handleExportCsv` | `data-table.tsx:161-215` | **Yes** (`escapeCsvField` `:191`) | Better for flat row lists |

**Decision:** clone the Payments Report's `downloadCsv` shape but **adopt `escapeCsvField` from `data-table.tsx:191`** — a Tips report emits employee names + method labels, exactly the free-text fields that break the unescaped exporter. Do not copy the unescaped join verbatim.

### 5.6 Employee self-visibility (POS) vs admin-only

**Decision required.** The schema anticipates two tiers via `reports.employee_tips` (all) and `reports.own_tips` (own) (`20260211000007:151-152`). Today both gate the **same** business-wide aggregate (`page.tsx:156-157,527`) — **a detailer granted only `reports.own_tips` sees the full-business total, a permission-intent violation** (Appendix A bug #6; do not preserve in the new report).

**Recommendation:** `/admin/reports/tips` = all-employee report gated by `reports.employee_tips`; a separate POS-side "My Tips" view gated by `reports.own_tips`, self-scoped to the logged-in PIN employee — finally backing the two permissions with the data they were named for.

### 5.7 QuickBooks treatment (per R6)

Tips are **entirely absent from QBO** (verified: dropped, not rolled in). `sync-transaction.ts:176-180` omits `tip_amount` from the SELECT; the SalesReceipt `Line` is items + optional `DiscountLineDetail` only (`:279-300`). Because `total_amount` excludes tip (`transaction-totals.ts:56-65`), there's **no double-count**, but QBO **under-reports actual cash received by the full tip** per ticket (Appendix A bug #9).

**Decision: add tips to QBO as a separate, non-taxable line — not rolled into service lines.** Reuse the `DiscountLineDetail` append precedent (`:291-300`) and the `getQboSetting('qbo_income_account_id')` pattern (`:209`) for a new `qbo_tip_account_id`. Add `tip_amount` to the SELECT (`:176-180`). **Open accounting-policy questions (operator, not engineering):** (1) income vs liability/pass-through account; (2) non-taxable line flag; (3) go-forward vs back-fill. **Out of Item 4's tactical scope per this audit** — flagged.

---

## 6. Cross-Feature Dependencies

### 6.1 The dependency chain (capture → splitting → reporting)

```
[4a CAPTURE]            [4b SPLITTING]                [4c REPORTING]
cash tip amount    ->   amount attributed to    ->   per-employee /
on a transaction        recipient(s) by role %       per-method rollups
(tip_amount exists      (NO attribution column       (NO per-employee
 today; cash UI         today; needs recipient        report today; needs
 writes 0)              dimension + role tip%)        attributed data)
```

| Layer | Produces | Requires from below | Current state |
|---|---|---|---|
| **4a Capture** | A tip *amount* on a transaction | Nothing — columns exist (`20260201000016:12`, `20260201000018:6`) | Cash writes `0` (`cash-payment.tsx:88,123`); no post-completion edit (`transactions/[id]/route.ts:129,243`) |
| **4b Splitting** | An *attribution* of each tip to recipient(s) weighted by role % | A captured amount **and** a recipient dimension + role `tip_pct` | No per-employee attribution; `payments` no `employee_id`; `roles` no numeric column |
| **4c Reporting** | Per-employee/method/date rollups + CSV | Attributed data (4b) for *per-employee*; can report *un-attributed* totals from 4a alone | No `/admin/reports/tips`; permissions back only the aggregate card |

**Hard dependency: 4c-per-employee → 4b.** A per-employee report is uncomputable from today's columns. **Soft dependency: 4b → 4a.** Split math can run on *card* tips that already exist, so splitting is not strictly gated on cash capture.

### 6.2 Is incremental ship viable?

- **Ship 4a (cash capture) alone — YES, highest-value, lowest-risk.** Cash tips are lost today; capturing them improves the global Tips card, EOD rollups, and every receipt surface with **zero schema change**.
- **Ship 4a + 4b without 4c — YES but low standalone value.** Splitting with no report is mostly invisible. **Recommend NOT shipping 4b in isolation.**
- **Ship 4c (global/per-method) on existing tips first — YES, recommended early win.** Fully computable today; gives the seeded permissions a real home; clonable template. The *per-employee* dimension waits for 4b.

### 6.3 Recommendation

1. **4a cash capture** (no schema dep, recovers data).
2. **4c reporting (global + per-method)** (clonable, works on captured tips).
3. **4b splitting + 4c per-employee** together last (splitting is only meaningful once reportable; both need the new attribution + role `tip_pct`).

This converts a "3-feature monolith" into three independently-shippable, independently-rollback-able slices, deferring the schema-heavy attribution work to the final slice where it is unavoidable.

---

## 7. Implementation Plan Recommendation

### 7.1 Recommended sub-feature ordering (evidence-based)

| Order | Slice | Why this position | Schema? |
|---|---|---|---|
| 1 | **4a-cash** — in-checkout cash tip capture | Zero schema dep; columns exist. Recovers data lost at `cash-payment.tsx:88,123`. | No |
| 2 | **4a-post** — post-completion "Add Cash Tip" | Builds on 4a-cash; new PATCH branch (void-only today, `:129,243`) + loyalty recalc + audit | Maybe (`tip_payment_method`, §7.3) |
| 3 | **4c-global** — Tips report (global + per-method) | Clonable (`payments/page.tsx:56`); nav + permissions ready. No attribution needed. | No |
| 4 | **4b** — splitting config (role `tip_pct`) + attribution | Blocked on recipient dimension + role numeric column — both absent. Largest schema scope. | **Yes** |
| 5 | **4c-employee** — per-employee rows | Strictly downstream of 4b's attribution | Uses 4b schema |

### 7.2 Parallelization — verified sequential

Sequential, not parallelizable: (a) **shared files** — slices 1–2 touch the POS checkout cluster; 3 and 5 touch the same report page; (b) **data dependency** — 4c-employee can't compute against attribution 4b hasn't defined. The one defensible parallel split is **4a-cash (checkout)** vs **4c-global (report)** (disjoint files) — but given Memory #8 and single-developer cadence, sequential is recommended.

### 7.3 Schema migrations needed + when they fire

| Migration | Fires before | Rationale / shape | Money-unit |
|---|---|---|---|
| `transactions.tip_payment_method` (text/enum `'card' \| 'cash' \| 'mixed'`) | Slice 2 | Classification flag, not money. Transaction grain so Phase 3 re-parents it for free. Justified by mixed-method post-completion add. | n/a |
| `roles.tip_pct` (`NUMERIC(5,2)`) | Slice 4 | No numeric column on `roles` today; editor boolean-only. Default Cashier 0 / Detailer 100. | percentage, not money |
| Attribution storage for 4b | Slice 4 | **Recommend compute-on-read** (zero Phase-3 risk). Persist `tip_splits` ONLY if immutable payroll snapshots required; key by `transaction_id` mirroring `payments`. | see §11 |

**Money-unit conflict must be resolved BEFORE any new tip-amount column** (§11). Recommendation if persistence chosen: `NUMERIC(10,2)` dollars to match the family. The `tip_payment_method` flag carries no amount and sidesteps this.

### 7.4 Testing strategy per slice

| Slice | Unit | Integration | UAT |
|---|---|---|---|
| 4a-cash | tip→`tip_amount` mapping; change/short keypad math | POST persists non-zero tip at both grains; split cash-leg | cash sale w/ tip → receipt Tip line + EOD `cash_tips` |
| 4a-post | PATCH input validation; loyalty delta; audit row shape | PATCH writes tip + payments row so grains reconcile (no DB CHECK — §7.6) | add cash tip to completed txn; loyalty re-earn + audit |
| 4c-global | date grouping; **CSV escaping** (reuse `escapeCsvField` `data-table.tsx:191`) | RPC totals vs report totals; EOD status-window mismatch | Today/Week/Month tips; CSV with comma-bearing labels |
| 4b | split math (role %, multi-detailer equal); compute-on-read shares | attribution join; ticketless/retail fallback | manager sets role %; verify shares |
| 4c-employee | per-employee aggregation; `own_tips` vs `employee_tips` scoping | rollup matches sum of attributed tips | detailer w/ `own_tips` sees only theirs |

### 7.5 Rollback / deploy risk per slice

| Slice | Risk | Rollback |
|---|---|---|
| 4a-cash | **Low** — additive UI; no schema | Revert UI; tip falls back to 0 |
| 4a-post | **Medium** — new mutation path; loyalty + audit; first tip column | Revert route + migration (nullable column safe to leave) |
| 4c-global | **Low** — read-only, no writes/schema | Remove nav child + page |
| 4b | **High** — new schema, role-editor change, split engine; Phase 3 interaction | Compute-on-read keeps rollback clean; a persisted table raises cost |
| 4c-employee | **Low–Medium** — read-only, depends on 4b data | Hide per-employee section |

### 7.6 UAT requirements

- **4a-cash:** cash sale with tip → receipt Tip line; `cash_drawers.cash_tips` increments; split cash leg per locked decision.
- **4a-post:** "Add Cash Tip" updates `tip_amount`, **re-calculates loyalty**, writes `audit_log`. Verify no `transactions.tip_amount` vs `SUM(payments.tip_amount)` drift (no CHECK enforces it).
- **4c-global:** Today/Week/Month/Year/Custom; per-method totals match EOD; CSV opens cleanly with comma/quote fields.
- **4b:** role tip % editable (default Cashier 0 / Detailer 100); multi-detailer equal-split; ticketless attribution explicit (not a silent drop).
- **4c-employee:** `own_tips` shows only the signed-in employee's tips; `employee_tips` shows all.

### 7.7 Phase 3 compatibility notes

Phase 3 collapses deposit + balance + close-out into one canonical row, keeping `transactions.tip_amount` but changing its parent row (`ROADMAP:36`). Item 4 must keep new attribution at transaction grain (a `tip_payment_method` flag rides along) or mirror the `payments` FK shape (a `tip_splits` table keyed by `transaction_id` gets re-parented like `payments`). **Prefer compute-on-read** (zero re-parenting). **Avoid** a method/split table keyed to the deposit/balance/close-out rows Phase 3 collapses. See §11.

---

## 8. Open Questions for Operator

Every unresolved decision the audit surfaced, with the recommended default. Must be resolved before Item 4 ships any schema.

1. **Cash-tip capture UX location?** Orphaned `TipScreen` (`tip-screen.tsx:1-151`) is dead code; live cash flow hardcodes `0` (`cash-payment.tsx:88,123`). **Default:** add a tip input to the existing `cash-payment.tsx` keypad (reading `checkout.tipAmount`, `checkout-context.tsx:24-25`) **plus** a post-completion "Add Cash Tip" PATCH — do NOT resurrect the unwired `TipScreen` as a step.
2. **Is the cash-tip amount required, or is $0 a valid silent entry?** **Default:** optional with $0 default — never block checkout, matching the card-tip silent-zero behavior.
3. **Split definition — %, fixed-$, or operator-entered per txn?** **Default:** role-level `roles.tip_pct`, computed-on-read at report time.
4. **Default split rule when no role config?** **Default:** Cashier 0% / Detailer 100%; multiple detailers split equally — but today a ticket has exactly ONE detailer (`jobs.assigned_staff_id` single FK; `jobs.appointment_id` UNIQUE), so single-detailer split is the only buildable default without a schema change (§10).
5. **Whose tip — cashier or detailer?** `transactions.employee_id` is the cashier; detailer is via `jobs.assigned_staff_id`. **Default:** detailer (path already wired into the admin SELECT), with cashier share governed by `roles.tip_pct` (Cashier 0% default).
6. **Ticketless/retail and multi-job attribution?** Walk-in sales have no detailer; `jobs.transaction_id` non-unique → multiple jobs (admin picks "first non-cancelled"). **Default:** ticketless → 100% cashier fallback; multi-job → flag for operator, do not silently pick the first for payroll-grade allocation.
7. **Tips report — Admin or POS?** **Default:** primary report `Admin > Reports > Tips` (clone of `payments/page.tsx`, slot under `roles.ts:28-39`); defer POS-side "own tips" self-view to a follow-up.
8. **Own tips vs full business total?** Today both permissions gate the same global card (likely permission-intent violation, Appendix A bug #6). **Default:** `reports.own_tips` filters to the requesting employee's tips; `reports.employee_tips` shows all.
9. **QBO tip handling?** Tips entirely absent from QBO today (accounting-completeness gap). **Default:** out of Item 4's tactical scope — flag explicitly; if added, a non-taxable tip line mirroring `DiscountLineDetail` (`sync-transaction.ts:291-300`) + a `qbo_tip_account_id` setting; decide income vs liability account first.
10. **Round-off on split allocations?** **Default:** integer-cents floor + assign residual cent(s) to the highest-share/primary recipient so the sum equals the source tip.
11. **Refund behavior for splits?** **Default:** compute-on-read needs no special handling (re-derives from live `tip_amount`); a persisted table MUST reverse allocations on refund — the decisive argument for compute-on-read.
12. **Who can EDIT a split after the fact?** **Default:** manager-PIN-gated, recorded via `logAudit` with a new `'tip_split'` `AuditEntityType`.
13. **Cents-now vs dollars-now — and resolve the doc conflict FIRST.** CLAUDE.md #20 (cents) vs MONEY.md (dollars, epic closed). **Default:** RESOLVE the conflict (update CLAUDE.md #20 to reflect closure) before any column; then make any new tip-amount column `NUMERIC(10,2)` dollars to match its family. The flag and `roles.tip_pct` are not money columns and are unaffected. See §11.
14. **Post-completion add — mutate the canonical row, or append a payment row?** **Default:** append a cash `payments` row AND update `transactions.tip_amount` together, so both grains stay reconciled (no CHECK enforces equality).

---

## 9. Reuse-First Findings

Verdict: **reuse** (existing infra fully covers), **partial** (covers part), **net-new** (nothing found).

| Need | Existing infra (file:line) | Verdict |
|---|---|---|
| Per-transaction tip amount | `transactions.tip_amount` (`20260201000016:12`) | **reuse** |
| Per-payment tip amount (splits) | `payments.tip_amount`/`tip_net` (`20260201000018:6-7`) | **reuse** |
| Per-tip cash-vs-card inference | `payments.method` (`20260201000018:4`); `cash_drawers.cash_tips` (`20260201000042:13`) | **partial** — implicit per-payment works; post-completion mixed-method add needs a marker (§10) |
| Drawer cash-vs-total split | `cash_drawers.cash_tips` + `total_tips` (`20260201000042:13,18`); EOD split (`summary/route.ts:92`) | **reuse** |
| Total-including-tip formula | `computeGrandTotal()` (`transaction-totals.ts:56-65`) | **reuse** |
| Tip display formatting | `formatCurrency` (`format.ts:25`) on receipts/detail/list/card | **reuse** (legacy dollars; `formatMoney` only if family migrates) |
| Admin transactions Tip column + CSV | shipped Session #156 (`admin/transactions/page.tsx:643,843,911,948`) | **reuse** |
| Detailer identity on the txn row | `appointment_id → jobs → assigned_staff_id`, embedded (`admin/transactions/page.tsx:259,768`) | **partial** — one join away but not tip-aware; single-detailer only |
| Tip recipient dimension | `employees` table | **partial** — recipient exists, no tip/commission column (`database.types.ts:1906-1923`) |
| Per-employee tip attribution | none — `payments` no `employee_id`; `transactions.employee_id` is cashier; `appointment_services` no detailer | **net-new** |
| Multi-detailer-per-ticket | none — `jobs.appointment_id` UNIQUE; `jobs.assigned_staff_id` single FK | **net-new** |
| Role-level Tip% column | none — `roles` boolean/text (`20260211000007:10-21`); editor boolean-only | **net-new** |
| Tip-split persistence | none — no `tip_split`/`tip_allocation`/`tip_pool`/`tip_distribution` anywhere | **net-new** (only if persistence chosen; recommend compute-on-read) |
| Tip reporting permissions | `reports.employee_tips` + `reports.own_tips` (`20260211000007:151-152`) | **reuse** (back only the aggregate card today) |
| Admin report page template | `admin/reports/payments/page.tsx:56` (date range + grouped + CSV) | **reuse** (clone to `/admin/reports/tips`) |
| Reports nav slot | `src/lib/auth/roles.ts:28-39` | **reuse** (one-line child) |
| Safe CSV export | `escapeCsvField` (`data-table.tsx:191`) | **reuse** — NOTE Payments Report's `downloadCsv` (`:149-159`) does NOT escape; use `escapeCsvField` |
| Date-range presets | `computeDateRange` inline (`admin/transactions/page.tsx:102`) | **partial** — extract to `src/lib/utils` (do NOT reuse `schedule-date-range.ts`, future-only) |
| PST date helpers | `todayPst()`/`firstOfMonthPst()` (`reports/payments/page.tsx:37-45`) | **partial** — reusable if extracted |
| Money cents conversion (if cents) | `toCents`/`fromCents` (`money.ts`); composer converts internally (`receipt-composer.ts:633,764`) | **reuse** |
| Audit trail for split changes | `logAudit` (`audit.ts:21`) + `buildChangeDetails` (`:55`) | **reuse** (add `'tip_split'` to `AuditEntityType`) |
| QBO non-item line append | `DiscountLineDetail` (`sync-transaction.ts:291-300`) + `getQboSetting('qbo_income_account_id')` (`:209`) | **partial** — pattern reusable; no tip helper; `tip_amount` not in SELECT |
| Post-completion tip add PATCH | none — `transactions/[id]` PATCH void-only (`:113,129,243`) | **net-new** (mirror void branch; reuse `tip_amount`/`payments`) |

---

## 10. Schema Change Inventory

Money columns follow §8 Q13's recommended default — **`NUMERIC(10,2)` dollars** to match the existing all-dollars family (NOT cents), per the MONEY.md closure (`:301-304`); **requires resolving the CLAUDE.md #20 vs MONEY.md conflict first** (§11).

### Required new schema

| # | Name | Type | Why reuse does NOT cover it | Session |
|---|---|---|---|---|
| 1 | `transactions.tip_payment_method` | `text` / enum (`'card' \| 'cash' \| 'mixed'`) | `payments.method` gives per-row method, but a post-completion cash-tip-add creates a **mixed-method** transaction; the transaction grain needs a single classification marker that survives Phase 3's row-collapse without re-parenting. No existing transaction-grain tip-method column. | B (cash DB+UX) |
| 2 | `roles.tip_pct` | `NUMERIC(5,2)` (percentage 0–100; NOT money) | `roles` is boolean/text only (`20260211000007:10-21`); `employees` has only `hourly_rate`. No numeric config column exists; requires a new numeric control in the boolean-only role editor (`admin/staff/roles/page.tsx:688-699`). | E (splitting config) |

### Conditional new schema (only if a question resolves toward persistence/multi-detailer)

| # | Name | Type | Trigger | Session |
|---|---|---|---|---|
| 3 | `tip_splits` table (`id`, `transaction_id` FK, `employee_id` FK, `share` NUMERIC(10,2) **or** `share_cents`, `share_basis`, `created_at`) | table | **Only if Q3/Q11 resolve toward PERSISTED splits.** Key by `transaction_id` mirroring `payments` so Phase 3 re-parents identically. **Audit recommends compute-on-read to avoid this entirely** (zero re-parenting + zero refund-reversal logic). | E |
| 4 | `appointment_services.detailer_id` FK **OR** `job_detailers` junction | column / table | **Only if multi-detailer-per-ticket is in scope.** Today `jobs.assigned_staff_id` is single-valued + `jobs.appointment_id` UNIQUE, so per-service attribution is unrepresentable. **Audit recommends single-detailer (no schema change) initially.** | future / out of initial scope |
| 5 | `business_settings` JSONB key `qbo_tip_account_id` | JSONB key / setting | **Only if Q9 resolves toward syncing tips to QBO.** Reuses `getQboSetting` (`sync-transaction.ts:209`). **Out of Item 4's tactical scope.** | future / out of scope |

### Non-schema changes (no new column/table, but new code)

| Change | Reused target | Session |
|---|---|---|
| Add `'tip_split'` to `AuditEntityType` union | `src/lib/supabase/types.ts` (`logAudit` reuse) | E |
| Add `tip_amount` to QBO SELECT + non-taxable tip line | `sync-transaction.ts:176-180` + `:291-300` | future (Q9) |
| New PATCH branch for post-completion tip add | `pos/transactions/[id]/route.ts:113` (mirror void); writes `tip_amount` + new `payments` row | B |

### No schema change needed (fully covered by reuse)

`transactions.tip_amount`; `payments.tip_amount`/`tip_net`; `cash_drawers.cash_tips`/`total_tips`; tip recipient identity (single detailer via `jobs.assigned_staff_id`); tip reporting permissions; Tips report page scaffold (clone `payments/page.tsx`); Reports nav entry; safe CSV (`escapeCsvField`); total-with-tip math (`computeGrandTotal`); audit logging (`logAudit`).

**Net assessment:** Following the audit's recommended defaults (compute-on-read splits, single-detailer scope, dollars-now, QBO deferred), Item 4 requires only **2 new columns** (`transactions.tip_payment_method`, `roles.tip_pct`) plus reused infrastructure — far smaller than the 2026-05-15 spec implied.

---

## 11. Phase 3 / Money-Unify Compatibility Notes

### 11.1 Current storage unit of every tip column

All tip money is `NUMERIC(10,2)` **dollars** — no `_cents` variant anywhere. The write-side math confirms it: `pos/transactions/route.ts:387-389` does `Math.round(tip*(1-CC_FEE_RATE)*100)/100` (dollar-rounding to 2 decimals, not a cents value); the pay-link webhook writes `tip_amount: tipDollars`/`tip_net: tipNetDollars` (`webhooks/stripe/route.ts:223,264-265`). TS types are plain `number` (`database.types.ts:778/794, 3542/3543, 6135`).

### 11.2 Which Money-Unify phase migrates these to cents? — NONE

**The epic was closed permanently on 2026-05-15** (`MONEY.md:292`). The closure names `transactions` among the tables that **stay `NUMERIC(10,2)` dollars indefinitely**:

> `MONEY.md:301-304` — "Storage layer stays as NUMERIC(10,2) dollars for catalog …, orders + order_items, **transactions**, appointments, quotes, coupons, customers, and all other money-bearing tables not already migrated."

Only the Inventory family (Unify-2) shipped cents columns and is kept (`MONEY.md:305-306`). **So no phase migrates the tip columns to cents.** *(Author-verified: the closure block and the stale row both exist in MONEY.md.)*

**Stale-doc hazard (Appendix A bug #10):** `MONEY.md:197` still lists Family A (`transactions, …, payments, …, cash_drawers`) as **"Pending (Unify-5)"** — not updated when the closure was recorded ~95 lines below. The closure (`:292-336`) supersedes the table; the row should be corrected.

### 11.3 The CLAUDE.md #20 conflict (must resolve before any column)

| Authority | Recency | Prescribes for a NEW tip column |
|---|---|---|
| `CLAUDE.md:38` (#20) | "in progress" framing (stale) | integer cents (`_cents`) |
| `MONEY.md:292-313` | 2026-05-15 closure (current; CLAUDE.md's ref table designates MONEY.md canonical) | `NUMERIC(10,2)` dollars, per-family consistency |

**These prescribe opposite units.** **Recommendation:** update CLAUDE.md #20 to reflect the closure before Item 4 authors any column.

### 11.4 What Phase 3 reworks about tip persistence

Phase 3 (single-transaction lifecycle; **not started** — Phase 1 Session #158 + Phase 2 Batch M Session #164 done) changes **which transaction row a tip attaches to, not the unit or column name**:

> `ROADMAP:36` — "this tip will migrate to the unified transaction row." Session #159 ledger — "same `transactions.tip_amount` column, different parent row."

Re-migration risk for Item 4 turns on **grain**:

| Item 4 addition | Grain | Survives Phase 3? | Why |
|---|---|---|---|
| `transactions.tip_payment_method` flag | transaction | **Yes** | re-parented for free alongside `tip_amount` |
| `tip_splits` table keyed by `transaction_id` | per-txn/allocation | **At risk** | if keyed to deposit/balance/close-out rows, must re-parent like `payments` |
| Split **computed-on-read** | n/a | **Yes** | nothing persisted |
| `roles.tip_pct` | role | **Yes** | orthogonal to transaction lifecycle |

### 11.5 Defensive-design recommendations

1. **Cash-vs-card flag — reuse `payments.method`;** add a transaction-grain `tip_payment_method` only if a mixed-method post-completion add forces a single per-ticket classification. Avoid a method table keyed to collapsing rows.
2. **Tip splitting — prefer COMPUTE-ON-READ.** Derive shares from `transactions.tip_amount` × `roles.tip_pct` across cashier (`transactions.employee_id`) + detailer (`jobs.assigned_staff_id`, already embedded `admin/transactions/page.tsx:259`). Zero Phase-3 risk. If persisted, key by `transaction_id`, store an immutable snapshot (the `price_at_booking` pattern), and document Phase 3 must re-parent it.
3. **Do NOT add a new tip-AMOUNT column.** Reuse `transactions.tip_amount`. The cash-vs-card flag is a classification field (not money), so it doesn't trigger the cents-vs-dollars decision. Adding a third tip-amount surface would compound the existing `transactions.tip_amount` vs `SUM(payments.tip_amount)` reconciliation gap (Appendix A bug #3).
4. **Role "Tip %" — new `NUMERIC` column on `roles`** (a percentage, not money — Money-Unify is irrelevant). Add a numeric control to the boolean-only editor.
5. **If a split table IS persisted, resolve the doc conflict first, then pick ONE unit for the whole feature.** Recommended: `NUMERIC(10,2)` dollars (family consistency; a lone `_cents` recreates the Unify-3 rollback drift `MONEY.md:262-280`). If CLAUDE.md #20 is honored literally, all tip-amount touches go cents together (ideally with a paired `tip_amount` migration) — a much larger scope inconsistent with Item 4's tactical framing.

**Blocking operator question:** Resolve the §11.3 unit conflict, and confirm whether the post-completion add mutates the canonical row or appends a `payments` row (interacts with Phase 3's single-row model + `cash_drawers.cash_tips`).

---

## 12. Per-Session Scope Estimates

Estimates assume the §7.1 ordering. LoC = net new + modified. Memory #8 = keep sessions scoped; anything > ~6–8 files or ~400 LoC, or mixing a migration with broad UI, is flagged.

| Session | Sub-feature | Files (est) | LoC (est) | Migrations | Risk | Memory #8 |
|---|---|---|---|---|---|---|
| **S1** | 4a-cash — in-checkout capture | 4–5 (`cash-payment.tsx`, `checkout-context.tsx`, adapt `tip-screen.tsx`, `checkout-overlay.tsx`, test) | ~180–260 | none | Low | OK |
| **S2** | 4a-post — post-completion add (PATCH + loyalty + audit) | 4–5 (`transactions/[id]/route.ts`, `transaction-detail.tsx`, loyalty helper, `audit.ts` entity-type, `tip_payment_method` migration) | ~220–320 | 1 | Medium | OK |
| **S3** | 4c-global — Tips report + CSV | 3–4 (new `reports/tips/page.tsx`, `roles.ts` nav child, reuse `escapeCsvField`, optional RPC extension) | ~250–380 | 0–1 | Low | OK |
| **S4** | 4b — role `tip_pct` + Role Mgmt UI | 4–5 (`roles.tip_pct` migration, `roles/route.ts:130` body parse, `roles/page.tsx` numeric control, GET shape, test) | ~220–300 | 1 | Medium | OK |
| **S5** | 4b — split engine + attribution (compute-on-read) | 5–7 (split-calc lib, attribution join helper, ticketless fallback, wire into S3, tests) | ~350–520 | 0 (/+1 if persisted) | **High** | **FLAG** |
| **S6** | 4c-employee — per-employee rows + `own_tips`/`employee_tips` scoping | 2–3 (extend report, scoped query, test) | ~150–240 | 0 | Low–Medium | OK |

### Memory #8 flags & proposed split

- **S5 is the one over-large session** — bundles (a) share-math engine, (b) the `txn → appointment → job → assigned_staff_id` attribution join, (c) ticketless/retail + multi-job edge cases (`admin/transactions/page.tsx:57-60` "first non-cancelled" heuristic). ~350–520 LoC / 5–7 files + possible migration. **Proposed split:**
  - **S5a — Attribution resolver** (~150–200 LoC): read-side helper resolving recipient(s), handling ticketless (no `appointment_id`) + multi-job. Pure function, unit-testable.
  - **S5b — Split math + report wiring** (~200–320 LoC): consumes S5a + `roles.tip_pct`, computes shares (multi-detailer equal-split), surfaces in the S3 report. If a `tip_splits` table is adopted, its Phase-3-safe migration lands here.
- **S2 carries a migration alongside a mutation path + loyalty recalc.** Within bounds, but if loyalty recalc proves involved, split the `tip_payment_method` migration into its own follow-up (additive/nullable, lands first with no app dependency) — per the operator Memory note on isolating schema migrations from app code.
- **S3's RPC extension is conditional.** A Tips report can derive per-method from `payments` directly without touching `get_transaction_stats` — keeping S3 migration-free is the lower-risk, comfortably-scoped path.

All other sessions sit within ~5 files / ≤~380 LoC and are appropriately scoped.

---

## Appendix A — Latent Bugs / Hazards Flagged (out of scope — flag only)

Per the audit mandate, these are flagged, not fixed.

| # | Severity | Issue | Cite |
|---|---|---|---|
| 1 | Feature gap (S0) | Cash payment never prompts for a tip — hardcoded `tip_amount: 0` at both grains (online + payments array); offline path writes no tip field | `cash-payment.tsx:88, 123, 155-189` |
| 2 | Data loss | Offline sync re-hardcodes `tip_amount: 0` on replay — even a fixed cash UI would lose the tip unless the queue payload is extended | `sync-offline-transaction/route.ts:85` |
| 3 | Integrity | No DB CHECK/trigger reconciles `transactions.tip_amount` vs `SUM(payments.tip_amount)` — current equality is an emergent client coincidence; silent drift possible | `20260201000016:12` vs `20260201000018:6` |
| 4 | Consistency | `cash_drawers` tip rollups (`cash_tips`/`total_tips`) computed at close-out with no enforced consistency — a later void/refund drifts the aggregate | `20260201000042:13,18` |
| 5 | Drift risk | Tip-display formatting split between `formatCurrency` (UI) and inline `$${x.toFixed(2)}` (receipt templates + email) — a future locale/symbol change wouldn't propagate to receipts | `receipt-template.ts:708, 1180`; `email/route.ts:81` vs `format.ts:25` |
| 6 | Permission-intent | `reports.own_tips` shows the full-business tip total, not the employee's own — both tip permissions gate the same aggregate card | `admin/transactions/page.tsx:156-157, 527` |
| 7 | Inconsistency | EOD close sums tips over `['completed','partial_refund']` while the summary endpoint also includes `'refunded'` — the two daily tip totals can disagree | `end-of-day/route.ts:48-53` vs `summary/route.ts:27` |
| 8 | Dead column | `payments.tip_net` is write-only — set by 5 writers, read by 0 consumers; the card-vs-cash net distinction has no functional effect today | repo-wide `tip_net` grep |
| 9 | Accounting | Tips are entirely dropped from QBO sync — QuickBooks under-reports actual cash received by the full tip on every tipped ticket | `sync-transaction.ts:176-180, 279-314` |
| 10 | Stale doc | `MONEY.md:197` lists Family A as "Pending (Unify-5)" contradicting the permanent-closure decision below it | `MONEY.md:197` vs `:292-336` |
| 11 | Doc conflict | CLAUDE.md #20 (cents, "in progress") vs MONEY.md (dollars, "closed") prescribe opposite units for new money code | `CLAUDE.md:38` vs `MONEY.md:301-313` |
| 12 | Non-determinism | Admin Transactions Detailer column uses a "first non-cancelled job" heuristic; non-deterministic if a transaction has two active jobs | `admin/transactions/page.tsx:57-60, 768` |
| 13 | UX/math | `change_given` computed on service total, not `total + tip` — must be revisited if cash-tip UX expects tendering service + tip | `cash-payment.tsx:43` |
| 14 | CSV injection | Payments Report `downloadCsv` joins raw values without escaping — comma/quote/newline fields corrupt the CSV; a cloned Tips report would inherit it | `admin/reports/payments/page.tsx:149-159` |

---

*End of audit. No code changed. Recommended next step: operator resolves the §11.3 money-unit doc conflict and the §8 open questions, then schedule slices per §7.1 (4a-cash first).*
