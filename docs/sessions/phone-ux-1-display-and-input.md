# Phase Phone-UX-1 — Phone Display + Input Formatting

> Canonical UX layer for phone numbers across the codebase.

## Context

Phase Normalization-1 (commit `655d8631`) closed the storage gap: every phone
write path now normalizes to E.164 (`+13105551234`) at the chokepoint before
hitting Twilio or the DB. But human-facing surfaces were still leaking the raw
E.164 string in ~28 display sites, and ~7 input forms had no live formatting,
forcing users to type with manual punctuation.

This phase establishes the canonical UX layer:

- **Displays** use `formatPhone()` → `(310) 555-1234`
- **Inputs** use `formatPhoneInput()` while typing + `normalizePhone()` on submit
- **SMS chip values** auto-format when the palette declares `format: 'phone'`

## Locked Decisions

### LOCKED-1: SMS chip engine centralization

`src/lib/sms/render-sms-template.ts` now consults `SMS_PALETTE` when
substituting chips. If a chip's metadata declares `format: 'phone'` and its
runtime value is non-empty, the value is passed through `formatPhone()` before
substitution. Phone chips today: `business_phone`, `customer_phone`.

Single point of enforcement. Eliminates manual `formatPhone()` /
`formatPhoneDisplay()` calls in 4 caller sites (lifecycle-engine,
campaigns/send, campaigns/process-scheduled, drip-engine) and the implicit
expectation that every transactional SMS caller would remember to format.

### LOCKED-2: Null-safe `formatPhone()`

`src/lib/utils/format.ts`:

```ts
export function formatPhone(phone: string | null | undefined): string
```

- `null` / `undefined` / `""` → `""`
- Unparseable (not a 10-digit US/Canada number) → `""`
- Valid E.164 or 10-digit → `"(XXX) XXX-XXXX"`

Each renderer decides what to show when the result is empty:

```tsx
{formatPhone(customer.phone) || '—'}
```

Behavior change from old `formatPhone()`: previously the function returned the
original input string when unparseable. Now it returns empty. Callers that
relied on the fallback behavior were already either gated by `if (phone)` or
explicitly handled the empty case.

### LOCKED-3: Three duplicate implementations consolidated

| Where | Before | After |
|---|---|---|
| `src/lib/utils/template.ts:143` | local `formatPhoneDisplay()` | deleted; 4 callers migrated to `formatPhone` |
| `src/components/account/account-shell.tsx:25` | local `formatPhone()` | deleted; uses canonical |
| `src/app/admin/settings/data-management/page.tsx:163` | local `formatPhone()` with `—` fallback | deleted; render site uses `formatPhone(value) \|\| '—'` |

Migrated callers of `formatPhoneDisplay()`:
- `src/app/api/marketing/campaigns/[id]/send/route.ts`
- `src/app/api/marketing/campaigns/process-scheduled/route.ts`
- `src/app/api/cron/lifecycle-engine/route.ts`
- `src/lib/email/drip-engine.ts`

### LOCKED-4: Documentation header on `format.ts`

Comment block at the top of `src/lib/utils/format.ts` codifies the four-helper
contract (display / input / wire / tel-link) and explicitly documents the
**US/Canada-only assumption**. If the business expands beyond +1, these
utilities need to be rebuilt with a library like `libphonenumber-js`.

### LOCKED-5: 22 HIGH-severity display sites wired

Customer-facing:
- `src/app/(public)/pay/[token]/page.tsx` (3 sites: top-level + PaidCard + LinkPaidCard)
- `src/app/jobs/[token]/photos/page.tsx`
- `src/app/authorize/[token]/page.tsx` (2 sites)
- `src/app/(public)/terms/page.tsx`
- `src/components/public/content-block-renderer.tsx`

Email templates (visual review required):
- `src/lib/email/send-cancellation-email.ts` (4 sites: templated vars,
  hardcoded text body, hardcoded HTML body, SMS fallback prose)
- `src/lib/email/send-void-notification.ts` (3 sites: text body, HTML body,
  SMS fallback prose)
- `src/lib/email/send-templated-email.ts` (auto-injected `business_phone` var)
- `src/lib/email/layout-renderer.ts` (footer business phone)
- `src/lib/utils/order-emails.ts` (5 sites: orderTemplateVars + 4 fallback
  email-wrapper footers)

Documents (visual review required):
- `src/app/api/quotes/[id]/pdf/route.ts` (PDF customer block)

Staff-facing:
- `src/app/pos/components/quotes/quote-detail.tsx` (customer card phone + comm
  log recipient)
- `src/app/admin/jobs/[id]/page.tsx`
- `src/app/admin/orders/[id]/page.tsx`

