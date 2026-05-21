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

## Section 3 — Critical bugs surfaced during testing (non-prompt)

These look like prompt issues but are actually code / tool-flow bugs. Tracked here so they're visible alongside prompt observations; resolved via dedicated fix sessions, not prompt tuning.

#### Bug A — Wrong-tier pricing in quote_sms tool output (P0, suspected)

**Observed:** 2026-05-20, staff conversation, conv=`a89b4b20-ce99-448f-88f2-e989968c4d59`
**Customer:** Joselyn Reyes / `+14243396994`
**Vehicle in conversation context:** 2015 Chevy Tahoe (SUV 3-row tier — $320 quoted by agent in chat)
**Quote actually sent:** Q-0076, short link `8qh2ui`, suspected to contain sedan-tier pricing ($210 from earlier in the same conversation when discussing a Civic).

The conversation pinned Tahoe pricing at $320 in multiple agent turns before the quote send. The quote SMS went out for "Signature Complete Detail" with the Tahoe context. Operator observed that the rendered quote page showed sedan pricing, not SUV.

**Hypothesis A:** `send_quote_sms` tool received a `service_id` only and resolved pricing against the customer's first vehicle on file (Joselyn's record may have a Civic-tier default), not the vehicle established in conversation. Vehicle context in conversation didn't flow into the tool call.

**Hypothesis B:** `send_quote_sms` tool received the correct payload but the quote-rendering page has a bug that renders against the customer's primary vehicle, not the quote's service tier.

**Status:** Open — needs diagnostic. Operator should run the parent-session SQL query to inspect quote Q-0076's stored fields (`quote_items.unit_price`, `quote_items.tier_name`, `quote_items.service_id`, the linked `vehicle_id`) before any tuning happens.

**Fix direction:** Likely a code fix in either the tool dispatcher's `send_quote_sms` case (`src/lib/sms-ai/tool-dispatcher.ts`) OR the underlying voice-agent quote endpoint (`/api/voice-agent/send-quote-sms`). NOT a prompt issue. The prompt-tuning session should leave Bug A alone and wait for the dedicated fix session.

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

(Empty for now; structured to add entries as prompt-tuning sessions close issues with SHA references.)

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
