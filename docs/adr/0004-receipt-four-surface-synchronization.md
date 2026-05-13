# ADR-0004: Receipt 4-surface synchronization rule

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Nayeem

## Context

A receipt is rendered for the same transaction across four channels:

1. **Thermal printer** (POS) — `receiptToEscPos()` ESC/POS byte stream
   sent to the 80mm thermal printer over the print-server bridge
2. **HTML print** (Copier print fallback) — `generateReceiptHtml()` for
   admin/POS in-browser printing
3. **SMS link** + **Email body** — public receipt page at
   `src/app/(public)/receipt/[token]/page.tsx`, linked from outbound SMS
   and embedded into transactional emails

These surfaces are reached through different file paths and different
rendering libraries (ESC/POS bytes vs Tailwind HTML vs server JSX). Each
has its own width constraint, typography, and rendering toolchain.
Without explicit discipline, a content change (new label, new sign
convention, retired deposit chrome) tends to land in one surface and
silently drift on the others. The Phase 1A receipt-unification phase
existed entirely because the four surfaces had drifted apart over the
preceding year.

## Decision

**Any content change that affects what the customer sees on a receipt
MUST update all four surfaces in the same commit.** No surface ships
ahead of the others. The single source of truth for receipt content
composition is `src/lib/data/receipt-composer.ts`; each surface renderer
consumes its outputs.

Canonical renderer locations:

| Surface | File | Function |
|---|---|---|
| Thermal | `src/app/pos/lib/receipt-template.ts` | `generateReceiptLines` → `receiptToEscPos` |
| HTML print | `src/app/pos/lib/receipt-template.ts` | `generateReceiptHtml` |
| Public page | `src/app/(public)/receipt/[token]/page.tsx` | inline JSX |
| Email body | reuses public-page renderer via templated email | — |

The 19-scenario fixture suite (`src/lib/data/__tests__/__fixtures__/receipt-baselines/`)
covers the matrix — each scenario produces both an HTML baseline and a
thermal text baseline. Any visual change requires regenerating baselines
and visually reviewing each surface.

## Consequences

**Positive:**
- Customers see the same artifact regardless of how they received it
- The fixture suite catches accidental divergence in CI
- The shared composer enforces uniform sign conventions, deposit
  chrome, loyalty label, and totals rows

**Negative:**
- Receipt changes are higher-friction than single-surface edits — every
  PR touches three files and a fixture sweep
- The thermal-width budget (48 columns) constrains label design across
  all surfaces, including those that have no width constraint

**Neutral:**
- The composer's strict typing surfaces missing-field issues at compile
  time on all four surfaces simultaneously.

## Alternatives Considered

**Single HTML render piped through a print-to-thermal converter.**
Rejected: ESC/POS thermal output has line-by-line semantics, column
alignment, and the receipt printer's hardware constraints that don't
survive an HTML→ESC/POS conversion. Three of the four renderers can
share rendering logic (HTML print + public page + email); thermal
fundamentally cannot.

**Let SMS receipts be a stripped-down view that omits some lines.**
Rejected: the SMS link points to the public page, which IS the full
receipt. Customers tap the link and expect parity with the printed
version they got at the shop.

**Use a third-party receipt-rendering library.** Considered. Rejected:
none support both ESC/POS and HTML with shared content composition.

## Related ADRs

_(none yet — independent decision)_
