# SMS AI v2 — Prompt Observations

## Purpose

Source of truth for v2 behavioral observations from the 2026-05-20+ allowlist phase. Feeds the eventual batched prompt-tuning session. Each entry: date, conversation evidence, severity, root-cause hypothesis (if known), proposed fix direction.

## What feeds this doc

Every conversation the operator captures from the allowlist phones — verbatim excerpts where possible, with the relevant turns transcribed exactly as customer + agent sent them. New observations get appended to Section 2 as they're captured.

## What doesn't

- **System bugs** (channel CHECK violations, silent INSERT failures, tool-flow regressions) — those go to dedicated fix-session prompts. Section 3 below tracks bugs that *look* like prompt issues but aren't, so they're visible alongside prompt observations.
- **Analytics** (latency, token use, cost) — separate observability work, deferred to Layer 6.
- **Cost data** — out of scope for this doc.

## Related docs

- `docs/dev/SMS_AI_V2_LAYER_3_DISCOVERY.md` — Layer 3 design context + tool catalog
- `docs/dev/SMS_AI_V2_AUDIT_2026-05-19.md` — pre-build design audit
- `docs/dev/ADDON_AUTHORIZATION_FLOW_AUDIT.md` — addon flow + tool semantics
- `src/lib/sms-ai/system-prompt.ts` — current production prompt; the future tuning session edits this file

---

## Section 1 — Locked design decisions

Decisions already made that any future tuning session must respect. Each one-liner is the operator's intent + rationale.

- **Vehicle rendering format = Option B.** Year + Color + Make + Model, always, with proper capitalization. Examples: "your 2026 Yellow Ferrari Roma Spider", "your 2016 Silver Honda Accord", "2024 Black Tesla Model 3". Decided 2026-05-20 by operator after observing inconsistent color rendering ("silver Accord" but no color on "Ferrari Roma" within the same conversation turn).

- **Spanish dialect target = Mexican Spanish.** When customer writes in Spanish, respond in Mexican Spanish. Use `usted` / `le` for adult customers by default. Use `carro` or `auto`, not `coche`. Avoid Castilian terms (`vosotros` → `ustedes`). The Smart Details customer base is mainly Mexican.

- **Channel value = `'sms'` always.** `messages.channel` uses `'sms'` for all v2 outbounds, matching legacy. Agent identity is captured via `sender_type='ai'`, not via channel. Confirmed schema CHECK in migration `20260324000003_cross_channel_bridge.sql`. Reference: fix sessions #42 + #43.

- **No customer pre-authorization for negotiation, just polite redirect to call the shop.** Per system prompt design, the agent does not negotiate pricing. If a customer pushes on price, empathize and route them to a phone call with staff.

- **No emoji unless customer uses one first or it lands naturally in closure context.** Emoji noted as well-received in conversation closure ("😊"). Worth keeping as pattern — sparing, contextual, closure-only by default.

---

## Section 2 — Confirmed prompt-tuning issues

Entries with evidence, ready to be addressed in the batched prompt-tuning session.

#### Issue 1 — Color rendering inconsistency

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 2 — Conversation closure not graceful

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 3 — Short affirmative replies after multi-option offers

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 4 — Spanish-Mexico vs Spain dialect

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 5 — Language switching not customer-current-message-led

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 6 — Past-context-over-extension to new questions

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 7 — Agent jumps to suggestions instead of discovery questions

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 8 — Multiple ways to ask for a quote — only some recognized

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 9 — Vehicle field capitalization not normalized on write

**Severity:** P2
**Observed:** 2026-05-21
**Channel:** SMS allowlist test
**Root cause class:** data-integrity, missing-normalization

**Evidence:**
Operator tested a Tahoe quote from their phone. Typed "green" as the color (no capitalization).
Customer record now shows vehicle color as "green" (lowercase). Similarly, "tahoe" would likely
be stored as "tahoe" lowercase, "chevy" as "chevy" lowercase. Most customers don't capitalize
when texting, so the storage layer ends up with inconsistent casing across thousands of records.

**What should have happened:**
Storage normalization should title-case Year + Make + Model + Color before persistence. "green" →
"Green", "honda" → "Honda", "tahoe" → "Tahoe". This makes downstream rendering consistent without
each renderer having to remember to apply title-case on every read.

**What did happen:**
Raw customer input persisted to DB without normalization. Causes inconsistent display in admin UI,
SMS replies, receipt rendering. Particularly noticeable when the SMS agent renders the vehicle back
to the customer (e.g., "your green Honda Accord" — the lowercase "green" looks unintentional).

**Proposed fix direction:**
Extend `sanitizeVehicleField()` in `src/lib/utils/vehicle-helpers.ts` to apply a `toTitleCase()`
helper on Make + Model + Color fields before INSERT. Handle multi-word colors ("lime green" →
"Lime green") and hyphenated values ("two-tone" → "Two-tone"). Fold into Workstream H Session 4
where vehicle-helpers.ts is being modified for the vehicle_models table integration.

**Status:** Open — scheduled for Workstream H Session 4

---