For staff-facing sites that previously rendered raw E.164 — the spec is
specific: wrap with `formatPhone(value) || value` so unparseable historical
phones still appear (rather than silently disappearing in admin views). The
pure customer-facing sites use `formatPhone(value)` directly since stored
data is normalized.

### LOCKED-6: 5 MEDIUM-severity admin display sites wired

- `src/app/admin/marketing/campaigns/[id]/page.tsx` (recipient list)
- `src/app/admin/marketing/campaigns/[id]/analytics/recipient-table.tsx`
- `src/app/admin/marketing/coupons/new/page.tsx` (customer picker)
- `src/app/admin/customers/new/page.tsx` (archived match dialog)
- `src/app/pos/components/customer-create-dialog.tsx` (archived match dialog)
- `src/app/admin/settings/messaging/sms-templates/page.tsx` (test send toast)

### LOCKED-7: 7 input forms with live formatting

For each form: onChange runs `formatPhoneInput()`, submit path runs
`normalizePhone()`, invalid input is rejected (inline error or toast). The
form input value displays the formatted string while typing.

| File | Field | Submit-side |
|---|---|---|
| `src/app/(public)/checkout/page.tsx` | `phone` (optional) | `normalizePhone` before payment-intent + shipping-rates POST; inline error under input when invalid |
| `src/components/booking/specialty-vehicle-block.tsx` | callback phone | `normalizePhone` blocks submit if invalid; inline error |
| `src/app/admin/settings/messaging/page.tsx` (×2) | business phone override + SMS test phone | already had `normalizePhone` on save; added live formatting on type + display formatting on load and after save |
| `src/app/admin/settings/messaging/sms-templates/page.tsx` | recipient phone chip input | `normalizePhone` on add; chip displays formatted phone |
| `src/app/admin/settings/shipping/page.tsx` | `ship_from_phone` | `normalizePhone` blocks save if invalid; inline error; load + post-save reformat |
| `src/components/admin/receipt-dialog.tsx` | SMS phone | live formatting added (normalizePhone was already present) |

## Out of Scope (per LOCKED-8)

The following were explicitly excluded and remain untouched:

- ESLint configuration (`eslint.config.mjs`, `eslint-rules/`) — owned by a
  parallel session
- `package.json` (no dependency changes)
- Schema migrations (no DB changes)
- `phoneToE164()` refactoring (kept as permissive coercer for tel: hrefs and
  JSON-LD)
- Vendor / order / voice_call_log phone CHECK constraints
- Square import preview (intentional raw display per existing audit)
- JSON-LD telephone field (E.164 per schema.org spec)
- SMS palette additions beyond format-driven enforcement

## SMS Chip Engine Architectural Change

Before this phase, every transactional SMS caller had to manually format
`business_phone` / `customer_phone` before passing it to `renderSmsTemplate`.
That's why lifecycle-engine, campaigns/send, campaigns/process-scheduled, and
drip-engine all called `formatPhoneDisplay(businessInfo.phone)` explicitly —
duplicating the same conversion logic across 4 files, with no enforcement
that callers wouldn't forget.

The new contract: chip metadata is the source of truth. `SMS_PALETTE` declares
`format: 'phone'` for chips that carry phone values. The engine inspects this
metadata at substitution time. Callers pass raw E.164; the engine formats.

This puts phone formatting on the same footing as REMOVE_LINE optional
substitution and business-info auto-injection — it lives inside the engine,
not in every caller.

Test coverage added in `src/lib/sms/__tests__/render-sms-template.test.ts`:

1. `customer_phone` chip value `+13105551234` renders as `(310) 555-1234`
2. Auto-injected `business_phone` from `getBusinessInfo()` renders pretty
3. Non-phone chips (e.g., `first_name` with phone-shaped value) pass through
   verbatim

Updated assertion in `src/lib/sms/__tests__/render-sms-template-contract.test.ts`:
the existing "business_phone override" test was asserting raw E.164 in the
rendered body. It now asserts the formatted output, which is the new contract.

## Email Templates Requiring QA Review

Trigger test sends for these flows and visually inspect rendered email
content (especially the footer block and any "Questions? Call X" prose):

1. **Booking cancellation** — `src/lib/email/send-cancellation-email.ts`.
   Template path AND hardcoded fallback path both pass formatted phone now.
2. **Transaction void** — `src/lib/email/send-void-notification.ts`. Hardcoded
   text + HTML body now show formatted phone.
3. **Any DB-templated email** — `src/lib/email/send-templated-email.ts`
   auto-injects `business_phone` formatted. Any template body referencing
   `{{business_phone}}` will now render pretty.
4. **Email layout footer** — `src/lib/email/layout-renderer.ts` formats the
   footer phone. Every email going through this renderer (most marketing +
   transactional emails) gets the new format.
