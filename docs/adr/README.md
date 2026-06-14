# Architecture Decision Records

This directory captures the architectural decisions that shape the Smart
Details codebase. Each ADR documents one decision — the context that
prompted it, what we decided, what we gave up, and the alternatives we
rejected.

ADRs exist to answer the question **"why is the code like this?"** months
or years after a decision was made, when the original context has faded
from memory.

## When to write an ADR

Write an ADR when a decision:

- Affects multiple files / systems / surfaces
- Closes off alternative approaches
- Sets a pattern others should follow
- Would be hard to undo later
- A future contributor would reasonably ask "why?"

Do **not** write an ADR for:

- Implementation details within a single function
- Minor library choices (e.g., "we used lodash here")
- Bug fixes that don't change architecture
- Tactical changes that don't establish patterns

When uncertain: bias toward writing. ADR overhead is small. Missing ADRs
are invisible cost.

## How to write an ADR

1. Copy `_template.md` to `NNNN-kebab-case-title.md`, picking the next
   sequential 4-digit number (never renumber existing ADRs).
2. Fill in the template. Hard caps:
   - Total length: ~800 words target, 1000 hard ceiling
   - Each section: 3 paragraphs max
   - Rendered length: 2 pages max
3. If an ADR feels longer, it's probably multiple decisions — split it.
4. Add a row to the index table below.
5. Cross-reference related ADRs at the bottom of the file.

## Lifecycle

- **Proposed** — under discussion; not yet binding.
- **Accepted** — in force; code should follow.
- **Deprecated** — no longer recommended but historical decision preserved
  for context; code may still match it.
- **Superseded by ADR-XXXX** — replaced by a newer decision. Both files
  stay in the corpus; the new one links back to the old.

**Never delete an ADR.** Even rejected decisions are valuable history —
they show paths considered and not taken. Update status instead.

## Session integration

`CLAUDE.md` Rule 5 (session end) calls out the ADR step: if a session
makes an architecturally significant decision per the trigger criteria
above, write or update an ADR alongside the usual CHANGELOG entry.

## Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0001](0001-canonical-form-pattern.md) | Canonical form pattern for domain values | Accepted | 2026-05-13 |
| [0002](0002-phone-format-integrity.md) | Phone number format integrity (5-layer defense) | Accepted | 2026-05-13 |
| [0003](0003-money-math-via-integer-cents.md) | Money math via integer cents | Accepted | 2026-05-13 |
| [0004](0004-receipt-four-surface-synchronization.md) | Receipt 4-surface synchronization rule | Accepted | 2026-05-13 |
| [0005](0005-timezone-policy-pacific.md) | Timezone policy — America/Los_Angeles | Accepted | 2026-05-13 |
| [0006](0006-operator-comm-audit-log-and-confirm-codes.md) | Operator-initiated customer comms — audit_log shape + structured confirmation codes | Accepted | 2026-06-12 |
| [0007](0007-conversation-reactivation-and-ai-context-inclusion.md) | Conversation lifecycle reactivation + AI-context inclusion contract | Accepted | 2026-06-13 |
