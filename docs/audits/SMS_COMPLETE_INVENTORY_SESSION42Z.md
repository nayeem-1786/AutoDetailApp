# SMS Complete Inventory & Chip-Migration Verdicts

**Session:** 42Z-audit
**Date:** 2026-04-24
**Status:** READ-ONLY diagnostic. No code changes. Single commit.
**Predecessor:** `SMS_TEMPLATE_ROOT_CAUSE_SESSION42W.md` (architectural root-cause for the "your your vehicle" incident — does NOT list every SMS).
**Driving question:** *Should every customer-facing SMS go through the admin-editable template (chip) system, or stay hardcoded for some?*

---

## TL;DR — the verdict spread

After enumerating every SMS-firing site in `src/`, the population breaks down like this:

| Verdict | Count | Meaning |
|---|---:|---|
| **DB chip template — already migrated** | 16 events / 11 customer + 5 staff slugs | These are the model implementation. No work needed. |
| **DB chip template — DB row exists but NOT seeded by migration** | 2 | `payment_receipt`, `loyalty_milestone` — code references them, user authored bodies via SQL editor. Migration the bodies into git ASAP. |
| **CAN MIGRATE — trivial seed (zero-variable or simple)** | 2 | `transaction_voided`, `addon_authorization_expired`. Cheap wins. |
| **CAN MIGRATE — needs new chip set + seed** | 6 | Quote/voice/addon variants. Engineering cost is real but bounded. |
| **CAN MIGRATE — but loses behavior unless engine extended** | 1 | `receipt_sms` 160-char truncation logic doesn't fit current engine. |
| **CANNOT MIGRATE — body is unbounded free text** | 3 | Two-way operator reply, two-way AI auto-reply, voice agent free-text composition. Chip template body would degenerate to `{message_body}`, providing zero authoring value. |
| **OUT OF SCOPE — different but parallel chip system** | 4 | Marketing/lifecycle/drip — already chip-templated, but in `campaigns.sms_template` / `lifecycle_rules.sms_template_id` columns, not `sms_templates`. Architectural overlap worth its own audit. |
| **GAP — fires no SMS at all** | 2 | POS refund, admin order refund. Customer never notified of refund. |

**Population:** ~36 distinct SMS events / 23 distinct surfaces.