5. **Order emails** — `src/lib/utils/order-emails.ts`: ready-for-pickup,
   shipped, delivered, refunded. All template variables + hardcoded HTML
   footers.

## Future Phase Lint-Hardening Considerations

> Parallel session is owning the ESLint rules. Do NOT add lint configuration
> from this session. The notes below document patterns this session
> encountered for future hardening.

After landing the changes in this phase, `npx eslint` on changed files
emits **0 errors, 36 warnings** from a new `phone/no-raw-display` rule. The
warnings fall into three categories:

1. **tel: hrefs** — `<a href={`tel:${phone}`}>` — the LOCKED-4 doc says
   `phoneToE164()` is the canonical wrapper for tel: links. Many of these
   sites pass raw E.164 (which already is a tel: scheme value); the lint rule
   is over-suggesting. Consider an exception for `tel:` string template
   contexts, or auto-fix to `phoneToE164()`.
2. **Prop pass to child** — `<PaidCard phone={businessInfo.phone}>` where the
   child component formats internally. The rule can't see into the child;
   one option is to format at the prop pass site (then drop formatting from
   the child).
3. **Display sites that use `formatPhone(value) || value`** — the rule fires
   on the trailing `|| value`. The pattern is intentional for staff views
   that should fall back to raw stored data if unparseable. Consider
   special-casing `formatPhone(x) || x` as an acceptable construction.

Other patterns worth linting:
- Direct `formatPhoneDisplay()` import in `template.ts` is now removed; a
  no-export rule could catch attempts to re-add it.
- Email layout fallback patterns where `${biz.phone}` is interpolated into
  HTML strings: only `order-emails.ts` and the hardcoded fallbacks in
  cancellation/void emails ship with this pattern; a string-literal scan for
  `${...phone}` could catch new instances.

## Files Changed Summary

**Library / contract:**
- `src/lib/utils/format.ts` — null-safe `formatPhone`, docs header
- `src/lib/utils/template.ts` — removed `formatPhoneDisplay`
- `src/lib/sms/render-sms-template.ts` — palette-driven phone auto-format

**4 callers of `formatPhoneDisplay`:**
- `src/app/api/marketing/campaigns/[id]/send/route.ts`
- `src/app/api/marketing/campaigns/process-scheduled/route.ts`
- `src/app/api/cron/lifecycle-engine/route.ts`
- `src/lib/email/drip-engine.ts`

**22 HIGH display sites:**
- `src/app/(public)/pay/[token]/page.tsx`
- `src/app/jobs/[token]/photos/page.tsx`
- `src/app/authorize/[token]/page.tsx`
- `src/app/(public)/terms/page.tsx`
- `src/components/public/content-block-renderer.tsx`
- `src/lib/email/send-cancellation-email.ts`
- `src/lib/email/send-void-notification.ts`
- `src/lib/email/send-templated-email.ts`
- `src/lib/email/layout-renderer.ts`
- `src/lib/utils/order-emails.ts`
- `src/app/api/quotes/[id]/pdf/route.ts`
- `src/app/pos/components/quotes/quote-detail.tsx`
- `src/app/admin/jobs/[id]/page.tsx`
- `src/app/admin/orders/[id]/page.tsx`

**5 MEDIUM display sites:**
- `src/app/admin/marketing/campaigns/[id]/page.tsx`
- `src/app/admin/marketing/campaigns/[id]/analytics/recipient-table.tsx`
- `src/app/admin/marketing/coupons/new/page.tsx`
- `src/app/admin/customers/new/page.tsx`
- `src/app/pos/components/customer-create-dialog.tsx`
- `src/app/admin/settings/messaging/sms-templates/page.tsx`

**Local duplicate deletions:**
- `src/components/account/account-shell.tsx`
- `src/app/admin/settings/data-management/page.tsx`

**7 input forms:**
- `src/app/(public)/checkout/page.tsx`
- `src/components/booking/specialty-vehicle-block.tsx`
- `src/app/admin/settings/messaging/page.tsx`
- `src/app/admin/settings/messaging/sms-templates/page.tsx`
- `src/app/admin/settings/shipping/page.tsx`
- `src/components/admin/receipt-dialog.tsx`

**Tests:**
- `src/lib/utils/__tests__/format-phone.test.ts` (new — 13 cases covering
  null safety + live input formatting + round-trip)
- `src/lib/sms/__tests__/render-sms-template.test.ts` (3 new chip auto-format
  cases)
- `src/lib/sms/__tests__/render-sms-template-contract.test.ts` (1 updated
  assertion for new business_phone format contract)

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 888 / 888 passing
- `npx eslint` on changed files — 0 errors, 36 warnings (all from new
  `phone/no-raw-display` rule owned by parallel session; flagged for future
  hardening above)
