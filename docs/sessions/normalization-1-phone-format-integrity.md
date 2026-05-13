# Phase Normalization-1 — Phone format integrity

## Why

The Phase Messaging-1+2 audit + a follow-up diagnostic poll surfaced malformed
phones leaking into `sms_delivery_log` over a month-long window (38 rows across
6 distinct numbers). Twilio's API silently accepts non-E.164 input today, so no
customer messages were missed. The risk is that future Twilio changes,
downstream queries, or conversation-thread joins will break on the inconsistent
format — and the existing audit trail is already inconsistent.

## Three root causes (all closed this session)

1. **`sendSms()` / `sendMarketingSms()` did not normalize.** The shared helper
   trusted every caller. With ~31 call sites, some normalize upstream and some
   don't.
2. **Five DB write endpoints accepted display-formatted phone strings**:
   employees create/update, the `sms_test_phone_number` setting, and the POS +
   admin receipt-SMS endpoint.
3. **`findOrCreateConversation()` wrote `phone` as-passed**, creating shadow
   conversations whose `phone_number` shadowed the real E.164 thread for the
   same person.

Only `customers.phone` was constraint-protected (`valid_phone` CHECK,
`^\+1\d{10}$ OR NULL`); every other phone-bearing column was unprotected.

## What changed

### Chokepoint normalization
- `src/lib/utils/sms.ts` — `sendSms()` and `sendMarketingSms()` now call
  `normalizePhone()` at entry. Unparseable input returns
  `{success:false, error:'Invalid phone number format'}` without touching
  Twilio or `sms_delivery_log`. Original input is logged via `console.warn`
  for forensic debugging.
- `src/lib/utils/conversation-helpers.ts` — `findOrCreateConversation()`
  normalizes phone at entry. Returns `null` on unparseable input (preserves
  the never-throws contract).

### Five unprotected write endpoints
- `src/app/api/staff/create/route.ts` — `phone` normalized to E.164 or 400.
- `src/app/api/admin/staff/[id]/route.ts` — same.
- `src/app/admin/settings/messaging/page.tsx` — client-side `handleSave()`
  normalizes `sms_test_phone_number` and `sms_business_phone_override` before
  upsert (this page writes `business_settings` directly via Supabase RLS, no
  server-side handler to host the check).
- `src/app/api/pos/receipts/sms/route.ts` — `phone` normalized to E.164 or 400.
  Single endpoint covers both POS and admin receipt-dialog flows.

### Form-side hygiene
- `src/app/admin/staff/new/page.tsx` + `src/app/admin/staff/[id]/page.tsx`:
  display formatting via `formatPhoneInput()` is preserved while typing;
  `onSubmit` now normalizes via `normalizePhone()` and shows an inline error if
  unparseable. Server-side normalization remains as defense-in-depth.
- `src/app/pos/components/receipt-options.tsx` +
  `src/components/admin/receipt-dialog.tsx`: same pattern.

### Database — migration `20260513022648_phone_normalization_phase_1.sql`
- Backfilled 3 `employees.phone` rows (Joselyn Reyes, John Detailer, Segundo
  Cadena — all from `(XXX) XXX-XXXX` to `+1XXXXXXXXXX`).
- Backfilled `business_settings.sms_test_phone_number`:
  `"13107564789"` → `"+13107564789"` (JSONB).
- Bulk-normalized 38 `sms_delivery_log.to_phone` rows across 6 distinct numbers
  (10-digit shapes prepended with `+1`, 11-digit shapes prepended with `+`).
- `DO $$` block verifies `employees.phone` is clean before adding the CHECK.
- Added `valid_phone` CHECK constraint on `employees.phone` mirroring the
  existing `customers.valid_phone`.

Post-migration verification (live DB):
- `bad_employees = 0`
- `bad_sms_log = 0`
- `business_settings.sms_test_phone_number = "+13107564789"`
- `employees.valid_phone` constraint added

### Tests (12 new)
- `src/lib/utils/__tests__/sms-normalization.test.ts` — sendSms /
  sendMarketingSms rejection on empty, garbage, too-short inputs; normalization
  on `(310) 756-4789` and `13107564789`; pass-through on E.164.
- `src/lib/utils/__tests__/conversation-helpers-normalization.test.ts` —
  findOrCreateConversation rejection on invalid; normalized lookup; normalized
  insert payload.

## Shadow conversations — DEFERRED to operator decision

Four malformed `conversations.phone_number` rows remain. CHECK constraint on
this column is deferred until the operator picks per-row resolution.

| Shadow ID (truncated) | Shadow phone | Normalized → | Shadow msgs | Existing E.164 conv | E.164 msgs | Recommended action |
|---|---|---|---|---|---|---|
| `c153ccb2…` | `(310) 756-4789` | `+13107564789` | 5 | `23ee4f02…` (Nayeem) | 36 | **Merge**: move shadow messages into E.164 conv, delete shadow |
| `aac0593a…` | `(424) 456-0527` | `+14244560527` | 2 | none | 0 | **Normalize only**: update phone_number on the shadow row |
| `5fa30f16…` | `(424) 438-6838` | `+14244386838` | 2 | none | 0 | **Normalize only** |
| `dfcf2382…` | `(310) 818-6517` | `+13108186517` | 2 | none | 0 | **Normalize only** |

Operator decides each row. PAUSE before touching the conversations table.

## Out of scope (per LOCKED-8)

- Voice agent normalization beyond existing coverage.
- n8n workflow normalization (separate self-hosted system).
- Square import path (already normalizes via `normalizePhoneForImport()`).
- CHECK constraints on `conversations.phone_number`,
  `sms_conversations.phone_number`, `sms_delivery_log.to_phone`,
  `sms_consent_log.phone`, `quote_communications.sent_to`,
  `voice_call_log.phone`, `orders.phone`, `vendors.phone` — deferred to
  follow-up after shadow conversation resolution and per-column backfill.
- Adding regex validators to `formatPhoneInput()` (purely presentational).

## Future defense-in-depth

Once shadow conversations are resolved, add CHECK constraints to:
- `conversations.phone_number`
- `sms_conversations.phone_number`
- `sms_delivery_log.to_phone`
- `sms_consent_log.phone`
- `quote_communications.sent_to`

Pattern: backfill table → DO $$ verify → ALTER TABLE ADD CONSTRAINT. Same
migration shape as this phase.