**Recommended global call (one-line):** **YES — adopt "chip-by-default" with three documented exemptions.** Every SMS that has *bounded, deterministic prose* and *known variable shape* should have a `sms_templates` row. Three exemption classes survive: free-text two-way (no template makes sense), marketing campaigns (parallel system that's already chip-driven), and engine-feature gaps that need solving before migration (`receipt_sms` truncation). The current hardcoded population other than those three is migratable — the only reason most of them aren't already DB rows is path-of-least-resistance authoring (`UNSAFE_SMS_TEMPLATES` is a *convenience* list, not a *capability* list).

The detailed reasoning per event follows.

---

## Phase 1 — Methodology

### How "every SMS in the app" was located

Every SMS in this codebase ultimately flows through one of two functions in `src/lib/utils/sms.ts`:

- `sendSms(to, body, options?)` — line 44. The single Twilio entrypoint. Inserts into `sms_delivery_log`, optionally logs to `messages` table for two-way conversations.
- `sendMarketingSms(to, body, customerId?, marketingOptions?)` — line 178. Wraps `sendSms` with consent check, frequency cap, URL click-wrapping, and `\nReply STOP to unsubscribe` footer.

Every callsite was located via:

```
grep -rn "sendSms\|sendMarketingSms\|smsService\|twilio\.messages\|client\.messages" src/
grep -rn "renderSmsTemplate\|renderTemplate" src/
```

The first grep returned **32 files / 47 callsites**. The second returned **26 files** (intersect identifies which sends use the chip engine vs. inline body construction). Cross-referencing the two produced the master inventory below.

There are zero direct Twilio API calls outside `sms.ts` (CLAUDE.md Rule 9 compliant).

### What "chip migration" means in this codebase

Two parallel template systems exist:

| System | Storage | Editor | Variables registry | Used for |
|---|---|---|---|---|
| **`sms_templates` (chip system)** | `sms_templates` table — slug-keyed, long-lived | `/admin/settings/messaging/sms-templates` SlideOver | `SMS_TEMPLATE_VARIABLES` map in `src/lib/sms/sms-template-variables.ts` (per-slug arrays) | Transactional SMS (booking, quote, reminder, etc.) |
| **Marketing campaign templates** | `campaigns.sms_template` text column / per-campaign | `/admin/marketing/campaigns/_components/campaign-wizard.tsx` | `CAMPAIGN_VARIABLES` map in `src/lib/utils/template.ts` | Marketing blasts, lifecycle drip, A/B variants |

Both use the same `renderTemplate(template, vars)` substitution at `src/lib/utils/template.ts:81-88`. They differ in **persistence** (slug-keyed durable templates vs. per-campaign body) and **chip palette** (per-slug strict vs. shared marketing palette).

When this audit says "migrate to chips," it means: **add a row to `sms_templates`, define its chip set in `SMS_TEMPLATE_VARIABLES`, replace the inline body construction at the callsite with `renderSmsTemplate(slug, vars, fallback)`.**

### Engine constraints (matter for verdicts below)

From `src/lib/sms/render-sms-template.ts` and `src/app/api/admin/sms-templates/[slug]/route.ts`:

1. **No POST endpoint.** Templates can only be created via SQL/migration. Admin UI cannot create.
2. **Cache TTL 60s** (line 44). PUT calls `invalidateSmsTemplateCache()` so edits propagate immediately.
3. **Required-variable validation** is enforced on PUT (admin route lines 71-85): blocks save if a required chip is missing from the body.
4. **No length enforcement.** Editor shows live segment count (admin UI `countSegments` at lines 59-63: 1 segment ≤160, 153/segment after) but does not block at render time. Strict-length truncation must happen caller-side.
5. **No conditional logic.** Cannot do "if vehicle_description, render line A else line B." Pattern at engine line 233-245 supports empty-fallback line removal but only for chips with empty default.
6. **MMS attachment is orthogonal.** `mediaUrl` is a `sendSms` option, not part of the template body. A migrated template can still send an MMS — the body just doesn't reference the attachment.
7. **HMAC tokens are just strings.** A token-bearing URL is no different from any other URL variable as far as the chip system is concerned. The current "UNSAFE" carve-out is a UX policy ("don't expose security-sensitive prose to staff editing"), not a technical limitation.
8. **Free-text bodies have no template structure.** Operator/AI replies are unique per message — a chip template `{message_body}` is the degenerate case (provides zero authoring value).

These constraints define the verdict taxonomy used below.

---

## Phase 2 — Master event inventory

Every SMS-firing site, grouped by current state. File:line references are verified; verdict reasons follow each cluster.

### Cluster A — Customer-facing transactional, ALREADY chip-driven (11 events)

These are the model implementation. Templates live in `sms_templates`, chips defined in `SMS_TEMPLATE_VARIABLES`, body editable in admin UI.

| # | Event | Code path | Slug | Status |
|---|---|---|---|---|
| 1 | Online booking confirmed | `src/app/api/book/route.ts:597` | `booking_confirmed` | ✓ Chip |
| 2 | Appointment confirmed (helper) | `src/lib/utils/sms.ts:319` (`buildAppointmentConfirmationSms`) — called by voice agent appointments (`src/app/api/voice-agent/appointments/route.ts:301, 528`), admin notify, POS notify | `appointment_confirmed` | ✓ Chip |
| 3 | Voice post-call appointment confirm | `src/lib/services/voice-post-call.ts:347` | `appointment_confirmed_postcall` | ✓ Chip |
| 4 | POS job cancel | `src/app/api/pos/jobs/[id]/cancel/route.ts:214` | `appointment_cancelled` | ✓ Chip |
| 5 | Email-system cancellation companion SMS | `src/lib/email/send-cancellation-email.ts:187` | `appointment_cancelled` | ✓ Chip |
| 6 | Quote accepted (single or multi) | `src/app/api/quotes/[id]/accept/route.ts:85` | `quote_accepted_single` / `quote_accepted_multi` | ✓ Chip |
| 7 | Booking reminder (cron) | `src/app/api/cron/booking-reminders/route.ts:76` | `booking_reminder` | ✓ Chip |
| 8 | Quote reminder unviewed (cron) | `src/app/api/cron/quote-reminders/route.ts:78` | `quote_reminder` | ✓ Chip |
| 9 | Quote viewed follow-up (cron) | `src/app/api/cron/quote-reminders/route.ts:182` | `quote_viewed_followup` | ✓ Chip |
| 10 | Job complete | `src/app/api/pos/jobs/[id]/complete/route.ts:244` | `job_complete` | ✓ Chip |
| 11 | Add-on approved / declined | `src/lib/services/job-addons.ts:146, 218` | `addon_approved` / `addon_declined` | ✓ Chip |

### Cluster B — Staff/detailer-facing, ALREADY chip-driven (5 events)

| # | Event | Code path | Slug |
|---|---|---|---|
| 12 | Online booking → staff | `src/app/api/book/route.ts:658` | `booking_staff_notify` |
| 13 | Specialty callback request → staff | `src/app/api/public/specialty-callback/route.ts:67` | `booking_staff_notify` |
| 14 | Quote accepted → staff | `src/app/api/quotes/[id]/accept/route.ts:119` | `quote_accepted_staff_notify` |
| 15 | Detailer job assigned | `src/app/api/appointments/[id]/notify/route.ts:301`, `src/app/api/pos/appointments/[id]/notify/route.ts:293` | `detailer_job_assigned` |
| 16 | Voice escalation / specialty inquiry → staff | `src/app/api/voice-agent/notify-staff/route.ts:89`, `src/app/api/webhooks/twilio/inbound/route.ts:642` | `staff_notification` |

**Verdict for Clusters A & B:** No action. These are the spec.

---

### Cluster C — DB row exists but NOT seeded by migration (2 events)

These are the highest-risk items in the inventory.

| # | Event | Code path | Slug | Issue |
|---|---|---|---|---|
| 17 | Sale completed → auto-receipt (30s setTimeout) | `src/app/api/pos/transactions/route.ts:516` | `payment_receipt` | Not in any seed migration. User authored body via Supabase SQL editor. No row in `SMS_TEMPLATE_VARIABLES` — admin UI shows zero chips. |
| 18 | Loyalty threshold crossed | `src/app/api/pos/transactions/route.ts:329` | `loyalty_milestone` | Same — DB-as-source-of-truth, not git-as-source-of-truth. |

**Verdict:** **MUST migrate to seed migration.** This is not a "should we migrate" question — these templates are already in the chip system *operationally* but missing from it *contractually*. The body that produced "Your your vehicle is all set" lives in the user's hand-typed SQL row. Until a migration codifies these slugs, any database restore or replication risks losing the bodies entirely.

Also affects the chip UX: because `SMS_TEMPLATE_VARIABLES` has no entry for these two slugs, the admin SlideOver editor shows **zero chips** when the user opens these templates. They authored blind. The migration step must add `payment_receipt` and `loyalty_milestone` entries to `src/lib/sms/sms-template-variables.ts`.

This is identical to 42W Phase 6 step 5. Restating here because the global-decision audit can't omit it without misrepresenting the population.

---

### Cluster D — Currently hardcoded, listed in `UNSAFE_SMS_TEMPLATES` (7 events)

Defined at `src/lib/sms/sms-template-variables.ts:134-142`. The list is documentary — these slugs intentionally don't have DB rows. Per-event analysis:

#### D1. `addon_authorization` — initial add-on auth request

- **Code:** `src/app/api/pos/jobs/[id]/addons/route.ts:227-246`
- **Body construction (line 228-234):**
  ```ts
  const smsBody = [
    `Hi ${customer.first_name}, while working on your ${vehicleDesc} we noticed ${issueText}.`,
    `We recommend ${friendlyName} for an additional $${finalPrice.toFixed(2)} — shall we go ahead?`,
    `View pictures and approve or decline here: ${authorizeUrl}`,
    detailerName,
    biz.name,
  ].join('\n');
  ```
- **Variables:** `first_name`, `vehicle_description`, `issue_text`, `friendly_name`, `final_price`, `authorize_url`, `detailer_name`, `business_name`. All known and resolved caller-side. `authorizeUrl` is `/authorize/{HMAC_token}` — a string like any other URL.
- **Verdict:** ✅ **CAN MIGRATE — needs new chip set.** The "security-sensitive prose" exemption is convention, not capability. The HMAC token is computed before the body is built; the chip system never sees the secret. Migrating gains the operator the ability to soften the tone ("Hi Sarah, your detailer Mike noticed…" vs. the current rigid format).
- **Cost:** New seed migration row + new entry in `SMS_TEMPLATE_VARIABLES` with 8 chips.

#### D2. `addon_authorization_resend` — re-send with fresh token + photo MMS

- **Code:** `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts:125-136`
- **Body construction (line 126):**
  ```ts
  const smsBody = `${original.message_to_customer}\n\nApprove or decline here: ${authorizeUrl}\n\n— ${biz.name}`;
  ```
- **Variables:** `message_to_customer` (operator-typed prose stored on the addon row), `authorize_url`, `business_name`.
- **MMS:** sends `mediaUrl: photoUrl` (line 130) — orthogonal to body.
- **Verdict:** ✅ **CAN MIGRATE — needs new chip set.** Three chips. The `{message_to_customer}` chip is the operator's free text from the addon row, no different in shape from any other text variable. MMS keeps working unchanged.
- **Cost:** Same shape as D1. ~3 chips.

#### D3. `addon_authorization_expired` — static expiry message

- **Code:** `src/app/api/webhooks/twilio/inbound/route.ts:864, 876` (two identical sends)
- **Body:** `'That authorization has expired. Would you like us to send a new one?'` — zero variables.
- **Verdict:** ✅ **CAN MIGRATE — TRIVIAL.** Zero-variable static body. The current rationale ("doesn't justify the template-management overhead") is a fair UX argument when SMS templates are scarce, but the existing `system` category in `sms_templates` already accepts zero-variable rows. Migration cost is one INSERT statement. The two callsites already share a literal string — moving to DB removes the duplication.
- **Cost:** Migration row + delete duplicated string at line 864 and 876. ~3 lines of code change.

#### D4. `quote_sms_admin` — admin-initiated quote send

- **Code:** `src/lib/quotes/send-service.ts:211-228`
- **Body construction:**
  ```ts
  const smsBody =
    `Estimate ${quote.quote_number} from ${business.name}\n` +
    `Total: ${formatCurrency(quote.total_amount)}\n\n` +
    `View Your Estimate: ${shortLink}`;
  ```
- **Variables:** `quote_number`, `business_name`, `total_formatted`, `short_link`. MMS PDF attachment optional.
- **Verdict:** ✅ **CAN MIGRATE — needs new chip set.** 4 chips. The PDF attachment is `mediaUrl`, body-orthogonal.
- **Cost:** Migration row + 4-chip entry. The migration would also subsume the existing `quote_reminder` and `quote_viewed_followup` chip taxonomy ergonomically.

#### D5. `quote_sms_postcall` — auto-quote SMS after voice call

- **Code:** `src/lib/services/voice-post-call.ts:609`
- **Body:** `\`Thanks for calling ${biz.name}${nameGreeting}! Here's a quote for what we discussed: ${linkUrl}\``
- **Variables:** `business_name`, `first_name` (optional, leading comma controlled at line 607), `link_url`.
- **Verdict:** ✅ **CAN MIGRATE — needs new chip set.** 3 chips. The conditional `nameGreeting` (empty when no name, `, FirstName` when present) is the only nuance — translates cleanly to chip system: `{first_name_greeting}` chip with caller doing the empty/non-empty switch (or empty-line-removal pattern with separate `{first_name}` chip).
- **Cost:** Migration row + 3-chip entry.

#### D6. `quote_sms_midcall` — voice agent send-quote tool

- **Code:** `src/app/api/voice-agent/send-quote-sms/route.ts:255-263`
- **Body:** `\`Here's your quote from ${biz.name} for ${serviceList}: ${linkUrl}\``
- **Variables:** `business_name`, `service_list`, `link_url`.
- **Verdict:** ✅ **CAN MIGRATE — needs new chip set.** 3 chips.
- **Cost:** Same shape as D5.

#### D7. `receipt_sms` — manual POS receipt sender

- **Code:** `src/app/api/pos/receipts/sms/route.ts:62-77`
- **Body construction:** Conditionally builds either `${vehicleStr} — $X.XX` or `Your total — $X.XX` for the summary line, then assembles `${biz.name}\n${summaryLine}\nThank you! View receipt:\n${shortUrl}` (line 77). **Strict 160-char limit** (line 68): if exceeded, vehicle string is truncated with `...` to fit.
- **Variables:** `business_name`, `vehicle_or_total_line`, `short_url`.
- **Verdict:** ⚠️ **CAN MIGRATE — but loses the 160-char truncation behavior unless the engine is extended.** The current code computes the *length of the full message* before truncating the vehicle field to fit. The chip engine has no equivalent — it renders chips and concatenates with no awareness of byte budget. To preserve this behavior under chip migration, two options:
  1. **Caller-side fit-then-substitute.** Caller computes the truncated `summary_line` chip value before calling `renderSmsTemplate`. The template body becomes `{business_name}\n{summary_line}\nThank you! View receipt:\n{short_url}` and behaves identically. Migration is safe; the caller logic stays where it is.
  2. **Engine-side length budget.** Add a per-template `max_chars` column and a "fit one chip" annotation. Significant new feature, probably not worth it for one template.
- **Cost:** Migration row + 3-chip entry + ~5 lines of caller refactor (move truncation to before `renderSmsTemplate` call). Recommended approach is option (1) — preserves behavior, no engine work.

**Cluster D summary:** Six of seven are no-cost or low-cost migrations. The seventh (`receipt_sms`) is also migratable with a caller-side adjustment. **The `UNSAFE_SMS_TEMPLATES` list is a historical convenience, not a permanent architectural carve-out.**

---

### Cluster E — Currently hardcoded, NOT in `UNSAFE_SMS_TEMPLATES` (8 events: 1 + 6 voice info + 1 commented)

These were never added to the unsafe list because they predate or duplicate it.

#### E1. `transaction_voided` — void notification

- **Code:** `src/lib/email/send-void-notification.ts:142-151`
- **Body construction:**
  ```ts
  const jobLine = input.jobCancelled ? ' Your scheduled service has been cancelled.' : '';
  const smsBody =
    `Hi ${customer.first_name}, transaction #${receiptNumber} at ${business.name} has been voided.${jobLine}` +
    ` Questions? Call ${business.phone}.`;
  ```
- **Variables:** `first_name`, `receipt_number`, `business_name`, `job_cancelled_line` (caller-built `' Your scheduled service has been cancelled.'` or empty), `business_phone`.
- **Comment in source (line 26):** "Uses hardcoded copy rather than DB templates because void notifications don't justify the template-management overhead."
- **Verdict:** ✅ **CAN MIGRATE — TRIVIAL.** Same shape as D3 — short body, clear variables. The "doesn't justify overhead" rationale is a 2025-era judgment that no longer holds: the user is currently asking for the *opposite* policy ("can these be migrated to chips"). The conditional `{job_cancelled_line}` is the only nuance and is already caller-built. 5 chips.
- **Already covered in 42W Phase 7 as recommended new template.**

#### E2–E7. Voice agent info SMS — 6 sub-types in one route

- **Code:** `src/app/api/voice-agent/send-info-sms/route.ts:74-337`
- **Single route handles 6 `infoType` values, each composing its body inline:**

| Sub-type | Line | Body shape |
|---|---|---|
| `store_info` | 106 | `${biz.name} — ${biz.address}. Hours: ${hoursStr}. Get directions: ${shortMapsUrl}` |
| `product_link` | 160 | `Check out ${product.name} from ${biz.name}: ${shortProductUrl}` |
| `category_link` | 205 | `Browse our ${category.name} at ${biz.name}: ${shortCategoryUrl}` |
| `service_page` | 259 | `Learn more about ${service.name} at ${biz.name}: ${shortServiceUrl}` |
| `booking_link` | 275 | `Book your appointment at ${biz.name}: ${shortBookingUrl}` |
| `quote_link` | 330 | `View your ${biz.name} quote: ${shortQuoteUrl}` |

- **Verdict:** ✅ **CAN MIGRATE — needs 6 new template rows + 6 new chip sets.** Every variable is caller-resolved before send (the route does the DB lookups for product/category/service/quote and creates the short link). Each sub-type has 2-4 chips — clean migration.
- **Cost:** 6 migration rows + 6 entries in `SMS_TEMPLATE_VARIABLES` + caller refactor that switches over `infoType` to a slug map. ~120 LOC of migration text + ~30 LOC of caller refactor.
- **Engineering nuance:** Today the 6 bodies share a *tonal voice* set by the developer who wrote them. Once moved to DB, six independent admin-edits could drift apart. Recommend adopting a single style guide in the body when seeding (or merging closely related ones — `category_link` and `service_page` use identical structure).

#### E8 (already counted in 42W). `transaction_voided` — same as E1 (no second instance — listed once)

---

### Cluster F — Free-text two-way conversations (3 events)

These are not template candidates. Each message is unique prose composed by an operator or AI at runtime.

| # | Event | Code path | Body source |
|---|---|---|---|
| F1 | Operator outbound from messaging inbox | `src/app/api/messaging/send/route.ts:55` | `messageBody` from request body — staff-typed in inbox UI |
| F2 | Operator outbound from conversation thread | `src/app/api/messaging/conversations/[id]/messages/route.ts:122` | Same — staff-typed prose |
| F3 | AI auto-reply (chunked) | `src/app/api/webhooks/twilio/inbound/route.ts:894` | `chunk` from `splitSmsMessage(autoReply)` where `autoReply` is the full Claude-generated response |

**Verdict:** ❌ **CANNOT MIGRATE.** A chip template here would be `{message_body}` — a single chip that holds the entire body. That provides zero authoring value (the operator/AI is *already* the author). Templates are useful when prose structure is fixed and only data varies; here, the prose itself is the variable.

What *could* be templated is the auto-prefix / auto-suffix (e.g., system-injected disclaimers), but that's an enhancement separate from "migrate the body."

---

### Cluster G — Marketing / lifecycle / drip (4 senders)

These already use a chip system — just a different one from `sms_templates`.

| # | Event | Code path | Body source | Chip palette |
|---|---|---|---|---|
| G1 | Manual campaign send | `src/app/api/marketing/campaigns/[id]/send/route.ts:367-368` | `campaign.sms_template` (or A/B variant override at line 348) | `CAMPAIGN_VARIABLES` (`src/lib/utils/template.ts:43`) |
| G2 | Scheduled campaign cron | `src/app/api/marketing/campaigns/process-scheduled/route.ts:292-293` | Same `campaign.sms_template` | Same |
| G3 | Lifecycle engine | `src/app/api/cron/lifecycle-engine/route.ts:716-722` | Resolved template body from `lifecycle_rules.sms_template_id` | Lifecycle template chips (overlapping with CAMPAIGN_VARIABLES) |
| G4 | Drip enrollment SMS | `src/lib/email/drip-engine.ts:430-435` | `step.sms_template` from drip definition | Same as G3 |

All four call `renderTemplate(template, vars)` followed by `sendMarketingSms`. **They are already chip-driven**, just persisted in `campaigns` / `lifecycle_rules` / `drip_steps` tables instead of `sms_templates`.

**Verdict:** **OUT OF SCOPE for the global "migrate hardcoded → chip" decision** — they're already templates. But they raise a separate architectural question:

> **Should marketing templates and transactional templates share the `sms_templates` registry, or stay separate?**

Pros of merging:
- Single audit surface.
- Shared chip palette reduces "which chips exist where" confusion.
- Admin sees one place for "all SMS bodies the system can send."

Cons of merging:
- Slug-keyed templates (`sms_templates`) assume one body per slug. Marketing campaigns are *per-campaign* — there are arbitrarily many. Schema mismatch.
- A/B variants don't fit the slug model.
- Lifecycle rules want different lifecycle metadata (delay, condition) attached to the template.

Recommended position: **stay separate.** They serve different lifecycles (durable transactional templates vs. ephemeral campaign bodies). But document the parallel structure so future audits don't keep "discovering" the marketing chip system as if it were missing.

---

### Cluster H — Admin test send (1 event)

| # | Event | Code path | Slug |
|---|---|---|---|
| H1 | Admin "Send Test SMS" button in template editor | `src/app/api/admin/sms-templates/[slug]/test/route.ts:130-132` | Whatever slug is being edited |

**Verdict:** ✅ Already chip-driven (uses `renderSmsTemplate`). No action.

---

### Cluster I — Refund SMS gaps (2 silent paths)

| # | Event | Code path | Currently fires |
|---|---|---|---|
| I1 | POS refund | `src/app/api/pos/refunds/route.ts` | **NOTHING** — verified zero hits for `sendSms`, `renderSmsTemplate` |
| I2 | Admin order refund | `src/app/api/admin/orders/[id]/refund/route.ts` | **NOTHING** — same |

**Verdict:** **Architectural gap, not a migration question.** Customers get charged, then refunded, with no notification. 42W Phase 7 already proposes new templates `refund_full`, `refund_partial`, `order_refund`. The global chip-migration decision is moot for these — there's nothing to migrate, only something to *create*. Whatever the global call is, **these gaps should be filled with chip templates from the start** (no reason to add hardcoded bodies in 2026 when the chip system is the established pattern).

---

## Phase 3 — The architectural decision

The user's framing — *"global decision: every customer-facing SMS through chips, or some hardcoded?"* — has, after enumeration, only one defensible answer:

### Recommendation: **Chip-by-default with three named exemptions.**

Rule (proposed for CLAUDE.md or `docs/dev/CONVENTIONS.md`):

> Every SMS the application sends MUST go through `renderSmsTemplate()` with a slug-keyed row in `sms_templates`, **except** for:
>
> 1. **Free-text bodies authored at runtime by humans or AI** — the operator inbox (`src/app/api/messaging/*`) and the inbound AI auto-reply (`src/app/api/webhooks/twilio/inbound/route.ts:894`). These remain `sendSms()` direct calls.
> 2. **Marketing campaign / lifecycle / drip bodies** — already chip-templated, but persisted in `campaigns.sms_template` / `lifecycle_rules.sms_template_id` / `drip_steps.sms_template`. These remain on their existing storage.
> 3. **Engine-feature gaps** — currently only `receipt_sms`'s 160-char strict truncation logic. Either extend the engine (out of scope) or move the truncation caller-side and migrate (recommended).

Everything else is migratable. The audit found:

- **2 templates already in DB but unseeded** (Cluster C) — must be migrated to seed migration regardless of global decision.
- **2 trivial migrations** (Cluster D3 `addon_authorization_expired` + Cluster E1 `transaction_voided`) — short bodies, clear chips, low risk.
- **6 standard migrations** (Cluster D1, D2, D4, D5, D6, plus 6 voice-info sub-slugs in E2–E7) — each needs a chip set entry and a seed migration row. Bounded engineering cost.
- **1 truncation-aware migration** (Cluster D7 `receipt_sms`) — also migratable with caller-side adjustment.
- **2 new templates for refund gaps** (Cluster I) — net new functionality.

**Total migration scope:** ~14 new templates seeded + ~14 entries added to `SMS_TEMPLATE_VARIABLES` + ~14 callsite refactors. None individually difficult; aggregate effort is sized as a focused 1–2 session sprint.

### What "chip-by-default" buys

- **Single audit surface.** Future "what SMS does this system send" questions resolve to `SELECT slug, body_template FROM sms_templates;` plus the three exemption clusters.
- **Operator-editable copy without code deploys.** Currently 7+ message bodies require a developer change.
- **Consent and silencing controls.** Every chip template has `is_active` and `can_silence` columns. Hardcoded bodies have no kill switch.
- **Variable validation.** Engine warns on missing required chips (admin PUT validates body shape). Hardcoded bodies have no equivalent guard.

### What "chip-by-default" costs

- **`payment_receipt`-style fallback collisions.** Every new template using `{vehicle_description}` etc. inherits the engine's noun-phrase fallback issue from 42W Phase 4. **Pre-requisite:** fix the engine fallback before mass migration, OR enforce a body-style policy ("never prefix `{x}` with prose articles like `Your` or `The`"). Without this, mass migration multiplies the risk surface.
- **Admin UI per-slug chip definition burden.** Each new slug needs an entry in `SMS_TEMPLATE_VARIABLES`. Currently 16 entries; migration would push it to ~30. Manageable but worth noting.
- **No POST endpoint for admin self-service template creation.** Adding new SMS slugs still requires a developer + migration. The chip system is operator-editable, not operator-extensible. Future-state hygiene: consider exposing template creation to admin once the inventory stabilizes.

### What "stay hardcoded for some" would cost

- Permanent bifurcation: every future SMS audit must ask "is this in `sms_templates` or hardcoded?" and grep both surfaces.
- Inconsistent operator capability — some bodies edit-without-deploy, others don't, with no visible signal to staff.
- Continued drift: every new feature adds another judgment call ("does this justify a template?"). The 7-entry `UNSAFE_SMS_TEMPLATES` list and the 8-entry Cluster E above show the pattern of accretion already in motion.

There is no positive case for keeping the hardcoded population at its current size other than developer convenience.

---

## Phase 4 — Recommended sequencing (if the user picks chip-by-default)

| Step | Scope | Rationale |
|---|---|---|
| 1 | Fix engine fallback collision (42W Phase 6 step 2) | Pre-requisite. Mass migration without this multiplies "your your vehicle"-class bugs across every new template using `{vehicle_description}`, `{service_name}`, etc. |
| 2 | Seed migrations for `payment_receipt` and `loyalty_milestone` (42W Phase 6 step 5) + add their chip sets to `SMS_TEMPLATE_VARIABLES` | Closes the unseeded-but-DB-resident gap. Restores git as source of truth. |
| 3 | Migrate Cluster D3 (`addon_authorization_expired`) and E1 (`transaction_voided`) | Lowest-risk warm-up. Short bodies, clear chips. |
| 4 | Migrate refund gaps (Cluster I) — `refund_full`, `refund_partial`, `order_refund` | Net-new functionality, ships chip system as the chosen pattern from day one. |
| 5 | Migrate Clusters D1, D2, D4, D5, D6 (addon authorization send + 3 quote SMS variants) | Standard migrations. Moderate chip counts. |
| 6 | Migrate Cluster E2–E7 (6 voice-info sub-slugs) | Highest churn — 6 new rows. Worth doing in one batch so the voice agent's tonal voice stays consistent. |
| 7 | Migrate Cluster D7 (`receipt_sms`) with caller-side truncation refactor | Last because it requires the truncation rework. |
| 8 | Update `UNSAFE_SMS_TEMPLATES` to reflect the post-migration reality (likely: only the 3 exemption clusters from Phase 3 above) | Keep the documentary list accurate. |
| 9 | Add the rule to `docs/dev/CONVENTIONS.md` (and reference from CLAUDE.md) so future SMS sites default to chip | Codify the global decision. |

Steps 1–2 are the 42W follow-through; the rest are net new in this 42Z scope.

---

## Phase 5 — Open questions for the reviewer

1. **Should the marketing/lifecycle/drip parallel chip system be folded into `sms_templates`?** The audit recommends keeping them separate (different lifecycles). But the question deserves a documented "no" decision rather than implicit divergence.

2. **Should the chip engine grow conditional rendering?** Patterns like `transaction_voided`'s `{job_cancelled_line}` are caller-built today. A `{#if job_cancelled}` directive would clean up several callsites but adds engine complexity. Soft recommendation: do not — caller-built conditional chips work fine and keep the engine simple.

3. **Should `receipt_sms` truncation logic be moved into the engine, or kept caller-side?** Caller-side is recommended (one-line refactor, preserves behavior, no engine feature). Engine-side would benefit any future strict-length template, of which currently zero exist.

4. **Should the admin UI gain a POST/CREATE endpoint for templates?** Operator self-service template creation is currently impossible. A "new template" path with slug + chips picker would close the loop, but introduces orphan-template risk (a slug with no calling code). Worth a separate audit.

5. **Once chip-by-default is the rule, should `UNSAFE_SMS_TEMPLATES` be renamed?** The "unsafe" framing implies the rest are safe by default — which is approximately true. Better names: `INTENTIONALLY_HARDCODED_SMS` or `SMS_EXEMPT_FROM_TEMPLATE_SYSTEM`. Bikeshedding, but the current name predisposes future readers to think the chip system is dangerous.

6. **For the voice-info 6 sub-slugs, should they be one slug with conditional logic or six independent slugs?** Six independent rows preserves operator-editable tonal differentiation per info type but multiplies the maintenance surface. One slug `voice_info` with `{info_type_body}` chip degenerates to "the body is a chip" — no template value. Recommend six rows.

7. **What's the policy for new SMS sites added between this audit and the migration sprint?** Recommendation: add the convention rule to CLAUDE.md / CONVENTIONS.md *now*, even before migration begins. New code stops adding to the hardcoded population while the migration sprint catches up the existing population.

---

## Files referenced (verified during audit)

### SMS-firing callsites (47 callsites across 32 files)

**Customer-facing chip system:**
- `src/app/api/book/route.ts:597, 609, 658, 668`
- `src/app/api/quotes/[id]/accept/route.ts:85, 91, 119, 129`
- `src/app/api/cron/booking-reminders/route.ts:76, 82`
- `src/app/api/cron/quote-reminders/route.ts:78, 86, 182, 190`
- `src/app/api/pos/jobs/[id]/cancel/route.ts:214, 222`
- `src/app/api/pos/jobs/[id]/complete/route.ts:244, 253`
- `src/app/api/pos/appointments/[id]/notify/route.ts:268, 293, 303`
- `src/app/api/appointments/[id]/notify/route.ts:276, 301, 311`
- `src/app/api/voice-agent/notify-staff/route.ts:89, 127`
- `src/app/api/public/specialty-callback/route.ts:67, 81`
- `src/app/api/voice-agent/appointments/route.ts:301, 528`
- `src/lib/services/voice-post-call.ts:347, 354`
- `src/lib/services/job-addons.ts:146, 148, 218, 220`
- `src/lib/utils/sms.ts:319` (helper)
- `src/lib/email/send-cancellation-email.ts:187, 195`

**DB-as-source-of-truth (unseeded chip templates):**
- `src/app/api/pos/transactions/route.ts:329, 332, 516, 519`

**Hardcoded UNSAFE_SMS_TEMPLATES:**
- `src/app/api/pos/jobs/[id]/addons/route.ts:236`
- `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts:127`
- `src/app/api/webhooks/twilio/inbound/route.ts:864, 876`
- `src/lib/quotes/send-service.ts:222`
- `src/lib/services/voice-post-call.ts:609`
- `src/app/api/voice-agent/send-quote-sms/route.ts:258`
- `src/app/api/pos/receipts/sms/route.ts:79`

**Hardcoded NOT in unsafe list:**
- `src/lib/email/send-void-notification.ts:146`
- `src/app/api/voice-agent/send-info-sms/route.ts:341`

**Free-text two-way:**
- `src/app/api/messaging/send/route.ts:55`
- `src/app/api/messaging/conversations/[id]/messages/route.ts:122`
- `src/app/api/webhooks/twilio/inbound/route.ts:651, 894`

**Marketing / lifecycle / drip:**
- `src/app/api/marketing/campaigns/[id]/send/route.ts:368`
- `src/app/api/marketing/campaigns/process-scheduled/route.ts:293`
- `src/app/api/cron/lifecycle-engine/route.ts:719`
- `src/lib/email/drip-engine.ts:433`

**Admin test:**
- `src/app/api/admin/sms-templates/[slug]/test/route.ts:130, 132`

**Refund gaps (no SMS):**
- `src/app/api/pos/refunds/route.ts` (verified zero hits)
- `src/app/api/admin/orders/[id]/refund/route.ts` (verified zero hits)

### Chip system implementation

- `supabase/migrations/20260327000001_sms_template_system.sql` — schema + 15 seeded templates
- `supabase/migrations/20260329000001_sms_template_variable_audit.sql` — variable additions
- `supabase/migrations/20260330000001_system_sms_logging.sql` — `messages.metadata` for notification context
- `supabase/migrations/20260410000001_staff_notification_sms_template.sql` — 1 added template
- `src/lib/sms/render-sms-template.ts` (276 lines) — engine
- `src/lib/sms/sms-template-variables.ts` (142 lines) — chip registry + UNSAFE list
- `src/lib/utils/template.ts:81-88` — `renderTemplate()` substitution function
- `src/lib/utils/sms.ts:44, 178` — `sendSms()` and `sendMarketingSms()` Twilio entrypoints
- `src/app/admin/settings/messaging/sms-templates/page.tsx` (590 lines) — admin SlideOver editor
- `src/app/api/admin/sms-templates/route.ts`, `[slug]/route.ts`, `[slug]/test/route.ts` — admin API (GET, PUT, test only — no POST)
- `src/app/admin/marketing/email-templates/_components/variable-inserter.tsx` — chip dropdown component (shared with email templates)

---

## Cross-reference to Session 42W

This audit's Cluster C (unseeded `payment_receipt` / `loyalty_milestone`) duplicates 42W Phase 5 rows 1–2 deliberately — the global decision can't be made without acknowledging these are still in the hardcoded population from a *git source-of-truth* perspective, even though they render through the chip engine.

Beyond that overlap, this audit is additive: 42W focused on root-cause for one incident; this one enumerates the entire SMS surface. 42W Phase 7's recommended new templates (`transaction_voided`, `refund_full`, `refund_partial`, `order_refund`) are explicitly affirmed here as part of the chip-by-default migration scope (Phase 4 steps 3–4 above).
