# ADR-0001: Canonical form pattern for domain values

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Nayeem

## Context

Domain values like phone numbers, money, and dates have multiple valid
representations. `+13105551234`, `(310) 555-1234`, `3105551234`, and
`310.555.1234` are all "the same phone." `$17.64`, `17.64`, `1764`, and
`17.6399999998` are all "the same amount." Without a discipline, the same
value gets stored differently in different rows, compared inconsistently,
and rendered inconsistently — joins miss matches, totals drift by cents,
and bugs appear weeks after the code that caused them.

Phase Normalization-1 (commit `655d8631`) and the Session-35 refund bug
each cost real recovery work because a domain value had no agreed
canonical form. After enough incidents the pattern emerged: every domain
value needs a single internal representation that ALL code agrees on,
plus separate explicit boundaries for display and input.

## Decision

Every domain value gets **four explicit boundaries**:

1. **Storage canonical** — one shape in the database. Enforced by CHECK
   constraints or column type when possible.
2. **Wire canonical** — the same shape when passing across function /
   service boundaries. Normalize at every chokepoint that crosses into
   storage or external services.
3. **Display formatted** — converted to a human-readable shape only at
   the rendering boundary (JSX, email body, PDF, receipt line).
4. **Input formatted** — converted from typed input at the form
   boundary, with a normalize step before submit.

Concrete applications live in their own ADRs (phone — ADR-0002, money —
ADR-0003). The pattern is the meta-rule; the ADRs are the
domain-specific application.

## Consequences

**Positive:**
- Joins, equality checks, and aggregations operate on one shape
- Render-time formatting is purely a presentation concern — no business
  logic depends on how something looks
- Lint rules and CHECK constraints can enforce the boundaries

**Negative:**
- Adds a learning curve for new contributors — they must know which
  boundary they're crossing before writing the call
- More helper functions in `src/lib/utils/format.ts` than a "just store
  the raw input" approach

**Neutral:**
- The cost of introducing the pattern to a new domain (say, addresses)
  is consistent: define canonical, write 4 helpers, document the ADR.

## Alternatives Considered

**Store-as-typed and format-on-the-fly.** Used in early commits. Failed
at scale — `sms_delivery_log.to_phone` accumulated 38 malformed rows
across 6 distinct numbers over a month-long window (mix of
`(XXX) XXX-XXXX` and `1XXXXXXXXXX` shapes), even while the
constraint-protected `customers.phone` stayed clean. Without a CHECK
constraint and a chokepoint, the unprotected column drifted whenever a
caller forgot to normalize. Phase Normalization-1 was forced to
backfill the 38 rows; Phase Schema-Hardening-1 then added the missing
CHECK constraints to prevent recurrence.

**Centralize format calls inside the API layer only.** Rejected: doesn't
address shared state across boundaries (input components, SMS chip
substitution, receipt renderers all encounter the same domain value).
Each layer needs to know which canonical shape it operates on.

**Use a runtime type system (Zod everywhere) instead of a documented
pattern.** Considered for v2. The current approach is documented
patterns + targeted enforcement (DB CHECK, ESLint, type narrowing) —
lighter weight, equally effective for current scale.

## Related ADRs

- ADR-0002 — Phone number format integrity (application of this pattern)
- ADR-0003 — Money math via integer cents (application of this pattern)
