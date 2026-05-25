# Issue 35 — Runner-Level Diagnostic (2026-05-24)

> Read-only audit of the SMS-AI v2 runner + background dispatcher to
> understand why iter=2 produces `chunks=0 noReply=true` after a solo
> `upsert_customer` tool call. Output of the post-D38-deploy live test:
> the prompt rule alone did NOT prevent the failure. Customer received
> silence; typed "Hello?" to wake the agent.
>
> NO code changes. NO new tests. File:line citations throughout.

## TL;DR

**The runner is doing its job correctly.** Anthropic's API returned a
`Message` with `stop_reason='end_turn'` and `content: []` (empty content
array — or text blocks whose joined text is `""`). `extractText`
(`agent-runner.ts:231-236`) returns `""`. The success branch in
`background-dispatch.ts:86-91` requires `assistantText.trim().length > 0`,
so the empty-text path falls through to the noReply log line
(`background-dispatch.ts:100-105`) where `chunks=0` is HARDCODED into
the log format string — `splitSmsMessage` was never called.

**Why the LLM chooses empty content on solo upsert_customer:** the
tool_result payload sent back to the model is just
`{success: true, customer_id, was_created, updated_fields, conversation_linked}`
(`src/app/api/voice-agent/customers/route.ts:423-431`). The model has
no customer-visible information to relay; it interprets the upsert as
"the response" and emits `end_turn` with no text. NO supplementary
prompt is sent alongside the tool_result (`agent-runner.ts:415`) —
just the raw tool_result blocks.

**Why multi-tool iterations don't fail:** when `classify_vehicle`,
`get_services`, or `send_quote_sms` accompany the upsert, the tool
results carry rich customer-visible content (size_class, pricing,
addon savings, quote link). The model has obvious material to synthesize
for the customer and produces text accordingly. Solo `upsert_customer`
returns nothing the customer would want to hear about.

**Recommendation: Approach C (modify upsert_customer's response shape
to carry `instructions_for_agent`)** as the primary fix, with optional
Approach A (runner-level noReply retry) as a belt-and-suspenders
backstop. C reuses the proven Rule 17 / `instructions_for_agent`
pattern from D36's `was_duplicate` design. Estimated fix scope:
~50 LOC + ~10-15 tests = 1 focused session.

---

## Target 1 — Where `chunks` gets counted

**File:** `src/lib/sms-ai/background-dispatch.ts`

Two branches:

**Success branch (lines 86-98):**
```typescript
if (
  (result.stopReason === 'end_turn' ||
    result.stopReason === 'max_iterations') &&
  result.assistantText &&
  result.assistantText.trim().length > 0
) {
  const chunks = splitSmsMessage(result.assistantText);   // line 92
  await sendAndLogChunks(conversationId, phone, chunks);
  console.log(
    `${LOG_PREFIX} conv=${conversationId} stopReason=${result.stopReason} iterations=${result.iterations} toolCalls=${result.toolCalls.length} chunks=${chunks.length}`,
  );  // line 95
  return;
}
```

`chunks` here = `splitSmsMessage(result.assistantText)`. Each element is
one outbound SMS segment (≤320 chars by default; `src/lib/utils/sms.ts:196`).

**noReply branch (lines 100-105):**
```typescript
console.log(
  `${LOG_PREFIX} conv=${conversationId} stopReason=${result.stopReason} iterations=${result.iterations} toolCalls=${result.toolCalls.length} chunks=0 noReply=true${
    result.errorMessage ? ` errorMessage="${result.errorMessage}"` : ''
  }`,
);
```

`chunks=0` here is a **hardcoded literal in the format string**, not a
computed value. `splitSmsMessage` is never invoked in this branch — by
design, since the success branch's `trim().length > 0` guard short-
circuits before `splitSmsMessage` would be called on `""`. (If it
were called, `splitSmsMessage("")` returns `[""]` of length 1 per
`src/lib/utils/sms.ts:197` — which is why the success branch refuses
empty text upstream.)

So the PM2 line `chunks=0 noReply=true` exclusively comes from the
fall-through branch at `background-dispatch.ts:100-105`.

## Target 2 — Where `noReply=true` gets set

**File:** `src/lib/sms-ai/background-dispatch.ts:100-105` (same site
as the hardcoded `chunks=0`).

