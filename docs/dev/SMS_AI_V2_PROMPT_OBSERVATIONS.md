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

**Severity:** P3
**Observed:** 2026-05-20
**Channel:** SMS allowlist test
**Root cause class:** vehicle-rendering

**Evidence:**

> "your Ferrari Roma Spider or your silver 2016 Accord"

…and later in the same conversation, in a staff-alert payload:

> "(Yellow, exotic)"

**What should have happened:**

Both vehicles rendered identically per locked format: "your 2026 Yellow Ferrari Roma Spider" and "your 2016 Silver Honda Accord". Capitalization consistent. Color included on both. Order: Year + Color + Make + Model.

**What did happen:**

Within a single agent turn, the Accord got "silver" (lowercase color, no year-first ordering, missing Honda make), and the Ferrari got no color at all. Then in the staff-alert downstream payload, color appeared as "Yellow" capitalized in parentheses. Three different renderings of the same data within one conversation.

**Proposed fix direction:**

System-prompt instruction in `src/lib/sms-ai/system-prompt.ts` for vehicle-mention formatting — likely a new bullet under the existing "Reference customer context naturally" critical rule, or a small new section. The render format is in Section 1 of this doc.

**Status:** Open

---

#### Issue 2 — Conversation closure not graceful

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test
**Root cause class:** short-reply-interpretation

**Evidence:**

Customer replied "Nope" to an agent follow-up; agent responded with another summary instead of recognizing the closure signal. Later in the same conversation, a "No" reply was handled gracefully — but the behavior is inconsistent across one-word negatives.

**What should have happened:**

One-word negatives following an agent question that offered to continue (e.g., "Anything else I can help with?") should close the conversation cleanly: a short acknowledgment + an optional closure emoji, no further info push.

**What did happen:**

"Nope" triggered another summary message restating earlier content. The agent did not recognize the customer's intent to end the exchange.

**Proposed fix direction:**

Add explicit short-reply interpretation guidance to the system prompt: list common one-word negatives ("nope", "no", "nah", "not now", "all good") as closure signals when preceded by an agent "anything else?" turn. Pair with the existing emoji-on-closure pattern.

**Status:** Open

---

#### Issue 3 — Short affirmative replies after multi-option offers

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test
**Root cause class:** short-reply-interpretation

**Evidence:**

"Si porfavor", "Yes", and "Si" all failed to advance the agent to the action they were supposed to confirm. The agent re-stated the same multi-option list each time. Pattern reproduced in both English and Spanish.

**What should have happened:**

When an agent offers a multi-option menu and the customer replies with a bare affirmative ("yes" / "si" / "sure"), the agent should ask one focused clarifying question ("Which one — A, B, or C?") rather than re-listing the same options as if the customer hadn't replied.

**What did happen:**

Agent re-presented the original options verbatim in response to the affirmative. Customer's intent was lost; the conversation looped on the same menu.

**Proposed fix direction:**

System-prompt instruction: when the model emits a multi-option offer and the next customer turn is a bare affirmative without a selection, the next agent turn must ask a single targeted clarifying question, not repeat the menu. May want a worked example in the prompt for both English and Spanish bare-affirmative cases.

**Status:** Open

---

#### Issue 4 — Spanish-Mexico vs Spain dialect

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test (staff conversation)
**Root cause class:** language-switching

**Evidence:**

Agent's Spanish was grammatically correct but used neutral / non-Mexican vocabulary defaults. Operator's customer base is predominantly Mexican.

**What should have happened:**

Per the locked decision in Section 1: Mexican Spanish, `usted`/`le` for adults, `carro`/`auto` not `coche`, no `vosotros`. Vocabulary defaults that read as locally familiar to the Smart Details customer base.

**What did happen:**

Spanish output was grammatically valid but dialectally neutral / closer to Spain. Specific instances captured in conversation history but not transcribed here verbatim.

**Proposed fix direction:**

Extend the existing "Multi-language support" section of the system prompt with explicit Mexican Spanish guidance (formality default = `usted`/`le`; preferred vocabulary set; terms to avoid). Likely a short paragraph or bullet list, not a wholesale rewrite.

**Status:** Open

---

