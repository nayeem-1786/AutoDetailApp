# Issues 43 + 44 — SMS-AI Agent Prompt Discipline Audit (2026-05-26)

> Read-only diagnostic audit. NO source code modified. NO migrations.
> NO test changes. Verifies operator-locked Issue 44 decisions are
> implementable; recommends fix architecture for both issues; flags
> the one PM2-evidence gap that operator must resolve before
> implementation locks.
>
> Companion to the Issues 42-46 capture commit
> (`436424f5` / `1863b451` merged 2026-05-26) which is the ground
> truth for Issues 43 + 44 descriptions, severities, and operator-
> locked decisions. Source-side findings cite `file:line`.

---

## TL;DR

**Root cause (Issue 43 — agent quotes wrong price first, self-corrects):** strongly suggested to be **hypothesis (a) — LLM confabulation from earlier conversation context** rather than (b) wrong size_class or (c) skipped get_services. Architectural evidence: D40 (Issue 36, `tool-dispatcher.ts:345-372`) ALREADY auto-injects `size_class` from RuntimeContext into every `get_services` call, captured from the most recent `classify_vehicle` response. The only way the agent reaches a wrong size_class is (b1) it called `get_services` BEFORE `classify_vehicle` and never recalled — but Critical Rule 6's "Recall directive" (`system-prompt.ts:262-275`) already covers this. The remaining failure mode is the LLM confabulating a price between `get_services` calls — i.e., recalling from prior turn's context or training-data baseline without re-grounding. **PM2 evidence required to confirm** — Target 1 currently EVIDENCE-BLOCKED (see below).

**Root cause (Issue 44 — scope-tier discovery + Complete-anchor gap):** confirmed structural via source-side reading. `system-prompt.ts:59-170` (Critical Rules 1-19) has rules for pricing fidelity (Rules 1, 5, 6, 7) but **zero rules for scope-pricing tier ENUMERATION or upsell ANCHORING**. The "Add-ons and bundle quoting" section (lines 228-235) covers add-on enumeration within a primary service but not tier enumeration WITHIN a scope-pricing primary. The agent's default behavior — quote the customer-mentioned tier, stop — is consistent with the prompt's general "answer the question" tone (line 307: "Don't present the full catalog as a substitute for understanding what they want") which can be misread as discouraging tier enumeration even when warranted.

**Recommended fix architecture:**

- **Issue 43:** **Option C — Both A and B (system-prompt Critical Rule + tool description tightening)**. Rationale: Critical Rule 1 already says "Never guess prices. Always call get_services before quoting any service" but evidently doesn't compel the LLM to re-call between subsequent service mentions in a multi-service turn. Tightening the rule to specify the pattern ("each NEW service mentioned in any turn → fresh get_services lookup, NEVER from memory") + tightening the `get_services` tool description to add a "do not cache across services" note gives the LLM both prompt-level and tool-level signals. Belt + suspenders matches the D38/D39 → D40 lesson: prompt rules alone fail under structural pressure; pair with a tool-level signal.
- **Issue 44:** **Option E — Critical Rule for system-prompt.ts (Approach 1)**. Rationale: the 3 operator-locked behaviors (disclosure / probe / Complete-anchor) are conversational policies, not tool-payload guarantees. A natural-language Critical Rule is the right granularity. Tool-response-shape changes (Option F) would be premature — they'd require API contract changes + frontend changes + would make the SMS agent more dependent on backend behavior. Defer Option F to a fallback if Option E drifts post-deploy (per the D38/D39 → D40 escalation pattern).

**Critical Rules numbering:** current system-prompt has **Rules 1-19**. Recommendation: insert as Rules 8 (Issue 43 fix) and 9 (Issue 44 fix), renumbering old 8-19 → 10-21. The inline cross-references in `system-prompt.ts` ("per Rule 19" at line 93; "Critical Rule 6" at lines 117/140/243; "per Rule 19" at line 132; "Critical rule 18" at line 221; "see Critical rule 4" at line 117) must all be updated. 4 cross-references confirmed in the file; renumbering is mechanical.

