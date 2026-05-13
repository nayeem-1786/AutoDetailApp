# Phase Schema-Hardening-1 — Phone CHECK Constraints + Channel-Aware Contract

> Defense-in-depth on phone formats: 5 DB-level CHECK constraints capturing
> the wire/display contract enforced upstream by Normalization-1 + Phone-UX-1.

## Context

Three prior phases built up the phone-format contract from the inside out:

1. **Phase Normalization-1** (commit `655d8631`) — chokepoint normalization in
   `sendSms()` / `findOrCreateConversation()`, app-layer rejection of
   unparseable input, backfill + CHECK on `employees.phone`.
2. **Phase Phone-UX-1** (commit `426d8ed2`) — `formatPhone()` for display,
   `formatPhoneInput()` for typing, `normalizePhone()` for submit, palette-
   driven SMS chip auto-format.
3. **Phase Lint-Hardening-1** (commit `dfd7713f`) — `phone/no-raw-display`
   ESLint rule to catch future leaks before they ship.

This phase finishes the perimeter at the database layer. Four phone-only
tables still had no CHECK constraints. A fifth (`quote_communications.sent_to`)
had a constraint applied via the Supabase SQL editor that was never captured
in source control — meaning fresh dev environments would diverge from prod.

## Locked Decisions

### LOCKED-1: One migration file

`supabase/migrations/20260513050241_phone_schema_hardening.sql`

Single migration. Pre-flight DO blocks per table, then `ADD CONSTRAINT`,
then a final summary DO block that asserts all 5 constraints are present.

### LOCKED-2: Idempotent retroactive constraint

`quote_communications.valid_sent_to` was applied to production via the
Supabase SQL editor (Option B, channel-aware) but no migration file
existed. The migration captures it via:

```sql
ALTER TABLE quote_communications DROP CONSTRAINT IF EXISTS valid_sent_to;
ALTER TABLE quote_communications ADD CONSTRAINT valid_sent_to CHECK (...);
```

On production this drops the identical constraint and re-creates it —
zero data impact. On a fresh dev environment it creates the constraint
that production already had. Source control is now the single source of
truth for what schema dev/staging/prod should match.

### LOCKED-3: Four new CHECK constraints

| Table | Column | Constraint | Check |
|---|---|---|---|
| `conversations` | `phone_number` (NOT NULL) | `valid_phone_number` | `~ '^\+1\d{10}$'` |
| `sms_delivery_log` | `to_phone` (NOT NULL) | `valid_to_phone` | `~ '^\+1\d{10}$'` |
| `sms_conversations` | `phone_number` (NOT NULL) | `valid_phone_number` | `~ '^\+1\d{10}$'` |
| `sms_consent_log` | `phone` (NOT NULL) | `valid_phone` | `~ '^\+1\d{10}$'` |

All four target columns are `NOT NULL`, so the constraint omits the
`OR <col> IS NULL` clause used in `customers`/`employees`.

### LOCKED-4 + LOCKED-5: Pre + post verification

Each table gets a DO block that re-runs the malformed-rows audit at apply
time. If anything drifted between offline audit and apply, the block raises
and the whole migration rolls back (LOCKED-6 — `supabase db push` wraps
each migration file in a transaction).

After all `ADD CONSTRAINT`s, a final DO block enumerates the expected 5
`(table, conname)` pairs against `pg_constraint`. If any are missing, it
raises with a list of misses.

### LOCKED-7: Inline documentation in `send-service.ts`

Added a comment block above `recordCommunication` (around line 162) that
documents the channel-aware contract: how the constraint is shaped, that
future channel values require constraint updates, and where the upstream
normalization lives.

### LOCKED-8: Regenerate DB_SCHEMA.md

`npx tsx scripts/regen-db-schema.ts` ran post-apply. The 5 constraints now
appear in `docs/dev/DB_SCHEMA.md`.

### LOCKED-9: Out of scope