**Condition (negation of the success-branch predicate at lines 86-91):**

`noReply=true` fires when ANY of the following is true:

1. `result.stopReason` is NOT `'end_turn'` and NOT `'max_iterations'`
   — i.e. it's `'api_error'` or `'unknown'`.
2. `result.assistantText` is `null`.
3. `result.assistantText.trim().length === 0` (empty or whitespace-only).

**For Issue 35:** path (3) — `stopReason='end_turn'`, `assistantText`
is non-null (it's `""` from `extractText`), but `trim().length === 0`.

The existing test pin for path (3) is at
`src/lib/sms-ai/__tests__/background-dispatch.test.ts:271-275`:
```typescript
it('on end_turn with empty assistantText: does NOT send SMS', async () => {
  runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('   '));
  await runV2AgentInBackground(BASE_INPUT);
  expect(sendSmsMock).not.toHaveBeenCalled();
});
```

The production behavior is byte-identical to this test's expectations.

## Target 3 — What iter=2's LLM response actually returns

**The handler:** `src/lib/sms-ai/agent-runner.ts:333-344`.

```typescript
if (response.stop_reason === 'end_turn') {
  const finalText = extractText(response.content);   // line 334
  console.log(
    `[SmsAiV2 runner] done conv=${conversationId} iterations=${iter} stop=end_turn tool_calls_total=${toolCalls.length}`,
  );
  return {
    assistantText: finalText,
    iterations: iter,
    stopReason: 'end_turn',
    toolCalls,
  };
}
```

**`extractText` (`agent-runner.ts:231-236`):**
```typescript
function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
```

**The Issue 35 iter=2 response is one of:**

- (a) `Message.content = []` — fully empty content array. Filter yields
  `[]`, join yields `""`.
- (b) `Message.content = [{ type: 'text', text: '' }]` — text block
  present but empty. Filter yields `[{type:'text', text:''}]`, map yields
  `['']`, join yields `""`.
- (c) `Message.content = [{ type: 'text', text: '   ' }]` —
  whitespace-only. Joined string is `'   '`; survives `extractText` but
  fails the `trim().length > 0` guard downstream.

All three cases produce the observed log line. The runner cannot
distinguish them from outside because the iter log at lines 329-331
only counts `toolUseBlocks.length` (i.e. `0` for end_turn) and does NOT
log content blocks.

**Why a 949ms / 1123ms iter=2 latency producing empty content:**
Anthropic's API returns `stop_reason='end_turn'` when the model
explicitly chooses to terminate the turn. It is a deliberate decision
by the model, not a network or token-budget issue. The model is doing
real inference work (hence the ~1s latency); it just decides the
appropriate output for this iteration is nothing.

The runner is correct in returning empty text to the dispatcher. The
LLM is the unit producing zero output. The dispatcher correctly
suppresses outbound SMS rather than sending an empty message.

## Target 4 — Existing detailed-LLM-response logging

**Result: there is NONE.** The runner does not log content blocks at
the response level. The only iter-level log is at `agent-runner.ts:329-331`:

```typescript
console.log(
  `[SmsAiV2 runner] iter=${iter} conv=${conversationId} stop=${response.stop_reason} tool_calls=${toolUseBlocks.length} latency=${latency}ms`,
);
```

This counts `tool_calls` but not text blocks, content length, or
content shape. From PM2 logs, the three possible shapes (empty array,
empty text, whitespace text) all look identical.

**For future diagnostic work (NOT this session):** consider adding a
gated debug log inside the runner's iter loop:

```typescript
// HYPOTHETICAL — do not implement in this audit session.
if (process.env.SMS_AI_V2_DEBUG === '1') {
  console.log(
    `[SmsAiV2 runner DEBUG] iter=${iter} content_blocks=${response.content.length} ` +
    `text_blocks=${response.content.filter(b => b.type === 'text').length} ` +
    `text_total_len=${extractText(response.content).length}`,
  );
}
```

Insertion point: between `agent-runner.ts:325` (latency computed) and
`agent-runner.ts:329` (existing iter log). Gated on env flag so prod
PM2 logs stay quiet by default.

This would distinguish "model returned no blocks" from "model returned
an empty text block" — useful if Approach C/B introduces any
asymmetry.

## Target 5 — What the runner constructs to send BACK to the LLM after upsert_customer

**File:** `src/lib/sms-ai/agent-runner.ts`. The post-tool message
construction is:

```typescript
// Line 385-409: build tool_result blocks
const toolResultBlocks: Array<{
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}> = [];

for (const { block, toolInput, result, latencyMs } of dispatchResults) {
  const output = ensureString(result.content);
  toolCalls.push({...});
  toolResultBlocks.push({
    type: 'tool_result',
    tool_use_id: block.id,
    content: output,
    is_error: result.isError,
  });
}

// Line 415: push them as a SINGLE user-role message.
messages.push({ role: 'user', content: toolResultBlocks });
```

**That's the entire message.** No system reminder. No "now reply to
the customer" nudge. No conversational scaffolding. The model sees:

- System prompt (cached, `agent-runner.ts:302-308`)
- Conversation history (lines 280-290)
- Customer's inbound message (line 292-294 — appended if not already
  trailing)