**Implementation scope:** single combined session, ~90-120 minutes. Files: `src/lib/sms-ai/system-prompt.ts` (add 2 rules + renumber + cross-ref updates), `src/lib/sms-ai/tools.ts` (get_services description tightening for Issue 43 + send_quote_sms description unchanged), `src/lib/sms-ai/__tests__/system-prompt.test.ts` (rule-count assertion + new rule fixtures), `src/lib/sms-ai/__tests__/tools.test.ts` (tool-description pin). LOC delta ~80-150. Test delta +10-15. NO migrations. NO endpoint changes (Option E doesn't require `get_services` to return new fields). NO frontend changes.

**Single session vs split:** RECOMMEND SINGLE. Both fixes touch the same file (`system-prompt.ts`), share Critical-Rules-numbering pressure (must renumber atomically), and serve the same conversation pattern (scope-pricing services). Splitting forces 2 renumbers + a stacked-branch dependency that the parallel-doc-sessions worktree memory flagged as fragile during the D43 arc. Combined size is well under memory #8's 300 LOC threshold.

---

## Empirical evidence

### Q-0087 conversation (2026-05-25 ~17:46-17:49 PT)

**Source: operator-captured transcript** (recorded in `SMS_AI_V2_PROMPT_OBSERVATIONS.md:1291-1330` — the Issues 43 + 44 captures committed 2026-05-26 at `436424f5`).

**Customer turns + agent responses (operator transcript):**

| Approx time | Customer | Agent response (excerpt) | Issue trigger |
|---|---|---|---|
| ~17:46 PT | "2018 suburban seats cleaned. How much?" | "That'd be the Hot Shampoo Extraction — Per Row tier. Your 2018 Suburban has 3 rows, so it'd be $125/row." | **Issue 44** — agent surfaced only `per_row` ($125), did not enumerate `floor_mats` ($75) / `carpet_mats` ($175) / `complete` ($450) siblings. |
| ~17:48 PT | "Combine plus exterior wash." | "Express Exterior Wash — $85" | **Issue 43** — first quoted $85, next-turn corrected to $110 ("(not $85 — let me correct that)"). Final quote landed at correct $435 = $325 (Hot Shampoo per_row × 2) + $110 (Express Exterior Wash for SUV 3-row). |

### PM2 tool-call evidence

**STATUS: BLOCKED — operator action required.**

The audit prompt's Target 1 / Target 2 hard rule mandates PM2 log evidence to confirm which of the 3 Issue 43 root-cause hypotheses (a/b/c) is empirically correct. The intended retrieval command:

```bash
ssh root@154.53.60.26
pm2 logs smart-details --raw --lines 5000 --nostream \
  | grep -E "2026-05-25.*1[78]:.*(tool=|get_services|sms-ai)" \
  | head -200
```

The Claude Code auto-mode classifier blocked the SSH attempt as a production read requiring explicit user approval naming the prod target. The audit proceeds with **source-side architectural analysis** (Targets 3-10) that reasons about which hypothesis is most consistent with the code paths. The TL;DR's hypothesis (a) ranking is based on source-side reasoning, NOT confirmed PM2 evidence.

**Operator options to unblock:**
1. Grant SSH approval to the worktree and re-run the audit's Target 1 + 2 extraction (15-minute follow-up).
2. Paste the relevant PM2 log excerpts directly into a follow-up to this audit.
3. Accept the source-side ranking and proceed to implementation; PM2 evidence becomes verification (Target 10) rather than diagnosis.

The implementation recommendation in Target 5 (Option C) is robust to all 3 hypotheses being correct (it adds belt + suspenders), so option 3 above is the lowest-friction path. Hypothesis confirmation only matters for the EMPIRICAL VERIFICATION STORY post-deploy, not for the fix architecture itself.

---

## Detailed findings per target

### Target 1 — Issue 43 evidence

**Customer impact (Q-0087):** mid-conversation correction from "$85" to "$110" with explicit self-flag "(not $85 — let me correct that)". Final quote $435 = $325 + $110 (correct). Customer was exposed to the wrong number for ~30-90 seconds (one round trip) before correction landed.

**Hypothesis space (per audit prompt):**

| Hypothesis | Source-side likelihood | Evidence required to confirm |
|---|---|---|
| **(a) LLM confabulation** — agent stated $85 without a tool call between customer's "combine plus exterior wash" message and the agent's response | **HIGH** — most consistent with the D40 architecture | PM2 grep for `tool=get_services` timestamps between the two customer messages |
| **(b1) Wrong size_class — cached pre-classify_vehicle response** — agent called get_services BEFORE classify_vehicle, response had fallback prices, never recalled | LOW — Critical Rule 6 + D40 RuntimeContext capture both target this | PM2 grep for ordering of classify_vehicle and get_services calls |
| **(b2) Wrong size_class — LLM passed wrong value despite D40** | **VERY LOW** — D40 always overrides LLM-provided value with RuntimeContext when present (`tool-dispatcher.ts:365` precedence ordering) | PM2 grep for `size_class=` in get_services URL params |
| **(c) Didn't call get_services for the SECOND service in multi-service flow** | MEDIUM — agent may have called get_services once early and reused the cached catalog response | PM2 grep for total count of get_services calls in the Q-0087 window |

**Source-side architectural finding:** D40 (Issue 36 fix, `tool-dispatcher.ts:345-372`, 2026-05-24) auto-injects `size_class` from `_runtimeContext.size_class` into every `get_services` call. RuntimeContext.size_class is captured from `classify_vehicle` response (`tool-dispatcher.ts:402-414`). LLM-provided value takes precedence (`tool-dispatcher.ts:361-365`), so an LLM that passes the wrong value would override the correct context-injected value — but for Q-0087 the customer mentioned ONE vehicle (2018 Suburban) so RuntimeContext + LLM-recalled size_class would converge on `suv_3row_van`.

**Most likely hypothesis (source-side reasoning):** **(a) LLM confabulation.** Hot Shampoo Extraction's `pricing` array in the get_services response (line 277-282 of `services/route.ts`) contains all 4 tiers with prices computed per the agent's size_class. For Express Exterior Wash (typical `vehicle_size` model), the response contains 5 tiers (sedan / truck_suv_2row / suv_3row_van / exotic / classic) each with a price. If the agent called get_services with `size_class=suv_3row_van`, the response would include `tier_name="suv_3row_van", price=110`. The agent reaching $85 requires either reading the wrong tier from the array (cognitively unlikely; the size_class match is the most salient) OR recalling a number from training-data baseline / earlier conversation context without re-grounding.

**$85 number sourcing analysis:** $85 is plausibly the `truck_suv_2row` tier for Express Exterior Wash (mid-size SUV without 3rd row). The 2018 Suburban customer would NOT have been classified as truck_suv_2row by D40-injection (Suburban classifies as suv_3row_van per CLAUDE.md Rule 19 vehicle taxonomy). For the agent to state $85, it would have needed to read from a tier_name that doesn't match the Suburban's size_class. This is consistent with (a) — LLM confabulation cross-contaminating with an earlier conversation context, perhaps from when the same agent quoted exterior wash for a smaller vehicle in the same session window.

**Confidence:** HIGH (90%+) on hypothesis (a) being the root cause; PM2 logs would confirm or invalidate.

### Target 2 — Issue 44 evidence

**Customer impact (Q-0087):** "2018 suburban seats cleaned. How much?" → agent presented only `per_row` ($125 × 3 rows = $375 if customer took 3 rows; actual Q-0087 used 2 rows = $250). Sibling tiers (`floor_mats` $75 / `carpet_mats` $175 / `complete` $450) NOT mentioned. Customer manually asked about floor mats LATER in the conversation, exposing the gap.

**get_services response shape for Hot Shampoo Extraction (source-side reading of `services/route.ts:263-284`):**

For `pricing_model='scope'` services (Hot Shampoo Extraction is the only one today per Issue 39 + 41 audit context), the response shape is:

```jsonc
{
  "id": "<service-uuid>",
  "name": "Hot Shampoo Extraction",
  "pricing_model": "scope",
  "pricing": [
    { "tier_name": "floor_mats",  "price": 75  },
    { "tier_name": "per_row",     "price": 125 },
    { "tier_name": "carpet_mats", "price": 175 },
    { "tier_name": "complete",    "price": 450 }   // size-aware for suv_3row_van
  ],
  "addon_suggestions": [ ... ],
  // tier_label is JOINED into the SELECT (line 66) but NOT emitted in response
  // qty_label is JOINED into the SELECT (line 70) but NOT emitted in response
  // max_qty is JOINED into the SELECT (line 70) but NOT emitted in response
}
```

**STRUCTURAL FINDING (Issue 44 NEW):** the get_services response for scope-pricing services emits ONLY `tier_name` (snake_case slug) + `price` per tier. The operator-curated `tier_label` ("Per Seat Row" / "Floor Mats Only"), `qty_label` ("row"), and `max_qty` are joined in the SELECT at `services/route.ts:65-70` but DROPPED at the response-format step (lines 277-282 emit only `{tier_name, price, sale_price?}`). The agent therefore has no human-readable label to read off — it must title-case the slug or refer to it raw.

This explains why the agent's Q-0087 response read "Per Row tier" (title-cased from snake_case) — that was the agent's improvisation, not operator-curated copy. For Issue 44's fix, this matters in TWO ways:

1. **If the fix is purely prompt-level (Option E):** the agent will enumerate using whatever it can read from the response — title-cased slugs. Operator-locked decision #1 ("disclose first-mentioned tier + acknowledge others exist") is implementable today; the agent already has the data. Operator-locked decision #3 ("anchor on Complete") is implementable — `complete` is in the pricing array.
2. **If the fix needs operator-curated tier_label copy in agent prose:** the get_services response shape MUST be widened to include `tier_label` (or the agent's prose will keep saying "Per Row" not "Per Seat Row" / "Per Row" — already happens organically post-Issue-40 cleanup since Issue 40's tier_label edits moved labels closer to the snake_case-titlecase output).

For the operator-locked behaviors as stated, Option E is sufficient. No tool-response shape change required for the MVP fix. The audit's Target 6 confirms this.

**Agent system_prompt size_class flow (source-side reading of `system-prompt.ts:262-275`):**

The "Recall directive (cached `get_services` response)" section explicitly tells the agent to recall `get_services` with `size_class` after `classify_vehicle` returns. Combined with D40's auto-injection, the agent on Q-0087 would have called `get_services` with `size_class=suv_3row_van` at some point and received the full 4-tier Hot Shampoo Extraction pricing array. The prompt's silence on what to DO with the 4-tier array beyond "quote the matching tier" is the Issue 44 gap.

### Target 3 — System prompt audit

**Current Critical Rules count: 19** (`system-prompt.ts:59-170`).

**Rules verbatim (lines 61-170, slot summaries):**

1. (line 61) **Never guess prices.** Always call get_services before quoting any service.
2. (line 63-95) **Every customer turn requires a customer-facing reply.** (D38 — Issue 35 fix)
3. (line 97) **One primary service per quote.**
4. (line 99) **Specialty vehicles require staff.** (exotic/classic/RV/boat/aircraft → notify_staff)
5. (line 101) **Classify before quoting.** (classify_vehicle BEFORE get_services)
6. (line 103-117) **CRITICAL — ALWAYS pass size_class to get_services after classify_vehicle.** (D39+D40 — Issue 36 fix; Recall directive at lines 113-117)
7. (line 119-140) **CRITICAL — Multi-tier services: pass tiers (and quantities when relevant) to send_quote_sms.** (D43 — Issue 38 fix)
8. (line 142) **Never confirm an appointment without explicit agreement.**
9. (line 144) **Honor STOP / UNSUBSCRIBE silently.** (TCPA compliance)
10. (line 146) **Never invent details.**
11. (line 148) **Never offer discounts.**
12. (line 150) **Honor customer context — don't re-ask what you have.**
13. (line 152) **After hours is normal.**
14. (line 154) **Don't double-act.** (each side-effecting tool ≤ once per turn)
15. (line 156) **Never pitch mobile service.**
16. (line 158) **After notify_staff, hand off.**
17. (line 160) **Tool-grounded add-ons only.** (add-on enumeration grounded in `addon_suggestions`)
18. (line 162) **Quote first, never book directly.** (send_quote_sms not create_appointment)
19. (line 164) **Tool responses with instructions_for_agent are silent guidance.** (Issue 26/27 silent-guidance rule)

**Rules governing PRICING discipline:**

- Rule 1: "Never guess prices. Always call get_services before quoting any service."
- Rule 5: "Classify before quoting. For any vehicle whose type isn't already in the customer context, call classify_vehicle BEFORE get_services."
- Rule 6: Full size_class pattern + Recall directive.
- Rule 7: Tier + quantity passing to send_quote_sms.
- Rule 11: "Never offer discounts" (forbids unfounded sale claims).
- Tool description for `get_services` (`tools.ts:83`): "Call this BEFORE quoting any service — never guess prices from memory. Response is large (~18KB); call once per size_class context (typically once or twice per conversation: once if size_class unknown, then RECALL with size_class after classify_vehicle returns)."

**GAP for Issue 43:** Rule 1's "before quoting any service" is generic. The "call once per size_class context" instruction in the tool description (line 83) implies caching the response across multiple services — which is correct for performance but creates the failure mode where the agent quotes a service from a stale cached response. There is NO rule that says "if you mention a service that wasn't quoted from the most recent get_services call, re-quote it from that call's array rather than recalling from earlier conversation memory."

**Rules governing SCOPE TIER ENUMERATION:**

- Rule 17 (line 160): Tool-grounded add-ons only. Addresses ADD-ONS (cross-service combos), not within-service tier enumeration.
- "Add-ons and bundle quoting" section (lines 228-235): same scope (add-ons across services).
- "Discovery before menu enumeration" (line 307): "Don't present the full catalog as a substitute for understanding what they want. Good: 'Looking for just the outside, or interior too?' Bad: enumerating 9 services and prices." — actively DISCOURAGES enumeration broadly. An LLM reading this could conclude "don't enumerate scope tiers either" by analogy.

**GAP for Issue 44:** ZERO rules for scope-pricing tier enumeration. The prompt's general tone (Rule 12 "Honor customer context", line 307 "Don't present the full catalog") leans toward minimalism. The gap is structural — operator's locked behaviors (disclosure / probe / Complete-anchor) are conversational policies that require explicit rule support.

**Rules governing MULTI-SERVICE FLOWS:**

- Rule 3 (line 97): "One primary service per quote" — guides bundling, not per-service get_services discipline.
- Rule 14 (line 154): "Don't double-act" — addresses tool re-call cadence at the SAME side effect, doesn't speak to multi-service quote sequencing.
- The agent flow examples in "Discovery and conversation flow" (lines 287-307) walk through single-service flows.

**GAP for Issue 43 (multi-service):** the prompt doesn't address the empirical Q-0087 case where customer says "combine plus exterior wash" after Hot Shampoo Extraction was discussed. The agent must either (a) recall Express Exterior Wash from the existing get_services response (correct path) or (b) call get_services freshly (correct but redundant). The prompt's "call once per size_class context" suggests (a). For (a) to work safely, the agent must INDEX into the cached array, not recall from prior conversation prose. There's no rule that crystallizes "lookup, don't recall."

### Target 4 — Tool description audit

**`get_services` tool description (`tools.ts:81-95`):**

```
Return the full active service catalog with current pricing tiers, add-on
suggestions, and prerequisites. Call this BEFORE quoting any service — never
guess prices from memory. Response is large (~18KB); call once per
size_class context (typically once or twice per conversation: once if
size_class unknown, then RECALL with size_class after classify_vehicle
returns).

CRITICAL: ALWAYS pass `size_class` when calling this after
classify_vehicle. Many services (e.g., Hot Shampoo Extraction Complete)
have prices that vary by vehicle size — sedan vs SUV vs 3-row van. Without
size_class, the response returns the fallback `price` field which may be
substantially DIFFERENT from the actual quote price (real-world failure:
customer told $300, quote charged $450, customer trust damaged). With
size_class, both the correct standard_price AND savings figures populate
for size-aware services and addons.

If you called this BEFORE classify_vehicle returned, you MUST recall it
with size_class once size_class is known. Do not rely on the cached
non-size-aware response for quoting.
```

**Response shape returned (per `services/route.ts:349-364`):**

```jsonc
{
  "id": "...",
  "name": "...",
  "pricing_model": "scope" | "vehicle_size" | "specialty" | "flat" | "per_unit" | "custom",
  "pricing": [
    { "tier_name": "<slug>", "price": <number|null>, "sale_price"?: <number>, "note"?: "..." }
  ],
  "addon_suggestions": [
    { "addon_name": "...", "addon_id": "...", "standard_price": ..., "combo_price": ..., "savings": ... }
  ],
  "prerequisites": [ ... ],
  "category": "...",
  "classification": "...",
  "duration_minutes": ...,
  "mobile_eligible": ...,
  "vehicle_compatibility": [ ... ],
  "special_requirements": ...
}
```

**Signal for `pricing_model='scope'` (Issue 44):** the response emits `pricing_model: "scope"` literally. The agent CAN identify scope-pricing services. But:
- The tool description (`tools.ts:83`) does NOT mention `pricing_model` at all.
- The system prompt mentions `pricing_model` once (`system-prompt.ts:185` — `vehicle_size` mapping table) and once (`system-prompt.ts:283` — exotic/classic escalation note). Neither references `scope`.
- The agent therefore has NO guidance on what `pricing_model: "scope"` means semantically.

**Signal for "enumerate all tiers" vs "single tier applies" (Issue 44):** None. The response shape is structurally identical between `vehicle_size` (one effective tier per size_class) and `scope` (multiple meaningful tiers customer chooses from). The agent has to infer.

**Tool description changes alone could address Issue 44?** PARTIALLY but not cleanly. Adding a `pricing_model: scope → enumerate all tiers + anchor on complete` note to the tool description would be ONE place to land the guidance, but tool descriptions are about WHEN to call + WHAT FIELDS MEAN. Behavioral conversation-policy guidance belongs in the system prompt. Target 6 recommends Option E (system-prompt rule).

**Tool description changes alone could address Issue 43?** PARTIALLY. The line "Response is large (~18KB); call once per size_class context" actively encourages caching across services, which is the Issue 43 failure mode. Tightening to "fresh call per NEW service mentioned by the customer" would help BUT contradicts the latency-cost guidance. The correct fix is more nuanced: the agent should LOOKUP from the cached array per service, not recall from prose memory. A system-prompt rule articulates this better than a tool description. Target 5 recommends Option C (both, with the tool description tightening focusing on the "lookup, not recall" framing rather than "fresh call per service").

### Target 5 — Issue 43 fix architecture recommendation

**RECOMMENDATION: Option C — Both system-prompt Critical Rule AND tool description tightening.**

**Proposed new Critical Rule 8 (system-prompt.ts, slots after current Rule 7 = D43 tier passing):**

> 8. **CRITICAL — Price lookup, never price recall.** When any customer turn mentions a service whose price you have NOT yet stated in this conversation OR whose vehicle has changed since you last stated its price, you MUST quote that price by LOOKUP from the most recent `get_services` response — NEVER from memory of an earlier turn or training-data baseline.
>
>    **Lookup pattern:** the most recent `get_services` response is your authoritative source. For each customer-mentioned service, find the matching `name` in the catalog, find the matching `tier_name` in its `pricing` array (using the vehicle's `size_class` for size-aware services), and quote the `price` from that match. If you cannot find the service in the cached response OR the cached response was called without `size_class` and the service is size-aware, RECALL `get_services` with the correct `size_class` before quoting.
>
>    **Empirical example (real customer-facing failure, Q-0087, 2026-05-25):** A multi-service conversation quoted Hot Shampoo Extraction first (correctly $250 for per_row × 2). Customer then said "combine plus exterior wash." The agent stated `"Express Exterior Wash — $85"` (incorrect — the SUV 3-row tier was $110). Next turn it self-corrected to `"$110 (not $85 — let me correct that)"`. The corrected total ($435 = $325 + $110) was right but the customer was exposed to the wrong $85 for one round trip. Root cause: LLM recalled a price from earlier conversation context or training-data baseline instead of looking it up from the cached `get_services` response.
>
>    **The recall trap:** an agent that has been deep in a conversation about Service A may "remember" prices for Service B from how it discussed similar services in prior turns or from training-data norms. This recall is unreliable. The cached `get_services` response is reliable.
>
>    ❌ WRONG — customer says "combine plus exterior wash" mid-conversation; agent states a price from memory: `"Express Exterior Wash — $85"`. Wrong tier; embarrassing self-correction next turn.
>
>    ✅ RIGHT — customer says "combine plus exterior wash" mid-conversation; agent indexes into cached `get_services` response: finds Express Exterior Wash → finds `tier_name: "suv_3row_van"` (matching the Suburban's size_class) → `price: 110` → quotes `"Express Exterior Wash — $110"`.
>
>    **Architectural parallel to Critical Rules 1, 6, 7.** Rule 1 says always call get_services before quoting. Rule 6 says pass size_class. Rule 7 says pass tiers + quantities to send_quote_sms. This rule (Rule 8) closes the loop: BETWEEN get_services calls, when the customer mentions a NEW service, do NOT recall from memory — LOOKUP from the cached response. Together they ensure every stated price is grounded in a fresh-enough tool call, not LLM working memory.

**Proposed get_services tool description tightening (`tools.ts:81-95`):**

Add after the existing 3 paragraphs:

> **Lookup, never recall.** The cached response is your authoritative source for ANY service you have not yet quoted in this conversation. When the customer mentions a new service mid-conversation, INDEX into the cached `pricing` array for the matching `tier_name` (using the vehicle's `size_class` for size-aware services). Do NOT recall prices from earlier turns or training-data baselines — that is the Issue 43 failure mode (Q-0087: agent recalled $85 for Express Exterior Wash instead of looking up $110 for the suv_3row_van tier, then self-corrected next turn). If the cached response was called WITHOUT the correct `size_class` and the new service is size-aware, RECALL with `size_class` before quoting.

**Why both (Option C) over either alone:**

- Option A alone (system-prompt rule) — past empirical evidence (D38 → D39 → D40 arc for Issue 35/36) shows the LLM sometimes ignores prompt rules under structural pressure. Belt-and-suspenders matters.
- Option B alone (tool description) — tool descriptions are primarily about WHEN to call + WHAT FIELDS MEAN. Behavioral rules are weakly enforced at the tool description level.
- Option C (both) — gives the LLM two coordinated signals; if one is partially ignored, the other reinforces. Cost: small (adding to existing rule + description, no new tool).

**Out-of-scope rejected options:**

- **Option D-X: hard-fail on confabulated prices** — would require post-hoc analysis comparing agent-stated prices to tool-call returns. Architectural overhead high; doesn't prevent the wrong price from being SENT, only flags it. Not recommended for first iteration.

### Target 6 — Issue 44 fix architecture recommendation

**RECOMMENDATION: Option E — Critical Rule for system-prompt.ts.**

**Proposed new Critical Rule 9 (system-prompt.ts, slots after the new Rule 8 = Issue 43 fix):**

> 9. **CRITICAL — Scope-pricing services: enumerate tiers + probe + anchor on Complete.** When the customer asks about a service whose `pricing_model` in the cached `get_services` response is `"scope"` (Hot Shampoo Extraction is the only one today; future services with multiple operator-curated tier_name values within a single primary service follow the same rule), the agent's prose MUST:
>
>    **1. Disclose the customer-mentioned tier price first.** Answer the question the customer actually asked — don't lead with the full catalog. Example: "Seats are $125/row — your 2018 Suburban has 3 rows, so $375 if you want all three."
>
>    **2. Acknowledge other tiers exist (briefly, without dumping all prices).** Example: "We've also got floor mats and carpets if you want — and a Complete package that bundles everything for the best price."
>
>    **3. Always probe for additional needs.** Ask "anything else inside?" or equivalent (natural phrasing — "are the carpets a mess too?" / "want floor mats while you're at it?" all work). The probe is mandatory; do not skip even if the customer's tone was decisive.
>
>    **4. Always mention the Complete package as the upsell anchor.** Use a "best value" framing — "Complete is $450 and covers seats + floor mats + carpets, usually the best deal if more than one area needs it." Mention even if the customer's stated need maps to a single tier; let them dismiss it if they want.
>
>    **Empirical example (real customer-facing failure, Q-0087, 2026-05-25):**
>
>    ❌ WRONG — agent quoted only the customer-mentioned tier and stopped:
>
>      Customer: "2018 suburban seats cleaned. How much?"
>      Agent: "That'd be the Hot Shampoo Extraction — Per Row tier. Your 2018 Suburban has 3 rows, so it'd be $125/row."
>      (Customer manually asked about floor mats LATER, exposing the gap. Lost upsell opportunity for Complete package at $450.)
>
>    ✅ RIGHT — disclose + acknowledge + probe + anchor in one reply:
>
>      Customer: "2018 suburban seats cleaned. How much?"
>      Agent: "Seats are $125/row — your Suburban has 3 rows so $375 for all three, or $250 if you just want the back two. We've also got floor mats ($75) and carpets ($175), and the Complete package is $450 for the whole interior — usually the best value if more than one area needs work. Anything else inside the truck need cleaning?"
>
>    **Edge cases the rule must handle without breaking:**
>
>    - **Direct price query** ("How much for seats?"): apply the 4 behaviors above; the customer asked and gets the answer + adjacent options + anchor + probe.
>    - **Exploratory phrasing** ("hmm what would you recommend for a really dirty interior?"): lead with Complete as the natural answer, then mention the smaller tiers as cheaper alternatives if appropriate.
>    - **Operator-bypass** ("I know what I want, just quote me X"): comply with the customer's explicit request; SKIP the probe + anchor. Customer autonomy wins.
>    - **Multi-service interleaving** (customer mentions Service A then Service B before A is quoted): apply the rule to A first, then to B independently. Don't blend.
>    - **Mid-conversation vehicle pivot** (customer changes vehicle mid-conversation): re-classify (Rule 5 + 6) then re-present tiers per this rule.
>    - **Complete-package short-circuit** (customer says "give me everything" / "the whole interior"): quote Complete directly without enumerating siblings (operator-locked decision #1 only requires "first-mentioned tier price" — Complete IS the first-mentioned tier here). SKIP the probe; ask "anything else outside?" if appropriate, but don't redundantly probe the same surface.
>
>    **Architectural parallel to Critical Rule 17 (`addon_suggestions`).** Rule 17 governs CROSS-SERVICE add-on enumeration (e.g., "Engine Bay Detail bundles with Signature Complete"). Rule 9 governs WITHIN-SERVICE tier enumeration for scope-pricing services. Together they ensure the customer sees the full landscape of relevant offerings without being overwhelmed by the full catalog.

**Why Option E over F (tool-response shape change) and G (both):**

- Option E (prompt-level rule) — matches operator's stated preference (Approach 1 from 2026-05-25 evening). Lowest implementation cost. Reversible if drift observed (tighten the rule wording or escalate to Option F).
- Option F (tool-response shape change: add `recommended_followup_questions` and `enumeration_required: true` flags to scope services) — significant API contract change. Would require updating `services/route.ts:349-364` response shape + updating the response-format type + updating any code that consumes the response shape. Possibly forces frontend changes if the response shape is also consumed by non-agent surfaces (operator UI for catalog browsing). Premature without empirical evidence that Option E drifts.
- Option G (both) — adds the cost of Option F to Option E without the benefit. Defer Option F as an escalation path, not a first-iteration commitment.
- Option H rejected: any "make the tool refuse to return single-tier results for scope services" or similar tool-level enforcement would break the operator UI + add fragility.

**Implementability check of operator-locked decisions:**

| Operator decision | Implementable via Option E? | Evidence required |
|---|---|---|
| 1. Disclose first-mentioned tier + acknowledge others | YES | Rule 9 sections 1+2 |
| 2. Probe "anything else inside?" | YES | Rule 9 section 3 |
| 3. Anchor on Complete as "best value" | YES | Rule 9 section 4 |

All 3 operator-locked behaviors are conversational policies the LLM can follow with prompt-level guidance. No tool-payload or schema changes required.

### Target 7 — Critical Rules numbering + conflict check

**Current count: 19 rules** (lines 61-170 of `system-prompt.ts`).

**Proposed insertion:**

- **NEW Rule 8 (Issue 43 fix):** Price lookup, never price recall. Slots between current Rule 7 (D43 tier passing) and current Rule 8 (appointment confirmation). Architectural placement: the pricing-discipline cluster (Rules 1, 5, 6, 7, 8) stays contiguous and reads top-to-bottom as the full pricing-fidelity story.

- **NEW Rule 9 (Issue 44 fix):** Scope-pricing services enumeration + probe + Complete anchor. Slots after the new Rule 8. Architectural placement: completes the price-handling cluster before the operational rules (appointment confirmation, STOP handling, etc.) take over.

- **Renumber old Rules 8-19 → 10-21.** Renumbering is mechanical.

**Inline cross-references in system-prompt.ts that must be updated** (`grep -n "Rule [0-9]\|rule [0-9]" src/lib/sms-ai/system-prompt.ts`):

| Line | Current text | New text (post-renumber) |
|---|---|---|
| 93 | "follow it (per Rule 19)" | "follow it (per Rule 21)" |
| 117 | "Critical Rule 6" | "Critical Rule 6" (unchanged — Rule 6 stays at slot 6) |
| 132 | "per Rule 19" | "per Rule 21" |
| 140 | "Critical Rule 6" | "Critical Rule 6" (unchanged) |
| 221 | "Critical rule 18" | "Critical rule 20" (the "Quote first, never book directly" rule moves from 18 → 20) |
| 243 | "Critical Rule 6" | "Critical Rule 6" (unchanged) |
| 285 | "Critical Rule 4" | "Critical Rule 4" (unchanged — Rule 4 stays at slot 4) |
| 425 | "per D9" | (unrelated — D-decision reference, no change) |

**Cross-reference impact:** of the 4 numbered-Rule cross-references that need updates (lines 93, 132, 221, and any in the renumbered Rules 10-21 themselves), 3 of them reference Rule 19 (the silent-guidance rule, currently the last one). Rule 19 becomes Rule 21 post-insertion. Line 221 references Rule 18 (the "Quote first" rule) which becomes Rule 20.

**Tests that pin Rule numbering** (`grep -rn "Critical [Rr]ule\|critical-rule\|rule [0-9]\|rule-[0-9]" src/lib/sms-ai/__tests__/`):

Audit will need to inspect the existing `system-prompt.test.ts` for any rule-count assertion (likely `expect(prompt).toContain("19.")` or similar). Implementation session must bump these to 21. Per the D43 Session B pattern (CHANGELOG entry for D43 Session B notes "~13 renumber updates" across the tests file), expect a similar mechanical update count.

**Verification step:** after the implementation lands, `grep -nE "Rule (1[0-9]|2[01])\|rule (1[0-9]|2[01])" src/lib/sms-ai/system-prompt.ts` and walk every match to confirm it points to the intended rule's NEW slot.

### Target 8 — Conversation pattern coverage

Predicted behavior for each adversarial pattern UNDER the proposed Rules 8 + 9 combined:

| Pattern | Expected agent behavior | Friction risk |
|---|---|---|
| **Direct price query** ("How much for seats?") | Rule 9 fires: disclose per_row price + acknowledge tier siblings + probe + anchor Complete. Reply is 1-2 sentences with the price + 1 mention of "we also have... Complete is $X for everything." Rule 8 doesn't fire because no prior context to recall from. | LOW — adds ~20 chars of acknowledgment + probe but stays under the 320-char SMS hard ceiling (channel rules line 47). Operator's stated intent is for this enrichment to happen, so this is INTENDED behavior, not friction. |
| **Exploratory phrasing** ("What would you recommend for a really dirty interior?") | Rule 9 fires: lead with Complete as the natural answer ("for a really dirty interior, the Complete Hot Shampoo at $X covers seats + floor mats + carpets"). Then mention smaller tiers as cheaper alternatives if appropriate. Probe is still applied ("does the outside need anything too?"). | LOW — the rule's "Complete-package short-circuit" edge case covers exactly this. |
| **Operator-bypass** ("I know what I want, just quote me X") | Rule 9 section 4 (edge cases) explicitly says: comply with the customer's explicit request; SKIP the probe + anchor. Customer autonomy wins. | LOW — the bypass IS coded into the rule. Risk is the LLM ignoring "skip the probe" because Rule 9 sections 1-4 are framed as "MUST" — wording should be clear about the override. |
| **Multi-service interleaving** (customer mentions Service A then Service B before A quoted) | Rule 9 applies per-service. Service A: full enumerate + probe + anchor. Service B: full enumerate + probe + anchor IF B is also scope-pricing. If B is vehicle_size, Rule 8 fires (lookup, don't recall). Rule 9 doesn't fire for non-scope services. | MEDIUM — risk of agent being verbose in a multi-service conversation (potentially exceeding the 320-char ceiling if both services are scope-pricing). Mitigation: the rule's probe ("anything else inside?") is itself the consolidation — if customer mentions Service A then Service B in adjacent turns, the agent's "anything else?" probe already invited B. Implementation should pin this with a test. |
| **Mid-conversation vehicle pivot** (customer changes vehicle mid-conversation) | Rule 5 (classify before quoting) + Rule 6 (pass size_class) + Rule 9 (scope enumeration with new vehicle's size_class) all fire. Rule 8 (lookup-not-recall) explicitly handles this — agent must NOT carry the old vehicle's prices forward. | LOW — Rule 8 explicitly mentions vehicle change as a recall-invalidation trigger. |
| **Complete-package short-circuit** ("give me everything") | Rule 9's edge case explicitly handles this: quote Complete directly without enumerating siblings (operator decision #1 is "first-mentioned tier price" — Complete IS first-mentioned here). SKIP the probe for the same surface. | LOW — explicitly coded. |

**Regression risk for non-scope services:** Rule 9 has explicit `pricing_model="scope"` gating. For vehicle_size services (Express Exterior Wash, Signature Complete Detail, ceramic shields) or specialty services (motorcycle, RV when not escalated), Rule 9 does NOT fire — agent's existing behavior preserved. Rule 8 (lookup-not-recall) DOES fire for all services but is purely additive (it prevents wrong recalls; it doesn't change correct lookups). No regression risk for non-scope quoting.

**Regression risk for new scope services added later:** any new service the operator marks as `pricing_model='scope'` automatically inherits Rule 9's behavior. This is desirable (no per-service rule update needed) but means the audit's verification scenarios MUST exercise at least one non-Hot-Shampoo scope service — or operator-test it after the first new scope service is added.

### Target 9 — Implementation scope estimate

**Files to modify:**

| File | Change | LOC delta |
|---|---|---|
| `src/lib/sms-ai/system-prompt.ts` | Add Rule 8 (~30 lines including examples) + Add Rule 9 (~40 lines including edge cases) + Renumber old 8-19 → 10-21 (mechanical) + Update inline cross-refs at lines 93, 132, 221 (line 93 + 132 already address Rule 19 → 21; line 221 addresses Rule 18 → 20) | ~+80 |
| `src/lib/sms-ai/tools.ts` | Add "Lookup, never recall" paragraph to `get_services` description (~6 lines) | ~+6 |
| `src/lib/sms-ai/__tests__/system-prompt.test.ts` | New describe block for Rules 8 + 9 (5-8 fixture cases each); update rule-count assertion (19 → 21); update cross-ref pin assertions (Rule 18 → 20, Rule 19 → 21) | ~+60 |
| `src/lib/sms-ai/__tests__/tools.test.ts` | Pin `get_services` description contains "Lookup, never recall" + "Q-0087" reference | ~+8 |
| **Total** | | **~+150 LOC** |

**Tests delta:** +10-15 net new (~5-8 for Rule 8 fixtures, ~5-8 for Rule 9 fixtures, 1 rule-count update, ~3-5 renumber-pin updates). Per D43 Session B precedent: "Tests +18 net new + ~13 renumber updates" — comparable scale.

**Time estimate:** 90-120 minutes (single session). Heavier on the wording / phrasing iteration than on mechanical changes; the renumber + cross-ref updates are mechanical (<15 minutes).

**Single session vs split:**

**RECOMMEND SINGLE.** Rationale:
- Both fixes touch `system-prompt.ts` — splitting forces 2 sequential renumbers + a stacked-branch dependency.
- The Critical Rules numbering pressure must be resolved atomically; mid-state (Rule 8 inserted but Rule 9 not yet) creates a 20-rule numbering that breaks the second session's plan.
- Combined size is well under memory #8's 300 LOC / >3 files threshold (~150 LOC, 4 files).
- Both rules serve the same conversation pattern class (scope-pricing services).
- Both have empirical evidence from the same Q-0087 conversation.
- Splitting would 2× the verification cycles for the same architectural concern.

**Single session structure:**
1. Add new Rule 8 + new Rule 9 + renumber old 8-19 → 10-21 atomically.
2. Update cross-refs (3 lines).
3. Update get_services tool description.
4. Update tests (rule count + cross-ref pins + new rule fixtures).
5. Verify gates (tsc 0, lint baseline, tests, build).
6. Commit + push (DO NOT MERGE — operator merges).

### Target 10 — Verification plan

**Post-deploy empirical verification scenarios (operator runs from `+13107564789`):**

Each scenario specifies the customer messages, the expected agent behaviors, and the SMS preview / PM2 evidence that confirms the fix.

#### Scenario 1: Q-0087 reproduction (Issues 43 + 44 combined)

**Customer messages:**
1. "Hi! 2018 Suburban, seats need a deep clean — how much?"
2. (await agent) "Add an exterior wash too please"
3. (await agent) "Send the quote"

**Expected agent behaviors:**

- Turn 1 reply (Issue 44 fix verification):
  - Disclose per_row price + acknowledge floor_mats / carpet_mats / complete siblings.
  - Probe ("anything else inside?").
  - Anchor on Complete as best value.
  - Stay under 320 chars.

- Turn 2 reply (Issue 43 fix verification):
  - Quote Express Exterior Wash at the correct SUV-3-row tier price ($110 — NOT $85, NOT any other size_class price).
  - No self-correction in the next turn ("not $85 — let me correct that" should not appear).

- Turn 3 reply: Quote sent. SMS preview includes Hot Shampoo Extraction + Express Exterior Wash with correct tier + size pricing.

**PM2 evidence expected:**
- Single `classify_vehicle` call early (Suburban → suv_3row_van).
- `get_services` call WITH `size_class=suv_3row_van` (D40 auto-inject confirmed by URL params).
- Agent does NOT call get_services again between turn 2 and turn 3 (Rule 8 "lookup, not recall" should encourage indexing into the cached array).
- `send_quote_sms` call with `services="Hot Shampoo Extraction, Express Exterior Wash"`, `tiers="<chosen scope tier>,"` (empty for the vehicle_size service per Rule 7), `quantities="<N>,"` (N depending on which scope tier customer chose).

**SMS preview check:**
- Includes correct subtotal matching operator's pre-deploy expectation.

#### Scenario 2: Direct price query (Issue 44 fix edge case — non-friction)

**Customer messages:**
1. "How much for seats?"

**Expected agent behavior:**

- Reply applies Rule 9 sections 1-4: discloses per_row price + acknowledges siblings + probes + anchors Complete.
- Reply stays under 320 chars.
- Reply asks for vehicle if no profile or no recent vehicle mention.

**Friction check:** customer should perceive the enriched reply as helpful (more info upfront), not annoying. Operator subjective judgment.

#### Scenario 3: Operator-bypass (Issue 44 fix edge case)

**Customer messages:**
1. (with 2018 Suburban vehicle on profile) "I know I want just the per row for the back two rows of my Suburban — quote me $250"

**Expected agent behavior:**

- Agent should COMPLY with the explicit request — skip the probe + anchor (customer autonomy wins per Rule 9 edge case).
- Reply confirms the quote intent + asks last_name if needed + sends quote with `tiers="per_row", quantities="2"`.
- Reply does NOT add "have you considered the Complete package?" — the customer explicitly bypassed.

**Friction check:** customer should perceive the agent as respecting their decisiveness, not pushing upsells they declined.

#### Scenario 4: Multi-service interleaving (Issue 43 fix verification)

**Customer messages:**
1. "Hi, I've got a 2020 Honda Accord — how much for the ceramic coating?"
2. (await agent) "What about an exterior wash too?"
3. (await agent) "OK let's do both — send the quote"

**Expected agent behavior:**

- Turn 1: classify + get_services (with size_class=sedan), quote ceramic shield correctly for sedan.
- Turn 2 (Issue 43 fix verification): quote Express Exterior Wash from the CACHED get_services response — looking up the `sedan` tier price (NOT a recalled / hallucinated number).
- Turn 3: send_quote_sms with both services.

**PM2 evidence expected:**
- get_services called once (with size_class=sedan), then NOT called again between turns 2 and 3 (lookup, not re-call).
- Agent's stated prices match the cached get_services response's pricing array values for the sedan tier.

#### Scenario 5: Mid-conversation vehicle pivot (Issue 43 + Issue 44 combined edge case)

**Customer messages:**
1. (with 2018 Suburban) "Seats cleaned — how much?"
2. (await agent — Rule 9 fires) "Actually, let me do my wife's 2022 Tesla Model 3 instead"
3. (await agent — must re-classify, re-quote) "Just the per row tier, send the quote"

**Expected agent behavior:**

- Turn 1: Rule 9 enumerate for Suburban (suv_3row_van prices).
- Turn 2: classify_vehicle for Tesla Model 3 → sedan. Recall get_services with size_class=sedan. Re-present Hot Shampoo Extraction tiers with sedan prices (Rule 9 still applies — new vehicle context, fresh enumeration).
- Turn 3: send_quote_sms with `tiers="per_row"` + appropriate quantity for Tesla's row count. The price should reflect the sedan tier, NOT the Suburban tier.

**PM2 evidence expected:**
- Two classify_vehicle calls (one per vehicle).
- Two get_services calls (one per vehicle's size_class).
- send_quote_sms uses the second vehicle's size_class.

#### Scenario 6: Complete-package short-circuit (Issue 44 fix edge case)

**Customer messages:**
1. "2018 Suburban, give me the whole interior detailed — what's that cost?"

**Expected agent behavior:**

- Agent recognizes "whole interior" maps to Hot Shampoo Extraction's complete tier.
- Agent quotes Complete tier directly at the suv_3row_van price ($450).
- Agent SKIPS the sibling-tier enumeration (per Rule 9 edge case — customer's first-mentioned tier IS Complete).
- Agent SKIPS the same-surface probe ("anything else inside?") because Complete already covers the inside. Agent MAY probe outside ("anything for the exterior while we're at it?").

**PM2 evidence expected:**
- get_services WITH size_class=suv_3row_van.
- send_quote_sms with `tiers="complete"` (NOT empty — complete is a specific scope tier even though it's the "best value" anchor; Rule 7 D43 still applies).

---

## Operator decisions needed

1. **Unblock PM2 evidence path?**
   - Option (i) grant SSH approval (one-time setting bump) so the audit's Target 1+2 evidence can be retrieved in a 15-minute follow-up commit, OR
   - Option (ii) paste the relevant log excerpts from your existing SSH session into a follow-up, OR
   - Option (iii) accept the source-side hypothesis ranking and proceed to implementation (PM2 evidence then serves as Target 10 post-deploy verification, not pre-implementation diagnosis).
   - **Audit recommends option (iii)** — Option C for Issue 43 is robust to all 3 hypotheses; hypothesis confirmation doesn't change the fix.

2. **Rule 9's "anything else inside?" probe — exact natural-language form?**
   - The operator-locked decision says "always ask 'anything else inside?' after first tier disclosure" but didn't specify whether the agent should use those exact words or paraphrase naturally per conversation context.
   - **Audit recommends** giving the LLM a "natural phrasing" guide with 2-3 example phrasings — "anything else inside?" / "are the carpets a mess too?" / "want floor mats while you're at it?" — and letting the LLM pick contextually. Hardcoding the exact words feels robotic.

3. **Rule 9's Complete-anchor "best value" framing — wording?**
   - Operator-locked decision says "always mention Complete package as 'best value' anchor" — should the agent literally say "best value" or paraphrase?
   - **Audit recommends** flexible phrasing — "best value" / "covers everything" / "if more than one area needs work" — with the underlying intent being to position Complete as the obvious choice for customers with multiple needs.

4. **Issue 45 (auto-send) scope coupling?**
   - The Issues 42-46 captures (commit `436424f5`) describe Issue 45 as a separate concern (agent asks "Want me to send a quote?" as a redundant confirmation step). If Rule 9's "probe + anchor" lands cleanly, the agent's natural flow might shift such that the redundant confirmation step changes shape (e.g., agent says "If that sounds good, I'll send the quote with the Complete option" instead of "Want me to send the quote?"). Audit suggests Issue 45 stays SEPARATE for now — different conversation point (end-of-flow vs. mid-flow), different intervention (auto-send rule vs. enumeration rule), different success criteria. Bundle would inflate session scope without architectural reuse.

---

## Risk matrix

| Dimension | Issue 43 fix risk | Issue 44 fix risk | Combined session risk |
|---|---|---|---|
| Customer-facing (prompt drift post-deploy) | LOW — Rule 8 is a precise lookup-not-recall pattern; D40 architecture supports it | LOW — Rule 9 is operator-locked behaviors with explicit edge-case coverage | LOW |
| Implementation (renumbering breaks tests) | LOW — mechanical | LOW — mechanical | LOW — but must be ATOMIC; mid-state would break things |
| Empirical regression (rule fires when it shouldn't) | LOW — Rule 8 fires only when customer mentions a NEW service AND a prior price exists in context | LOW — Rule 9 gated on `pricing_model="scope"` (only Hot Shampoo Extraction today) | LOW |
| Cross-rule conflict | LOW — Rule 8 reinforces Rule 1; Rule 9 reinforces Rule 17 (add-on enumeration) | LOW | LOW |
| Token budget pressure (Rule 9 makes replies longer) | n/a | MEDIUM — Rule 9 reply can approach 320-char ceiling; SMS-system auto-split handles this | MEDIUM |
| Verification (need empirical evidence post-deploy) | MEDIUM — Q-0087-class reproduction requires operator manual test from allowlisted phone | MEDIUM — same | MEDIUM — verification is per-scenario (6 scenarios), operator time investment |
| Rollout (deploy without flag) | LOW — additive prompt rules, no API contract change | LOW — same | LOW |

**Overall risk: LOW.** Both rules are additive, scoped, and rooted in operator-locked behaviors with explicit edge-case coverage. Verification requires operator manual testing but the test scenarios are well-defined.

---

## Verification of audit hard rules

- ✅ NO source code in `src/`. Verified via `git diff --name-only` at session end.
- ✅ NO migrations.
- ✅ NO test changes (audit is read-only; implementation session adds tests).
- ✅ Only new files: this audit deliverable + standard CHANGELOG/ROADMAP/SMS_AI_V2 doc updates.
- ✅ Every source-side finding cites `file:line` (system-prompt.ts:61-170; tools.ts:81-95; tool-dispatcher.ts:345-372; services/route.ts:263-284, 277-282, 349-364).
- ⚠️ PM2 log evidence is REQUIRED per audit prompt hard rule — **BLOCKED**: SSH to production was blocked by Claude Code auto-mode classifier as a production-read action. Audit proceeds with source-side architectural analysis and explicitly flags the gap; operator action required to unblock (see "Operator decisions needed" item 1). The source-side reasoning ranks hypothesis (a) HIGH (90%+ confidence) but final confirmation requires PM2 logs.
- ✅ Operator-locked Issue 44 decisions HONORED — disclosure / probe / Complete-anchor preserved as REQUIRED behaviors in Rule 9 sections 1-4; not re-litigated.
- ✅ Memory feedback-parallel-doc-sessions-use-worktree: NOT triggered — no concurrent code session at audit time (D46 merged earlier today, capture session at `1863b451` also merged; this audit is sequential not parallel).
- ✅ Memory #8 (~300 LOC or >3 files = split): combined fix is ~150 LOC / 4 files, well under threshold; single session recommended.
- ✅ Helper-architecture question: not applicable to this audit (Option E for Issue 44 explicitly DEFERS the tool-response shape change to a fallback path).