- `vendors.phone`, `orders.phone`, `voice_call_log.phone` CHECK constraints
  (not in audit scope; their write paths weren't audited yet — defer)
- `phoneToE164()` refactoring
- ESLint rule changes
- Any application code changes beyond the inline doc block
- `shipping_settings.ship_from_phone` (single-value setting, validated by
  app layer at Phase Phone-UX-1)

## Pre-flight Audit Results

Ran against the linked DB before writing the migration:

```sql
SELECT 'conversations' as t, COUNT(*) as bad
  FROM conversations WHERE phone_number !~ '^\+1\d{10}$'
UNION ALL SELECT 'sms_delivery_log', COUNT(*)
  FROM sms_delivery_log WHERE to_phone !~ '^\+1\d{10}$'
UNION ALL SELECT 'sms_conversations', COUNT(*)
  FROM sms_conversations WHERE phone_number !~ '^\+1\d{10}$'
UNION ALL SELECT 'sms_consent_log', COUNT(*)
  FROM sms_consent_log WHERE phone !~ '^\+1\d{10}$';
```

Result:

```
conversations:      0 bad
sms_delivery_log:   0 bad
sms_conversations:  0 bad
sms_consent_log:    0 bad
```

Phase Normalization-1's chokepoint normalization + backfill closed every
historical leak ahead of this phase. The defensive DO blocks in the
migration re-run the same audit at apply time as belt-and-braces.

## Channel-Aware Option B (quote_communications)

Why a channel-aware constraint instead of a uniform regex:

`quote_communications.sent_to` holds the recipient address that was used
for a specific channel attempt. For `channel='email'` rows it holds an
email; for `channel='sms'` it holds a phone. A uniform "phone OR email"
regex would allow nonsense like an email value on an SMS row.

The Option B constraint enforces the cross-column contract:

```sql
CHECK (
  sent_to IS NULL
  OR (channel = 'sms'   AND sent_to ~ '^\+1\d{10}$')
  OR (channel = 'email' AND sent_to ~ '^[^@]+@[^@]+\.[^@]+$')
)
```

This catches three classes of bug:
1. Channel/value mismatch (email value sent to SMS pipe or vice-versa)
2. Missing normalization on the SMS path (a `(310) 555-1234` would be rejected)
3. Future channel additions that forget to update the constraint —
   inserts will fail loudly rather than silently storing unvalidated
   data

The trade-off: adding a new channel (e.g., `voice`) requires updating
this constraint BEFORE app code attempts to write the new value.
That's a feature, not a bug — it forces the contract to evolve alongside
the channel enum. The inline doc block in `send-service.ts` makes the
requirement discoverable from the canonical writer.

## Inline Documentation Pattern

Source-of-truth comments belong with the code that has to honor them.
The `recordCommunication` function in `src/lib/quotes/send-service.ts`
is the single insert path for `quote_communications` rows (per the
existing Phase Messaging-1+2 comment). The new comment block sits
directly above that function — anyone touching it sees the contract,
its enforcement layer, and the migration file that owns the SQL.

The comment links:
- The constraint definition (channel-aware shape)
- The migration filename
- The upstream normalization helpers (`sendSms`, `normalizePhone`)

## Defense-in-Depth Summary

After this phase, the phone-format contract is enforced at five layers:

| Layer | Mechanism | Owned by |
|---|---|---|
| Storage | DB CHECK constraints on 5 phone-bearing columns | **Schema-Hardening-1 (this phase)** |
| Wire | `sendSms` / `sendMarketingSms` / `findOrCreateConversation` normalize at chokepoint | Normalization-1 |
| Display | `formatPhone()` canonical helper across ~30 sites | Phone-UX-1 |
| Input | `formatPhoneInput()` + `normalizePhone()` on submit, with inline errors | Phone-UX-1 |
| Lint | `phone/no-raw-display` ESLint rule | Lint-Hardening-1 |

Each layer fails closed on bad data. A bad input is rejected at the form;
if it slips through, it's rejected at the chokepoint; if a bypass route
emerges, the DB constraint rejects the INSERT.

## Files Changed

- `supabase/migrations/20260513050241_phone_schema_hardening.sql` (new)
- `src/lib/quotes/send-service.ts` (inline doc block above
  `recordCommunication`)
- `docs/dev/DB_SCHEMA.md` (regenerated — 5 constraints now visible)
- `docs/sessions/schema-hardening-1-phone-checks.md` (this file)

## Verification

- Pre-flight DB query: all 4 columns 0 malformed rows
- `supabase db push`: migration applied successfully
- Post-apply DB query: all 5 constraints present
- `npx tsc --noEmit`: clean
- `npx eslint src/lib/quotes/send-service.ts`: clean
- `npx vitest run`: 888 / 888 passing

## Future Schema-Hardening Considerations

Defense-in-depth on the **remaining phone-bearing columns** that this
phase did not touch:

- `vendors.phone` — nullable; audit + backfill required before CHECK
- `orders.phone` — guest-checkout writes; audit needed for legacy data
- `voice_call_log.phone` — ElevenLabs webhook writes; audit needed for
  any pre-Normalization-1 rows
- `shipping_settings.ship_from_phone` — single-value JSONB setting,
  app-layer validation in `Phase Phone-UX-1` is sufficient; a CHECK is
  awkward on JSONB and probably not worth it
- `booking_form` SMS opt-in phones — already routed through
  `findOrCreateConversation`, so storage is already E.164 via the
  chokepoint; no separate CHECK needed

For each candidate above: run the same pre-flight audit query, then add
to a future `phone_schema_hardening_2` migration with the same DO-block
pattern. Trivial mechanical follow-up once the audit data is in hand.

**Cross-column constraint pattern.** The Option B channel-aware shape
applied to `quote_communications` is a model for any other table that
holds polymorphic "recipient address" or "destination" values discriminated
by another column. Candidates worth auditing if/when they appear:
- `email_delivery_log` (single channel, less relevant)
- Future webhook log tables (channel + url/phone/email)
