# POS Sale vs Quotes — Prerequisite + Add-On Gating Parity Audit (2026-05-28)

> ✅ **RESOLVED in Session #121 (Track A)** — `fix/track-a-useValidatedServiceAdd-shared-helper`.
> Target 5's recommended fix shipped exactly as specced: one surface-agnostic
> `useValidatedServiceAdd` hook (`src/app/pos/hooks/use-validated-service-add.tsx`) runs the add-on-only
> gate → prerequisite check → commit, and owns both warning dialogs + the prerequisite auto-add.
> All three surfaces route through it — Sale `catalog-browser` (byte-behavior-identical reference),
> Quotes `quote-builder` (search/picker + browse via new `customerIdOverride`/`vehicleIdOverride`/
> `serviceIdsOverride` props on `<CatalogBrowser>`, fixing the G5 wrong-context bug), and `register-tab`
> favorites (gained the prereq check it never had). Add-on-only solo = **warn + manager-PIN override**
> (reuses `pos.override_prerequisites`), mirroring the prereq override. +17 regression tests. The
> read-only diagnostic below is preserved as the original finding.

> Read-only diagnostic. No source/migration/test changes. No DB needed (pure code-path trace).
> Branch: `audit/pos-sale-vs-quotes-prereq-gating-parity`. Isolated `git worktree` off `origin/main` (`ab36cb56`).
> Builds on `POS_PREREQ_ENFORCEMENT_AND_GATING_AUDIT.md` (prior) and `POS_PREREQUISITE_PRICING_AUDIT.md` (#112).

## Context

Goal: pin the exact mechanism difference between the Sale (ticket) add path and the Quotes add path so the working pattern can be ported, and decide where add-on-only gating (Issue 2, never built) should live so one fix covers both checks in both surfaces.

## TL;DR

**The Quotes path is *not* missing the prerequisite check** — and this **corrects the prior audit's overgeneralization** ("register-tab + quote paths dispatch ADD_SERVICE directly"). `quote-builder.tsx` calls `checkPrerequisites` in **all** of its add paths and has since 2026-03-14 (`4afe5ed94`/`99ba7d2c5`). The genuine parity defect is **context, not absence**: the quote **browse** view delegates to `<CatalogBrowser>`, whose internal prerequisite check is **hardwired to the Sale-ticket context** (`useTicket()` → `ticket.customer/vehicle/items`, `catalog-browser.tsx:76-80`), *not* the quote's. The quote **search/picker** paths use the correct quote context (`quote-builder.tsx:221-225`). So in the browse view, quotes validate prerequisites against the wrong (sale-ticket) customer/vehicle/line-items — which can both **over-fire** (empty sale ticket) and, crucially, **silently under-fire** ("doesn't fire") when a concurrently-open Sale ticket already contains the prerequisite (it reads as "satisfied").

Reducers are pure (`ticket-reducer.ts` / `quote-reducer.ts` only *store* `prerequisiteNote`; no enforcement) — enforcement lives entirely at the component dispatch call sites.

Three surfaces, three states (the core finding):

| Surface | Add path | Calls `checkPrerequisites`? | Context used | Status |
|---|---|---|---|---|
| **Sale** | `catalog-browser` (search / browse / detail dialog / picker / custom) | **Yes** — all funnel through `addServiceChecked` | Sale ticket (correct) | ✓ works |
| **Sale** | `register-tab` favorites quick-add | **No** | — | ✗ no check at all (prior audit; re-verified 0 matches) |
| **Quotes** | `quote-builder` search + picker | **Yes** (`:314/:340/:354`) | Quote (correct) | ✓ works |
| **Quotes** | `quote-builder` **browse** (`<CatalogBrowser onAddService>`) | **Yes** (CatalogBrowser's own) | **Sale ticket (WRONG)** | ⚠ wrong context |

**Add-on-only gating:** genuinely absent on every surface (prior audit; no `classification` handling in any add path). **Recommended fix:** one shared *add-with-validation* helper that takes the surface's context explicitly and runs (a) add-on-only gate → (b) prerequisite check → (c) dispatch; route Sale (`catalog-browser`), Quotes (both views), and `register-tab` through it. This fixes the quote browse wrong-context bug, the register-tab no-check gap, and adds gating everywhere — one helper, both checks, three surfaces (CLAUDE.md Rule 11/22).

## Target 1 — Sale enforcement mechanism (the reference)

All Sale add paths funnel through **`addServiceChecked`** (`catalog-browser.tsx:199-247`), the single gate:
- `if (!skipPrereqCheck) { const result = await checkPrerequisites(svc, p, vsc, perUnitQty); if (!result.canAdd) return false; }` (`:211-213`) — runs **before** the dispatch/`onAddService` branch (`:217-244`).
- The check uses CatalogBrowser's `usePrerequisiteCheck` configured from the **live Sale ticket** (`:76-80`): `customerId: ticket.customer?.id`, `vehicleId: ticket.vehicle?.id`, `ticketServiceIds` from `ticket.items` (`:72-74`). Correct for Sale.
- Not satisfied → the hook sets `warning` → `<PrerequisiteWarningDialog>` (`:594-601`) → `handleAddPrerequisite` / `handlePrereqOverride` on confirm.

Funnels that reach `addServiceChecked`: `handleTapServiceDirect`→`quickAdd` (`:394-396`), `handleTapServiceDirectUnchecked`→`quickAdd` (`:497-499`), picker `handlePricingSelect` (`:452`), `handleCustomPriceSelect` (`:480`), and `ServiceDetailDialog` via `onPrerequisiteCheck` (`:591`; called at `service-detail-dialog.tsx:199-200`).

**The one Sale exception:** `register-tab.tsx` favorites quick-add dispatches `ADD_SERVICE` directly with **zero** prereq handling (re-verified: 0 matches for `prerequisite|checkPrereq|addServiceChecked`). So "Sale works" is true for the catalog-browser surface, not the favorites tiles.

## Target 2 — The Quotes "gap" (precisely)

`quote-builder.tsx` is **not** a direct-dispatch-without-check path. It:
- instantiates its own quote-context check: `usePrerequisiteCheck({ customerId: quote.customer?.id, vehicleId: quote.vehicle?.id, ticketServiceIds: quoteServiceIds })` (`:221-225`, `quoteServiceIds` from `quote.items` `:217-219`);
- **search view** (`ServiceGrid`, shown when `search` is non-empty, `:478-485`) → `handleTapServiceSearch` → `checkPrerequisites` (`:314`, `:340`) before dispatch ✓;
- **picker** `handlePricingSelect` → `checkPrerequisites` (`:354`) ✓;
- **browse view** (no search, the default, `:494-503`) → `<CatalogBrowser onAddService={handleAddService}>`. `handleAddService` (`:260-288`) dispatches without its own check **because CatalogBrowser already checked** — but CatalogBrowser checked against the **Sale ticket** (`catalog-browser.tsx:76-80`), not the quote.

**The defect (file:line):** `catalog-browser.tsx:76-80` reads prereq context from `useTicket()` unconditionally. CatalogBrowser accepts `vehicleSizeOverride`/`vehicleSpecialtyTierOverride` (`:43-46`, `:94-99`) so quote pricing uses the quote's vehicle size — but there is **no** `customerId`/`vehicleId`/`ticketServiceIds` override, so the prereq check cannot see the quote's customer, vehicle, or line-items. In quote mode the browse path therefore evaluates prerequisites against whatever is in the Sale ticket:
- `required_same_ticket` (e.g. Paint Correction Prep needs Express Exterior Wash): if a Sale ticket is open and already has the prerequisite, the check reads **satisfied → no warning** even though the quote lacks it → **"doesn't fire."** With an empty Sale ticket it over-fires.
- `required_history`: reads the Sale ticket's customer/vehicle (often null mid-quote) → wrong/again-empty history basis.

This is the leading code-level explanation for the operator's "doesn't fire in Quotes" (browse view + a populated Sale ticket, or simply the wrong-context inconsistency). It needs a one-line repro confirmation (search vs browse; was a Sale ticket open?).

## Target 3 — Is the prereq-check hook reusable in Quotes?

**Yes — it already is, and it's fully surface-agnostic.** `usePrerequisiteCheck` takes its context as plain options (`use-prerequisite-check.ts:28-32`: `{ customerId?, vehicleId?, ticketServiceIds }`) and POSTs them to the stateless endpoint. `quote-builder.tsx:221-225` already calls it with quote context correctly. The quote builder has everything the check needs — `quote.customer`, `quote.vehicle`, and `quote.items` → `quoteServiceIds` (`:217-219`). The only reusability gap is structural: **`<CatalogBrowser>` hardcodes the hook's options to `useTicket()`** instead of accepting them as props. No quote-specific variant of the hook is needed — only a way to pass quote context into CatalogBrowser (or to not route quote adds through CatalogBrowser's internal check).

## Target 4 — Where add-on-only gating should live

The natural home is the **same pre-dispatch chokepoint** that runs the prereq check. On the Sale side that is `addServiceChecked` (`catalog-browser.tsx:199-247`); a `classification === 'addon_only'` gate placed there (before/with the prereq check) would cover Sale browse + Quotes browse at once. But because the quote search/picker and register-tab paths each dispatch on their own, a gate *inside CatalogBrowser only* would miss them. → The gate belongs in a **shared helper used by every surface**, alongside the prereq check, so add-on-only enforcement and prerequisite enforcement are guaranteed to travel together everywhere.

## Target 5 — Port plan + blast radius + tests

**Recommended (canonical, Rule 11/22): extract one shared *add-with-validation* helper.**
A surface-agnostic hook, e.g. `useValidatedServiceAdd({ customerId, vehicleId, serviceIds, dispatchOrCallback })`, that:
1. runs the **add-on-only gate** (block/redirect when `classification === 'addon_only'` per the operator's chosen rule — hard block vs warn+manager-override mirroring the prereq override),
2. runs **`checkPrerequisites`** with the **caller's** context,
3. then dispatches / invokes the callback,
and owns the `PrerequisiteWarningDialog` + (new) add-on warning state.

Route through it:
- **Sale** `catalog-browser` — replace the internal `addServiceChecked` + `useTicket()`-bound hook with the shared helper fed the Sale ticket context (behavior-identical — the reference must not change).
- **Quotes** `quote-builder` — feed the helper quote context; both the search/picker handlers and the browse path use the same context (fixes the wrong-context browse bug).
- **register-tab** favorites — route the currently-unchecked dispatches through the helper (closes the no-check gap).

**Blast radius:** ~3 component files (`catalog-browser.tsx`, `quote-builder.tsx`, `register-tab.tsx`) + 1 new shared hook; reducers untouched; endpoint untouched; `usePrerequisiteCheck` untouched (the helper wraps it). **Risk:** the Sale catalog-browser path is the reference and must stay byte-behavior-identical — the safest sequencing is (a) extract helper from the existing `addServiceChecked` with Sale context and prove Sale tests still green, then (b) adopt in Quotes, then (c) adopt in register-tab.

*Minimal alternative (if a smaller change is preferred first):* add `customerIdOverride`/`vehicleIdOverride`/`serviceIdsOverride` props to `<CatalogBrowser>` (mirroring `vehicleSizeOverride`) and pass quote context from `quote-builder` — fixes only the quote browse wrong-context bug, not register-tab and not gating. Not recommended as the end state (leaves the 3-way duplication the prior audits flagged).

**Regression tests to add** (the per-add-path detection assertions that never existed):
- "prereq warning fires when adding an add-on with an unmet `required_same_ticket` prereq" — once per surface: Sale catalog-browser, Sale register-tab favorites, Quotes search, **Quotes browse** (the bug), and Quotes uses **quote** context (a service present in the quote but not the Sale ticket reads satisfied).
- "add-on-only service is blocked/warned when added solo" — per surface.
- "Sale catalog-browser behavior unchanged" — snapshot/parity guard on the reference path.

## Target 6 — Does the fix fold in register-tab?

**Yes — register-tab is the third surface and should be included in the same arc.** It currently has *no* prereq check at all (worse than Quotes, which checks but with wrong context in browse). The shared helper (Target 5) closes all three in one mechanism: Sale (already correct, just refactored behind the helper), Quotes (correct context for both views), and register-tab (gains the check it never had) — plus add-on-only gating across all three. Splitting them would re-duplicate the exact logic the prior audits flagged. Recommend one fix arc covering all three surfaces + both checks.

## Open questions for the operator

1. **Exact quote repro:** when a prerequisite "didn't fire" in Quotes, was the service added via the **search box** (type → tap result) or by **browsing categories** (the `CatalogBrowser` view)? And was a **Sale ticket open at the time** (and did it already contain the prerequisite)? This confirms the browse-path wrong-context diagnosis.
2. **Add-on-only rule:** hard block when added solo, or warn-and-allow with manager-PIN override (mirroring the existing prerequisite override)?
3. **register-tab favorites scope:** should favorites enforce prerequisites (and gating) too, or are they intentionally a fast lane? (Recommend enforce, for consistency.)

## Verification of audit hard rules

- ✅ No `src/` / migration / test changes — read-only.
- ✅ No DB writes (no DB access needed — pure code/git trace).
- ✅ file:line for every claim; pre/post and cross-surface comparisons explicit.
- ✅ Sale path documented as the reference; the recommended fix preserves it.
- ✅ Reuse-over-duplication recommendation (shared helper), not copy-paste.
- ✅ Worktree isolation off `origin/main`.
