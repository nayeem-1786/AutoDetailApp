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

---


#### Issue 15 — When add-ons ARE configured, agent should surface them proactively (not just on customer pushback)

_(resolved 2026-05-22 — see Section 5.)_

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
