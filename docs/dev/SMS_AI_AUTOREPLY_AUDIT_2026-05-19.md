# SMS AI Auto-Reply Pipeline — Audit

**Date:** 2026-05-19
**Scope:** Inbound Twilio SMS → AI auto-reply pipeline (v1 single-shot responder)
**Trigger:** Two production symptoms reported after Anthropic API key rotation (Fix #1)
**Status:** Audit-only. **No code was modified.** Fix path is recommended but blocked on user review.

> **2026-06-18 update — Phase C eradicated v1.** The single-shot responder (`getAIResponse()` in `src/lib/services/messaging-ai.ts`) and its prompt source (`getDefaultSystemPrompt()` in `src/lib/services/messaging-ai-prompt.ts`) were deleted in Workstream A Layer 5 Phase C. SMS AI v2 (agent runner in `src/lib/sms-ai/`) is the sole AI path. The specialty-pivot gate in `route.ts:612-674` (the §1 root cause below) was deleted as part of the same cleanup. The admin textarea ↔ runtime prompt-source mismatch surfaced in §10 was closed — `buildV2SystemPrompt` now reads from `business_settings.messaging_ai_instructions` first and falls back to a hardcoded `getStandardTemplate()` in `src/lib/sms-ai/system-prompt.ts`. The findings below are preserved as historical record; the file paths and line numbers no longer resolve in main.

---

## TL;DR

Both reported symptoms have **a single shared root cause**: the **specialty-vehicle pre-AI gate** in
`src/app/api/webhooks/twilio/inbound/route.ts:612-674`. For any customer whose `vehicles` table
contains an `exotic` or `classic` `size_class` row, every inbound SMS is:

1. **Intercepted before the AI call** — a hardcoded templated reply is built from the vehicle record
   (year/make/model), so the message body is ignored.
2. **Followed by `is_ai_enabled = false` on the conversation** — by design, to hand off to staff.

The customer in the reported transcript has a Ferrari Roma Spider on file
(`size_class IN ('exotic','classic')`). Therefore:

- Every inbound triggers the same templated `"For 2026 Ferrari Roma Spider, we give custom quotes..."` reply.
- The conversation `is_ai_enabled` flag is flipped back to `false` after each one.
- Manually re-enabling the flag in Admin > Messaging does NOT remove the Ferrari from the customer's
  vehicle list, so the next inbound hits the same gate and the loop repeats.
- The AI (Anthropic API) is **never called** for this customer — so the Ferrari Roma text is **not** an
  AI response. It's a hand-built string at `route.ts:634`. The chat bubble is logged with
  `sender_type: 'ai'` (line 926), which is why operators perceive it as an AI reply.

Symptom 1 (toggle flipping off) is **intentional**. The looping loop-back is **a bug** — the gate has no
"already handed off" guard. Symptom 2 (ignoring message body) is **a bug** — the gate has no
intent/content classifier; it fires on the existence of a specialty vehicle alone.

---

## 1. Architecture

### Inbound webhook entry point
`src/app/api/webhooks/twilio/inbound/route.ts` (`POST`)

Ordered phases inside `POST(request)`:

| # | Phase | Lines | Notes |
|---|-------|-------|-------|
| 1 | Validate Twilio signature | 234-243 | Skipped in `NODE_ENV=development` |
| 2 | Parse `From` / `Body` / `MessageSid` / `MediaUrl0` | 248-255 | |
| 3 | Customer lookup by `customers.phone = normalizedPhone` | 263-272 | `customerId` is null for unknown numbers |
| 4 | STOP/START keyword handling (TCPA) | 279-364 | Runs even when `two_way_sms` flag is OFF. Writes `is_ai_enabled = isStartWord` at lines 320 + 358 |
| 5 | Feature-flag gate: `two_way_sms` | 371-375 | All remaining phases gated |
| 6 | Find or create conversation; reopen if closed | 380-438 | New conversations default `is_ai_enabled = true` (line 392) |
| 7 | Insert inbound message | 443-452 | `sender_type: 'customer'`, `channel: 'sms'` |
| 8 | **Auto-reply decision + AI call** | 457-691 | See §3 below |
| 9 | Auto-quote extraction (`[GENERATE_QUOTE]`...`[/GENERATE_QUOTE]`) | 696-864 | Optional — only if AI returns the block |
| 10 | Addon authorization extraction | 869-913 | Optional — only if AI returns AUTHORIZE/DECLINE blocks |
| 11 | Send + log outbound SMS chunks (`splitSmsMessage`, max 320 chars per chunk) | 916-940 | `sender_type: 'ai'` is hard-coded |

### `shouldAiReply` predicate (route.ts:482-487)

```ts
const shouldAiReply =
  conversation.is_ai_enabled &&
  aiMasterEnabled &&
  (!duringBusinessHours ||
    (isUnknown && aiEnabledForUnknown) ||
    (isCustomer && aiEnabledForCustomers));
```

- `aiMasterEnabled = aiEnabledForUnknown || aiEnabledForCustomers` (line 474)
- `aiEnabledForUnknown` / `aiEnabledForCustomers` read from `business_settings` keys
  `messaging_ai_unknown_enabled` / `messaging_ai_customers_enabled` (lines 460-468)
- `duringBusinessHours` toggles audience-pill logic: after hours, AI replies regardless of pills
  (line 478, comment on 476)

### Rate limit
`MAX_AI_REPLIES_PER_HOUR = 25` — counted by `messages WHERE conversation_id = … AND sender_type = 'ai'
AND created_at >= now() - 1h` (lines 491-500). Both the AI path AND the specialty-vehicle hardcoded
path log with `sender_type: 'ai'`, so the specialty replies count against this budget.

---

## 2. `conversations.is_ai_enabled` Data Model & Lifecycle

### Schema
`supabase/migrations/20260209000011_create_messaging_tables.sql:11`

```sql
is_ai_enabled BOOLEAN NOT NULL DEFAULT false
```

DB-level default is **`false`**. App-level creation paths override to `true` (see below).

### All write paths (verified — `grep -rn "is_ai_enabled" src/ supabase/`)

| Site | File:Line | Direction | Why |
|------|-----------|-----------|-----|
| New conversation default (STOP/START flow) | `webhooks/twilio/inbound/route.ts:320` | `isStartWord ? true : false` | TCPA — START opts in, STOP opts out |
| STOP/START update on existing conv | `webhooks/twilio/inbound/route.ts:358` | `isStartWord` | Same |
| New conversation default (regular flow) | `webhooks/twilio/inbound/route.ts:392` | `true` | New inbound conversations start AI-enabled |
| **Specialty vehicle pivot** | **`webhooks/twilio/inbound/route.ts:672`** | **`false`** | **Hands off to staff after canned reply** |
| Staff sends manual reply | `api/messaging/conversations/[id]/messages/route.ts:160-161` | `false` | "Human took over" — by design |
| Admin UI toggle | `api/messaging/conversations/[id]/route.ts:41-54` | per request body | The Admin > Messaging dropdown writes via this PATCH |
| Voice post-call processor | `lib/services/voice-post-call.ts:246` | `true` | Re-enables AI when a phone call concludes — keeps SMS-after-call conversational |
| Conversation helper | `lib/utils/conversation-helpers.ts:60` | `true` | Used by other senders (outbound notifications) when no conversation exists |

### Reads
- `webhooks/twilio/inbound/route.ts:483` — primary gate (this is what flips the AI off after each reply)
- `api/messaging/conversations/[id]/messages/route.ts:113-160` — staff send detection
- `api/voice-agent/context/route.ts:52,142` — voice agent context fetch
- `app/admin/messaging/components/thread-view.tsx:213,247-261` — UI badge + toggle button
- `app/admin/messaging/components/conversation-row.tsx:68` — list-view badge

### Lifecycle summary

```
inbound (no conv)  →  new conv with is_ai_enabled = true
inbound (existing) →  no flag mutation (just last_message_at, status, etc.)
inbound + customer has exotic/classic vehicle  →  canned reply, flag = false  ← BUG SURFACE
staff replies via Admin UI                     →  flag = false                ← intentional
voice call ends                                →  flag = true                 ← intentional
STOP keyword                                   →  flag = false                ← TCPA
START keyword                                  →  flag = true                 ← TCPA
admin UI toggle                                →  whatever user clicked       ← intentional
```

---

## 3. AI Response Generation Pipeline

### Entry point
`getAIResponse(history, newMessage, customerCtx, customerId, summary, lastNotifType, lastNotifAt)`
in `src/lib/services/messaging-ai.ts:330-511`.

### Anthropic call shape
`messaging-ai.ts:482-495`

```ts
fetch('https://api.anthropic.com/v1/messages', {
  body: JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: systemPrompt,
    messages,  // up to last 100 messages
  }),
})
```

- No prompt caching, no `cache_control` blocks, no application-level cache. **A "stale response from
  cache" hypothesis is ruled out** — every call rebuilds the system prompt from DB + sends fresh
  history.
- API key from `process.env.ANTHROPIC_API_KEY`; throws if missing (line 339-342).

### System prompt assembly (`buildSystemPrompt`, lines 19-224)

1. Behavioral prompt — `business_settings.messaging_ai_instructions` if set, else
   `getDefaultSystemPrompt()` from `lib/services/messaging-ai-prompt.ts`
2. Service catalog (all active services + pricing tiers) — appended verbatim
3. Business info (name, phone, hours, open/closed flag, booking URL)
4. Active general-purpose coupons (joined with rewards) — only if at least one exists
5. Optional product context if `searchRelevantProducts()` finds keyword hits (lines 230-282)
6. Optional pending-addon authorization context (lines 202-211)

### Customer context (lines 388-457)

Appended only when `customerCtx` is provided:

- `name`, `email`, `customer_type`
- Vehicles on file (year/make/model/color/`size_class`) — **including the Ferrari Roma**
- Upcoming appointments
- Recent quotes (last 3, soft-delete filtered)
- Transaction history (last 10)
- Loyalty balance + dollar value
- Staff notes + tags + engagement metrics

Followed by hardcoded `INSTRUCTIONS FOR RETURNING CUSTOMERS` (lines 446-456) which include:

> - Reference their vehicles by name (e.g., "your 2020 Honda Accord") — NEVER re-ask for vehicle info
>   you already have
> - Only ask for vehicle info if they mention a DIFFERENT vehicle not in their profile

### Message history (lines 459-477)

```ts
const recentHistory = conversationHistory.slice(-100);
```

System-channel messages from earlier are prefixed `[SYSTEM NOTIFICATION: …]` so the model can
distinguish notifications from its own past replies. The webhook drops voice-channel system
messages from history (route.ts:511-513) but keeps SMS-channel system messages.

The `newMessage` (the inbound body) is appended last as `role: 'user'` (line 480). It is **not**
embedded inside the system prompt — it's the most recent user turn.

---

## 4. Identified Bugs

### Bug A — Specialty-vehicle gate ignores message body

**Location:** `src/app/api/webhooks/twilio/inbound/route.ts:612-634`

**Code:**
```ts
const { data: specialtyCheck } = await admin
  .from('vehicles')
  .select('year, make, model, size_class')
  .eq('customer_id', conversation.customer_id)
  .in('size_class', ['exotic', 'classic'])
  .limit(1)
  .maybeSingle();

if (specialtyCheck) {
  hasSpecialtyVehicle = true;
  specialtyVehicleDesc = [specialtyCheck.year, specialtyCheck.make, specialtyCheck.model]
    .filter(Boolean).join(' ') || 'your vehicle';
  …
}

if (hasSpecialtyVehicle) {
  autoReply = `Thanks for reaching out! For ${specialtyVehicleDesc}, we give custom quotes…`;
  …
}
```

**Behavior:** The gate fires for any inbound when the customer has at least one row in `vehicles`
where `size_class IN ('exotic', 'classic')`. It does NOT examine `body`. Result: the customer can
text anything — "Today at 3pm", "How much to wash my Accord?", "STOP STOP STOP" (well, STOP is
caught earlier at line 280) — and the response is always the same canned Ferrari Roma message.

**Evidence matching reported transcript:**

| Customer message | Webhook path | Outbound |
|------------------|--------------|----------|
| `"I need a price to get my car washed"` | Specialty gate fires (vehicles has Ferrari Roma) | `"…For 2026 Ferrari Roma Spider…"` |
| `"Today at 3pm"` (1st & 2nd) | `is_ai_enabled` is now `false` from prior turn → `shouldAiReply = false` | **No outbound** |
| (Operator re-enables AI in Admin UI) | `is_ai_enabled = true` | — |
| `"Today at 3pm"` (3rd) | `is_ai_enabled = true`, specialty gate fires again | `"…For 2026 Ferrari Roma Spider…"` |
| `"How much to wash my accord?"` | Specialty gate fires again | `"…For 2026 Ferrari Roma Spider…"` |

This matches the transcript verbatim.

**Why operator perceives this as "AI ignoring me":** the outbound message gets inserted with
`sender_type: 'ai'` at `route.ts:926`, so it renders identically to a real AI reply in the
chat UI. There is no operator-facing indicator that this is a hardcoded specialty pivot, not an
Anthropic-generated reply.

**Origin:** Commit `86a9f06a` (Apr 18 2026) — "feat: exotic/classic consumer surfaces". The commit
message explicitly describes the design: "pre-AI gate in Twilio inbound handler checks customer
vehicles for requires_custom_quote. Pivots to custom-quote reply, fires staff_notification,
disables AI via existing is_ai_enabled flag." Subsequently the predicate switched from
`requires_custom_quote` boolean to `size_class IN ('exotic','classic')` in commit `a0de2eba`
(Session 29 — size_class taxonomy consolidation). The SMS template chip-driven refactor in
`558566cc` (Session 2F) only changed the staff-notification SMS, not the customer-facing canned
reply.

### Bug B — Specialty-vehicle gate has no "already handed off" guard

**Location:** Same block, plus the absence of any pre-condition check.

**Behavior:** Even after the gate fires once and AI is disabled (line 672), the next inbound
re-runs the gate from scratch. The disable is a session-level signal that's flipped right back
on the moment an operator hits "Enable AI Auto-Reply" — there's no record on the conversation
saying "specialty handoff already initiated; further inbounds go to staff routing, not the
canned reply."

The original commit's intent was clearly "send canned reply ONCE, then staff takes over." The
implementation works if staff never re-enables AI. It loops when they do.

**Suggested check candidates** (not yet validated — see §5):

- A `last_specialty_handoff_at` column on `conversations` (timestamp). If set within the last
  N hours, skip the canned-reply gate and call AI normally.
- A `specialty_handoff_state` enum on `conversations` (`none | pending | resolved`). Operator
  flips back to `none` to re-arm the gate.
- A heuristic: skip the gate if the inbound body strongly indicates a different vehicle
  (regex for "accord", "civic", "model 3", etc.) — fragile, not recommended.

### Bug C (Symptom 1, intentional but unsafe) — `is_ai_enabled` writes after every specialty reply

**Status:** **Intentional per commit `86a9f06a`** — the design is "one canned reply, then human
takes over." The symptom (operator sees AI flip off after each AI reply) is the user-visible
consequence of bugs A + B combined: because the gate doesn't gate itself (bug B), the flag flips
off on every inbound from a specialty-vehicle customer, not just the first.

If bugs A + B are fixed, the `is_ai_enabled = false` write at line 672 should remain — it's the
right behavior for a one-shot specialty pivot.

**Independent question for product owner:** Should `is_ai_enabled` also flip on subsequent
inbounds from the SAME customer who already had a specialty pivot fired? Probably no — once
staff has been notified, future messages from the same customer should also route to staff.
The fix is to make sure those messages don't re-trigger the canned reply (bug B).

### Bug D (would-be, ruled out) — Anthropic prompt caching replaying stale Ferrari context

**Status:** Ruled out. `messaging-ai.ts:482-495` makes a fresh `fetch` to
`api.anthropic.com/v1/messages` on each call with no `cache_control` markers and no application-side
caching. The "stale response" perceived by the operator is **not** from the AI at all — it's the
hardcoded specialty pivot. Confirmed by code review.

### Bug E (would-be, ruled out) — Conversation lifecycle auto-close ending AI

**Status:** Ruled out. `business_settings.messaging_auto_close_hours` and
`messaging_auto_archive_days` are configured in `app/admin/settings/messaging/page.tsx:25-26,69-85`
but there is **no cron job** in `lib/cron/scheduler.ts` that consumes them. No code path
auto-closes a conversation or auto-mutates `is_ai_enabled` based on idle time. (Reopening a
closed conversation at `route.ts:408-437` does NOT touch `is_ai_enabled`.)

This is a separate, pre-existing latent issue — see §6.

---

## 5. Recommended Fix Paths

Effort estimates assume one engineer, focused work, no parallel tickets.

### Fix path 1 — **Minimal: stop the loop, keep the pivot** (recommended)

**Effort:** ~1 hour code + ~30 min testing.

**Scope:**
1. Add a `last_specialty_handoff_at` `TIMESTAMPTZ NULL` column to `conversations` (migration).
2. At `route.ts:626` (where `hasSpecialtyVehicle = true` is set), also check whether
   `conversation.last_specialty_handoff_at` is within a cooldown window (e.g., 7 days). If yes,
   skip the canned reply, treat as a normal AI turn (proceed to `getAIResponse`).
3. At `route.ts:672` (the post-canned-reply block), also set
   `last_specialty_handoff_at = now()` in the same UPDATE.
4. Update `DB_SCHEMA.md` and regenerate.
5. Update `CHANGELOG.md`.

**Result:** The first inbound from a specialty-vehicle customer still gets the canned pivot +
staff notification + AI disable (preserving the original commit's design). Subsequent inbounds
within 7 days route through the regular AI path. After 7 days, the pivot can re-fire (in case
the customer reopens with a new request that needs another callback).

**Tradeoff:** The canned reply will keep ignoring the message body **on first contact**. If the
customer's very first SMS is `"How much to wash my Accord?"` (a non-Ferrari vehicle), they still
get the Ferrari pivot. To address this we'd need Fix path 2.

### Fix path 2 — **Fix bug A: only pivot when the message is about the specialty vehicle**

**Effort:** ~3 hours code + ~1 hour testing (depends on detection approach).

**Scope:**
1. Either:
   - **Option a (LLM-classifier):** Make a cheap pre-check LLM call (Haiku) with the body + the
     customer's vehicle list, asking "is the customer asking about the exotic/classic vehicle, or
     a different vehicle, or something unrelated?" If "different" or "unrelated," skip the
     pivot and fall through to the normal AI path. ~$0.001/call, latency +500ms.
   - **Option b (deterministic regex on body):** Build a list of known make/model tokens from the
     customer's non-specialty vehicles. If the body mentions a non-specialty vehicle token, skip
     the pivot. Cheaper but fragile (the customer might say "my other car," etc.).
2. Combine with Fix path 1 so even when option a misfires, the loop self-stops.

**Tradeoff:** Adds latency and a second API key dependency. Worth doing only if specialty-vehicle
customers commonly have non-specialty cars too (an empirical question for the product owner).

### Fix path 3 — **Disable the specialty pivot entirely; let AI handle it**

**Effort:** ~30 min code + ~30 min testing.

**Scope:** Delete or feature-flag `route.ts:612-674`. Update the AI system prompt
(`messaging-ai-prompt.ts`) to include an instruction like "If the customer has an exotic or
classic vehicle on file, do NOT quote from the catalog — offer a specialist callback and ask for
preferred contact time." Let the LLM produce a context-aware reply. Keep the staff-notification
SMS firing (extract that block from the gate into its own conditional).

**Tradeoff:** Loses the deterministic "always pivot specialty vehicles to staff" guarantee. AI
might still try to quote a regular wash for the Ferrari if instructions aren't followed
precisely. Higher trust placed in the model.

### Fix path 4 — **UI signal that the specialty pivot fired**

**Effort:** ~30 min.

**Scope:** When the specialty pivot is the source of `autoReply`, log a SECOND message with
`sender_type: 'system'` and `channel: 'voice'` (which renders as a notification bar, not a
chat bubble — see `route.ts:428-437` for the pattern) saying "Specialty vehicle pivot — AI
disabled, staff notified." This addresses the operator's confusion about why the AI seems
"stuck" on Ferrari content.

Not a fix on its own — combine with Fix path 1 or 2.

### Recommended bundle

For the reported issue, **Fix path 1 + Fix path 4** is the minimum viable correction. Fix path 2
becomes worth doing if multi-vehicle specialty customers are common. Fix path 3 is a bigger
philosophical shift and should not be bundled with a hotfix.

---

## 6. Out-of-Scope Findings (pre-existing issues)

### 6.1 — Conversation auto-close settings have no consumer

`business_settings.messaging_auto_close_hours` and `messaging_auto_archive_days` are
operator-editable at `/admin/settings/messaging` but no cron job or runtime path reads them.
Conversations only transition to `closed` / `archived` via the Admin UI PATCH endpoint
(`api/messaging/conversations/[id]/route.ts`). If the operator believes inactive conversations
auto-close, this is a documentation/UI lie.

### 6.2 — Outbound messages from the specialty pivot are logged as `sender_type: 'ai'`

`route.ts:926` hardcodes `sender_type: 'ai'` for all outbound chunks regardless of whether the
text came from a real AI call or from the hardcoded specialty pivot. This conflates two
provenance categories. A new enum value (`sender_type: 'system_pivot'` or similar) or a
`metadata.source` field would let admins distinguish.

### 6.3 — `MAX_AI_REPLIES_PER_HOUR = 25` budget is consumed by specialty-pivot replies

Because the specialty pivot logs with `sender_type: 'ai'` (see 6.2), each pivot reply counts
against the rate limit. In a loop scenario, the operator manually re-enabling AI dozens of
times within an hour would eventually trip the limit and silence even the canned reply — without
any operator-facing signal explaining why.

### 6.4 — `customer_id` lookup uses `.single()` instead of `.maybeSingle()`

`route.ts:264-272` and 287-291 use `.single()` which throws when zero rows are returned. The
result is destructured with optional chaining (`if (customer) …`), so the error is silently
discarded — but the Supabase client logs a "Cannot coerce the result to a single JSON object"
error in the server console for every inbound from an unknown phone number. Cosmetic but noisy.

### 6.5 — `size_class IN ('exotic','classic')` runs a fresh `vehicles` query separate from `customerCtx`

`route.ts:619-625` queries `vehicles` again even though the same data was already loaded into
`customerCtx.vehicles` 60 lines above (`route.ts:538-543`). The second query is redundant and
could be replaced with `customerCtx.vehicles.find(v => v.size_class === 'exotic' || v.size_class === 'classic')`. Pure perf cleanup.

### 6.6 — `getAIResponse` history slice mismatch

`messaging-ai.ts:460` uses `conversationHistory.slice(-100)` but `route.ts:507` already fetches
`limit(100)`. The slice is defensive but `.slice(-100)` on a 100-item array is a no-op. Cosmetic.

### 6.7 — `searchRelevantProducts` is a true positive vector for over-anchoring

`messaging-ai.ts:237-282`: keyword-driven product search injects a `PRODUCTS WE CARRY` section
into the system prompt. The keyword set includes generic words like `"product", "interior",
"exterior", "wheel", "glass", "tire"` that fire on most detailing conversations. This isn't the
cause of either reported symptom, but it's a latent over-anchoring vector worth a future audit.

---

## 7. Direct Answers to the Brief

**Q: Is observed Symptom 1 (auto-AI toggle flips off after each AI response) intentional or a bug?**

**A: Mixed.** The mechanism (`is_ai_enabled = false` after a specialty-vehicle pivot reply at
`route.ts:672`) is **intentional per commit `86a9f06a`** — the design is "send canned reply ONCE,
then human takes over." However, the observed *loop* (the flag flipping off after every reply,
not just the first) is **a bug** caused by the pivot gate at `route.ts:612-625` re-firing on
every inbound with no idempotency check.

**Q: Why does the AI generate stale / message-ignoring "Ferrari Roma" responses?**

**A: The Ferrari Roma reply is not from the AI.** It's a hand-built string at `route.ts:634`
that interpolates the customer's specialty-vehicle make/model. The Anthropic API is never called
for this conversation as long as the customer has an `exotic` or `classic` `size_class` vehicle
on file. The reply ignores the message body because the gate has no body inspection. The reply
is logged with `sender_type: 'ai'`, which is misleading in the admin UI.

**Q: Is conversation lifecycle / auto-close relevant?**

**A: No.** The auto-close/auto-archive settings exist but have no runtime consumer (see §6.1).

**Q: Are there hour-of-day restrictions in play?**

**A: Yes, but not the cause.** `duringBusinessHours` at `route.ts:476-487` flips AI on after
hours for all audiences. The reported transcript timing isn't specified, but this logic doesn't
gate the specialty pivot — the specialty pivot runs inside the `shouldAiReply` block but bypasses
the AI call regardless of hours.

**Q: Has the pipeline been touched recently?**

**A: Yes.** `git log -- src/app/api/webhooks/twilio/inbound/route.ts` for the last 60 days shows:
- `558566cc` (Session 2F) — SMS template chip-driven refactor for the specialty-callback staff
  notification. Touched the staff-notification body, NOT the customer-facing canned reply.
- `0a5ef968`, `e600b9bd`, `27be5cec`, `38dbc9cd` — other SMS template engine refactors that
  touched imports and template rendering, no logic change.
- `f9b9164f` (Money-Unify-1) + revert `209ffc35` — money helper additions, no relevant change.
- `a0de2eba` (Session 29) — switched specialty detection from `requires_custom_quote` boolean to
  `size_class IN ('exotic','classic')`. This is the predicate currently in production.
- `86a9f06a` (Apr 18 2026) — **original specialty pivot commit.** Introduced both the canned
  reply and the `is_ai_enabled = false` write.

None of these are post-Anthropic-key-rotation. The symptoms reported by the user have existed
for the entire life of the specialty pivot (Apr 18 onwards) — the key rotation likely just
brought them into focus. The audit confirms the Anthropic key rotation itself is **not**
responsible for either symptom.

---

## 8. Files & Lines Cited

- `src/app/api/webhooks/twilio/inbound/route.ts:1-948` — inbound webhook
  - Specialty gate: 612-634
  - Specialty handoff disable: 672
  - AI predicate: 482-487
  - Outbound logging: 916-940
- `src/lib/services/messaging-ai.ts:1-511` — Anthropic call + prompt builder
  - Anthropic fetch: 482-495
  - Customer context block: 388-457
  - History slice: 459-477
- `src/lib/services/messaging-ai-prompt.ts:1-50+` — default behavioral prompt
- `src/app/api/messaging/conversations/[id]/messages/route.ts:155-164` — staff-send disable
- `src/app/api/messaging/conversations/[id]/route.ts:41-54` — Admin UI PATCH
- `src/app/admin/messaging/components/thread-view.tsx:213-269` — UI toggle
- `src/app/admin/settings/messaging/page.tsx:33-85` — settings keys
- `supabase/migrations/20260209000011_create_messaging_tables.sql:11` — DB default
- `src/lib/cron/scheduler.ts:108-120` — no auto-close cron consumer
- `src/lib/services/voice-post-call.ts:246` — voice re-enable
- `src/lib/utils/conversation-helpers.ts:60` — helper default
- Commit `86a9f06a` — original specialty pivot design
- Commit `a0de2eba` — specialty predicate switched to `size_class`

---

## 9. Next Action

**Decision requested from product owner before any code changes:**

1. Confirm or correct the hypothesis that the test conversation involves a customer with at
   least one `exotic` or `classic` vehicle on file. (Cannot be verified from code alone — needs
   DB query: `SELECT v.* FROM vehicles v JOIN conversations c ON c.customer_id = v.customer_id
   WHERE c.phone_number = '<test-phone>';`)
2. Pick a fix path (recommendation: **Fix path 1 + Fix path 4**).
3. Decide cooldown window for Fix path 1 (recommendation: 7 days, but could be 24h–30d).
4. Decide whether to also pursue Fix path 2 (body-aware pivot) in a follow-up phase.