#### Issue 10 — Color is not consistently collected by agent

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 11 — Agent asks for customer name unnecessarily when context is present

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 12 — Agent asks for phone number despite SMS being the conversation channel

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 13 — No defined "fresh conversation" threshold; agent treats all conversation history as relevant context

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 14 — Agent hallucinates bundle/add-on pricing for services that have no configured add-ons (P1)

_(resolved 2026-05-22 — see Section 5.)_

**Additional refinements — 2026-05-22 testing:**

Two refinements surfaced during multi-vehicle + multi-service operator testing:

(a) **Avoid mentioning the ABSENCE of bundle pricing.** When a service has no
configured add-ons, the agent currently says things like "no bundle discount
configured" or "no current bundle pricing on that one." This makes the system
sound either broken (jargon-y "configured" language) or stingy (customer
thinks they're missing a discount others got). The fix is silence: don't
mention bundle pricing at all when there's none to mention. Just state the
standalone price.

(b) **Sum vs combo language clarification.** When a customer asks about
multiple separate services in one turn (e.g., "engine bay detail and
undercarriage steam cleaning"), the agent may state the arithmetic sum
($175 + $125 = $300) so the customer sees the total. This is acceptable AND
helpful, BUT the language must NOT imply a configured combo discount when
none exists. Acceptable phrasing: "$175 + $125 = $300 total" or "$300 for
both services." Unacceptable phrasing: "combining both services for $300"
(implies a configured combo). When a real configured combo_price exists in
addon_suggestions, present it using the combo math from the tool data. When
it doesn't, present a plain sum without combo language.

Both refinements scheduled for follow-up prompt-tuning session.

---


#### Issue 15 — When add-ons ARE configured, agent should surface them proactively (not just on customer pushback)

_(resolved 2026-05-22 — see Section 5.)_

---

#### Issue 16 — Twilio webhook intercepts inbound 'YES' / 'START' / 'UNSTOP' unconditionally, breaking agent short-affirmative flow (P1)

_(resolved 2026-05-22 — see Section 5.)_

---


#### Issue 17 — Agent doesn't auto-invoke `get_products` for catalog/product link requests

**Severity:** P2
**Observed:** 2026-05-22
**Channel:** SMS allowlist test (Spanish, staff member testing)
**Root cause class:** missing-tool-invocation, prompt-rule-gap

**Evidence:**
During a Spanish conversation, the customer asked for the product catalog:
```
Customer: Hola que productos venden?
AI: [lists categories]
Customer: Tienes catalogo?
AI: ¿Quieres que te mande un link al catálogo de productos por mensaje?
Customer: Si
AI: Para mandarte el link necesito tu número.
```

The agent has access to the `get_products` tool (per tools.ts), which can
return product information AND generate catalog/product links. Instead of
calling the tool when the customer affirmed they wanted the link, the agent
asked for the customer's phone number — which is redundant (Issue 12) AND
unnecessary (the tool can construct the link without re-asking).

**What should have happened:**
When customer asks about products or requests a catalog/product link, the
agent should call `get_products` to retrieve product info. When a link is
needed, the tool returns/generates it; the agent sends it directly without
asking for phone (already known via SMS).

**What did happen:**
Agent improvised a "I need your phone to send the link" affordance that
doesn't exist as a tool path. Customer experience: redundant ask, conversation
stalled.

**Proposed fix direction:**
System prompt addition in the Tool usage guide: "For any product-related
question, catalog request, or product link request, call `get_products` BEFORE
asking the customer for anything. The tool returns the data needed. Don't
ask for phone, name, or any other info as a prerequisite for sending product
info — the conversation context already has everything required."

**Status:** Open — scheduled for follow-up prompt-tuning session

---

#### Issue 18 — Customer Type not classified on new customer record creation

**Severity:** P2 — affects marketing pipeline
**Observed:** 2026-05-22
**Channel:** SMS allowlist test (Spanish, agent-created customer)
**Root cause class:** missing-classification, marketing-data-gap

**Evidence:**
During Spanish testing, the agent collected customer name + phone and created
a new customer record (Crystal Lopez). The resulting customer record defaulted
to `customer_type='Unknown'`. No classification logic ran to determine if the
customer is Enthusiast (B2C consumer interested in services) or Professional
(detailer, body shop, dealership purchasing products).

Marketing implications:
- Unknown customers don't fit into either marketing track (B2C service
  offers vs. B2B product sales)
- Manual reclassification required by staff at follow-up
- Lost opportunity to tag customers at signup based on conversation signals

Operator definition (per chat history):
- **Enthusiast** — B2C customers interested in services, may also buy products.
  Marketing track: service offers, coupons, seasonal promotions.
- **Professional** — Detailers, auto body shops, dealerships. Marketing track:
  product-only sales, bulk pricing, no service offers.

**What should have happened:**
When the agent creates a new customer record AND the conversation signals
strongly suggest a type:
- Service inquiry → likely Enthusiast
- Product-only inquiry with bulk/wholesale signals → likely Professional
- Mixed or ambiguous → Unknown (default)

The classification should be a tool call or extension to the existing
customer-creation flow.

**What did happen:**
Crystal's record was created with `customer_type='Unknown'` despite the
conversation clearly indicating Enthusiast behavior (asked about Express
Wash, Signature Complete Detail, multi-vehicle owner).

**Proposed fix direction:**
Two-layer approach:
(a) System prompt addition: "When creating a new customer record, infer
customer_type from conversation context. Service-focused inquiries → tag
Enthusiast. Bulk product / wholesale / business-account signals → tag
Professional. Default to Unknown only when neither signal is clear."
(b) Tool/endpoint check: confirm the customer-creation path (likely inside
`send_quote_sms` or `find_or_create_customer` helper) accepts a customer_type
parameter and persists it. If not, that's a small endpoint extension.

**Status:** Open — gated on tool-data verification + prompt rule. Scheduled for follow-up prompt-tuning session.

---

#### Issue 19 — notify_staff deduplication missing; same intent repeats firing

**Severity:** P2 — operator-experience and noise
**Observed:** 2026-05-22
**Channel:** SMS allowlist test (Spanish, appointment reschedule)
**Root cause class:** missing-state-tracking, agent-doesnt-recognize-continuation

**Evidence:**
Customer asked to reschedule an appointment. Agent correctly fired
`notify_staff` once. Customer then asked clarifying follow-up questions on
the same intent (still about rescheduling). Agent fired `notify_staff` two
more times for the same intent within minutes:

```
Customer: Hola niecesito reagendar mi cita
Staff notification sent: Appointment Change/Cancel — Crystal quiere reagendar...

Customer: Si sabes de cual cita te hablo?
Staff notification sent: Appointment Change/Cancel — Customer wants to reschedule...

Customer: La puedo reagendar ahora?
Staff notification sent: Appointment Change/Cancel — Crystal quiere reagendar de hoy...
```

Three notifications fired for one underlying intent. Staff receives the same
ping three times within a few minutes.

**What should have happened:**
Once `notify_staff` fires for a given intent in a conversation, subsequent
customer messages on the same topic should NOT re-fire the notification.
The agent should recognize the continuation and respond conversationally
("Yes I notified them already — they'll reach out soon").

**What did happen:**
Each on-topic customer message triggered another notification. No
deduplication.

**Proposed fix direction:**
Two possible approaches:
(a) **Prompt-only:** System prompt addition: "After calling `notify_staff`
for an intent, do NOT call it again for the SAME intent in the same
conversation. Subsequent customer messages on the same topic should get a
conversational reply acknowledging the prior notification."
(b) **Tool-level:** Add a backend dedup check in `notify_staff` that
prevents duplicate notifications for the same conversation_id + reason
within a time window (e.g., 1 hour).

Recommend (a) first as a prompt-level fix. (b) is defense-in-depth for if
the prompt fails to honor the rule.

**Status:** Open — scheduled for follow-up prompt-tuning session (prompt-level fix); backend dedup is a future enhancement.

---

#### Issue 20 — Quote modification needs supersession pattern; current behavior leaves stale quotes acceptable

**Severity:** P2 — data integrity + customer confusion
**Observed:** 2026-05-22 (originally discussed; diagnostic completed same day)
**Channel:** SMS allowlist test (operator testing multi-service modification)
**Root cause class:** missing-supersession-infrastructure, half-built-expired-state

**Evidence:**
When the customer modifies a quote ("I want the undercarriage done too,"
then later "actually just the engine bay"), the agent generates a new quote
via `send_quote_sms`. The OLD quote remains valid with its full validity
window (default 7 days). The customer's SMS history contains both quote
links, both clickable, both with active "Accept Quote" buttons. Risk: customer
clicks the older quote and accepts stale pricing/services.

**Diagnostic findings (read-only audit, 2026-05-22):**

(1) The `quotes.status` enum already has `'expired'` value. The public quote
page already renders a red "expired" banner. The `convert-service` already
rejects conversion on expired status. The `Re-Quote` button (currently dead
code per Issue 21 diagnostic) already gates on expired. The infrastructure
is half-built — the WRITE path for `status='expired'` does not exist.

(2) Specifically missing:
- No cron job, trigger, or runtime code writes `status='expired'`
- The `valid_until` column is set on every quote but never enforced
- No `cancel_quote` tool or endpoint for sent/viewed/accepted quotes
- No `superseded_by_quote_id` column for tracking lineage

(3) Staff POS already supports in-place mutation for editable statuses
(draft, sent, viewed, accepted — confirmed via quote-detail.tsx button gating
at lines 343-475). Mutation works for staff because operator judgment
compensates. Agent-driven supersession is a different concern because
the agent has no operator judgment.

**What should have happened:**
When the agent modifies a previously-sent quote, the OLD quote should
become unacceptable (status='expired') and the NEW quote should be the only
acceptable one. Customer's SMS history still shows both links, but clicking
the old one reveals the existing "expired" banner — no Accept button visible.

**What did happen:**
Old quote stays acceptable. New quote also acceptable. Risk of accidental
acceptance.

**Proposed fix direction (Path D-prime):**
Finish the half-built expired infrastructure + add lineage tracking. NOT
build a parallel "supersession" concept from scratch.

Specific work (sequenced as Workstream I in the roadmap):
- Add expiration cron (nightly: flip status='expired' when valid_until < now())
- Add `superseded_by_quote_id` nullable FK column on quotes
- Extend `send_quote_sms` with optional `supersedes_quote_id` parameter
- In same transaction: old quote → expired status + lineage column set,
  new quote created
- Agent system prompt: pass `supersedes_quote_id` when modifying a
  previously-sent quote

Smaller scope than the "Path B" originally considered because the expired
status + banner + page rendering already exist. Marginal cost is one
cron + one column + one optional parameter.

**Status:** Open — scoped as Workstream I. Sessions 1 + 2 (expiration cron + agent supersession) directly address this issue. See Workstream I details in `ROADMAP-13-ITEMS.md`.

---

#### Issue 21 — Re-Quote button is dead code (mechanically functional, semantically broken)

**Severity:** P3 — feature gap rather than active bug
**Observed:** 2026-05-22 (verified via code audit of quote-detail.tsx + page.tsx + quote-builder.tsx)
**Channel:** POS code review
**Root cause class:** half-built-feature, signature-vs-binding-mismatch

**Evidence:**

The Re-Quote button at `quote-detail.tsx:462-466` gates on
`quote.status === 'expired'`. The handler `handleReQuote()` at line 177
accepts a quoteId argument and calls `onReQuote(quoteId)`.

But the parent binding at `src/app/pos/quotes/page.tsx:40` discards the
quoteId argument:
```tsx
onReQuote={() => setView({ mode: 'builder', quoteId: null })}
```

The arrow function signature `() =>` ignores the quote_id parameter. The
builder then mounts with `quoteId={null}`, runs CLEAR_QUOTE, and renders
an empty "New Quote" UI with NO data carryover.

Result: clicking Re-Quote on an expired quote opens a blank New Quote
builder — same as clicking "+ New Quote" from the list. The source quote
data (customer, vehicle, services, modifiers, notes) is never loaded.

The inline comment at line 178 (`// Clear quote state — builder will create new from this quote's data`)
describes intended behavior that was never implemented.

Double-broken in practice:
- The `expired` gating status never fires (per Issue 20)
- Even when the button does render, the handler doesn't copy source data

**What should have happened:**
A genuine "copy this quote's data into a new draft" feature, available on
ANY non-draft status (sent, viewed, accepted, expired, converted).

**Proposed fix direction:**
Rebuild the handler as a true "Copy Quote" feature (scoped as Workstream I
Session 3). Three changes required:

(a) Fix the parent binding to forward quoteId
(b) Add builder pre-population logic (new prop `copyFromQuoteId` or new
reducer action `LOAD_QUOTE_AS_COPY` that fetches source data and seeds
customer/vehicle/items/modifiers/notes)
(c) Audit log entry on save: "Created as copy of Q-XXXX on [date] by [user]"

Plus:
(d) Rename button label "Re-Quote" → "Copy Quote"
(e) Expand status gating from `expired` only → all non-draft (sent, viewed,
accepted, expired, converted)
(f) Remove the misleading comment at line 178

**Status:** Open — scoped as Workstream I Session 3. Depends on Session 4 (Quote History audit logging) for the audit entry mechanism.

---

## Section 3 — Critical bugs surfaced during testing (non-prompt)

These look like prompt issues but are actually code / tool-flow bugs. Tracked here so they're visible alongside prompt observations; resolved via dedicated fix sessions, not prompt tuning.

_(Bug A resolved 2026-05-20 — see Section 5.)_

---

## Section 4 — Pre-emptive flags (not yet tested or partially tested)

Items flagged early in the allowlist phase that haven't been fully exercised. Each one-liner notes current status.

- **One-word replies** — partially tested via "Nope" / "Yes" / "Si". See Issues 2 and 3 above.
- **Mixed-language switching** — tested via the "In English please" turn; works when explicitly requested, but agent shouldn't have opened in Spanish for an English question. See Issue 5.
- **Negotiation** — NOT TESTED. Future test: send "can you do $20 off?" after receiving a quote and verify the redirect-to-call behavior.
- **MMS (image inbound)** — NOT TESTED. Future test: send a photo of a car and observe whether the agent handles the inbound gracefully (or escalates).
- **Multi-question single message** — NOT TESTED. Future test: "How much for a wash on the Accord and when can I come in?" — verify both sub-questions get addressed in one reply.
- **Out-of-scope query** — NOT TESTED. Future test: "Do you sell cars?" / "What's the weather?" — verify clean refusal + redirect.
- **Stale conversation pickup** — NOT TESTED. Future test: send a message, wait a day, send another. Verify the agent picks up context cleanly (or asks to refresh).

---

## Section 5 — Resolved

- **Bug A: Wrong-tier pricing in quote_sms tool output (Q-0076)** — resolved 2026-05-20 via session #45 (`fix/send-quote-sms-hardcoded-sedan-tier`). **Root cause:** `src/app/api/voice-agent/send-quote-sms/route.ts:82` hardcoded `const sizeClass = 'sedan';` before the service price-resolution loop, regardless of agent-provided `vehicle_year/make/model`. Q-0076 live-row inspection confirmed `quotes.vehicle_id` correctly pointed at a Tahoe with `size_class='suv_3row_van'`, but `quote_items.tier_name='sedan'` / `unit_price=210` was frozen by the hardcoded constant (the Tahoe's correct suv_3row_van tier was $320). Neither original hypothesis (A: vehicle context didn't flow; B: rendering bug) was exact — the actual layer was the endpoint accepting vehicle data but throwing it away for pricing. **Approach:** reordered the endpoint handler so `findOrCreateVehicle` (which internally classifies via `resolveVehicleClassification`) runs BEFORE the price-resolution loop, exposing `size_class` + `specialty_tier` via two new fields on `FindOrCreateVehicleResult`. `resolvePrice(service, sizeClass)` now receives the classified value. Explicit `'sedan'` fallback (with `console.warn`) survives only for the no-vehicle / null-result case. Fix reordered `findOrCreateVehicle` to run before `resolvePrice`; the agent's prompt-tuning issue around specialty-vehicle routing (agent should call `classify_vehicle` first for non-sedan vehicles, and route exotic/classic/RV/boat/aircraft to `notify_staff` instead of `send_quote_sms`) remains in Section 2 for future prompt-tuning work — not addressed by this code fix.

- **Issue 1: Color rendering inconsistency** — resolved 2026-05-22 via session #49 (batched prompt tuning). Approach: new `# Formatting and naming` section pins Year + Color + Make + Model order with capitalization (lowercase customer input rendered as Title Case in agent prose).
- **Issue 2: Conversation closure not graceful** + **Issue 3: Short affirmative replies after multi-option offers** — resolved 2026-05-22 via session #49. Approach: `# Discovery and conversation flow` section adds "Reading short replies" subsection (interpret short affirmatives/negatives against the most recent agent message) + "Graceful closure" subsection (one brief acknowledgment after short-negative to "anything else?", no repeat-summary, no second "anything else?").
- **Issue 4: Spanish-Mexico vs Spain dialect** + **Issue 5: Language switching not customer-current-message-led** — resolved 2026-05-22 via session #49. Approach: `# Language handling` section (renamed from `# Multi-language support`) declares Mexican Spanish vocabulary pins (carro/auto NOT coche; ustedes NEVER vosotros; usted/le default mirroring; Mexican confirmations) + current-message-led switching rule (current message language wins over history; immediate switch on explicit request).
- **Issue 6: Past-context-over-extension to new questions** + **Issue 10: Color not consistently collected** — resolved 2026-05-22 via session #49. Approach: `# Vehicle info requirement` section declares Multi-vehicle disambiguation rule that fires every turn (ALWAYS ask which vehicle for any pricing inquiry from a multi-vehicle customer when current message doesn't specify) + Color: ask-once-then-proceed rule (don't loop; backend records null color for staff follow-up). Compounds with Issue 13's 4-hour rule.
- **Issue 7: Agent jumps to suggestions instead of discovery questions** — resolved 2026-05-22 via session #49. Approach: `# Discovery and conversation flow` adds "Discovery before menu enumeration" rule with good/bad examples ("Looking for just the outside, or interior too?" vs catalog enumeration).
- **Issue 8: Multiple quote-request phrasings not all recognized** — resolved 2026-05-22 via session #49. Approach: `# Tool usage guide` extended with "Quote-send intent recognition" paragraph listing English ("text me the price", "give me an estimate", etc.) and Spanish ("me puedes mandar un quote", "me puedes cotizar", "me puedes dar un presupuesto", "mándame la cotización") phrasings; don't require literal word "quote".
- **Issue 11: Agent asks for customer name unnecessarily** + **Issue 12: Agent asks for phone number on SMS channel** — resolved 2026-05-22 via session #49. Approach: Critical rule 9 strengthened to forbid asking for first name when on file and forbid asking for phone always (customer is texting from it).
- **Issue 13: No defined "fresh conversation" threshold (D14)** — resolved 2026-05-22 via session #49. Approach: new `# Conversation freshness` section codifies the 4-hour soft-reset rule (gap < 4h continues, gap ≥ 4h treats current message as fresh — re-ask vehicle for multi-vehicle customers AND re-evaluate service intent) with the explicit-prior-reference exception (continuation regardless of elapsed time when current message names a prior item).
- **Issue 14: Bundle pricing hallucination, P1 (D15)** + **Issue 15: Proactive add-on disclosure (D16)** — resolved 2026-05-22 via session #49. Approach: new Critical rule 14 (tool-grounded add-ons only — every bundle/combo/savings MUST come from `addon_suggestions` for that specific primary service; never invent) + new `# Add-ons and bundle quoting` section with the "no current bundle pricing configured" canned response for empty add-on arrays + proactive surfacing rule (1-2 most-relevant add-ons in the same message as the standalone quote, picked by highest savings or topical fit, one mention per turn).

- **Issue 16: Twilio webhook intercepts inbound 'YES' / 'START' / 'UNSTOP' unconditionally (P1)** — resolved 2026-05-22 via session #50 (`fix/twilio-yes-keyword-interception`). **Root cause:** `src/app/api/webhooks/twilio/inbound/route.ts:230-315` unconditionally treated any inbound matching the `START_WORDS = ['START', 'YES', 'UNSTOP']` list (exact-match, case-insensitive after `body.trim().toUpperCase()`) as a TCPA opt-in keyword — calling `updateSmsConsent({action:'opt_in'})`, writing a "Customer sent 'Yes' — opted back in to SMS" system message, and returning early with `TWIML_EMPTY` BEFORE the SMS AI v2 routing block (line 462+) could fire. Effect: agent silently ghosted any English-speaking customer who replied "Yes" to a short-affirmative question. Live evidence: conv `23ee4f02` had 6 inbound 'Yes' messages and zero agent replies in the past ~2 days; the system "opted back in" message all-time count was 6, all in that single conversation. Customer-base impact: 1,374 of 1,384 non-deleted customers have `sms_consent=true`; only 10 are opted out, and zero recent `sms_consent_log` rows are `source='inbound_sms'`. The bug overwhelmed its only legitimate purpose. Spanish "Si" / "Sí" were NOT affected (not in keyword list). **Approach:** piggybacked an extra column on the existing customer SELECT (`select('id, sms_consent')`), introduced a gate `customerIsOptedOut = customer?.sms_consent === false`, and split the keyword check into `isStartWordKeyword` (raw match) and `isStartWord = isStartWordKeyword && customerIsOptedOut`. The `if (isStopWord || isStartWord)` block now only fires the opt-in path when the customer is genuinely opted out. For opted-in / unknown / new customers, START_WORDS fall through to the normal pipeline; the agent's short-reply rules (Issue 3, resolved in session #49) interpret them. STOP_WORDS interception is unconditional (TCPA floor — unchanged). `updateSmsConsent()` helper untouched (its idempotency guard remains as defense in depth). The system "opted back in" message no longer fires for opted-in customers' casual "Yes" replies. **Tests:** new `src/app/api/webhooks/twilio/inbound/__tests__/start-words-gate.test.ts` with 17 cases covering pass-through (5: opted-in, opted-in with caps/lowercase/whitespace, new customer no row, sms_consent=null), legitimate opt-in (3: opted-out + YES/Start/UNSTOP), STOP unconditional (3: opted-in/opted-out/new customer), exact-match regression (4: "Yes please", Spanish "Sí", "Yes." with period, "yeah"), and a STOP-then-YES sequenced round-trip integration case. **Verification:** tsc 0 errors, lint 0 errors / 97 warnings (unchanged baseline), 1858/1858 vitest pass (was 1841; +17 new), build clean. **Deploy required: YES** via `deploy-smartdetails`. After deploy, re-test conv 23ee4f02 by sending "Yes" — agent should reply normally instead of the system intercept message.

  - **Follow-up — Twilio Console keyword list alignment** — completed 2026-05-22 via session #51 (`fix/twilio-keyword-alignment`). The Yes-fix shipped with the pre-existing keyword lists `STOP_WORDS = ['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT']` and `START_WORDS = ['START','YES','UNSTOP']`, which diverged from the actual Twilio Console compliance keywords for +14244010094 (Console verified 2026-05-22 — opt-in: START / SUBSCRIBE / LETSGO / SIGNMEUP; opt-out: OPTOUT / CANCEL / END / QUIT / UNSUBSCRIBE / REVOKE / STOP / STOPALL). Both Twilio and this app intercept these messages independently; misalignment caused inconsistent handling. **Change:** STOP_WORDS gained `OPTOUT` + `REVOKE`. START_WORDS gained `SUBSCRIBE` + `LETSGO` + `SIGNMEUP` and lost `YES` + `UNSTOP` (those were originally defensive heuristics, never in Twilio Console; the Yes-fix consent gate now correctly handles conversational YES via fall-through to the agent regardless). Alignment comment added above the constants documenting the Twilio-Console-pairing invariant. Gate logic unchanged. Test impact: 3 existing tests modified (opted-out + YES → opted-out + SUBSCRIBE; opted-out + UNSTOP → opted-out + LETSGO; STOP→YES round-trip → STOP→SUBSCRIBE round-trip) + 2 new fall-through tests added documenting the new behavior (opted-out + YES → falls through to agent; opted-out + UNSTOP → falls through to agent). Test count 17 → 19 in this file. Verification: tsc 0 errors, lint 0/97 warnings, 1860/1860 vitest pass (was 1858; +2 net), build clean. Customer-base impact identical to the Yes-fix: only ~10 of ~1,384 customers are opted out, and those are imported Square contacts not actively using SMS — the YES/UNSTOP keyword removal has near-zero blast radius.

Each future entry format:

```
- **Issue N: [Title]** — resolved YYYY-MM-DD via session #NN (commit SHA). Approach: [one-line summary].
```

---

## Section 6 — Process notes

- This doc is read by the prompt-tuning CC session as its input. The eventual tuning session takes Sections 1 + 2 as the spec for the edits it makes to `src/lib/sms-ai/system-prompt.ts`.
- When an issue is resolved, move it from Section 2 to Section 5 with the resolving commit SHA. The Section 2 entry's "Status: Open" becomes the Section 5 entry's resolution line.
- Critical bugs (Section 3) become their own fix-session prompts, not prompt-tuning items. The tuning session should explicitly skip Bug A until its dedicated fix session lands.
- New observations get appended to Section 2 as they're captured from production conversations. Pre-emptive flags (Section 4) graduate to Section 2 once they have evidence from a real test.
- Locked design decisions (Section 1) are not negotiable in a tuning session without explicit operator sign-off — they're the constraints the tuning operates within.

---

## Section 7 — Vehicle Classification & Escalation Architecture (planned)

This section captures the architectural decisions for handling vehicle
classification, exotic/classic vehicles, and unknown vehicles. The build
itself is sequenced in `ROADMAP-13-ITEMS.md` under Workstream H. Decisions
here are locked unless explicitly revisited by the operator.

### Background

Before this architecture: the classifier in `src/lib/utils/vehicle-categories.ts`
returned `'sedan'` as a silent fallback for any vehicle it couldn't recognize.
The send-quote-sms endpoint ALSO hardcoded sedan (Bug A — fixed 2026-05-20
in commit `190f23be`). Net effect: ~half of all non-sedan vehicles received
wrong-tier pricing for the lifetime of the voice-agent + SMS-AI v2 endpoints.
Bug A's fix addressed the endpoint half. This architecture addresses the
classifier half and introduces a structured escalation path for genuinely-
unknown vehicles.

### Design decisions (locked)

**D1 — Exotics and classics ALWAYS escalate (Design B).**
Exotic + classic vehicles will NOT be auto-quoted by SMS agent or voice
agent. They will NOT appear in the public booking widget's price-display
path. Pricing for exotic/classic tiers exists in the catalog ONLY for
staff use via POS / walk-ins / manual quote creation. Rationale: operator
wants visual confirmation of vehicle condition before pricing high-value
work; staff can up-charge based on what they see; the bar for "auto-quote"
is lower for standard vehicles.

**D2 — Unknown vehicles escalate via the same path as exotic/classic.**
When the classifier returns `size_class === null` (no rule, no match), the
backend refuses to auto-quote and triggers an escalation. Customer receives
an LLM-adapted "we'll follow up" message; staff receives a notification
with vehicle details and a deep link to the customer record.

**D3 — Two-tier classification system: `vehicle_models` table FIRST, regex fallback SECOND.**
A new `vehicle_models` table will store curated Make+Model rows with
authoritative size_class assignments. The classifier checks this table
before falling through to the existing regex-based logic. The regex layer
is preserved as a safety net but is no longer the only path. Hardcoded
arrays (`EXOTIC_MAKES`, `CLASSIC_ELIGIBLE_MAKES`, `MODEL_SIZE_HINTS`)
remain in code as the final fallback layer.

**D4 — Customer-facing message is LLM-adapted, not template-verbatim.**
Templates provide guidance about WHAT to say (key facts: vehicle, reason,
expected follow-up). LLM adapts WORDING to maintain conversational
naturalness and respect customer language (English/Spanish/etc.). This
preserves the agent's casual conversational tone established in Layer 4.

**D5 — Staff notification is template-controlled via existing `staff_notification_templates`.**
New template `staff_notification_escalation` covers all three reasons
(exotic, classic, unknown) using a single template with placeholders.
Reason field differentiates triage. Other fields: customer name, phone,
vehicle (year/make/model/color), last message excerpt, deep link to admin.
No customer-facing deep link in SMS.

**D6 — Deep link lives in admin escalation panel only, not in any SMS.**
Operator must use desktop to handle escalations; mobile SMS notification
carries only the alerting payload. Reasons: SMS character limits, URL
preview rendering risks, separation of "alert" vs "act."

**D7 — Vehicle Makes + Vehicle Models = master-detail relationship in admin UI.**
Vehicle Makes card (existing) remains the primary list. Selecting a Make
populates a Vehicle Models card below it. Models are scoped to the
selected Make. Unselected Make = empty/placeholder state in Models card.
Inline CRUD with auto-save. New makes can be auto-created from the
escalation "Add to catalog" form with operator confirmation prompt
("Make 'Lordstown' doesn't exist. Create it as automobile category?").
Auto-create handles both vehicle_makes + vehicle_models row inline.

**D8 — Escalations queue lives at Admin > Reports > Escalations.**
Separate from POS Settings (where catalog management happens). Reports
section emphasizes the queue+analytics nature: filter by date/type/status,
table with per-row actions (open conversation, view customer + vehicles,
add to catalog, mark resolved), aggregate metrics. Operators come here to
handle unresolved escalations and review trends.

**D9 — Color is required for vehicle persistence.**
Year, Make, Model, AND Color must be collected by SMS agent before any
vehicle row is created. System prompt enforced; backend permits null
color if customer abandons mid-conversation but logs that color is
missing in the escalation notification.

**D10 — Vehicle re-classification on null `size_class`.**
If a customer-vehicle row was previously created with `size_class=null`
(via escalation), the classifier on subsequent agent calls should
re-classify (consult the vehicle_models table again, since staff may
have added a row in the meantime). Once a non-null size_class is stamped,
the classifier uses the stamped value.

**D11 — Voice agent (Retell) follows the same escalation policy.**
Same backend guards apply to voice-agent endpoints. Voice agent's prompt
will be updated to match. After-hours customer calls trigger same
escalation but customer-facing message reflects next-day callback.

**D12 — Legacy specialty-pivot block deletion deferred to Layer 5.**
The existing legacy specialty-pivot code (route.ts:604-674) is functionally
the same pattern this new escalation will use. Layer 5's "eradicate legacy"
plan deletes it. No bridge work needed before Layer 5 — the new escalation
handles allowlisted phones; legacy continues for non-allowlisted phones
until Layer 5 ships, at which point the legacy path is removed entirely.

**D13 — Vehicle field capitalization normalized on write.**
Make, Model, and Color stored with title-case applied via
`sanitizeVehicleField()` regardless of customer input case. "green" →
"Green", "honda" → "Honda", "tahoe" → "Tahoe". Folds into Session 4
(vehicle_models integration) since both touch `vehicle-helpers.ts`.

**D14 — 4-hour fresh-conversation soft-reset rule.**
After 4+ hours of inactivity (no inbound or outbound on the conversation),
the agent treats the next inbound as a fresh conversation. Re-asks vehicle.
Re-evaluates intent. Does not carry forward assumed service context from
earlier in the message history. EXCEPTION: explicit content references
("book that quote", "yes proceed", "the Tahoe one") override the reset
and the agent recognizes continuation. This applies to v2 SMS agent;
voice agent follows the same rule per D11. Threshold value (4 hours) is
intentional middle-ground between aggressive resets (favors fresh starts
but disrupts continuations) and lazy continuity (continues across
overnight gaps inappropriately). Revisit if real-world data suggests
adjustment.

**D15 — Bundle/add-on pricing comes from tool data ONLY; agent never invents.**
Hard guardrail. The agent may ONLY mention add-ons and bundle pricing
that are returned by the `get_services` tool response for the specific
service being discussed. If a service has no configured add-ons in the
catalog, the agent says so directly rather than fabricating options.
This is a P1 customer-trust + revenue rule. Violations create
expectations the POS cannot honor at checkout. Tool-data shape must
support this rule before the prompt rule is meaningful — separate
diagnostic confirms whether `get_services` returns add-on data today.

**D16 — Proactive add-on disclosure when configured.**
When `get_services` returns configured add-ons for the service being
quoted, the agent briefly mentions 1-2 relevant add-ons in the quote
message with combined-price context. Surfaces upsell naturally rather
than waiting for customer pushback. Not a menu of every possible
bundle — the most natural complement, with savings context. Pairs
with D15: surface real add-ons, never invent ones. Add-on relationships
are defined in the catalog by operator (Admin > Catalog > Services
add-on configuration); the agent reports what's configured, doesn't
decide what bundles together.

**D17 — Copy Quote field-mapping decision (operator-locked 2026-05-22).**
When the Copy Quote feature (Workstream I Session 3) creates a new draft
from a source quote, the following fields carry over:
- customer_id (identity)
- vehicle_id (default vehicle)
- items / services / products (the whole point of the copy)
- notes (internal notes carry forward)
- is_mobile / mobile_zone / mobile_surcharge (service location)

The following fields RESET:
- coupon_code + coupon_discount (coupons are time-bound)
- loyalty_points_to_redeem + loyalty_discount (loyalty balance may have changed)
- manual_discount_type/value/label (operator decides whether to re-apply)
- valid_until (new validity window from current date)
- sent_at / viewed_at / accepted_at (lifecycle starts over)
- access_token (fresh token for new quote URL)
- status (set to 'draft')
- quote_number (newly generated)
- converted_appointment_id (not converted)
- follow_up_status (reset to 'not_contacted')
- last_activity_at (fresh from now)
- created_by (set to current operator)

Principle: identity + content carries over; lifecycle + system state resets.

**D18 — Supersession via existing expired status, NOT new infrastructure (operator-locked 2026-05-22).**
The agent-driven quote supersession path uses the existing `quote_status`
enum value 'expired' rather than introducing a new 'superseded' value.
Reasons:
- The `expired` status is already half-implemented: enum value, public page
  banner, conversion guard, and Re-Quote button gating all exist
- Adding a separate `'superseded'` value would create a parallel concept
  with overlapping semantics
- Lineage tracking via `superseded_by_quote_id` nullable FK column gives
  the ability to distinguish "expired naturally" (null) from "expired via
  supersession" (set) without needing a separate status

Path-of-least-resistance pattern: finish the half-built `expired`
infrastructure, then add minimal lineage column. Total marginal schema
cost: one nullable FK column.

### Coverage targets

After full architecture lands:
- 97-99% accurate classification on common cases (table + regex)
- Remaining 1-3% gracefully escalates to staff (no silent miscoding)
- Operator visibility via Admin > Reports > Escalations
- Self-improving system: every escalation can result in a new vehicle_models row → fewer future escalations

### What this does NOT solve (out of scope)

These are operator-aware limitations of the planned architecture, NOT bugs:

- **Heavily modified vehicles** (e.g., 1969 Mustang with modern V8 swap):
  classifier sees the make/model; operator handles up-charge during walk-in
  inspection via POS. Per-customer `size_class_manual_override` available
  if needed.
- **Trim-level differentiation** (e.g., Civic LX vs Civic Type R):
  classifier treats them the same; pricing config differentiates if needed
  via service-level tier configuration, not classifier logic.
- **Online booking widget for exotics/classics:** separate workstream;
  widget should NOT auto-price exotics/classics regardless of catalog
  pricing being present. To be scoped after SMS/voice flows are stable.
