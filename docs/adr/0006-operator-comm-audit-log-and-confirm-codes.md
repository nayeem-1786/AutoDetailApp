# ADR-0006: Operator-initiated customer comms — audit_log shape + structured confirmation codes

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Nayeem

## Context

Session #146's payment-link lifecycle audit surfaced two gaps in the same
"operator triggers a customer-facing send" surface. (1) The `sendPaymentLink`
helper unconditionally wiped `appointments.payment_link_paid_at` after a
successful send, leaving partial-paid + previous-link-consumed appointments
exposed to a same-amount double-charge if the operator forgot the prior link
had cleared. (2) The same helper wrote no `audit_log` row on a successful
send — operators had no canonical trail of "who sent what to whom for how
much, and when," only the low-level `sms_delivery_log` (Twilio attempts) and
the post-#146 conversation `messages` row.

The same shape appears across the catalog of operator-initiated customer
comms — receipt SMS / email, quote send, send-info-sms, future welcome
campaigns. Session #149 closes both gaps for payment-link send specifically,
but the patterns established here are intended to be the template for the
broader audit-coverage retrofit Class (a) Item 6 will land.

Two callers share the helper today (POS operator route, voice-agent
Bearer-key route); a third (customer-portal "resend my link") is plausibly
on the horizon. Any per-route duplication of the audit shape or the
guard surface would drift on the next caller add.

## Decision

**Pattern A — `audit_log` row written INSIDE the shared helper (Option H),
NOT per-route.** Mirrors `cancelAppointmentOrchestrated` (`src/lib/
appointments/cancel-orchestration.ts:789-816`). Helper accepts an `actor:
{ triggeredBy, userId?, userEmail?, employeeName?, ipAddress? }` input field;
an internal `actorSourceFor()` translates `triggeredBy → AuditSource`
(`'operator' → 'pos'`, `'voice_agent' → 'api'`). Row shape: `action:
'update'` + `details.event: '<verb>_sent'` (mirrors stripe webhook
payment_link confirm — no new `AuditAction` union member added),
`entity_type: 'booking'` for appointment-scoped events,
`entity_label: "Appointment #${id.slice(0,8)} (<verb> $X via <channel>)"`.

**PII / bearer-credential lockout in `details` JSONB:** payment-link tokens
and any other bearer credentials are NEVER logged (audit_log readers
would gain implicit credential bearer access). Customer phone and email
are NEVER logged — `customer_id` is the canonical reference; PII belongs
on the customer record gated by its own permissions. The
`specialty-callback` audit row IS the documented exception (anonymous
customer initiates, staff follow-up requires the contact info).

**Pattern B — structured 409 confirmation code for "send requires explicit
operator intent" guards.** Server returns `{status: 409, code:
'<guard-name>', <relevant_context>: {...}}` and SKIPS the side effects.
Caller-side UI parses the code and renders a confirmation modal; on
confirm, the same request is re-sent with `confirmResend: true` (or a
similar boolean bypass field documented in the input contract). Voice-agent
path adds `instructions_for_agent: <string>` to the 409 body so the
existing `voiceAgentFetch:262-271` passthrough surfaces the prompt to the
LLM verbatim. **Auto-retry is forbidden** — the bypass is the explicit
intent capture.

## Consequences

**Positive:**
- One write site per helper, one audit shape — when receipt/quote/send-info
  retrofits land, they reuse this template byte-for-byte.
- The "previous_link_paid" code becomes a reusable shape; other guards
  (e.g. future "previous_receipt_sent_within_5_min" duplicate-send guard)
  follow the same client-side parse + retry contract.
- Audit row is operator-friendly without leaking credentials or PII —
  searchable on `entity_label` ilike, filterable on `(entity_type, action,
  created_at)` index.

**Negative:**
- `SendPaymentLinkInput` (and every future helper following this pattern)
  gains a required `actor` field that all callers must populate. New caller
  add requires actor-shape thought; can't be a thin "forward the body" route.
- The confirmation modal adds one click on every legitimate deposit+balance
  cycle (per-cycle, not per-attempt). Accepted vs the double-pay risk.
- Voice-agent path's `source: 'api'` shares the audit_log source value with
  Stripe webhook + specialty-callback. Distinguishing voice-agent-initiated
  events requires reading `details.trigger` rather than `source` alone.

**Neutral:**
- `actorSourceFor` is per-helper today (duplicated from cancel-orchestration).
  When a third helper lands, extract to a shared module.

## Alternatives Considered

**Shape A — Hard block on `payment_link_paid_at IS NOT NULL`.** Rejected
because the codebase explicitly supports designed multi-link
deposit-then-balance flows (PaymentLinkAmountModal's 25/50/75/custom
presets, the webhook's per-PI idempotency, the
`payment-link-status-flip` locked test). Hard-blocking re-sends would
break a feature, not protect from a bug.

**Option R — Per-route audit write.** Each caller writes its own audit_log
row after the helper returns. Rejected because (a) the cancel-orchestration
precedent is recent and known-good with multiple callers, (b) a third
caller (customer-portal resend) would duplicate the audit shape, and (c)
the helper already has the canonical post-send-success decision point and
the `channels` / `token_reused` derivations natively.

**Extending `AuditAction` union with `'send'`.** Rejected for now —
`action: 'update'` + `details.event: 'payment_link_sent'` matches the
existing stripe webhook payment_link confirm row's choice and stays
inside the union without a type-system change. Schema layer accepts new
values (no DB enum), so this is reversible if a future audit-coverage
retrofit prefers a dedicated `'send'` action.

## Related ADRs

- ADR-0003 (money math via integer cents — `amount_cents` fields in `details`)
- ADR-0005 (timezone policy — `paid_at` rendering uses `America/Los_Angeles`)
