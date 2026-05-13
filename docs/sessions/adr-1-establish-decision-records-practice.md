# Phase ADR-1 — Establish Architecture Decision Records as ongoing practice

> Pure documentation session. Establishes `docs/adr/` as the canonical
> home for architectural decisions, writes the 5 most-important ADRs
> from current codebase state, audits the rest of the codebase for
> follow-on ADR candidates, and wires the practice into the session
> close workflow.

## Why ongoing practice (not one-time consolidation)

The Smart Details codebase has accumulated architectural decisions
across:

- CLAUDE.md rules (a flat list of ~19 numbered rules)
- `userMemories/` cross-session memory entries
- `docs/CHANGELOG.md` session entries
- `docs/sessions/*.md` session docs
- Inline code comments
- Implicit pattern repetition (no doc, just consistency)

These sources answer "what did we do" well, but not "why" or "what did
we reject." A one-time consolidation would freeze a snapshot — fine for
this week, stale in three months. ADRs as **ongoing practice** keep the
why alive: every session that makes an architecturally significant
decision writes one alongside the usual CHANGELOG entry.

## Locked Decisions

### LOCKED-1: Directory + numbering
ADRs live in `docs/adr/`. Filenames `NNNN-kebab-case-title.md` with
4-digit sequential numbers; **never renumber**. Superseded ADRs keep
their number and gain a "Superseded by ADR-XXXX" status line; the new
ADR gets a fresh number. Index at `docs/adr/README.md`.

### LOCKED-2: Template
`docs/adr/_template.md` is the canonical structure: 6 sections
(Context, Decision, Consequences, Alternatives Considered, Related
ADRs) plus a header block (Status, Date, Deciders). Hard caps: ≤800
words target, ≤1000 ceiling; 3 paragraphs per section; 2 rendered
pages. If an ADR feels longer, split into multiple.

### LOCKED-3: Trigger criteria
Write an ADR when a decision affects multiple files/systems, closes
off alternatives, sets a pattern for others, would be hard to undo,
or future contributors would ask "why?". Don't write ADRs for
single-function implementation details, minor library choices,
non-architectural bug fixes, or one-off tactical changes. **Bias
toward writing when uncertain** — overhead is small, missing ADRs
are invisible cost.

### LOCKED-4: Initial corpus (5 ADRs)
Written this session:

| # | Title | Captures |
|---|---|---|
| [0001](../adr/0001-canonical-form-pattern.md) | Canonical form pattern | Meta-pattern: storage canonical + wire canonical + display formatted + input formatted |
| [0002](../adr/0002-phone-format-integrity.md) | Phone format integrity | E.164 storage; 5-layer defense (DB CHECK, wire chokepoint, display, input, lint); US/Canada-only |
| [0003](../adr/0003-money-math-via-integer-cents.md) | Money math via integer cents | `toCents`/`fromCents`; round once per line; residual distribution; server tolerance 0 |
| [0004](../adr/0004-receipt-four-surface-synchronization.md) | Receipt 4-surface sync | Thermal + HTML print + public page + email update together |
| [0005](../adr/0005-timezone-policy-pacific.md) | Timezone policy | `America/Los_Angeles` at the application layer; UTC at storage only |

ADR-0002 and ADR-0003 are domain applications of ADR-0001's
meta-pattern. ADR-0004 and ADR-0005 are independent.

### LOCKED-6: Session-workflow integration
CLAUDE.md Rule 5 (Session end) now includes one additional sentence:
"Write or update an ADR in `docs/adr/` if the session made an
architecturally significant decision per the trigger criteria in
`docs/adr/README.md`." Single-line addition, no bloat.

### LOCKED-7: Index
`docs/adr/README.md` carries the table of all ADRs plus the
when-to-write criteria, how-to-write steps, and lifecycle (Proposed →
Accepted → Deprecated / Superseded).

### LOCKED-8: Out of scope
- Writing the audit candidates as ADRs (this session = report only)
- Refactoring existing CLAUDE.md content into ADRs (separate decision)
- Code or schema changes

## LOCKED-5 Audit — Additional ADR candidates

The codebase has many more architectural decisions worth documenting.
Below is the audit: one-line description, ADR/Not-ADR recommendation,
priority. **User decides which to write in follow-up sessions.**

### From the LOCKED-5 prompt list

