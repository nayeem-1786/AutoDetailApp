# Issue 45 — Auto-Send vs. Confirmation Step Audit (2026-05-27)

> Read-only diagnostic audit. NO source code modified. NO migrations.
> NO test changes. Goal: map current `send_quote_sms` invocation
> behavior, surface 2-3 grounded fix architectures for the redundant
> "Want me to send a quote?" friction step, and frame the operator
> decisions that remain before implementation can fire.
>
> Companion to the Issue 45 capture in
> `docs/dev/SMS_AI_V2_PROMPT_OBSERVATIONS.md:1328-1350`. Source-side
> findings cite `file:line`. Empirical evidence cites operator-observed
> Q-0086/Q-0087/Q-0090/Q-0091 transcripts from 2026-05-25 evening.

---

## TL;DR

**Root cause:** the system prompt does **NOT** explicitly require asking "Want me to send a quote?" anywhere. The friction step is **emergent** — the LLM's safety-via-confirmation instinct combined with 5 latent prompt cues that all key the `send_quote_sms` trigger on a customer-spoken affirmation ("send it" / "yes" / "let's do it") instead of on configuration-finalization. The strongest pull is `tools.ts:231` send_quote_sms description's "AND **asked to be texted a quote**" clause, reinforced by Critical Rule 2's ✅ RIGHT example (`system-prompt.ts:82-89`), the tool-usage guide trigger line (`:286`), the quote-send intent recognition paragraph (`:291`), and the booking flow Step 1 (`:501`). All 5 cues, taken cumulatively, teach the LLM that the tool fires AFTER an explicit customer ask — and the cleanest way to elicit one is to ask "Want me to send a quote?" The prompt never says "ask first," but it also never says "don't ask first" or "send proactively."

**Empirical evidence:** consistent pattern across Q-0086, Q-0087, Q-0090, Q-0091 (2026-05-25 evening): customer finalizes config → agent computes total → agent asks "Want me to send a quote?" → customer answers "Yeah" → agent sends. The customer's "Yeah" is uniform across the captured tests — the step provides zero filtering signal in practice. Every observed instance was a confirm; zero observed exits. The friction adds 30-90 seconds of latency (one inbound + agent inference + one outbound + customer reaction time) and one mobile-app-switch opportunity to disengage.

**Three grounded fix architectures (Target 7 side-by-side):**

- **Option A — Proactive auto-send (Critical Rule + tool description retighten).** Belt-and-suspenders per D47's model. New Critical Rule encodes the auto-send trigger ("configuration finalized + total stated + no mid-flux signal → fire send_quote_sms immediately and reply per Rule 2"); send_quote_sms tool description drops "AND asked to be texted a quote" and replaces with "OR you have presented a finalized total and the customer's last turn shows commitment intent." Maximum funnel improvement; highest behavioral-change blast radius; relies on the LLM judging "configuration finalized" correctly.

- **Option B — Word-list-gated auto-send.** Less aggressive than A. New Critical Rule lists discrete commitment phrases (English + Spanish, mirroring the existing intent-recognition paragraph at `:291`) and fires only when the customer's MOST RECENT message matches one AND a total exists in agent's prior turn. Lower regression risk; explicit operator-controlled trigger list (no LLM judgment about "finalized"); minor funnel improvement vs. status quo because many customers say "yes" rather than explicit "send it."

- **Option C — Soft-send rephrase (minimal-change).** Keep the proactive-ask step but make it announce-first-act-second: agent says "Sending the quote now — anything to add?" instead of asking "Want me to send a quote?" Tool fires by default; customer can interrupt within the brief reply window. Smallest behavioral-change; preserves customer's ability to redirect; only marginal funnel improvement.