- Assistant turn with `tool_use` block (line 363, the model's prior turn)
- **THIS user turn containing only the tool_result(s)** (line 415)

**The upsert_customer success payload that the model receives as the
tool_result content** is the JSON-stringified body from
`src/app/api/voice-agent/customers/route.ts:423-431`:

```json
{
  "success": true,
  "customer_id": "<uuid>",
  "was_created": true,
  "updated_fields": ["first_name", "phone", "sms_consent", "customer_type"],
  "conversation_linked": true
}
```

**There is no `instructions_for_agent` field on the success path.**
Per `src/app/api/voice-agent/customers/route.ts:434-442`, only the
error path (catch block at lines 432-443) carries
`instructions_for_agent`. The model has zero explicit guidance on
"what to do next" after a successful upsert.

**For comparison — the D36 `was_duplicate` success path in
`send-quote-sms`** (the canonical example of success-with-directive)
DOES include `instructions_for_agent`. See
`src/app/api/voice-agent/send-quote-sms/route.ts:318-325`:
```typescript
const dedupResponse = {
  success: true as const,
  was_duplicate: true as const,
  quote_number: ...,
  quote_link: ...,
  instructions_for_agent:
    'A duplicate quote for this customer + vehicle + service set was already sent within the last 60 seconds. Do NOT inform the customer that a duplicate was prevented. Acknowledge naturally as if the quote was just sent — it was, just moments ago and the customer already received the SMS. A short reply like "Quote sent — check your texts!" is fine. Do not call send_quote_sms again this turn.',
};
```

That instructional success response reliably produces customer-facing
text on the next iteration. `upsert_customer`'s success response does
not.

## Target 6 — Why multi-tool iterations DON'T produce empty content

Empirical comparison from the post-D38 test conversation:

**Failed iteration (solo upsert_customer):**
```
iter=1: stop=tool_use tool_calls=1 (upsert_customer)
iter=2: stop=end_turn tool_calls=0 latency=949ms  ← chunks=0 noReply=true
```

**Successful iteration (multi-tool):**
```
iter=1: stop=tool_use tool_calls=3 (classify_vehicle + upsert_customer + get_services)
iter=2: stop=end_turn tool_calls=0 latency=~1500ms  ← chunks=1+ noReply=false
```

**Mechanism of the difference:**

The tool_result content that comes back to the model differs
dramatically in customer-visible information density.

**Solo upsert_customer:** tool_result is
`{success: true, customer_id, was_created, updated_fields, conversation_linked}`.
None of this is something to tell the customer. The model's natural
inference: "I responded to the customer by saving their data; the
turn is complete." → `end_turn` with empty content.

**Multi-tool:** tool_results include:
- `classify_vehicle` response: `{size_class: 'sedan', tier: '...', ...}` — informational
- `get_services` response: `{services: [...with prices and addon_suggestions]}` — RICH customer-visible content
- `upsert_customer` response: same as above (administrative)

The model sees substantive content begging for synthesis ("Express
Interior is $85 for your sedan; Pet Hair bundles to $100 saves you
$25"). It produces text.

**This is consistent with the broader LLM-behavior pattern:** Claude
end_turns with empty content when it judges that the tool result IS
the response. For administrative tools whose output is not customer-
facing, this judgment is wrong from a UX perspective — but it is a
predictable cognitive pattern given the system prompt and tool result
shapes.

**D38 (the new Critical rule 2 from the prior session) DID NOT
prevent this** because the model's mid-turn judgment is influenced
more strongly by the tool_result content shape (no customer-visible
data) than by the high-level rule. Rules are anchored in the system
prompt; tool_result content is fresh in the immediate context window.
For administrative tools, the model's cognition is consistent with
"the upsert IS the reply."

## Target 7 — Anthropic API behavior at the wire level

**`stop_reason` taxonomy:** Anthropic's `Message.stop_reason` can be
`'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'pause_turn' | 'refusal'`
(plus `null` for streamed responses, irrelevant here).

**`end_turn` with empty content is API-valid behavior.** The model is
saying: "I have finished what I want to do; I have nothing further to
contribute." The API does NOT enforce "there must be at least one text
block." The model is the authority on its own output.

**Verified by the SDK typing imports** at `agent-runner.ts:34-40`:
```typescript
import type {
  ContentBlock,
  Message,
  MessageParam,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
```

`Message.content` is typed `ContentBlock[]`, which permits an empty
array. No runtime invariant enforces non-empty.

**Why doesn't D38 (Critical rule 2 — mandatory customer-facing reply)
override the model's judgment?** Because LLM prompt-following is
probabilistic. A high-level critical rule competes with the cognitive
pull of the immediate context. When the immediate context is
"customer just gave info → I saved it → success returned → there is
nothing left to say," the rule loses to the inference.

**Implication:** prompt rules alone cannot reliably enforce "always
reply." The fix must be structural — either in the tool response
shape (making the success carry an explicit "now reply" directive,
which the model is well-trained to follow per the Rule 17 pattern)
or in the runner (catching the empty-content case and forcing one
more inference).

## Target 8 — Candidate fixes

### Approach A — Runner-level retry on noReply

**Mechanism:** When the runner exits with `stopReason='end_turn'` and
`extractText(content).trim().length === 0`, append a system-side user
nudge ("You did not produce a customer-facing reply. Now respond
conversationally to the customer's last message.") and call once
more with `tools` omitted. Return the second call's text.

**Implementation:**
- File: `src/lib/sms-ai/agent-runner.ts`
- Insertion point: between lines 333-344 (the `end_turn` early return).
  Add a sub-branch: if `finalText.trim() === ''`, push nudge + call
  once more with tools omitted.
- Pattern reuses the existing `ITERATION_CAP_NUDGE` shape (lines
  68-69, 422-429). Already-validated structure.
- LOC: ~25-30 (new branch + nudge constant + one forced call) +
  ~5-8 new tests.

**Risk profile:**
- LOW. Single bounded retry. No loops. Tools omitted, so no re-
  dispatch concerns. Existing `extractText` + `Message` types support
  the path. Logging: add a `[SmsAiV2 runner] noReply retry conv=…`
  log line for visibility.
- Cost: ~1 extra LLM call per noReply event. Rare enough that average
  cost increase is negligible.

**Addresses:** symptom, not root cause. The root cause is LLM
cognition — un-fixable in code. A is a robust backstop.

**Reuse:** HIGH. Mirrors `ITERATION_CAP_NUDGE` (`agent-runner.ts:68-69,
422-429`) verbatim. Same pattern: append user nudge, call once with
tools omitted, return forced text.

### Approach B — Synthetic follow-up prompt after every tool result

**Mechanism:** After pushing `toolResultBlocks` at `agent-runner.ts:415`,
also append a user-side reminder: "You have completed tool calls.
If the customer is awaiting a reply, produce customer-facing text
now."

**Implementation:**
- File: `src/lib/sms-ai/agent-runner.ts`
- Insertion: ~3 lines after line 415.
- LOC: ~5 + ~2-3 new tests.

**Risk profile:**
- MEDIUM. Adds a permanent extra user turn after EVERY tool dispatch,
  even when the LLM would have replied anyway. Two concerns:
  1. May disrupt the LLM's mid-loop intent — e.g., when the LLM
     planned to make a follow-up `tool_use` call (e.g., classify →
     get_services), the nudge could push it to short-circuit and
     reply prematurely.
  2. The injected user turn is visible to the model on every iteration;
     adds prompt noise that competes with the system-prompt rules.
- Cost: zero extra LLM calls (the nudge is in the same iteration).

**Addresses:** symptom upstream of the model's emit decision.

**Reuse:** LOW. Net-new pattern. The codebase has no precedent for
post-tool user-side reminders.

**Discard recommendation.** The mid-loop disruption risk to genuine
tool-loop iterations is too high for the marginal benefit.

### Approach C — Modify upsert_customer's response shape to carry `instructions_for_agent`

**Mechanism:** Add `instructions_for_agent` to the success response
of `POST /api/voice-agent/customers` so the LLM gets explicit guidance
to produce customer-facing text on the next iteration. Reuses the
exact Rule 17 / D36 pattern that already exists in production.

**Implementation:**
- File: `src/app/api/voice-agent/customers/route.ts:423-431`
- Change:
```typescript
const responseData = {
  success: true as const,
  customer_id: customerId,
  was_created: wasCreated,
  updated_fields: updatedFields,
  conversation_linked: conversationLinked,
  instructions_for_agent:
    'Customer record saved. Now respond conversationally to acknowledge what the customer just shared and continue the conversation — DO NOT mention that you saved their data; the persistence is invisible to them. If they just gave you their name, greet them by name and continue discovery (vehicle / service interest). If they just gave you a new field (last_name, email, address), acknowledge it as part of your natural reply.',
};
```
- LOC: ~10 + ~3-5 new tests.

**Risk profile:**
- LOW. Additive field (no removed fields, no schema changes). The
  field is already in the response-shape contract — endpoints
  routinely include `instructions_for_agent` on both success and
  error per Rule 17 / D36.
- The `voiceAgentFetch` dispatcher passes the full JSON response back
  to the LLM verbatim (`tool-dispatcher.ts:223-251` for the success
  path, line 245-251 for `okResult(text)` → the full text/JSON
  response). No dispatcher change needed.

**Addresses:** ROOT CAUSE PATH. The LLM's "upsert IS the reply"
inference is broken by the explicit "now respond conversationally"
directive. Per the production D36 success-with-instructions track
record, this pattern reliably produces text in iter=2.

**Reuse:** HIGHEST. Pattern is the production D36 pattern verbatim.
Rule 17 in the system prompt already governs how the agent handles
`instructions_for_agent` (silent follow). No new prompt rule needed.
No new test infrastructure.

### Approach D — Pre-emptive bundling rule (DISCARD)

**Mechanism:** Prompt rule that `upsert_customer` must never be the
sole tool call when customer just provided info.

**Risk profile:**
- HIGH. Vulnerable to LLM not following the rule (D38 just demonstrated
  this in production).
- Architectural cost: forces the LLM to delay persistence to a later
  turn OR bundle with a tool the customer didn't ask for. Distorts the
  natural discovery flow.

**Discard.** Doesn't address the root cause and adds architectural
weirdness.

### Approach E — Combination (C + A)

**Mechanism:** Ship C as the primary fix; ship A as a backstop.

**Rationale:**
- C reuses the proven D36 pattern at the response-shape layer where
  the LLM is most malleable. Expected to fix the majority of noReply
  cases (>90% in solo-upsert path).
- A catches the long tail. Even with C, the LLM may occasionally
  ignore the directive — A guarantees a customer-facing reply on
  every customer-initiated turn.
- Combined complexity: ~40-50 LOC + ~10-15 tests. ~1-hour session.

**Risk profile:** LOW. Both individual approaches are LOW risk;
combined they don't compound because A only fires when C didn't help.

## Recommendation

**Ship Approach C + A together.** Sequenced this way:

1. **C first** (in the response shape) closes the root-cause path
   using the proven Rule 17 / D36 pattern. Test coverage proves the
   `instructions_for_agent` directive reaches the LLM verbatim.
2. **A second** (runner-level noReply retry) as a robust backstop
   for any noReply event that survives C. Logged as `[SmsAiV2 runner]
   noReply retry conv=…` so operator can observe how often A actually
   triggers in production — empirical data on whether C is sufficient
   alone over time.

**Estimated fix session scope:**

| Workitem | LOC | Tests | Risk |
|---|---|---|---|
| C — add `instructions_for_agent` to upsert_customer success | ~10 | ~3-5 | LOW |
| C tests — existing route test extended; new dispatcher pass-through test | — | — | — |
| A — runner-level retry on `end_turn` + empty text | ~25 | ~5-8 | LOW |
| A tests — extend agent-runner.test.ts with empty-content scenarios | — | — | — |
| Docs — CHANGELOG + ROADMAP + observation update (Issue 35 status → fully resolved) | ~30 | 0 | — |
| **Total** | **~65** | **~10-15** | LOW |

**Single session, ~1 hour CC.** Branch: `feat/issue-35-runner-noreply-fix`.

**Hard rules for the fix session:**
- DO NOT touch `agent-runner.ts` retry logic in a way that introduces a
  loop. Single bounded retry only.
- DO NOT modify Rule 17 (`instructions_for_agent` silent guidance) or
  Critical rule 2 (D38 mandatory-reply rule) — both rules are preserved.
- DO NOT change `tool-dispatcher.ts`'s tool routing. The
  `voiceAgentFetch` success-path passthrough is already correct.
- DO NOT add new tools or fields beyond the additive
  `instructions_for_agent` field on upsert_customer's success response.
- Boundary pin: the existing `endTurnResult('   ')` test at
  `background-dispatch.test.ts:271-275` must continue to assert "no
  SMS sent" — A's retry happens INSIDE the runner before the result
  reaches the dispatcher, so that test stays green.

**Manual verification scenario post-deploy:**

1. From an allowlisted phone, send "Hi, I'm Sarah with a 2020 Camry".
2. Expect PM2 logs to show:
   - `iter=1 tool_use upsert_customer` (and possibly classify_vehicle)
   - `iter=2 end_turn tool_calls=0 latency=~1s`
   - **Critically: `chunks>=1 noReply=false`** — i.e., the LLM
     produced text on iter=2 because the `instructions_for_agent`
     directive nudged it to acknowledge Sarah.
3. Customer receives a real reply like "Thanks Sarah! Is the Camry
   a sedan? What color, and what would you like done — interior,
   exterior, or both?" — NOT silence.
4. If a regression slips through C, A's retry log line appears:
   `[SmsAiV2 runner] noReply retry conv=… nudge_latency=…ms`.
   Customer still gets a reply.

---

## Sources cited

| Citation | Purpose |
|---|---|
| `src/lib/sms-ai/agent-runner.ts:231-236` | `extractText` filter/map/join |
| `src/lib/sms-ai/agent-runner.ts:302-308` | Cached system blocks |
| `src/lib/sms-ai/agent-runner.ts:329-331` | Iter log line shape (no content blocks) |
| `src/lib/sms-ai/agent-runner.ts:333-344` | `end_turn` early return |
| `src/lib/sms-ai/agent-runner.ts:363` | Append assistant turn with tool_use |
| `src/lib/sms-ai/agent-runner.ts:385-409` | Build `tool_result` blocks |
| `src/lib/sms-ai/agent-runner.ts:415` | Push tool_result as user message — NO follow-up nudge |
| `src/lib/sms-ai/agent-runner.ts:68-69, 422-429` | `ITERATION_CAP_NUDGE` precedent (for Approach A) |
| `src/lib/sms-ai/background-dispatch.ts:86-91` | Success-branch predicate |
| `src/lib/sms-ai/background-dispatch.ts:92-95` | `chunks` computed via `splitSmsMessage` |
| `src/lib/sms-ai/background-dispatch.ts:100-105` | noReply log with HARDCODED `chunks=0` |
| `src/lib/sms-ai/__tests__/background-dispatch.test.ts:271-275` | Existing empty-text test pin |
| `src/lib/sms-ai/tool-dispatcher.ts:223-251` | `voiceAgentFetch` returns full body verbatim |
| `src/lib/sms-ai/tool-dispatcher.ts:451-470` | `callUpsertCustomer` — runtime context injection |
| `src/app/api/voice-agent/customers/route.ts:423-431` | upsert_customer SUCCESS response shape (no instructions_for_agent) |
| `src/app/api/voice-agent/customers/route.ts:434-442` | upsert_customer ERROR response shape (has instructions_for_agent) |
| `src/app/api/voice-agent/send-quote-sms/route.ts:318-325` | D36 was_duplicate success-with-directive — proven Rule 17 pattern |
| `src/lib/utils/sms.ts:196-197` | `splitSmsMessage("")` → `[""]` (length 1) |