#### Issue 5 — Language switching not customer-current-message-led

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test (staff conversation)
**Root cause class:** language-switching

**Evidence:**

Earlier turns of the conversation were in Spanish. Operator then wrote: "Hi can I get pricing for a wash?" (English). Agent replied in Spanish.

**What should have happened:**

Agent should respond in the language of the customer's CURRENT message, not the language of conversation history. A customer who switches to English mid-conversation should get English replies starting with the next agent turn.

**What did happen:**

Agent stayed in the conversation-history language (Spanish) even after the customer's explicit English turn. Required an "In English please" clarification to switch.

**Proposed fix direction:**

Tighten the "Multi-language support" section of the system prompt to explicitly state: respond in the language of the customer's current message, not the language of previous turns. Conversation-history language is a tiebreaker only when the current message is ambiguous (e.g., emoji-only, or punctuation only).

**Status:** Open

---

#### Issue 6 — Past-context-over-extension to new questions

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test (operator conversation)
**Root cause class:** vehicle-disambiguation

**Evidence:**

Customer has 2 vehicles on file (Ferrari Roma + Honda Accord). Earlier in the conversation, customer specified "The Roma" for a quote. Later, customer asked: "Hi can I get pricing for a wash?" — agent assumed Accord without asking which vehicle.

**What should have happened:**

For multi-vehicle customers, every new pricing or service question should re-confirm which vehicle is in scope before quoting, unless the question explicitly references one of their vehicles ("the Ferrari", "my Accord", etc.).

**What did happen:**

Agent silently picked one vehicle (the Accord, not the previously-referenced Roma) and quoted against it. The customer's prior "The Roma" disambiguation didn't persist, AND the agent didn't ask.

**Proposed fix direction:**

Add a "Multi-vehicle disambiguation" rule to the system prompt: when the customer context shows 2+ vehicles AND the customer asks a service/price question without naming a vehicle, the agent must ask which one before invoking pricing tools. The existing "Reference customer context naturally" rule covers acknowledging vehicles but doesn't enforce disambiguation.

**Status:** Open

---

#### Issue 7 — Agent jumps to suggestions instead of discovery questions

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test
**Root cause class:** missing-discovery

**Evidence:**

Customer: "Hi can I get pricing for a wash?"
Agent: listed 3 services (Exterior Wash, Interior Clean, Signature Complete Detail).

**What should have happened:**

The customer used the word "wash" — typically implies exterior. Agent should ask one clarifying question first: "By 'wash' do you mean exterior, interior, or both?" — then quote only the matching tier(s).

**What did happen:**

Agent dumped a multi-service menu including services the customer didn't ask about (Interior Clean, full detail). Over-broad response when a single clarifying question would have narrowed the field.

**Proposed fix direction:**

System-prompt guidance to prefer one focused discovery question when the customer's term is ambiguous (e.g., "wash" could be exterior-only or basic-package), rather than enumerating the full catalog. Pairs with Issue 3 (short-reply-interpretation) — the customer's response to the clarifying question becomes the trigger for the actual quote.

**Status:** Open

---

#### Issue 8 — Multiple ways to ask for a quote — only some recognized

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test (staff conversation)
**Root cause class:** missing-discovery

**Evidence:**

Staff member tried three Spanish phrasings in the same conversation:
- "Me puedes dar un presupuesto" — did NOT trigger `send_quote_sms`
- "Me puedes cotizar" — did NOT trigger `send_quote_sms`
- "Me puedes mandar un quote" — DID trigger `send_quote_sms`

**What should have happened:**

All three phrasings (and their English equivalents — "can you quote me", "give me an estimate", "send me a quote", etc.) should be recognized as quote-request intent and trigger the `send_quote_sms` tool consistently.

**What did happen:**

Only the literal-English-loanword phrasing ("mandar un quote") triggered the tool. The Spanish-native phrasings ("presupuesto", "cotizar") did not.

**Proposed fix direction:**

Either expand the `send_quote_sms` tool description in `src/lib/sms-ai/tools.ts` with example trigger phrasings in multiple languages, or add a system-prompt note clarifying the intent-recognition set for quote requests. The tool description is the model's primary signal for tool selection per Layer 1+2 convention, so that's the likely fix surface — but verify before tuning.

