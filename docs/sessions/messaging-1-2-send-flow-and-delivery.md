# Phase Messaging-1+2 — Send Pipeline Overhaul + Twilio Delivery Tracking

**Date:** 2026-05-12
**Scope:** Quote send dialog UX bugs (Bug 5/6/7/8) and Twilio delivery
status surfacing on the quote dashboard (Bug 9 visibility).

## Audits

### Messaging-1 audit (send flow)

Four bugs traced to a shared architectural cause: the server returned
HTTP 200 with `{success: true, errors: [...]}` for partial/total failures,
and the client unconditionally fired `toast.success` then iterated
`errors[]` firing `toast.warning` per item. Compounding bugs:

- **Bug 6** (modal lock-up): `QuoteSendDialog.success` state was never
  reset between opens. After a first send, the component stayed mounted
  with `success=true`; the next open showed a locked "Sent" badge with
  every control disabled, recoverable only by a page refresh.
- **Bug 5/8** (dual toasts): success + warning toasts fired on every
  partial outcome.
- **Bug 7** (failed sends not logged): five pre-flight/exception paths
  in `send-service.ts` skipped the `quote_communications` insert.

### Messaging-2 audit (delivery tracking)

`/api/webhooks/twilio/status` exists and correctly updates
`sms_delivery_log` by `message_sid`. But `quote_communications` had no
`twilio_sid` column and no link to `sms_delivery_log`, so the dashboard
read a hardcoded `status='sent'` that never reflected real delivery
outcomes — Twilio could mark a message `undelivered` and the dashboard
would still show a green pill.

## Locked decisions

- **3-status enum** on `quote_communications.status`: `sent` | `failed`
  | `blocked`. `blocked` = pre-flight gate prevented an attempt;
  `failed` = attempted but infrastructure refused; `sent` = Twilio
  accepted (delivery state lives in `sms_delivery_log`).
- **`twilio_sid` column** on `quote_communications` (nullable; indexed
  partial WHERE NOT NULL). Email rows leave it null until the eventual
  Mailgun parity work.
- **HTTP 422** on total-failure send (no channel landed). HTTP 200 on
  full or partial success. Fatal early-exits (quote not found, update
  failed) keep their explicit `status` and HTTP code.
- **Result shape**: `{ success, link, sent_via, blocked_via, failed_via,
  errors: { channel, reason, status }[], quote }`.
- **JOIN-based read**: comm history endpoints fetch `quote_communications`
  rows, gather `twilio_sid`s, fetch matching `sms_delivery_log` rows,
  and merge `delivery_status` / `delivery_error_code` /
  `delivery_updated_at` into the response. No FK between the tables;
  manual two-step lookup keeps queries idiomatic.
- **Pill semantics**:

  | Send-time status | Delivery status (Twilio) | Pill |
  |------------------|--------------------------|------|
  | `blocked`        | —                        | Orange "Blocked" |
  | `failed`         | —                        | Red "Failed" |
  | `sent` (email)   | n/a (no SID)             | Green "Sent" |
  | `sent` (SMS)     | `delivered`              | Green "Delivered" |
  | `sent` (SMS)     | `queued`/`sending`/`sent`/`accepted` | Yellow "Sending…" |
  | `sent` (SMS)     | `undelivered`            | Red "Undelivered" |
  | `sent` (SMS)     | `failed`                 | Red "Failed" (with Twilio error code) |
  | `sent` (SMS)     | null (webhook pending)   | Yellow "Pending" |

- **Dialog state reset**: `setSuccess(false)` inside the 3s `setTimeout`
  on both `QuoteSendDialog` and `NotifyCustomerDialog` (mirrors the
  pattern already present in `SendPaymentLinkDialog`).
- **Max 2 toasts per send**: one primary (`success` or `error`) plus
  one consolidated warning summarising partial failures (was: one
  warning per error).

## Architecture

```
   Quote Send POST                              Twilio webhook
       ↓                                              ↓
   send-service.ts                          /api/webhooks/twilio/status
       ↓                                              ↓
   recordCommunication()                    UPDATE sms_delivery_log
       ↓                                       WHERE message_sid = sid
   INSERT quote_communications
       (channel, status, sent_to,
        error_message, twilio_sid)

   Dashboard read
       ↓
   SELECT * FROM quote_communications WHERE quote_id = $1
   collect sids → SELECT * FROM sms_delivery_log WHERE message_sid IN (...)
   merge in delivery_status / delivery_error_code / delivery_updated_at
       ↓
   deriveCommPill() → green/yellow/red/orange
```