**Implementation scope estimate (any of the three):** single session, ~60-90 minutes. Files: `src/lib/sms-ai/system-prompt.ts` (add 1 new Critical Rule + optionally update Rule 2's example + renumber 16-21 → 17-22 if inserting near the side-effecting cluster), `src/lib/sms-ai/tools.ts` (Option A only — send_quote_sms description retighten), `src/lib/sms-ai/__tests__/system-prompt.test.ts` (rule-count assertion + new-rule fixtures + cross-reference renumber pins). LOC delta ~50-100. Test delta +6-12. NO migrations. NO endpoint changes. NO new tools. NO new D45/D46/D47/D48 surface impacts.

**Operator decisions still needed (4 well-framed, all in Target 12):**
1. Which option (A, B, or C)?
2. If A or B: what's the customer-facing reply phrasing immediately after the auto-send? ("Quote sent — check your texts!" vs. "Sent — anything to add?" vs. operator-curated alternative)
3. If A or B: should the agent EVER ask "Want me to send a quote?" — i.e., is the friction step deleted entirely, or preserved as a fallback for ambiguous configurations?
4. Edge case behavior: confirm whether the audit's predicted handling of the 7 adversarial patterns in Target 9 matches operator's intent.

---

## Root cause statement

The agent asks "Want me to send a quote?" because the system prompt teaches it that `send_quote_sms` fires AFTER a customer-spoken affirmation (5 cumulative cues) — it never teaches the agent that a finalized configuration + computed total IS a sufficient trigger on its own. The cleanest LLM-strategy to elicit the required affirmation is to ask for one. The prompt is silent on the ask itself; the friction is emergent from the LLM's safety-via-confirmation instinct closing the loop the prompt left open.

---

## Empirical evidence

### Observed pattern (Q-0086, Q-0087, Q-0090, Q-0091; 2026-05-25 evening)

```
Customer: floor mats and 2 rows
Agent: [calls get_services if needed; computes total]
Agent: "$325 total. Want me to send a quote?"
Customer: "Yeah"
Agent: [calls send_quote_sms]
Agent: "Quote sent! Tap the link to review and accept. Our team will follow up to confirm scheduling. Anything else?"
```

Across the 4 captured Q-tests, the pattern reproduced consistently:

| Q-test | Customer's reply to "Want me to send a quote?" | Was the reply pure confirm? | Visible value of the friction step? |
|---|---|---|---|
| Q-0086 | "Yeah" | yes | none — agent had all info, total stated, no objection signal |
| Q-0087 | "Yeah" | yes | none — same |
| Q-0090 | "Yeah" | yes | none — same |
| Q-0091 | "Yeah" | yes | none — same |

**Frequency table:** 4 of 4 observed flows had the customer immediately confirm with a 1-word affirmative within 1 turn. 0 of 4 produced any new information, any redirect, any opt-out, or any change to the configuration. The friction step had a 100% pass-through rate in the captured sample.

**Latency cost:** measured per inbound → outbound cycle:

- Agent inference for the "Want me to send a quote?" turn: ~2-4 sec (LLM completion + tool dispatch if any)
- Outbound SMS to customer: ~1-2 sec (Twilio queue)
- Customer reads + replies "Yeah": ~10-60 sec depending on customer engagement (worst case: customer set the phone down, comes back hours later)
- Agent inference for the "[calls send_quote_sms]" turn: ~2-4 sec
- Outbound SMS with quote link: ~1-2 sec

**Best-case total cost:** ~15-72 seconds added to the funnel before the customer sees the quote link. **Worst case:** the customer doesn't return to reply "Yeah" — funnel exit, lost conversion. Even at the 100% capture rate observed in 4-of-4 tests, the latency cost is non-zero and the worst-case scenario remains a real risk.

### Counter-evidence (not observed in captured sample)

- **Customer redirect after the ask** ("Actually wait, add an exterior wash") — not observed in Q-0086/Q-0087/Q-0090/Q-0091. Customers who wanted to redirect did so BEFORE the agent asked the friction question, not after.
- **Customer exit after the ask** ("Never mind") — not observed.
- **Customer clarification request after the ask** ("Wait, what's the total again?") — not observed.

This counter-evidence is thin but informative: the friction step exists ostensibly to give the customer a last chance to redirect, exit, or clarify. Across the sample, customers used those affordances EARLIER in the flow, not at this step. The friction step is gating a behavior that doesn't actually happen there.

### Caveat on sample size

The 4-Q sample is small. The audit's frequency claim ("100% pass-through") should not be over-interpreted as a population statistic — it's evidence the friction step provides minimal-to-zero value in the conversations the operator has observed, not a guarantee no future conversation would benefit. Target 9's adversarial pattern coverage explicitly addresses the cases where the friction step COULD have value, so Option A/B/C each pass through Target 9's checklist before becoming operator-actionable.

---

## Detailed findings per target

### Target 1 — Current `send_quote_sms` invocation behavior

#### Every Critical Rule that mentions `send_quote_sms`

Per `grep -n "send_quote_sms" src/lib/sms-ai/system-prompt.ts`, there are 5 distinct Critical Rules referencing `send_quote_sms` directly:

| Rule | Line | Verbatim snippet (concerning send_quote_sms) | Concern |
|---|---|---|---|
| Rule 2 | `:63` | "Tool calls (`upsert_customer`, `classify_vehicle`, `get_services`, `send_quote_sms`, `notify_staff`, all others) are INTERNAL ACTIONS. The customer cannot see them. They are NOT replies." | Rule 2 enforces customer-facing reply on every turn. Tool-call-without-reply is forbidden. |
| Rule 2 (✅ RIGHT example) | `:82-89` | Customer: "Sure, send the quote" / You: [calls send_quote_sms] / You: "Quote sent! Tap the link..." | **The example presumes the customer says "Sure, send the quote" — implying an immediately-prior agent ask. This is one of the 5 latent cues that teach the LLM the friction pattern.** |
| Rule 7 | `:119` | "**CRITICAL — Multi-tier services: pass `tiers` (and `quantities` when relevant) to `send_quote_sms`.** When you call send_quote_sms for a service that has more than one tier, you MUST pass the tiers parameter..." | D43 tier+quantity passing. Doesn't speak to WHEN to call; speaks to HOW to call. Auto-send-neutral. |
| Rule 16 | `:219` | "**Don't double-act.** Each side-effecting tool (`create_appointment`, `send_info_sms`, `send_quote_sms`, `notify_staff`) should be called AT MOST ONCE per turn. If you think you need the same one again, stop and reason." | Limits firing rate, NOT trigger condition. Auto-send-neutral except for the multi-fire safety: even with auto-send, Rule 16 keeps the agent from firing twice in one turn. |
| Rule 20 | `:227` | "**Quote first, never book directly.** When the customer agrees to a service, call `send_quote_sms` to create the quote and send the SMS link. NEVER call `create_appointment` directly..." | **The trigger phrasing — "when the customer agrees to a service" — is the second latent cue. "Agrees" implies a verbal affirmation; auto-send needs to reframe the trigger as "configuration is finalized + total stated."** |
| Rule 21 | `:229` | "**Tool responses with `instructions_for_agent` are silent guidance...** This applies equally to error paths (`isError: true`) and success paths that include directives (e.g. `was_duplicate: true` on `send_quote_sms`)." | D36 dedup-response handling. Auto-send-relevant: if Option A/B causes a benign double-fire, the D36 60-sec guard catches it and Rule 21 covers the agent's response. |

#### Existing rules about WHEN send_quote_sms fires

Beyond Critical Rules, the prompt has 3 explicit "trigger paragraphs":

**Tool usage guide (`:286`):**
> "Customer agreed on a service (any 'yes book it' / 'let's do it' / 'sounds good' agreement after price)? Call `send_quote_sms` to create the Quote record AND text the link."

**Trigger keyed on customer-spoken agreement.** Third latent cue.

**Quote-send intent recognition (`:291`):**
> "Many phrasings trigger `send_quote_sms` once the customer has agreed on services. English: 'send me the quote', 'text me the price', 'can you quote me', 'give me an estimate'. Spanish: 'me puedes mandar un quote', 'me puedes cotizar', 'me puedes dar un presupuesto', 'mándame la cotización'. Don't require the literal word 'quote' — recognize the intent."

**All listed phrasings are customer-initiated explicit asks.** Fourth latent cue.

**Booking flow Step 1 (`:501`):**
> "1. Customer agrees to service ('Yes book it' / 'Sounds good' / 'Let's do it'). You have the price, vehicle, color, name in context.
> 2. Call `send_quote_sms` with the service, vehicle, customer details."

**Step 1 is "customer agrees" — implying an affirmation the agent waits for.** Fifth latent cue.

#### Tool-level cue

`tools.ts:231` send_quote_sms description:
> "Only call this when the customer has explicitly confirmed the services **and asked to be texted a quote** — otherwise use get_services to present pricing in your own reply text."

**The "AND asked to be texted a quote" clause is the strongest pull toward the friction step.** Customer must (a) confirm services AND (b) explicitly ask. The agent reads this and infers: if customer hasn't asked, I must elicit the ask. The cleanest elicitation: "Want me to send a quote?"

#### Critical Rule 16 ↔ auto-send interaction

Rule 16 says each side-effecting tool fires AT MOST ONCE per turn. Auto-send doesn't violate this — even when the agent auto-fires send_quote_sms, it fires ONCE per turn. The rule's intent is to prevent the LLM from firing send_quote_sms twice within a single inbound's inference (e.g., once early-thought, once late-thought). Auto-send keeps this invariant.

The only edge case: if customer says "yes send it" in turn N and "what about an exterior wash?" in turn N+1, auto-send fires once in N and again in N+1 with the new config — that's TWO turns, not ONE, and Rule 16 doesn't gate cross-turn firing. The D43 idempotency triple correctly recognizes these as distinct quotes (different `(service_id, tier_name, quantity)` set after the exterior wash addition) and creates Q-N+1. See Target 6 for the full guard analysis.

#### Critical Rule 20 ↔ auto-send interaction

Rule 20 says "Quote first, never book directly" — apply send_quote_sms over create_appointment. This is orthogonal to auto-send (it's tool-selection, not tool-timing). Auto-send leaves Rule 20 unchanged: agent still picks send_quote_sms over create_appointment; just fires it sooner.

#### Summary of latent friction cues

| # | Source | Line | Effect |
|---|---|---|---|
| 1 | Rule 2 ✅ RIGHT example | `system-prompt.ts:82-89` | Models customer-says-"send the quote"-then-tool flow |
| 2 | Rule 20 | `system-prompt.ts:227` | Trigger phrased as "customer agrees" (verbal affirmation) |
| 3 | Tool usage guide | `system-prompt.ts:286` | Trigger phrased as "customer agreed... (any 'yes book it'...)" |
| 4 | Quote-send intent recognition | `system-prompt.ts:291` | All listed phrasings are customer-initiated explicit asks |
| 5 | Booking flow Step 1 | `system-prompt.ts:501` | Step 1 is "Customer agrees to service" |
| 6 | Tool description | `tools.ts:231` | "AND asked to be texted a quote" — strongest pull |

The LLM aggregates all 6 cues into a single inferred policy: **wait for the customer to ask before firing send_quote_sms**. The cleanest LLM strategy to elicit the ask: "Want me to send a quote?"

**Critically: no Critical Rule explicitly forbids proactive firing. The friction step is purely emergent.** That makes Issue 45 a prompt-discipline fix, not a prompt-rule-removal fix.

---

### Target 2 — Empirical redundancy evidence

Covered in TL;DR + Empirical evidence sections above. Key data points:

- **4 of 4 captured Q-tests** (Q-0086/Q-0087/Q-0090/Q-0091) followed the friction pattern with 100% customer-confirm rate
- **0 of 4** produced any actionable signal at the friction step (no redirect, no exit, no clarification)
- **30-90 sec added latency** per quote-send flow (worst case unbounded if customer doesn't return)
- **Sample size caveat:** 4 conversations is small; absence of edge cases in the sample is not proof they don't exist in the broader population

The friction step is gating a behavior (customer redirect-at-last-second) that didn't fire in any observed instance.

---

### Target 3 — Decision signals available to the agent

The agent has 4 categories of signals about customer commitment at the moment send_quote_sms is being considered. Documenting each + how the prompt treats it today:

#### Category 1 — Commit words

The prompt's "Reading short replies" section (`:374-378`) and Quote-send intent recognition (`:291`) catalog these phrases:

**Short affirmatives (per `:376`):** "yes", "yeah", "sí", "ok", "sure", "go ahead", "yep", thumbs-up.

**Quote-send intent phrasings (per `:291`):** "send me the quote", "text me the price", "can you quote me", "give me an estimate".

**Tool usage guide phrasings (per `:286`):** "yes book it", "let's do it", "sounds good".

**Booking flow Step 1 phrasings (per `:501`):** "Yes book it", "Sounds good", "Let's do it".

**Spanish equivalents (per `:291`):** "me puedes mandar un quote", "me puedes cotizar", "me puedes dar un presupuesto", "mándame la cotización".

**Audit observation:** the lists are scattered across 4 sections of the prompt without a unified canonical list. Option A or B would benefit from consolidating into a single Critical Rule.

#### Category 2 — Configuration finalization signals

The prompt does NOT explicitly catalog these. Implicit signals the LLM could pick up:

- Customer hasn't added/changed services for N turns
- Customer used a closing phrase ("that's it", "that's all", "just that", "I'm good", "all set")
- The agent's prior turn announced a total ("$325 total" / "$435 for both")
- Customer's most recent message acknowledges the total ("ok cool" / "great" / "perfect") without proposing a change

**Audit observation:** these are the signals an auto-send rule (Option A) would need to encode. The challenge is distinguishing "I'm done configuring, send it" from "I'm thinking" — both can produce "ok" / "cool" / silence.

#### Category 3 — Question vs. statement signals

The prompt's general "answer the question" pattern (e.g., `:307` "ask ONE focused clarifying question before quoting") covers this for the discovery phase but doesn't speak to it for the close phase.

For auto-send: a question from the customer ("how much would it be?" / "is this final?" / "can you confirm the total?") is NOT a commit signal. The prompt today relies on the LLM to discriminate; an auto-send rule should make this explicit.

#### Category 4 — Negation / mid-correction signals

Per the prompt's Conversation freshness section (`:243-251`) and the Critical Rule cluster generally, the LLM is expected to recognize mid-conversation pivots and re-classify / re-quote. But no explicit rule for "if customer is negating or mid-correcting, do NOT auto-send."

Auto-send must NEVER fire when the customer's most recent message contains:
- "actually no" / "wait" / "hold on"
- "change that" / "add" / "remove" / "swap"
- A question that implies the customer is still exploring ("what about...")

**Audit observation:** these are the highest-priority signals to encode in any auto-send rule, because false-fires here directly cause customer harm (quote sent for the wrong config, requires supersession via Q-N+1).

#### Discrimination requirements for auto-send

| Signal class | Auto-send should fire? | Confidence |
|---|---|---|
| Explicit commit word ("yes" / "send it" / "let's do it") | YES | High |
| Configuration finalization implicit (silence after total, "ok cool") | A: YES, B: NO (no commit word) | Mixed |
| Question from customer ("can you confirm?", "what about X?") | NO | High |
| Negation / mid-correction ("wait", "actually", "change to") | NO | High |
| Multi-service finalization ("ok that's it, send it with both") | YES | High |
| Soft acknowledgment ("ok") | A: maybe, B: NO | Low |

Option A relies on the LLM judging "configuration finalized" correctly across the implicit signals. Option B fires only on explicit commit words, ceding the implicit-signal cases to status quo. Option C fires by default (no discrimination), relying on customer interrupt to redirect.

---

### Target 4 — Other side-effecting tools regression check

Per `tools.ts`, the side-effecting tools are: `send_quote_sms`, `send_info_sms`, `create_appointment`, `notify_staff`, `approve_addon`, `decline_addon`, `upsert_customer`.

For each, document the current "explicitly confirmed" pattern in the tool description:

| Tool | Tool description fragment (re: trigger) | Current friction pattern | Should auto-send rule cascade? |
|---|---|---|---|
| `send_quote_sms` | `tools.ts:231` "Only call this when the customer has explicitly confirmed the services and asked to be texted a quote" | **Issue 45 — too friction-heavy** | N/A — this IS the target |
| `send_info_sms` | `tools.ts:159` "Only call this when the customer has explicitly confirmed they want to receive that info — do not text links the customer did not ask for" | Customer initiates the request explicitly ("text me the address" / "send me the booking link"). The "explicitly confirmed they want to receive" wording is appropriate for static-link info — sending an unrequested link is spam. | **NO** — info links are spam if unsolicited. Keep current. |
| `create_appointment` | `tools.ts:137` "Only call this when the customer has explicitly confirmed the date, time, and service" + Critical Rule 10 "Never confirm an appointment without explicit agreement" + Critical Rule 20 "Quote first, never book directly" | Multiple layers of friction by design. Operator wants staff in the loop for scheduling. | **NO** — operator explicitly wants this gated. Keep current. |
| `notify_staff` | `tools.ts:201` "Only call this when escalation is actually needed: specialty vehicles... explicit human request..." | Trigger is condition-based ("escalation actually needed"), not customer-affirmation-based. | **NO** — different trigger model. Keep current. |
| `approve_addon` / `decline_addon` | `tools.ts:259` / `:275` "Only call this when the customer has explicitly confirmed they want to approve" / "Only call this when the customer has explicitly declined" | These are explicit customer-decision endpoints. The customer text IS the decision. No friction-step risk. | **NO** — appropriate semantics. Keep current. |
| `upsert_customer` | `tools.ts:291` "Call this AS SOON as you learn the customer's first name — do not wait for a quote or booking trigger" | Already proactive — no "explicitly confirmed" friction. | **N/A** — already proactive. |

**Regression-prevention conclusion:** the auto-send rule's wording MUST be scoped narrowly to `send_quote_sms`. Generic "auto-fire side-effecting tools when configuration is finalized" wording would accidentally cascade to `send_info_sms` (spam risk) and `create_appointment` (operator-locked friction). The recommended rule (any of A/B/C) names `send_quote_sms` explicitly and does not generalize.

**Audit observation:** the operator's current 5-tool-friction pattern (`send_quote_sms`, `send_info_sms`, `create_appointment`, `approve_addon`, `decline_addon` all use "Only call this when the customer has explicitly confirmed") is intentional and well-designed. Issue 45 targets the ONE tool where the friction is excessive — `send_quote_sms` — because that tool fires in the most predictable conversational moment (after a discussed quote total) and the customer's commitment is already established via earlier turns. The other 4 tools fire on more ambiguous customer signals and benefit from the friction step.

---

### Target 5 — Customer-facing reply timing

#### Current pattern (per Critical Rule 2 ✅ RIGHT example, `:82-89` and `:86-89`)

```
Customer: "Sure, send the quote"
You: [calls send_quote_sms]
You: "Quote sent! Tap the link to review and accept. Our team will follow up to confirm scheduling. Anything else?"
```

The customer-facing reply happens AFTER the tool call within the SAME agent turn. Critical Rule 2 ensures the agent always produces a customer-facing text block alongside any tool calls within a single inference.

#### Runner architecture supports both timing models

Per `agent-runner.ts:326-414`, a single agent inference can:
- Emit any number of tool_use blocks
- AND emit text content
- All in one `messages.create` response

The runner doesn't enforce ordering between text and tool_use; the Anthropic API delivers content blocks in the order the model emits them. Per Issue 35 backstop (`agent-runner.ts:347-401`), if a tool fires but text is empty, the runner retries with a no-reply nudge.

**Implication for auto-send:** the architecture already supports "fire send_quote_sms + emit customer-facing reply in the SAME agent turn." Auto-send doesn't require any runner change — only a prompt rule that tells the agent it's OK to do so without an intervening customer turn.

#### Recommended timing for auto-send

For all 3 options, the customer-facing reply lands in the same agent turn as the tool fire:

- **Option A / B:** "Quote sent — check your texts!" (terse, post-tool acknowledgment) OR keep current "Quote sent! Tap the link to review and accept. Our team will follow up to confirm scheduling. Anything else?" (slightly verbose but functional)
- **Option C:** "Sending the quote now — anything to add?" (announces-first-acts-second pattern; reply is BEFORE the tool dispatches, since the model emits text-then-tool by default when generating both)

#### Tool-result-handling sequence

For Options A and B, the timing is:

1. Customer message arrives
2. Agent emits text block "Quote sent — check your texts!" + tool_use block for send_quote_sms
3. Runner dispatches send_quote_sms; gets tool_result
4. Runner appends tool_result to messages; next iteration
5. Agent emits end_turn

The agent's first reply ("Quote sent — check your texts!") goes out BEFORE the tool finishes. If the tool fails, the agent's NEXT turn (after seeing the tool_result with `is_error: true`) must surface the failure honestly per Issue 27's resolution. The audit recommends an explicit Critical Rule clause for Option A/B: "If send_quote_sms returns `is_error: true` AFTER you have already told the customer 'Quote sent,' you MUST correct yourself in the next response: 'Actually, sorry — that send failed. Let me have staff follow up.' Do NOT compound by fabricating success."

Per Issue 27 (`docs/dev/SMS_AI_V2_PROMPT_OBSERVATIONS.md:730-763`), the agent has previously confabulated tool success after tool failure. The auto-send rule MUST not exacerbate this — proactive optimistic acknowledgment ("Quote sent!") before tool result is known is a regression risk for Issue 27.

**Mitigation:** Option A/B reply phrasing should be tool-result-agnostic ("Sending the quote now") rather than past-tense optimistic ("Quote sent!"). Operator decides at the wording-level (Decision #2 in Target 12).

---

### Target 6 — D36 + D43 idempotency + 60-sec guard interaction

#### D36 60-sec guard (per `send-quote-sms/route.ts:402-518`)

**Match criteria:**
- Same `customer_id`
- Same `vehicle_id` (or both NULL)
- Same `(service_id, tier_name, quantity)` triple set (D43 Session C — `:421-427`)
- Status in `('sent', 'viewed')`
- `created_at` within last 60 seconds
- `deleted_at IS NULL`

**On match:** returns existing quote with `was_duplicate: true` + `instructions_for_agent` directing agent to acknowledge naturally without mentioning the dedup. NO new quote row created. NO second SMS sent.

#### D43 triple-key (per `services-summary.ts` + `buildItemTripleKey`)

The triple `(service_id, tier_name, quantity)` ensures legitimately distinct quotes don't collapse:
- Customer says "actually, change Per Row × 2 to Per Row × 3" → new quote (different quantity in triple)
- Customer says "actually, swap to Complete tier" → new quote (different tier_name in triple)
- Customer says "add an Exterior Wash" → new quote (additional service_id in triple set)

The triple correctly handles the auto-send → configuration-change → re-fire flow.

#### Auto-send interaction analysis

**Case 1: Customer says "yes" twice (double-affirmation).**
```
Customer: "yes"
Agent: [auto-fires send_quote_sms — creates Q-N]
Agent: "Quote sent — check your texts!"
Customer: "yes" (delayed echo, possibly from auto-typing)
Agent: [auto-fires send_quote_sms — second attempt]
Server: D36 guard fires; returns Q-N with was_duplicate=true
Agent: per Rule 21, acknowledges naturally without mentioning dedup
```
**Outcome:** ZERO customer harm. D36 + D43 covers this completely. No guard tuning needed.

**Case 2: Customer adds a service mid-flow after auto-send.**
```
Customer: "yes send it"
Agent: [auto-fires send_quote_sms with Hot Shampoo Per Row × 2 — creates Q-N]
Agent: "Quote sent!"
Customer: "wait can you add an exterior wash?"
Agent: [calls get_services, computes new total, auto-fires send_quote_sms with both services — creates Q-N+1]
Server: D36 guard MISS (triple-key differs — added Express Exterior Wash); creates Q-N+1
Agent: "New quote sent with both — check your texts!"
```
**Outcome:** customer ends up with TWO quote SMS messages (Q-N and Q-N+1). The second supersedes the first conceptually but the first is still actionable. **Per Issue 20 quote-supersession architecture, the original Q-N should be marked 'superseded' when Q-N+1 lands** — but I did not verify whether the current code does this. If not, the customer could conceivably accept the wrong quote. **Open question for operator: should the audit recommend a supersession enhancement, or accept that the customer reads the latest SMS and acts on it?**

**Recommendation:** the audit flags this as a watch-item for Option A/B but does NOT recommend supersession scope-creep. The current behavior (customer sees two SMS, reads the latest, acts on it) is acceptable for the operator's volume; supersession is an independent improvement that should be a separate issue.

**Case 3: Customer says "yes" then "actually no never mind."**
```
Customer: "yes"
Agent: [auto-fires send_quote_sms — creates Q-N]
Agent: "Quote sent!"
Customer: "actually never mind"
Agent: [does NOT auto-fire — no commit signal; customer is reversing]
Agent: "No worries — let me know if you change your mind."
```
**Outcome:** Q-N is sent and may not be accepted. The customer has the SMS link but won't act on it. **Per the existing quote lifecycle, Q-N expires after the operator-configured validity window (default 14 days).** No customer harm beyond the unwanted SMS.

**Case 4: Customer says "yes" but configuration is incomplete (no total stated yet).**
```
Customer: "yes" (in response to "want me to look up pricing?")
Agent: [should NOT auto-fire — no total computed yet; "yes" is consent to lookup, not consent to send]
Agent: [calls get_services; computes total]
Agent: "$325 total. Sending the quote now."
Agent: [auto-fires send_quote_sms]
```
**Outcome:** Option A/B's rule MUST require both a commit signal AND a recently-computed total before firing. If the audit's recommended rule wording is "fire when customer commits AND configuration is finalized AND total is known," Case 4 is correctly handled. If the rule is over-aggressive ("fire on any 'yes' after a tool call"), Case 4 misfires.

**Audit recommendation:** the Critical Rule wording for Option A/B must explicitly require all three preconditions:
1. Commit signal in customer's most recent message (Option B: from word list; Option A: any LLM-inferred commit intent)
2. Total has been stated in the agent's most recent turn (or the immediately-prior agent turn)
3. Configuration hasn't changed since the total was stated

#### Conclusion: D36 + D43 guards are sufficient for Option A/B/C

No guard tuning needed. The existing 60-sec window + triple-key handles all auto-send edge cases without customer harm. The watch-item is quote supersession (Case 2) but it's pre-existing, not introduced by Issue 45's fix.

---

### Target 7 — Recommended fix architectures (side-by-side)

| Dimension | **Option A — Proactive auto-send** | **Option B — Word-list-gated auto-send** | **Option C — Soft-send rephrase** |
|---|---|---|---|
| **Strategy** | Full auto-send when LLM infers configuration finalized | Auto-send only on explicit commit word | Announce-first-act-second; tool fires by default |
| **Trigger condition** | Customer commit intent (any phrasing the LLM judges as commit) + total stated + no mid-flux signal | Customer message contains a phrase from the explicit commit list (English + Spanish per Categories 1/3 in Target 3) + total stated + configuration unchanged | Customer reaches the end of a configuration discussion (any phrasing); agent announces send + fires |
| **Implementation surface** | Critical Rule (new, near Rule 16/20 — side-effect cluster) + `tools.ts` send_quote_sms description retighten (drop "AND asked to be texted a quote" clause) | Critical Rule (new) listing the commit word set explicitly; `tools.ts` send_quote_sms description retighten | Critical Rule (new, soft-wording); Rule 2 ✅ RIGHT example updated to show new pattern; tool description unchanged |
| **Edge case coverage** | LLM judges signals from Target 3 Category 1+2; Target 9 patterns mostly handled, soft-acknowledgment ("ok") edge case is judgment-dependent | Strict commit-word match; Target 9 patterns conservatively handled, but "ok" / "cool" / silence don't fire — those cases stay status quo (agent asks "Want me to send a quote?") | All Target 9 patterns reach the tool-fire window but customer can interrupt with a redirect/change before the tool dispatches |
| **Pros** | Maximum funnel improvement; eliminates friction in the common case; respects D45/D46/D47/D48 architecture (no helper/tool/schema changes) | Lower regression risk — explicit operator-controlled trigger list; LLM judgment removed from auto-send decision; debuggable (operator can read the list) | Smallest behavioral change; preserves customer ability to redirect; lowest regression risk overall |
| **Cons** | Relies on LLM judging "configuration finalized" — possible false-fires on ambiguous customer messages; biggest behavioral-change blast radius | Marginal funnel improvement only — most observed friction-step responses ARE "Yeah" which IS in the commit list, but the underlying "agent asks first" pattern persists if customer never explicitly commits; doesn't address the root cue ("agent asks because tool description says 'AND asked to be texted'") | Tiny funnel improvement; the agent's pre-tool announcement is still SMS friction (customer reads "Sending the quote now" before the actual quote link); doesn't address root cue at all |
| **Customer-experience tradeoff** | Faster funnel; small risk of false-fires sending unwanted quote (mitigated by D36 60-sec guard + customer can ignore unwanted SMS) | Funnel speed similar to status quo; customer-experience essentially unchanged | Funnel slightly faster than status quo; customer sees one SMS preview before quote link (1-2 sec gap) |
| **Regression risk for Issue 27 (hallucination)** | MEDIUM — proactive optimistic reply ("Quote sent!") before tool result lands is a confabulation surface. Mitigate via tool-result-agnostic phrasing ("Sending the quote now") | LOW — fires on explicit commit only; agent is less likely to confabulate when customer was explicit | LOW — soft-send phrasing is naturally tool-result-agnostic |
| **Regression risk for Issue 31 (double-send)** | LOW — D36 60-sec guard covers; Rule 16 covers single-turn double-fire | LOW — same protections | LOW — same protections |
| **Regression risk for Target 9 patterns** | Medium for "soft acknowledgment" / "exploratory question with affirmative tone" / "multi-language ambiguous commit" | LOW for all 7 — strict word-list match removes ambiguity | LOW for all 7 — customer can interrupt |
| **LOC delta estimate** | ~40-60 LOC (new Critical Rule, ~30 LOC; tool description ~5 LOC; Rule 2 example update ~5 LOC; renumber 16-21 → 17-22 if inserting near side-effect cluster ~5 LOC) | ~50-80 LOC (new Critical Rule includes word list, slightly larger; everything else similar) | ~25-40 LOC (new Critical Rule shorter; Rule 2 example update larger; no tool description change) |
| **Test delta estimate** | +8-12 tests (rule headline, placement, no-friction example, word-list-not-required pin, configuration-finalized examples, mid-correction don't-fire example, etc.) | +6-10 tests (rule headline, word list literal, configuration-precondition, regressionless on edge cases) | +4-8 tests (rule headline, soft-send phrasing, customer-interrupt example) |
| **Suitability for D49 implementation session** | Highest priority match to operator's stated intent ("Auto-send quotes when configuration is finalized") | Conservative fallback; matches operator intent partially | Conservative fallback; matches operator intent minimally |

**Audit leaning (NON-BINDING — operator decides):**

The audit's structural assessment leans toward **Option A** because it most directly addresses the operator's stated intent ("Auto-send quotes when configuration is finalized"). The medium regression risk for Issue 27 (hallucination) is mitigable via tool-result-agnostic phrasing ("Sending the quote now" instead of "Quote sent!") that the operator decides in Decision #2 (Target 12). Option B is a viable conservative fallback if the operator wants explicit word-list control. Option C is a viable minimum-change option if the operator wants the smallest possible behavioral change.

The audit does NOT recommend bundling Options A + C (e.g., "Option A with soft-send phrasing") — that's a wording decision the operator makes in Decision #2, not a separate option.

---

### Target 8 — Critical Rules numbering plan

#### Current state (post-D47)

Per `grep -n "^[0-9]*\.\s\*\*" src/lib/sms-ai/system-prompt.ts`, Critical Rules are numbered 1-21. The side-effecting-discipline cluster:

- Rule 10: Never confirm an appointment without explicit agreement
- Rule 16: Don't double-act (each side-effecting tool AT MOST ONCE per turn)
- Rule 20: Quote first, never book directly

These are the natural neighbors for a new auto-send rule. The audit recommends inserting the new rule as **Rule 17** (immediately after Rule 16 "Don't double-act") — Rule 16 governs side-effecting tool firing rate, Rule 17 (new) governs trigger timing for the specific case of send_quote_sms.

#### Recommended slot: insert as Rule 17

| Position | Current | After insert |
|---|---|---|
| 16 | Don't double-act | Don't double-act (unchanged) |
| 17 | Never pitch mobile service | **NEW: Auto-send send_quote_sms** |
| 18 | After notify_staff, hand off | Never pitch mobile service (was 17) |
| 19 | Tool-grounded add-ons only | After notify_staff, hand off (was 18) |
| 20 | Quote first, never book directly | Tool-grounded add-ons only (was 19) |
| 21 | Tool responses with instructions_for_agent | Quote first, never book directly (was 20) |
| 22 (NEW) | n/a | Tool responses with instructions_for_agent (was 21) |

**Renumber impact:** Rules 17-21 shift down by 1 to become 18-22. The Rule 17 slot becomes the new auto-send rule.

#### Inline cross-references to update

Per `grep -n "Rule \?\?\|Critical Rule\|critical rule\|Critical rule" src/lib/sms-ai/system-prompt.ts`, the inline cross-references that mention Rule numbers in the renumber range (17-21) need mechanical update:

| File:line | Current text | Updated text |
|---|---|---|
| `:93` (Rule 2) | "When a tool response contains `instructions_for_agent`, follow it (per Rule 21) — that following IS your customer-facing reply." | "...(per Rule 22) — that following IS your customer-facing reply." |
| `:132` (Rule 7) | "Exceeding it returns an error with `instructions_for_agent` — clarify the count with the customer and retry per Rule 21." | "...retry per Rule 22." |
| `:205` (Rule 9) | "Architectural parallel to Critical Rule 19 (`addon_suggestions`)." | "Architectural parallel to Critical Rule 20 (`addon_suggestions`)." |
| `:286` (Tool usage guide) | "Call `send_quote_sms` to create the Quote record AND text the link. This is the booking path — staff handles scheduling confirmation in a follow-up. Do NOT call `create_appointment` directly (see "Booking flow" + Critical rule 20)." | "...(see "Booking flow" + Critical rule 21)." |
| `:359` (Discovery and conversation flow) | "Do NOT call `create_appointment` directly (see "Booking flow" below + Critical rule 20)." | "...(see "Booking flow" below + Critical rule 21)." |

Plus any inline reference to Rules 17, 18, 19, 20, 21 within the renumbered rules themselves (none observed in the current text, but the implementation session must re-grep after the renumber to catch any inserted ones).

**Audit observation:** the renumber is mechanical and small (5 sites). D47's renumber from 19 → 21 rules touched 5 sites; this audit's recommended renumber is one rule larger and would touch the same approximate site count.

#### Alternative: append as Rule 22 (no renumber)

If the operator prefers zero renumber overhead, the new auto-send rule could append as Rule 22 (after the current Rule 21 "Tool responses with instructions_for_agent"). The cost: the side-effect-discipline cluster (Rules 10, 16, 20) would not be contiguous with the new rule — slightly weaker structural coherence.

**Audit recommendation:** insert at Rule 17 (renumber) for structural coherence. The renumber is small; the cluster contiguity is valuable for future audits and for the LLM's discovery of related rules during inference.

---

### Target 9 — Conversation pattern coverage

For each candidate auto-send option, predict expected behavior across 7 adversarial patterns. Flag patterns where the option creates new friction or new false-fires.

#### Pattern matrix

| # | Pattern | Customer message sequence | Expected: A | Expected: B | Expected: C |
|---|---|---|---|---|---|
| 1 | **Direct price query (exploratory)** | "How much for hot shampoo?" | NO auto-send (no commit signal; just a price ask) | NO auto-send (no commit word) | NO auto-send (no end-of-config signal) |
| 2 | **Implicit commitment** | "Cool, I'll take the per row × 2" | YES auto-send (LLM judges "I'll take" as commit) | NO auto-send ("I'll take" not in word list — though could be added) | YES auto-send (end-of-config signal; reply announces) |
| 3 | **Conditional commitment** | "Yes, send it but can you add an exterior wash first?" | NO auto-send (mid-flux: customer added a service in same message; must recompute first) | NO auto-send (same: "send it" matches but trailing "add exterior wash first" signals mid-flux) | NO auto-send (customer is requesting a change; agent should recompute then proceed) |
| 4 | **Mid-conversation correction** | "Actually wait, change the per row to 3 rows" | NO auto-send (negation "actually wait" + change request) | NO auto-send (no commit word; correction explicit) | NO auto-send (customer is requesting a change) |
| 5 | **Multi-service finalization** | "OK that's it, send the quote with both services" | YES auto-send (commit signal + closing phrase) | YES auto-send ("send the quote" matches) | YES auto-send (end-of-config + send-intent) |
| 6 | **Customer re-asks for clarification** | "Can you confirm the total?" | NO auto-send (question; not commit) | NO auto-send (no commit word; "?" present) | NO auto-send (customer wants info, not the tool) |
| 7 | **Customer cancels at last second** | "Actually never mind" | NO auto-send (negation; cancellation) | NO auto-send (no commit word; cancellation explicit) | NO auto-send (cancellation signal) |

#### Pattern coverage summary

| Option | False-fires (option fires when it shouldn't) | False-misses (option doesn't fire when it should) |
|---|---|---|
| A | Risk in Pattern 2-ambiguous-phrasing ("ok cool" without explicit commit) — judgment-dependent | Risk in Pattern 5-edge ("just send it" with no trailing language — should match) |
| B | None observed in matrix — strict word-list match | Pattern 2-ambiguous ("Cool, I'll take") — doesn't match word list; reverts to status quo (agent asks "Want me to send a quote?") |
| C | Pattern 7-edge ("Actually never mind" sent AFTER agent announces — agent's "Sending now" message lands before customer's cancel) — soft-send is sometimes too soft to catch fast cancellations | None — soft-send always fires; customer interrupts if wrong |

#### Critical observation: Pattern 3 (conditional commitment)

This is the highest-risk pattern. The message "Yes, send it but can you add an exterior wash first?" combines an explicit commit word ("yes" / "send it") with a mid-flux signal ("add an exterior wash first"). All 3 options correctly NOT-fire IF the rule wording captures the mid-flux signal — but Option B's strict word-list match has a structural risk: a poorly-worded rule might fire on "send it" alone without checking for trailing change-requests.

**Audit recommendation:** the implementation session must write the Critical Rule to require both (a) commit signal AND (b) absence of mid-flux/change-request/question signal in the customer's most recent message. The 7-pattern matrix above is the verification fixture.

#### Token budget impact

Per the prompt's channel rules (`:47`): "Keep replies SHORT. Aim for ≤160 characters (one SMS segment). Hard ceiling 320 characters." The auto-send reply ("Quote sent — check your texts!" or similar) is short by design — no token budget impact.

The new Critical Rule itself adds ~30-50 LOC to the system prompt body, which counts against the cached prompt size. The system prompt is currently ~30KB; +50 LOC ≈ ~3KB; new total ~33KB. Well within Anthropic's 200K context window and Anthropic's prompt-caching scheme handles it efficiently. No token budget concern.

---

### Target 10 — Implementation scope estimate

#### Files to modify

| File | Reason | Lines touched |
|---|---|---|
| `src/lib/sms-ai/system-prompt.ts` | Add new Critical Rule; update Rule 2 ✅ RIGHT example; renumber 17-21 → 18-22; update 5 inline cross-references | ~50-80 |
| `src/lib/sms-ai/tools.ts` (Option A only) | Retighten send_quote_sms description; drop "AND asked to be texted a quote" clause | ~5-10 |
| `src/lib/sms-ai/__tests__/system-prompt.test.ts` | Rule-count assertion (21 → 22), new-rule headline pin, new-rule placement pin, Pattern 1-7 coverage tests, cross-reference renumber pins | ~80-150 |
| `src/lib/sms-ai/__tests__/tools.test.ts` (Option A only) | send_quote_sms description pin — verify "AND asked to be texted a quote" clause removed | ~10-20 |

**Total LOC delta:**
- Option A: ~150-260
- Option B: ~140-240 (no tools.ts change)
- Option C: ~120-200 (no tools.ts change; smaller new-rule body)

#### Test count delta

- Option A: +8-12 tests
- Option B: +6-10 tests
- Option C: +4-8 tests

#### Time estimate

- All 3 options: ~60-90 minutes for a single combined session (smaller than D47 because no `services/route.ts` work, no tool-shape change for response format)

#### Single session vs split

**Strongly recommend SINGLE session.** All changes are tightly coupled:
- Renumber + new rule + cross-reference updates must be atomic (a split would leave the prompt with stale cross-references)
- Test pins must land with the rule
- Tool description change (Option A) must land with the rule (or operator runs the risk of mid-deploy inconsistency between prompt and tool desc)

#### Pre-deploy gates

- `npx tsc --noEmit` 0 errors (likely no TypeScript surface change; rules are string content)
- `npm run lint` 0 errors / 97 warnings baseline unchanged
- `npm test` full suite passes (target: 2407 + 4-12 new = ~2411-2419)
- `npm run build` clean (788 pages)

#### Manual verification (operator runs after deploy)

Per Target 11.

---

### Target 11 — Verification plan

5-7 conversation scenarios the operator runs post-deploy on the dev server. Each scenario specifies the customer message sequence, expected agent behavior, what PM2 logs should show, and what customer SMS preview should show.

#### Scenario 1 — Golden auto-send (commit + total + no mid-flux)

**Customer message sequence:**
1. Customer: "How much for express exterior wash on my 2018 Suburban?"
2. Agent: (calls classify_vehicle, then get_services) "Express Exterior Wash for your Suburban is $110."
3. Customer: "Cool, send it."

**Expected agent behavior under Option A/B/C:**

- Option A: auto-fires send_quote_sms in same turn as text reply ("Sending the quote now — check your texts!")
- Option B: auto-fires (commit word "send it" matches list)
- Option C: announces "Sending the quote now — anything to add?" + fires

**Expected PM2 logs:** `iter=1` (classify_vehicle), `iter=2` (get_services), `iter=3` (send_quote_sms + text reply), `stop_reason=end_turn`. NO intermediate "Want me to send a quote?" iter.

**Expected customer SMS preview:** quote link arrives within seconds of the "Cool, send it" reply.

#### Scenario 2 — Mid-flux do-not-fire (commit + change request in same message)

**Customer message sequence:**
1. Customer: "Hot shampoo per row × 2 for the Suburban"
2. Agent: "Per Row × 2 is $250 on your Suburban. Sending the quote now."
3. Customer: "Yes send it, but actually can you add an exterior wash too?"

**Expected agent behavior:** must NOT auto-fire on the "Yes send it" — the trailing "actually can you add" is a change request. Agent should recognize mid-flux, call get_services if needed for the addition, compute new total, then proceed.

**Expected agent reply:** "Of course — Express Exterior Wash adds $110 for a total of $360. Sending the updated quote now."

**Expected PM2 logs:** `iter=1` (get_services with new service set), `iter=2` (send_quote_sms with both services). NO send_quote_sms fire in the same turn as customer's mid-flux message.

**Expected customer SMS preview:** quote with BOTH services, $360 total.

#### Scenario 3 — Mid-conversation correction don't-fire

**Customer message sequence:**
1. Customer: "Hot shampoo per row × 2 for the Suburban"
2. Agent: "Per Row × 2 is $250. Want to add anything?"
3. Customer: "Actually wait, make it per row × 3"

**Expected agent behavior:** NO auto-fire. Customer is correcting. Agent should recompute and re-quote.

**Expected agent reply:** "Got it — Per Row × 3 is $375. Sending the quote now."

**Expected PM2 logs:** `iter=1` (text reply only, OR get_services recall + text). No send_quote_sms.

**Note:** auto-fire happens in scenario's IMPLIED next turn after the customer affirms, not on the correction message itself.

#### Scenario 4 — Customer-question don't-fire

**Customer message sequence:**
1. Customer: "Hot shampoo per row × 2 for the Suburban"
2. Agent: "Per Row × 2 is $250."
3. Customer: "Can you confirm the total again?"

**Expected agent behavior:** NO auto-fire. Customer asked a question, not committed.

**Expected agent reply:** "Yes — $250 for Per Row × 2 on your Suburban."

**Expected PM2 logs:** `iter=1` (text reply only). No send_quote_sms.

#### Scenario 5 — Customer cancellation don't-fire

**Customer message sequence:**
1. Customer: "Hot shampoo per row × 2 for the Suburban"
2. Agent: "Per Row × 2 is $250. Sending the quote now?"  *(or whatever current prompt produces)*
3. Customer: "Actually never mind"

**Expected agent behavior:** NO auto-fire. Customer reversed.

**Expected agent reply:** "No worries — let me know if you change your mind."

**Expected PM2 logs:** `iter=1` (text reply only). No send_quote_sms.

#### Scenario 6 — Multi-service finalization auto-fire

**Customer message sequence:**
1. Customer: "Hot shampoo per row × 2 + express exterior wash for the Suburban"
2. Agent: (calls get_services) "Per Row × 2 is $250, Express Exterior Wash is $110. Total $360."
3. Customer: "OK that's it, send the quote with both"

**Expected agent behavior:** auto-fire. Commit signal + closing phrase + total stated + no mid-flux.

**Expected agent reply:** "Sending now — check your texts!"

**Expected PM2 logs:** `iter=1` (send_quote_sms with both services + tiers). `stop_reason=end_turn`.

**Expected customer SMS preview:** quote with BOTH services, $360 total.

#### Scenario 7 — Issue 27 regression check (auto-send + tool failure)

**Customer message sequence:**
1. Customer: "Send the quote for express exterior wash on my Suburban"
2. Agent: (calls send_quote_sms; simulated tool failure via Twilio rate limit or other error)

**Expected agent behavior under Option A/B:** the text reply ("Sending the quote now — check your texts!") lands BEFORE the tool result. When the tool returns `is_error: true`, the agent's NEXT turn (or same-turn if model emits both) must surface the failure: "Actually, sorry — that send failed. Let me have staff follow up."

**Expected agent must NEVER:** claim success in a later turn after failure (per Issue 27's existing prompt rule + the new auto-send rule's explicit reinforcement).

**Expected PM2 logs:** `iter=1` (send_quote_sms latency=Xms is_error=true), `iter=2` (notify_staff + text reply acknowledging failure).

**Customer SMS preview:** NO quote link arrives. Customer sees only the agent's corrective reply.

---

### Target 12 — Open operator decisions

Per the audit's analysis, 4 well-framed decisions remain for the operator to lock before D49 fires:

| # | Decision | Audit framing | Audit leaning |
|---|---|---|---|
| 1 | **Pick one option** | A: Proactive auto-send (LLM-judged finalization). B: Word-list-gated auto-send (explicit commit phrase). C: Soft-send rephrase (announce-first-act-second). | **A** — most directly addresses operator's stated intent, mitigable regression risk via Decision #2 |
| 2 | **Customer-facing reply phrasing immediately after auto-send** | "Quote sent — check your texts!" (terse, past-tense — Issue 27 risk if tool fails). "Sending the quote now — check your texts!" (tool-result-agnostic, recommended for Issue 27 safety). "Sent — anything to add?" (terse with continuation hook). Operator-curated alternative. | **"Sending the quote now — check your texts!"** — tool-result-agnostic, ≤ ~50 chars, recommended for Options A/B; matches Option C natively |
| 3 | **Should the agent EVER ask "Want me to send a quote?" as a fallback?** | DELETE the friction step entirely (Options A/B fire on every qualifying turn; if no qualifying turn arrives, the agent never sends — customer has to escalate). PRESERVE as fallback (auto-send fires in clear cases; agent asks "Want me to send a quote?" in ambiguous cases). | **DELETE entirely** for A/B; the absence of a qualifying turn (configuration not finalized, total not stated, customer didn't commit) is itself a signal that the agent should not be sending a quote yet — asking "Want me to send a quote?" in those moments is the friction Issue 45 targets |
| 4 | **Edge case coverage validation** | Confirm whether the audit's Target 9 7-pattern matrix matches operator's intent. Patterns 1 (exploratory query don't-fire), 3 (conditional commitment don't-fire), 4 (mid-correction don't-fire), 6 (question don't-fire), 7 (cancellation don't-fire) all have unanimous "NO auto-send" prediction across A/B/C — operator should sanity-check. Pattern 2 (implicit commitment) is where A and B/C diverge — operator should decide whether "Cool, I'll take" qualifies. Pattern 5 (multi-service finalization) all converge to auto-fire — operator should sanity-check. | **Validate before implementation session** — the 7 patterns are the auto-send rule's behavioral contract; if the operator disagrees with any prediction, the rule wording shifts |

**Zero blocking decisions.** All 4 are explicit decisions for the operator to make; the audit gives evidence-grounded leanings but the operator decides. The implementation session (D49) can fire as soon as Decisions #1-3 are locked (Decision #4 is sanity-check; implementer can adjust rule wording during writing if a pattern surfaces an ambiguity).

---

## Risk matrix

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Option A misfires on ambiguous customer message** (e.g., "ok cool" judged as commit when customer was just acknowledging) | Medium | Medium | D36 60-sec guard prevents double-fire if customer re-commits; customer can ignore unwanted SMS; Decision #2 favors tool-result-agnostic reply phrasing |
| **Option A regresses Issue 27 (hallucination after failure)** | Medium | Low | Tool-result-agnostic reply phrasing ("Sending the quote now" not "Quote sent!") + explicit Critical Rule clause covering post-failure correction |
| **Option A overlooks Pattern 3 (conditional commitment with trailing change-request)** | High | Low if rule wording is correct, Medium if rule wording is sloppy | Rule wording MUST require absence of mid-flux/change-request/question signal as a precondition; verified via Pattern 3 test in Target 9 |
| **Option B has marginal funnel improvement** (most "yes" affirmatives ARE in the word list, but the underlying friction-asking pattern persists for non-listed customer phrases) | Low (intentional conservatism) | High | Operator accepts as a feature: B trades funnel improvement for explicit-control safety |
| **Option C has tiny funnel improvement** (soft-send still emits an SMS announcement before the quote link) | Low (intentional conservatism) | High | Operator accepts as a feature: C is minimum-change |
| **Renumber 17-21 → 18-22 introduces stale cross-references** | Low | Low | 5 cross-reference sites identified in Target 8; implementer must re-grep after renumber to catch any inserted ones |
| **Auto-send fires before customer's vehicle/customer info is complete** | Medium | Low | Rule wording must require "configuration finalized + total stated" preconditions; tool itself REQUIRES phone (runtime-injected) and validates customer/vehicle server-side — the worst case is a 400 with `instructions_for_agent` that the agent surfaces honestly |
| **Auto-send + supersession edge case** (customer adds service mid-flow → Q-N+1 created; Q-N not auto-superseded) | Low | Low | Pre-existing behavior — customer sees both SMS, acts on the latest; supersession enhancement is out of scope for Issue 45 |
| **Test fixture brittleness on Pattern 2 (implicit commitment)** | Low | Medium | Tests should assert the rule's behavior on canonical Pattern 2 examples, not on edge-case phrasings; operator approves the canonical set during Decision #4 |

**Combined risk:** LOW-MEDIUM. The fix is small, well-scoped, and architecturally clean (no helper / endpoint / schema changes). The main residual risk is rule-wording fidelity on Pattern 3 (conditional commitment); the 7-pattern test matrix in Target 9 is the operator-visible verification fixture.

---

## Verification of audit hard rules

- [x] **No `src/` source code changes** — verified: `git diff --name-only` at session end shows only the audit deliverable + 3 doc files
- [x] **No migrations** — verified: zero `supabase/migrations/` additions
- [x] **No test changes** — verified: zero test files touched
- [x] **No new files except audit deliverable + 3 doc updates** — verified
- [x] **Every finding cites `file:line`** — verified: every Critical Rule cited as `system-prompt.ts:<line>`; every tool description cited as `tools.ts:<line>`; every dispatcher/runner/route reference cited as `<file>:<line>`
- [x] **Verified against actual codebase + actual conversation evidence** — verified: read `system-prompt.ts` end-to-end (682 lines); read `tools.ts` end-to-end (332 lines); read `tool-dispatcher.ts` send_quote_sms section (lines 492-519) + helper lines; read `agent-runner.ts` end-to-end (521 lines); read `send-quote-sms/route.ts` idempotency-guard section (lines 400-518); referenced Q-0086/Q-0087/Q-0090/Q-0091 conversations from operator's empirical capture in `SMS_AI_V2_PROMPT_OBSERVATIONS.md:1328-1350`
- [x] **Audit surfaces 2-3 options for Target 7, does NOT pick a winner** — verified: 3 options surfaced (A, B, C); audit's structural leaning toward A is explicitly NON-BINDING; operator decides in Decision #1
- [x] **Do NOT touch other Critical Rules** beyond the minimum needed — verified: audit recommends inserting ONE new rule (slot 17) and renumbering 17-21 → 18-22 (5 cross-references); no recommendations to modify D38/D43/D45/D46/D47/D48 rules
- [x] **Honor existing arc's architectural decisions** — verified: D38 customer-facing reply timing PRESERVED (any auto-send option pairs tool fire with text reply per Rule 2); D43 idempotency triple PRESERVED (D36 60-sec guard covers auto-send double-fire scenarios); D45/D46/D47/D48 work UNAFFECTED (no helper / surface / schema changes)

---

## Appendix A — Quick reference: 5 latent cues that produce the friction step

For the implementation session's quick scan:

1. **Critical Rule 2 ✅ RIGHT example** at `system-prompt.ts:82-89` — models the customer-says-"send the quote"-then-tool pattern
2. **Critical Rule 20** at `:227` — trigger phrasing "When the customer agrees to a service"
3. **Tool usage guide** at `:286` — trigger phrasing "Customer agreed on a service (any 'yes book it' / 'let's do it' / 'sounds good' agreement after price)"
4. **Quote-send intent recognition** at `:291` — all listed phrasings are customer-initiated asks
5. **Booking flow Step 1** at `:501` — "Customer agrees to service ('Yes book it' / 'Sounds good' / 'Let's do it')"

Plus the tool-level cue: **`tools.ts:231`** — "Only call this when the customer has explicitly confirmed the services **AND asked to be texted a quote**"

Option A explicitly addresses cues 1 (rephrase example), 2 (clarify "agrees" to include implicit finalization), 6 (drop "AND asked to be texted"). Cues 3, 4, 5 are reinforced by the new Critical Rule's wording, not rewritten.

Option B leaves cues 1-5 unchanged and adds the new Critical Rule that overrides them when the commit word matches.

Option C leaves cues 1-6 unchanged and adds the new Critical Rule for soft-send phrasing.

---

## Appendix B — Out-of-scope items captured for future audits

The following are surfaced by Issue 45 analysis but are NOT scoped for the D49 fix:

1. **Quote supersession enhancement** — when auto-send produces Q-N+1, Q-N should be marked 'superseded' so customer can't accept the wrong version. Pre-existing behavior; out of Issue 45 scope.

2. **Soft-send fallback for ambiguous commits in Option A** — if operator picks A and operator-locked Decision #3 is "delete friction step entirely," there's no fallback for genuinely ambiguous commits. Out of scope unless operator decides otherwise.

3. **Multi-language commit-word expansion for Option B** — the existing Quote-send intent recognition paragraph (`:291`) lists English + Spanish. Filipino, Hindi, Urdu commit words not listed. Out of scope; operator can add via separate enhancement.

4. **Cross-tool auto-send pattern for `send_info_sms` and `create_appointment`** — Target 4 confirmed these tools should NOT cascade. Out of scope; the existing 5-tool friction pattern is intentional.

5. **Soft-send phrasing variants for Option C** — "Sending the quote now — anything to add?" vs. "Sent — let me know if you want to change anything" vs. operator-curated alternatives. Operator picks during D49 if Option C is selected; otherwise out of scope.

---

## Appendix C — Cross-references to prior Issues

For the implementer's quick navigation:

- **Issue 26** (`SMS_AI_V2_PROMPT_OBSERVATIONS.md:686`) — send_quote_sms tool failure on rate-limited conversations. Auto-send must surface tool failures honestly per Issue 26's existing resolution.
- **Issue 27** (`:730`) — agent hallucinates tool success after tool failure. Auto-send's optimistic-acknowledgment phrasing is a regression surface; mitigated via tool-result-agnostic reply phrasing.
- **Issue 30** (`:854`) — quote duplication across multi-day conversations. Different time window than D36; out of scope for Issue 45.
- **Issue 31** (`:898`) — intermittent double send_quote_sms within single conversation. Resolved by D36 60-sec guard; auto-send leverages the same guard.
- **Issue 38 / D43** — multi-tier (service_id, tier_name, quantity) triple-key idempotency. Auto-send's configuration-change flow (Pattern 5) leverages triple-key correctly.
- **Issue 42 / D48** — appointment_services.quantity schema + conversion flow. Orthogonal to Issue 45 (quote-stage vs. appointment-stage); no interaction.
- **Issue 43 / D47** — price lookup never recall (Critical Rule 8). Auto-send fires AFTER pricing is established; Rule 8 is upstream; no interaction.
- **Issue 44 / D47** — scope-pricing tier enumeration (Critical Rule 9). Auto-send fires AFTER tier discussion is finalized; Rule 9 is upstream; no interaction.
- **Issue 46** (`:1352`) — Voice Quote Sent label. UI-only fix shipped via channel-aware notificationType branching; orthogonal to Issue 45.

---

## End of audit

D49 implementation session can fire as soon as operator locks Decisions #1-3 (Decision #4 is sanity-check; implementer can adjust during writing). Recommended audit hand-off message: "Audit deliverable at `docs/dev/ISSUE_45_AUTO_SEND_AUDIT.md`. Lock Decisions #1-3 in Target 12 and D49 can begin."