**Status:** Open

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

**Severity:** P2
**Observed:** 2026-05-20 / 2026-05-21
**Channel:** SMS allowlist test
**Root cause class:** missing-discovery, vehicle-data-collection-invariant

**Evidence:**
In multiple conversations, the SMS agent quoted vehicles after collecting Year + Make + Model but
without asking for Color. This matches the agent's current behavior — `classify_vehicle` and
`send_quote_sms` don't strictly require color, and the agent doesn't proactively ask.

This matters because vehicle data integrity for the customer's record must include Color. Walk-in
intake and phone-agent intake both collect Color. SMS agent should match this discipline.

**What should have happened:**
When the customer provides any vehicle info missing Color, the agent should ask ONE focused
question before calling `classify_vehicle` or `send_quote_sms`. Example: "Got it — Honda Accord
2016. What color is your Accord?"

**What did happen:**
Agent skips the Color question and proceeds to classification and quoting. Vehicle row gets
created (or updated) without Color. Downstream "render the customer's vehicle" prose has
incomplete data.

**Proposed fix direction:**
System prompt addition: "When the customer provides vehicle info, collect Year + Make + Model +
Color. If any of the four is missing, ASK ONE focused question before proceeding to
classify_vehicle, send_quote_sms, or any other tool that needs vehicle context." Fold into the
batched prompt-tuning session.

**Status:** Open — scheduled for batched prompt-tuning session

---

#### Issue 11 — Agent asks for customer name unnecessarily when context is present

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test (Spanish, staff member testing as customer Joselyn Reyes)
**Root cause class:** redundant-discovery, context-not-honored

**Evidence:**
In the Spanish quote conversation, after the customer agreed to receive a quote, the agent asked:
"¿A qué nombre lo envío y confirmo que el número es 4243396994?" (To what name do I send it,
and confirm the number is 4243396994?)

The customer's name was already attached to the customer record via prior context. The phone
was already established via the inbound SMS. Both pieces of information were available to the
agent through `getCustomerContext()`.

**What should have happened:**
Agent should silently use the customer's name and phone from the existing customer record.
If the customer was new (no prior record) AND name was missing, ASK for the name. Otherwise,
proceed without asking. The phone number is NEVER asked — the SMS came from that phone, so
the phone is the identity, period.

**What did happen:**
Agent treated the conversation as if information was unknown, asked redundantly. Felt robotic
and slowed the conversation flow.

**Proposed fix direction:**
System prompt addition: "Customer name and phone come from the conversation context bundle.
NEVER ask the customer to confirm their phone number — the SMS is the source of truth for
the phone. NEVER ask for the customer's name UNLESS the customer record has no name on file
AND it's needed for the next action (e.g., creating a quote for a brand-new customer). When
a name is needed, ask casually in conversation, not as a formal verification."

**Status:** Open — scheduled for batched prompt-tuning session

---

#### Issue 12 — Agent asks for phone number despite SMS being the conversation channel

**Severity:** P2
**Observed:** 2026-05-20
**Channel:** SMS allowlist test
**Root cause class:** redundant-discovery, channel-context-not-honored

**Evidence:**
Same Spanish quote conversation as Issue 11. Agent asked "confirmo que el número es 4243396994?"
during a conversation where the customer was actively texting on that exact number.

The phone number is structurally the conversation key — the Twilio inbound webhook receives the
phone in the `From` field, the conversation row is keyed on it, and all message rows reference
the conversation. Asking the customer to confirm their phone via SMS is logically redundant.

**What should have happened:**
Agent should ALWAYS use the conversation's phone as the source of truth. Phone confirmation is
NEVER part of an SMS conversation flow.

**What did happen:**
Agent included phone-confirmation language in the customer-facing message, making the
conversation feel more robotic and bureaucratic than it should.

**Proposed fix direction:**
System prompt addition: "NEVER ask the customer to confirm their phone number. The SMS came
from their phone — that IS the phone number. Use it silently for any tool calls that need a
phone (e.g., send_quote_sms). If the customer mentions a different phone number for some
reason, that's data to capture, not a confirmation to request."

**Status:** Open — scheduled for batched prompt-tuning session

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