### Per-channel error contract

```ts
interface SendQuoteChannelError {
  channel: 'email' | 'sms';
  reason: string;
  status: 'failed' | 'blocked';
}
```

`reason` is the user-facing string written to `quote_communications.error_message`
AND surfaced in the warning toast (`{channel}: {reason}` joined with `•`).

### Migration

`supabase/migrations/20260512152847_quote_communications_delivery_tracking.sql`:

- `ADD COLUMN twilio_sid TEXT`
- `CREATE INDEX idx_quote_communications_twilio_sid ... WHERE twilio_sid IS NOT NULL`
- `DROP CONSTRAINT quote_communications_status_check` then
  `ADD CONSTRAINT ... CHECK (status IN ('sent', 'failed', 'blocked'))`
- `ALTER COLUMN sent_to DROP NOT NULL` (so blocked-no-email/no-phone
  rows can land)

## What changed (files)

| File | Change |
|------|--------|
| `supabase/migrations/20260512152847_…sql` | New migration |
| `src/lib/quotes/send-service.ts` | Result shape; `recordCommunication()` helper; 6 log-write paths; twilio_sid capture |
| `src/app/api/pos/quotes/[id]/send/route.ts` | Map outcome-failure to HTTP 422 |
| `src/app/api/quotes/[id]/send/route.ts` | Same |
| `src/app/api/pos/quotes/[id]/communications/route.ts` | JOIN sms_delivery_log |
| `src/app/admin/quotes/[id]/page.tsx` | JOIN reader + 4-tone pill renderer |
| `src/app/pos/components/quotes/quote-detail.tsx` | Communication type widening; `deriveCommPill()` + 4-tone classes |
| `src/app/pos/components/quotes/quote-send-dialog.tsx` | 422 branch, `setSuccess(false)` reset, consolidated warning |
| `src/components/quotes/notify-customer-dialog.tsx` | Same dialog fixes (LOCKED-10) |
| `src/lib/supabase/database.types.ts` | Hand-extended for new column (will be overwritten on next regen — re-add at that time) |
| `src/lib/quotes/__tests__/send-service.test.ts` | 8 cases covering all 6 log-write paths + outcome states |
| `src/app/pos/components/quotes/__tests__/quote-send-dialog.test.tsx` | 422 keeps modal interactive; partial success is 1 success + 1 warning |

## Webhook handler — intentionally unchanged

`/api/webhooks/twilio/status/route.ts` still updates `sms_delivery_log`
only. The new JOIN-based read picks up its writes automatically; no
fan-out to `quote_communications` is needed. Confirmed during
implementation that the existing behaviour suffices for the dashboard
UX.

## Out of scope (per LOCKED-11)

- **Email delivery tracking** (Mailgun webhooks) — future Phase Messaging-1.7.
  `quote_communications.twilio_sid` stays null for email rows; pill renderer
  falls back to plain "Sent".
- **Receipt/transaction Resend UI** — no such surface exists in the codebase.
- **Voice-agent quote-send code path** — separate pipeline, not in repro.
- **`QuoteBookDialog`** — different code path.
- **`quote-reminders` cron** — separate flow.
- **Audit log UI / activity stream** — future Phase Audit-1.
- **Backfill** of historical `sms_delivery_log` linkage onto pre-deployment
  `quote_communications` rows. Pre-Phase-Messaging-2 rows render as plain
  "Sent" (no SID, falls through the null-delivery branch).
- **`messages` (conversation thread) update from webhook** — known gap;
  conversation thread UX doesn't drive quote-dashboard decisions and is
  parked for now.
- **`appointment_communications` parity** — no such table exists.
  `NotifyCustomerDialog` got the UI fixes from LOCKED-10; the underlying
  appointment-notify routes were not touched (no comm history table to
  log to). LOCKED-10 "investigate during implementation" — outcome: no
  parallel log table on appointments today; future work would need a
  schema addition before server changes make sense.

