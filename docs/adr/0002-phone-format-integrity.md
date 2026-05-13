# ADR-0002: Phone number format integrity (5-layer defense)

- **Status:** Accepted
- **Date:** 2026-05-13
- **Deciders:** Nayeem

## Context

Phase Normalization-1 found 38 malformed `sms_delivery_log.to_phone` rows
accumulating over a month. Only `customers.phone` had a CHECK constraint;
every other phone-bearing column was unprotected. `sendSms()` trusted its
~31 callers to format; many didn't. Display surfaces showed raw E.164.
Inputs didn't normalize. The result was inconsistent storage, broken
joins (shadow conversations whose `phone_number` shadowed real threads),
and customer-facing surfaces leaking `+13105551234` style strings.

US/Canada is the only market in scope. International phone support
would require `libphonenumber-js` and a different canonical shape.

## Decision

Phone numbers use **E.164 (`+1XXXXXXXXXX`) as the canonical storage and
wire form**. Defense-in-depth across five enforcement layers:

| Layer | Mechanism | Owned by phase |
|---|---|---|
| Storage | DB CHECK `~ '^\+1\d{10}$'` on 7 phone columns | Schema-Hardening-1 (`30b0947e`) |
| Wire | `sendSms`/`sendMarketingSms`/`findOrCreateConversation` normalize at chokepoint, reject unparseable | Normalization-1 (`655d8631`) |
| Display | `formatPhone()` returns `(XXX) XXX-XXXX` or `""` | Phone-UX-1 (`426d8ed2`) |
| Input | `formatPhoneInput()` live-formats while typing; `normalizePhone()` on submit | Phone-UX-1 (`426d8ed2`) |
| Lint | `phone/no-raw-display` ESLint rule flags new violations at write time | Lint-Hardening-1 + 1.2/1.3 (`dfd7713f`, `a7e1a35b`) |

Four helpers live in `src/lib/utils/format.ts`; nothing else may
reformat. `quote_communications.sent_to` carries a channel-aware CHECK
(`channel='sms'` requires E.164; `channel='email'` requires email shape)
documented inline in `src/lib/quotes/send-service.ts`.

## Consequences

**Positive:**
- Every layer fails closed on bad data; bypassing one is caught by the next
- Storage, wire, and display are statically separated in lint and runtime
- One canonical shape means SMS conversation joins are reliable

**Negative:**
- US/Canada-only is a hard limitation (documented in `format.ts` header)
- New phone columns require both a CHECK constraint and normalize-before-write
- Lint rule's ~19 prop-pass-through warnings remain pending Phase 1.4

**Neutral:**
- Existing data was backfilled once (38 rows + 3 employees + 1 setting);
  the constraints prevent reoccurrence.

## Alternatives Considered

**App-layer only (no DB CHECK).** Tried first — failed when one
caller's missing normalization corrupted 38 rows over a month with no
DB-level alarm. Required Phase Schema-Hardening-1.

**libphonenumber-js for international support.** Rejected: shop serves
South Bay LA only. Library adds 100kb+, and the team has no immediate
international plans. Documented as the migration path if ever needed.

**Format at the API boundary only, leave components free to display
raw.** Rejected after Phase Phone-UX-1 audit found 28 leaked sites
across components, emails, and PDFs. Display-layer enforcement is
necessary; an API-layer-only contract cannot hold.

## Related ADRs

- ADR-0001 — Canonical form pattern (parent meta-pattern)