| # | Candidate | Recommendation | Priority | Reasoning |
|---|---|---|---|---|
| A | Authentication architecture — phone-first OTP for customers; cookie isolation via `app.` subdomain (planned) | **ADR** | **HIGH** | Closes off email-first signup; cookie isolation is hard to undo once shipped; touches every customer-portal surface |
| B | RLS policy pattern (3 clients: `createClient` w/ RLS for customers, `createAdminClient` w/ service role for admin, HMAC-authed for POS) | **ADR** | **HIGH** | Cross-cutting; every API route picks one; getting it wrong is a security incident |
| C | n8n integration boundary — Smart Details app handles app logic, n8n only for cross-business workflows | **ADR** | **HIGH** | CLAUDE.md Rule 2 already forbids n8n-for-cron; the broader question of where to draw the line is undocumented |
| D | Voice agent auto-quote contract — one primary service + add-ons; `send_quote_sms` debounce | **ADR** | MEDIUM | Specific to voice-agent integration; documented in `docs/dev/VOICE_AGENT.md` but no decision rationale captured |
| E | POS vs Admin separation philosophy — POS PIN-only access; admin role-based; quotes read-only in admin | **ADR** | **HIGH** | Multiple downstream rules derive from this; "why can't I edit quotes in admin?" is a recurring question |
| F | Square import strategy — one-time migration tool, not ongoing sync | **ADR** | MEDIUM | Closes off ongoing-sync architecture; relevant when Phase 16 launch prep runs |
| G | Stripe Terminal manual capture pattern — authorize in POS, capture on payment-confirm | **ADR** | **HIGH** | Payment-flow architecture; the auth-vs-capture distinction has subtle implications for refund and offline-tx flows |
| H | Booking multi-service shelved — "what we didn't build" | **ADR** | MEDIUM | Architectural negative space; preserves the analysis that led to single-service booking |
| I | Supabase CLI for all schema changes — `supabase migration new` + `supabase db push`; never SQL editor | **ADR** | **HIGH** | Already a Critical Rule but no rationale captured; recent Phase Schema-Hardening-1 retroactively captured a SQL-editor-applied constraint — exactly the failure mode this rule prevents |

### Additional candidates surfaced during audit

| # | Candidate | Recommendation | Priority | Reasoning |
|---|---|---|---|---|
| J | Customer soft-delete (`deleted_at`) with forward-looking-filter discipline | **ADR** | **HIGH** | CLAUDE.md Rule 18 is dense but doesn't capture *why* this differs from hard delete; touches every customer query |
| K | Vehicle `size_class` taxonomy — 5 canonical values, no parallel boolean flags | **ADR** | MEDIUM | Closes off the `is_exotic`/`is_classic` flag explosion path |
| L | SMS template engine — palette + per-slug contracts + Zod + REMOVE_LINE | **ADR** | MEDIUM | Architecturally rich; CLAUDE.md Rule 9 documents the mechanics but not the trade-offs vs. simpler templating |
| M | Business identity via `getBusinessInfo()` — single source of truth for name/phone/email/address | **ADR** | LOW | Simple rule (no hardcoded business info); ADR would be short |
| N | Internal cron via `src/lib/cron/scheduler.ts` + `instrumentation.ts` | **ADR** | MEDIUM | Closes off external-scheduler alternatives; partly overlaps with candidate C |
| O | Coupon discount rules in shared `coupon-helpers.ts` (POS + booking both use it) | **Not ADR** | — | Tactical refactor pattern; covered by component-reuse rule |
| P | iOS format-detection + zoom prevention | **Not ADR** | — | Mobile-Safari workaround tactics, not architectural decisions |
| Q | POS dark mode (`dark:bg-gray-900` discipline) | **Not ADR** | — | Style rule, not architecture |
| R | Component reuse before writing new ones | **Not ADR** | — | Cultural rule |

**Total recommended:** 10 HIGH + 4 MEDIUM + 1 LOW = **15 candidate ADRs**
for follow-up. None written this session.

## Format hard caps (codified for reference)

Per LOCKED-2:

- ≤800 words target, ≤1000 ceiling
- 3 paragraphs per section
- 2 rendered pages
- 6 sections (Context, Decision, Consequences, Alternatives, Related, header)

Verified for the 5 initial ADRs:

| ADR | Word count |
|---|---|
| 0001 | 489 |
| 0002 | 423 |
| 0003 | 498 |
| 0004 | 481 |
| 0005 | 497 |

All within the cap.

## Files changed

- `docs/adr/` (new directory)
- `docs/adr/_template.md`
- `docs/adr/README.md`
- `docs/adr/0001-canonical-form-pattern.md`
- `docs/adr/0002-phone-format-integrity.md`
- `docs/adr/0003-money-math-via-integer-cents.md`
- `docs/adr/0004-receipt-four-surface-synchronization.md`
- `docs/adr/0005-timezone-policy-pacific.md`
- `CLAUDE.md` (+1 sentence in Rule 5)
- `docs/dev/FILE_TREE.md` (new `docs/adr/` block)

No source code changed.

## Verification

- All 5 ADRs ≤ 800 words ✓
- Template structure followed exactly ✓
- README index complete with all 5 entries + dates + status ✓
- CLAUDE.md addition is exactly one sentence in Rule 5 ✓
- `git status` shows only docs changes — no source code touched ✓

## Next phases

15 ADR candidates identified for follow-up sessions. Recommended
order:

1. **HIGH priority first** (10 ADRs): RLS pattern, Auth architecture,
   POS vs Admin separation, n8n integration boundary, Stripe Terminal
   manual capture, Supabase CLI for schema, customer soft-delete,
   Square import strategy. Cluster by adjacency — auth + RLS together,
   POS + Stripe together.
2. **MEDIUM priority** (4 ADRs): voice agent contract, size_class
   taxonomy, SMS template engine, internal cron scheduler, booking
   multi-service shelved.
3. **LOW priority** (1 ADR): business identity via getBusinessInfo.

Subsequent sessions should fold ADR writing into normal close-out via
the LOCKED-6 CLAUDE.md update — no separate "Phase ADR-2" needed unless
a batch is desired.