## Future Phase Audit-1 alignment notes

When the activity stream / audit log lands, both `quote_communications`
and `sms_delivery_log` should be sources for the SMS subsystem rather
than being separately rendered. The 3-status enum + Twilio status overlay
is the granularity that should flow into that timeline.

## Manual test plan

1. **Resend → success path**: SMS to a valid number → row appears as
   yellow "Sending…" then resolves to green "Delivered" within ~5–30s
   once Twilio's webhook fires.
2. **Resend → undelivered**: SMS to a known-bad number (Twilio
   magic numbers: `+15005550001` for an invalid number) → yellow
   "Sending…" then red "Undelivered" with Twilio error code.
3. **Blocked (no email)**: Send to customer with `email=null`, method
   email → modal shows single error toast, modal stays interactive,
   history shows orange "Blocked".
4. **Blocked (no phone)**: Same, method=sms.
5. **Re-open after first send**: Click Resend, wait for auto-close,
   click Resend again → modal opens in default interactive state
   (no more locked "Sent" badge).
6. **Partial outcome**: With method=both, force one channel to fail
   (e.g. delete customer email after row is created — or use
   block-list customer) → exactly one success toast + one consolidated
   warning toast.

## Follow-up fixes (same day)

Production testing surfaced two regressions in the initial ship:

### A. `delivery_status='sent'` is a SUCCESS, not in-flight

The original LOCKED-7 state machine grouped Twilio's `sent` with
`queued`/`sending`/`accepted` and rendered them all as yellow
"Sending…". This was wrong for the real Twilio lifecycle:

```
queued / accepted → sending → sent → delivered
                                   ↘ undelivered / failed
```

`sent` means **Twilio handed the message to the carrier**. For Twilio
**test numbers**, **carriers that don't return delivery receipts**, and
many real-world MMS paths, `sent` is the **terminal** state — no
`delivered` follow-up ever arrives. Pills stayed stuck on yellow
"Sending…" indefinitely.

**Fix**: `sent` now renders green "Sent" (alongside `delivered` which
renders green "Delivered"). Only `queued` / `accepted` / `sending`
remain yellow.

Also folded in: legacy SMS rows that have a `twilio_sid` but no
matching `sms_delivery_log` row (race between send and webhook write,
or pre-Phase-Messaging-2 messages whose SIDs came from `messages`
without a delivery-log insert). These now show optimistic green "Sent"
instead of perpetual yellow "Pending". Send-time failure/blocked
status still wins.

Both `deriveCommPill()` (POS) and `deriveAdminCommPill()` (admin) were
collapsed into a single shared helper at
`src/lib/quotes/derive-comm-pill.ts` to guarantee the two surfaces
stay in lockstep. Each caller still owns its own class-name palette
(`PILL_TONE_CLASSES` in POS, `ADMIN_PILL_ICON_CLASS` in admin).

### B. Toast stacking config

Sonner's default behaviour collapses multiple toasts into an
overlapping pile that expands on hover. Two toasts dispatched
back-to-back from a partial-failure send appeared visually stacked on
top of each other.

**Fix**: added `expand` (and bumped `visibleToasts` from 3 to 5) on
the `<Toaster />` in `src/app/layout.tsx`. Multi-toast outcomes now
form a true vertical stack.

### Tests

`src/lib/quotes/__tests__/derive-comm-pill.test.ts` covers all
LOCKED-1 scenarios (14 cases including the `sent`-is-success
regression and the legacy-row null-delivery_status fallback). 837
total tests pass (was 823).

### Why the original state machine was wrong

The Phase Messaging-2 design treated Twilio's status enum as a strict
progression where `delivered` was the only terminal success. In
practice the `delivered` step requires **carrier-side delivery
receipts** which a meaningful slice of real-world traffic never
returns. The conservative original ("show yellow until we see
`delivered`") fails open to the wrong default. The corrected design
treats `sent` as success: Twilio has done its job, the carrier has
taken custody, and if `delivered` arrives later the pill upgrades
from green "Sent" to green "Delivered" — same colour, more specific
label. Failure paths (`undelivered`/`failed`) still wedge red, with
the Twilio error code surfaced as the secondary line.
