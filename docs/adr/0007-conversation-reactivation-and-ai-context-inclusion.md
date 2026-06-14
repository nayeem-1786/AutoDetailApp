# ADR-0007: Conversation lifecycle reactivation + AI-context inclusion contract

- **Status:** Accepted
- **Date:** 2026-06-13
- **Deciders:** Nayeem

## Context

Session #149's payment-link work added `logToConversation: true` to the
`sendPaymentLink` helper, expecting closed conversations to reactivate on
new system SMS. Post-deploy observation surfaced the gap: payment-link
SMSes wrote `messages` rows but conversations stayed in `'closed'`
status. Pre-#150 the codebase carried THREE inline reactivation
implementations (Twilio inbound, operator-typed reply, voice-post-call)
with subtly different shapes; the canonical `sendSms({logToConversation:
true})` chokepoint and ~10 other paths flowing through it didn't
reactivate at all.

Paired with this: a related prompt-poisoning vector. The
`webhooks/twilio/inbound/route.ts:540` AI-history filter excluded only
`(sender_type='system' AND channel='voice')` — letting SMS status
markers (pg_cron auto-close banner, reactivation banner, manual close
audit, staff-notification audit) enter Claude's conversation history as
if the customer had received them. The naive fix (exclude all
`sender_type='system'`) would have broken designed behavior — customer-
facing notifications (payment links, receipts, quote reminders) are
sender_type='system' channel='sms' AND the customer literally receives
them; their AI-context inclusion is what lets Claude understand replies
like "I paid it" or "yes reschedule."

Visual verification during implementation also caught a real PostgREST
silent-no-op surface: `error: null` on a 0-row UPDATE, observed at
conversation `b0deab43-ba18-44e4-aea8-49cb284cc28f`.

## Decision

**One canonical helper — `reactivateIfClosed(supabase, conversationId,
options?)` in `src/lib/utils/conversation-helpers.ts`.** All 5 sites
(Twilio inbound, operator-typed reply, voice-post-call,
`findOrCreateConversation` existing-row branch, `sendSms` chokepoint)
route through this primitive. The helper reads status, performs UPDATE
+ banner INSERT inside the helper itself (mirrors ADR-0006's Option H
pattern). Banner mode discriminates origin: `'customer_re_engaged'`
(inbound from customer), `'automated_activity'` (system-outbound), or
`null` (operator-typed reply — the typed message is the marker).

**INVARIANT (writer + reader contract):** a `sender_type='system'`
message enters Claude's AI history iff `metadata.notificationType` is
set. Customer-facing notifications MUST set it; pure status markers
(reactivation banner, auto-close, manual close audit, audit banners)
MUST omit it. The reader contract lives at
`webhooks/twilio/inbound/route.ts:540` via the exported predicate
`shouldIncludeInAiHistory` in the same helper module; the writer
contract is documented in `reactivateIfClosed`'s jsdoc and must be
honored by every future `messages.insert` site.

**PostgREST `.select()` defensive guard for status-flipping UPDATEs.**
The helper's UPDATE chain ends in `.select('id, status')` so PostgREST
returns the updated row(s); the caller verifies BOTH `data.length > 0`
AND `data[0].status === 'open'` before declaring reactivation
successful. Defends against the silent-no-op surface where PostgREST
returns `error: null` on a 0-row UPDATE — a real surface observed
during #150's visual verification at conversation b0deab43. The exact
PostgREST mechanism (transient quirk, row-lock contention, SDK edge
case) is opaque without a runtime trace; the defense works regardless
of root cause.

## Consequences

**Positive:**
- Five reactivation sites converge on one writer — when a 6th caller
  emerges (e.g., a future customer-portal flow), no per-site
  re-implementation needed.
- Status markers can be enumerated mechanically by querying for
  `sender_type='system' AND metadata IS NULL OR
  metadata->>'notificationType' IS NULL`.
- Operator-friendly banners ("Conversation reopened — automated activity"
  / "customer re-engaged") give the messaging thread view a clear
  lifecycle audit trail at the moment of each reactivation.
- The `.select()` guard becomes a sub-pattern for any future
  status-flipping UPDATE that must be observably verified post-write.

**Negative:**
- New `sender_type='system'` writers MUST consciously decide whether
  the message is customer-facing (set `notificationType`) or operator-
  only (omit it). The contract is documented at both writer and reader
  sites, but it's not enforced at the type system or DB level — a
  forgotten `notificationType` on a customer-facing notification means
  Claude loses that context.
- The helper performs SELECT → UPDATE → INSERT as three sequential
  HTTP requests, not a single transaction. Row-level concurrency is
  handled correctly because Postgres serializes writes on the same row,
  but the helper isn't atomic across the full sequence.

**Neutral:**
- The pre-#150 `channel='voice'` rendering hack on inbound reactivation
  banners is preserved for existing data (backfill is out of scope per
  #150 audit); new banners use `channel='sms'`. The render predicate
  at `message-bubble.tsx:113-115` already routes on `sender_type='system'`
  as the primary signal so the channel value doesn't affect rendering.

## Alternatives Considered

**Blanket `sender_type !== 'system'` AI-history exclusion.** Originally
proposed during the #150 audit as the "simple" fix to the
prompt-poisoning vector. Rejected because it would have broken designed
behavior — the AI loses context for customer replies to system
notifications ("I paid it" referring to a prior payment-link SMS). The
refined `metadata.notificationType` discriminator preserves customer-
replyable context without leaking status markers.

**Per-route reactivation (Option R from #150).** Each caller writes
its own status flip + banner. Rejected for the same reason ADR-0006
rejected per-route audit log: when a 6th caller emerges, the shape
drifts. Adding a third reactivation site after the original two would
have left three inline implementations — the visible-from-day-one cost
of NOT centralizing.

**DB trigger on `messages` INSERT to auto-reactivate.** Considered but
deferred. A trigger would catch all paths automatically — including
future writers that forget to call the helper. Trade-off: triggers are
invisible at the call site; debugging "why did this conversation
reactivate?" requires reading the SQL function. Helper-at-call-site is
the explicit pattern the codebase follows for similar lifecycle
operations (cancel-orchestration, payment-link send) and matches
ADR-0006's locked decision.

## Related ADRs

- ADR-0006 (Option H "write inside the shared helper" pattern that this
  decision extends to the conversation-lifecycle domain)
- ADR-0005 (timezone policy — banner `created_at` rendering uses
  `America/Los_Angeles` in the operator UI)
