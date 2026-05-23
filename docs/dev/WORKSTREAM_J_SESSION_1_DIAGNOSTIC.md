# Workstream J Session 1 — Diagnostic Report (2026-05-23)

> Read-only code audit of refined-flow tool surface + Admin Purge cascade.
> No source changes. No prompt changes. No migrations. Output is an
> implementation specification for Sessions 2-5.

## TL;DR

Ten audit targets surveyed across two surfaces: (a) refined-flow tool plumbing
for the D20-D32 controlled-booking flow, and (b) Issue 26-28 post-mortem on
the late-night new-customer test. Major findings:

1. **Admin Purge cascade is more complete than Issue 28 assumed.** The Purge
   route (`src/app/api/admin/customers/purge/route.ts`) DOES delete the
   conversation (by `phone_number` OR `customer_id`), messages, vehicles,
   quotes, sms_consent_log, and ~20 other tables. Issue 28's "conversations
   leak" hypothesis is **not borne out by the code**. Two genuine gaps remain
   — `coupons.customer_id` is nulled (not deleted) and `print_jobs.payload`
   may contain PII text after `transaction_id` is nulled. The Issue 28
   evidence pattern is more likely explained by (a) operator using the per-
   customer **soft-delete** DELETE endpoint instead of Data Management Purge,
   or (b) a stale conversation that pre-dated the Purge feature itself. **Open
   question for operator below** — answer determines whether Session 2 work
   is "tighten Purge further" or "audit the DELETE path."

2. **Rate-limit attribution in Issue 26 is misidentified.** The 25-msg/hr
   gate is at the **webhook level**, not inside `send_quote_sms`. When the
   rate limit fires, the entire agent invocation is suppressed — no tool
   call happens at all. So Issue 26's "tool failed → agent attributed to
   phone" attribution did NOT come from a rate-limited tool call. The likely
   source is an earlier turn where `send_quote_sms` returned 400 "Invalid
   phone number" (the only error string close to "phone number issue") and
   the agent paraphrased into the notify_staff details field.

3. **Tool schema gaps confirmed (Session 2 scope).** `send_quote_sms` does
   not accept `customer_type` (Issue 18) or `notes` (D19/D24). The endpoint
   has matching gaps. `create_appointment` already supports the quote-id
   conversion branch + accepts `notes`, but the agent uses the direct-booking
   branch which writes `price_at_booking=0, tier_name=null` — confirming the
   $0.00 evidence from Issue 25.

4. **D20 is mostly already implemented.** `customer-context.ts` already
   SELECTs `quotes.status` and `getCustomerContext()` is called fresh on
   every inbound (per `agent-runner.ts:265`). Minimal D20 work is adding
   `valid_until` and `accepted_at` to the existing SELECT — zero new round-
   trips.

5. **`get_availability` tool is reliable enough to keep.** Reads live DB
   state, no caching, applies booked-slot conflict checks. Issue 23's slot
   hallucination is a prompt-side reasoning failure (already addressed via
   session #53's "never state specific slot availability" rule), not a tool
   reliability issue. **Verdict: keep tool, restrict agent usage via prompt**;
   no Session 2 code change needed.

**Total gaps identified across 10 targets: 14** (see Risk matrix below).
**Highest priority: Purge investigation + DELETE path audit** (Open question
#1) — sub-issue of Target 1. Estimated implementation sessions: **Sessions
2 + 4 in parallel, then Session 3, then Session 5** — matches the existing
Workstream J sequencing.

---

## Open questions / decisions needed before Session 2

**Q1 — Purge vs DELETE path.** Per Target 1 audit, the Purge route already
deletes conversations. Two scenarios could still produce Issue 28's
"conversation persisted" pattern:
- (a) Operator used Admin > Customers > [individual customer] → trash icon
  (DELETE handler, soft-delete only — does NOT touch conversations) instead
  of Admin > Settings > Data Management (POST /purge, hard-delete with
  cascade).
- (b) Operator used Data Management Purge, but the conversation row had a
  phone_number that didn't match `customers.phone` (pre-Schema-Hardening-1
  format drift) AND its `customer_id` was already NULL.

Operator answer determines Session 2 scope:
- If (a) → Session 2 includes "extend DELETE handler to call into shared
  purge cascade" + UI confirmation that soft-delete and hard-delete are
  visually distinct.
- If (b) → Session 2 includes "Purge cascade should also fall back to any
  conversation referencing any historical phone we've ever assigned to this
  customer" (out of current scope; the customers table doesn't store
  phone history).
- If neither → close Issue 28 as "infra-level race that resolved itself";
  ship the two genuine gaps (coupons + print_jobs) and move on.

**Q2 — Session 2 tool surface decision.** Should the new
`convert_quote_to_appointment` tool be:
- (a) A **new dedicated tool** that wraps `convertQuote()` directly (skips
  the voice-agent endpoint), OR
- (b) A **thin tool that POSTs to `/api/voice-agent/appointments` with
  quote_id** (reuses the existing branch A which already handles
  status='pending', conversion, SMS confirmation).

(b) is lower risk + faster — voice-agent endpoint is hardened. (a) avoids
the HTTP self-call overhead. **Recommendation: (b)** unless operator wants
to also separate SMS-agent and voice-agent codepaths. The roadmap currently
implies (a) by tool name; needs confirmation.

**Q3 — Replace `create_appointment` with `convert_quote_to_appointment` or
keep both?** The refined flow (D19-D29) eliminates direct booking by the
agent. Options:
- Keep `create_appointment` available + tighten prompt to never use it
- Remove `create_appointment` from `SMS_AI_V2_TOOLS` entirely
- Replace with `convert_quote_to_appointment` only (and `update_appointment`
  for D26)

Removing the tool is the safest enforcement (defense in depth beyond the
prompt rule). Roadmap WJ Session 4 already calls this out. Confirms now.

---

## Session 2 spec — Tool/endpoint changes

**Scope:** New tool + extend two endpoint schemas. No prompt changes (those
come in Session 3).

### S2.1 — Add `convert_quote_to_appointment` tool

Per Q2 above, two implementation paths. Spec assumes (b) — wrap the
existing voice-agent endpoint.

**Tool definition (add to `src/lib/sms-ai/tools.ts`):**
```ts
{
  name: 'convert_quote_to_appointment',
  description:
    'Convert an existing accepted quote into a pending appointment. Use this when the customer has accepted a previously-sent quote AND named a date/time. The quote is automatically marked accepted (if not already) in the same transaction. Default appointment status is "pending" — staff confirms after review. Pass quote_id (UUID) or quote_number (e.g. "Q-0023"). The notes field captures preferred-time context for staff.',
  input_schema: {
    type: 'object',
    properties: {
      quote_id: { type: 'string', description: 'Quote UUID or quote_number ("Q-0023").' },
      date: { type: 'string', description: 'Appointment date, YYYY-MM-DD, America/Los_Angeles.' },
      time: { type: 'string', description: 'Start time, "HH:MM" 24h or "HH:MM AM/PM" 12h.' },
      notes: { type: 'string', description: 'Preferred-time or context notes for staff (optional).' },
    },
    required: ['quote_id', 'date', 'time'],
  },
},
```

**Dispatcher addition (in `src/lib/sms-ai/tool-dispatcher.ts`):**
- Add `convert_quote_to_appointment: 10000` to `TOOL_TIMEOUT_MS`
- Add case to switch that POSTs to `/api/voice-agent/appointments` with
  `{ quote_id, date, time, notes, customer_name?, customer_phone? }`.
  Existing branch A handles the rest.

**Endpoint change (in `src/app/api/voice-agent/appointments/route.ts`
Branch A):**
- Currently ignores incoming `notes` parameter (only Branch B writes
  `job_notes`). Extend Branch A to append `notes` to the appointment's
  `job_notes` (post-conversion UPDATE since `convertQuote()` already wrote
  `job_notes` from `quote.notes`).
- Add D21 logic: BEFORE calling `convertQuote()`, if quote.status is
  'sent' or 'viewed', UPDATE to 'accepted' + `accepted_at=now()` in the
  same supabase round-trip. `convertQuote()` then flips to 'converted' as
  usual.

### S2.2 — Extend `send_quote_sms` for `customer_type` + `notes`

**Tool definition (modify `src/lib/sms-ai/tools.ts` lines 219-236):**
```ts
properties: {
  phone: { ... },
  customer_name: { ... },
  customer_type: {
    type: 'string',
    enum: ['enthusiast', 'professional'],
    description: 'Customer classification for marketing track routing. Pass when conversation signals are clear: B2C personal vehicle = enthusiast; bulk/wholesale/dealership = professional. Omit if ambiguous.',
  },
  services: { ... },
  vehicle_year: { ... },
  vehicle_make: { ... },
  vehicle_model: { ... },
  vehicle_color: { ... },
  notes: {
    type: 'string',
    description: 'Internal notes for staff (e.g. preferred appointment time). Stored on the quote and carried through to the appointment if accepted.',
  },
},
```

**Endpoint changes (in `src/app/api/voice-agent/send-quote-sms/route.ts`):**
- Destructure `customer_type` and `notes` from body
- When new customer is created (lines ~119-140 of the route), pass
  `customer_type` if provided (else leave default 'Unknown' for back-
  compat)
- When existing customer found AND has `customer_type='Unknown'` AND
  incoming `customer_type` is set, UPDATE the customer record with the
  inferred type
- Pass `notes` to `createQuote()` as the quote's `notes` field (currently
  hardcoded to "Generated during phone call" at line 245)

### S2.3 — Add `quote_sms_failed` notify_staff reason

**Schema change (in `src/lib/services/staff-notification.ts`):**
- Append `'quote_sms_failed'` to `StaffNotificationReason` type +
  `STAFF_NOTIFICATION_REASONS` array
- Append `quote_sms_failed: 'Quote SMS Failed — See Details'` to
  `REASON_LABELS`
- Tool definition (`tools.ts` line 200-208) — add `'quote_sms_failed'` to
  `notify_staff.input_schema.properties.reason.enum`
- Update tool description to add: "...If `send_quote_sms` returns a tool
  error, fire `notify_staff` with reason='quote_sms_failed' and put the
  exact tool error string into the details field — staff needs the actual
  error, not a paraphrase."

The `details` field already accepts free-form text — no new chip needed
for the error string. The prompt rule (Session 3) does the heavy lifting
of "verbatim error, never paraphrase."

### S2.4 — (Optional) Add `update_appointment` tool for D26

Per D26 (mid-conversation reschedule). Out-of-scope for Session 2 unless
operator confirms it's a P1 today. Pending appointments are rare in the
first refined-flow rollout; defer to a follow-up unless the rate of mid-
conversation reschedules merits it.

---

## Session 3 spec — Prompt updates

**Scope:** Replace D19's absolute "agent never books" with refined-flow
rules per D20-D29. Add Issue 27's tool-failure consistency rule.

### S3.1 — Replace D19 absolute rule

Current `# Booking flow — quote first, scheduling second` section
enumerates "agent never books" + forbidden phrases. Replace with:

- **Quote-first** remains the default — agent calls `send_quote_sms`
  first
- **Conversion path:** when customer confirms acceptance AND names a
  date/time, agent calls `convert_quote_to_appointment(quote_id, date,
  time, notes?)`. NOT `create_appointment` directly.
- **Time-asking (D24):** if customer accepts without naming a time, agent
  asks "What day/time works best?" Captures into the convert call.
- **Multi-quote disambiguation (D22):** if customer has multiple active
  quotes (status='sent' or 'viewed'), ask "Which service are you booking
  — [A] ($X) or [B] ($Y)?" Same pattern as Issue 6's multi-vehicle rule.
- **Reschedule (D26):** if customer changes time mid-conversation AND the
  appointment is still 'pending', agent calls update tool (S2.4) OR
  notify_staff. Pre-S2.4: notify_staff only.
- **Cancellation (D27):** agent NEVER cancels. Always fires notify_staff
  with reason='appointment_change' + tells customer "Got it — passing
  this to our team to handle."
- **Same-day urgency (D25):** if customer requests same-day/next-day,
  agent fires notify_staff in addition to creating the pending
  appointment. (Verify in Session 1: notify_staff template existing
  flow may already cover.)
- **Service change (D28):** if customer requests different service after
  quote sent, agent fires a new `send_quote_sms` with new services. Pre-
  Workstream I: old quote expires naturally; post-WS-I: supersedes
  via `supersedes_quote_id`.
- **Additional service (D29):** if customer asks about ALONGSIDE
  service, agent references existing quote + offers new separate quote.

### S3.2 — Issue 27 — Tool-failure consistency rule

Add to a new `## Honoring tool errors` subsection (under `# What you
cannot do` or similar high-emphasis location):

```
When a tool returns isError=true, you MUST NOT later claim the tool succeeded.

CORRECT pattern:
  [Tool returned isError=true]
  Turn N:   "Sorry — that didn't go through. I've flagged this for our team."
  Customer: "When will they get back to me?"
  Turn N+1: "Our team will reach out shortly — I don't have an exact time."

INCORRECT pattern (a real failure mode from production):
  [Tool returned isError=true]
  Turn N:   "I've flagged this — they'll reach out soon."
  Customer: "When will they get back to me?"
  Turn N+1: "I actually just sent your quote — check your texts!"

There is no scenario where reversing yourself on a tool failure is acceptable. If you cannot deliver what the customer expects, say so plainly and lean on staff handoff — never invent a successful outcome to defuse social tension.
```

### S3.3 — `quote_sms_failed` escalation rule

Add to `# Tool usage guide` under send_quote_sms guidance:

```
If send_quote_sms returns isError=true, fire notify_staff with:
  reason='quote_sms_failed'
  details=<the verbatim error string from the tool result, plus a 1-2 sentence summary of what the customer wanted>
Tell the customer plainly: "Our team will text you the quote shortly — sorry for the hiccup." DO NOT attempt send_quote_sms again in the same turn.
```

### S3.4 — Issue 23 — Restate slot-availability prohibition

Already in prompt per session #53. Verify it survives Session 3 rewrites
(the booking-flow section is being rewritten end-to-end).

### S3.5 — Compression target

Roadmap notes -3K to -5K char compression goal. The refined flow is
shorter than the rigid absolute rules — but the rule additions in S3.2
(tool-failure consistency) and S3.3 (quote_sms_failed escalation) reclaim
some. Estimate net compression: -2K to -4K chars. Acceptable.

---

## Session 4 spec — customer-context.ts + cleanup

### S4.1 — D20 quote_status refresh

**Per Target 10 audit: `quotes.status` is ALREADY in the SELECT** and
`getCustomerContext()` is called fresh per inbound. D20 is mostly
delivered. Minimal additions:

**Change in `src/lib/services/customer-context.ts` lines 233-246:**
```diff
 admin
   .from('quotes')
-  .select(`id, quote_number, status, total_amount, created_at, quote_items ( item_name )`)
+  .select(`id, quote_number, status, total_amount, valid_until, accepted_at, sent_at, viewed_at, created_at, quote_items ( item_name )`)
   .eq('customer_id', customer.id)
   .is('deleted_at', null)
   .order('created_at', { ascending: false })
   .limit(RECENT_QUOTES_LIMIT)
```

Extend `CustomerContextQuote` interface (lines 82-89) to include
`valid_until`, `accepted_at`, `sent_at`, `viewed_at`. Update
`renderCustomerContextBundle` (in same module — need to confirm location)
to surface these signals to the agent prose ("Q-0023 sent 2 days ago,
status=sent, expires in 5 days").

Zero new round-trips. Test impact: customer-context.test.ts needs
fixture updates.

### S4.2 — Remove `create_appointment` from agent's tool surface (Q3)

Per Q3 above. Recommended: remove `create_appointment` from
`SMS_AI_V2_TOOLS` array entirely once the refined flow is operative.
The voice agent retains the endpoint — only the SMS-AI v2 tool list
removes it.

Conservative alternative: keep the tool definition but tighten its
description to "DO NOT USE — call `convert_quote_to_appointment` instead.
This tool is retained for backwards compatibility and will be removed in
a future cleanup."

**Recommendation:** delete from tool list (defense in depth — model
cannot accidentally call what isn't in its tool surface).

### S4.3 — Document `get_availability` policy

No code change. Update tool description (lines 102-124 of
`src/lib/sms-ai/tools.ts`) to reinforce "result is for your reasoning
only — never quote specific slot availability to the customer directly.
If you need to confirm whether a date works, ask the customer to name a
preferred time and use this tool to verify before calling
`convert_quote_to_appointment`."

### S4.4 — Genuine Purge gaps

(Bundled into Session 4 since they're small code edits in the Purge
route, not their own session. Or pull out into Session 2.5 if Session 4
is already loaded.)

1. **`coupons.customer_id`** — append `safeDelete('coupons', () =>
   supabase.from('coupons').delete({count:'exact'}).in('customer_id',
   customerIds))` to Step 4 of the purge route. Customer-targeted coupons
   are a privacy concern (could leak the customer's marketing journey).
2. **`print_jobs.payload`** — print_jobs rows whose `transaction_id`
   matches a deleted transaction may carry receipt text with customer
   PII. Decision needed: (a) DELETE rows with matched `transaction_id`
   pre-transaction-delete, (b) NULL the payload column, (c) leave as-is
   (print_jobs is essentially a queue, completed entries are noise).
   Recommend (a) — same pattern as refund_items.

---

## Session 5 spec — verification + observation harvest

**Scope (unchanged from roadmap):** Operator runs new-customer test on the
refined flow. Verify pending appointment creation, quote acceptance,
notify_staff firing, calendar visual distinction. Document new
observations as Issues 26+.

Specific test scenarios per refined flow:
1. **Happy path:** new customer → discovers service → quote sent → "yes
   book it for Tuesday 9am" → quote becomes accepted, appointment
   created with status='pending', notify_staff fires
2. **No time named:** new customer → quote sent → "yes book it" (no time)
   → agent asks "what day/time?" → conversion proceeds
3. **Multi-quote:** customer with 2 active quotes → "yes book it" →
   agent asks "which one?"
4. **Tool failure:** simulate send_quote_sms returning 500 → agent fires
   notify_staff with reason='quote_sms_failed' + verbatim error in
   details → does NOT reverse itself on follow-up turn
5. **Cancellation:** customer asks to cancel → agent fires notify_staff +
   tells customer "passing to team" → does NOT attempt cancellation
6. **Reschedule (pending):** mid-conversation time change before staff
   confirmation → either update tool (if S2.4 shipped) or notify_staff
7. **Spanish path (D30):** repeat scenario 1 in Spanish

---

## Audit findings by target

### Target 1: Admin Purge code audit (Issue 28)

**Files read:**
- `src/app/api/admin/customers/purge/route.ts` (POST /api/admin/customers/purge)
- `src/app/api/admin/customers/[id]/purge-preview/route.ts` (GET preview)
- `src/app/admin/settings/data-management/page.tsx` (UI)
- `src/app/api/admin/customers/[id]/route.ts` (DELETE handler — soft-delete only)
- `docs/dev/DB_SCHEMA.md` — FK relationships from customers
- `git log -- src/app/api/admin/customers/purge/route.ts` — commit dates

**Current behavior — Purge handler:**

When operator selects N customers (max 50) in Admin > Settings > Data
Management and clicks "Purge All Records":

1. Pre-captures FK-related IDs: appointment IDs, job IDs, quote IDs,
   transaction IDs (by customer OR appointment), order IDs, conversation
   IDs (by phone OR customer).
2. Step 1 — Transitive: deletes `refund_items` → `refunds` (transaction
   children) for matched transactions.
3. Step 2 — RESTRICT parents: `appointment_services` →
   `appointments`; `jobs`; `quote_items` + `quote_communications` →
   `quotes`.
4. Step 3 — SET NULL tables (would orphan): `transactions`; `messages`
   → `conversations`.
5. Step 4 — No-constraint / nullable FKs: `order_items` → `orders`;
   `link_clicks`; `tracked_links`; `sms_delivery_log`;
   `email_delivery_log`; `lifecycle_executions`; `waitlist_entries`.
6. Step 5 — Phone-based: `voice_call_log`.
7. Step 6 — `customers` (final). CASCADE handles: `vehicles`,
   `loyalty_ledger`, `customer_payment_methods`, `marketing_consent_log`,
   `sms_consent_log`, `campaign_recipients`, `drip_enrollments`,
   `drip_send_log` (transitively), `email_verification_codes`.

Note on `jobs`: deleted explicitly before quotes because `jobs.quote_id`
is RESTRICT (not CASCADE on quote). `job_addons`, `job_photos` CASCADE
from jobs.

**Current behavior — DELETE /api/admin/customers/[id]:**

Soft-delete only: sets `deleted_at`, stops active drip enrollments,
disconnects portal access. **Does NOT touch conversations, messages,
or any other tables.**

**FK mapping table (all customer-linked tables):**

| Table | FK to customers? | Touched by Purge? | Deletion type | Notes |
|-------|------------------|-------------------|---------------|-------|
| customers | (self) | YES | hard delete (step 6) | |
| appointments | direct, RESTRICT | YES | hard (step 2) | explicit pre-customer |
| appointment_services | via appointment | YES | hard (step 2) | |
| campaign_recipients | direct, CASCADE | implicit | auto-cascade | |
| conversations | direct (SET NULL) + by phone | YES | hard (step 3) | lookup by phone OR customer_id |
| coupons | direct, SET NULL | **NO** | SET NULL via cascade | **leak — customer_id nulled, row persists with privacy data (target_customer_type, customer_tags)** |
| customer_payment_methods | direct, CASCADE | implicit | auto-cascade | |
| drip_enrollments | direct, CASCADE | implicit | auto-cascade | drip_send_log auto-cascades via enrollment_id |
| drip_send_log | via drip_enrollments | implicit | auto-cascade | |
| email_delivery_log | direct, no constraint | YES | hard (step 4) | |
| email_verification_codes | direct, CASCADE | implicit | auto-cascade | |
| job_addons | via jobs | implicit | auto-cascade | |
| job_photos | via jobs | implicit | auto-cascade | |
| jobs | direct, CASCADE | YES (explicit) | hard (step 2) | explicit pre-quotes |
| lifecycle_executions | direct, CASCADE | YES (explicit) | hard (step 4) | double-delete safe |
| link_clicks | direct, no constraint | YES | hard (step 4) | |
| loyalty_ledger | direct, CASCADE | implicit | auto-cascade | |
| marketing_consent_log | direct, CASCADE | implicit | auto-cascade | |
| messages | via conversations | YES | hard (step 3) | |
| order_items | via orders | YES | hard (step 4) | |
| orders | direct, no constraint | YES | hard (step 4) | |
| payments | via transactions | implicit | auto-cascade | |
| print_jobs | via transactions (SET NULL) | **NO** | SET NULL via cascade | **leak — payload TEXT may contain receipt PII** |
| quote_activities | via quotes | implicit | auto-cascade | |
| quote_communications | via quotes | YES (explicit) | hard (step 2) | |
| quote_items | via quotes | YES (explicit) | hard (step 2) | |
| quotes | direct, RESTRICT | YES (explicit) | hard (step 2) | |
| refund_items | via refunds | YES | hard (step 1) | |
| refunds | via transactions | YES | hard (step 1) | |
| sms_consent_log | direct, CASCADE | implicit | auto-cascade | |
| sms_conversations | direct, CASCADE | implicit | auto-cascade | (legacy table; agent uses `conversations`) |
| sms_delivery_log | direct, no constraint | YES | hard (step 4) | |
| tracked_links | direct, no constraint | YES | hard (step 4) | |
| transaction_items | via transactions | implicit | auto-cascade | |
| transactions | direct, SET NULL | YES (explicit) | hard (step 3) | |
| vehicles | direct, CASCADE | implicit | auto-cascade | |
| voice_call_log | by phone (no FK) | YES | hard (step 5) | |
| waitlist_entries | direct, no constraint | YES | hard (step 4) | |
| audit_log | entity_id text (no FK) | **NO** | not touched | intentional audit trail; entity_id + entity_label contain "Archived: First Last" |

**Tables mentioned in Issue 28 list that don't exist in schema:**
`escalations`, `customer_addresses`, `customer_loyalty`,
`customer_communications` — none of these tables exist in
`docs/dev/DB_SCHEMA.md`. (Customer loyalty is in `loyalty_ledger` +
`customers.loyalty_points_balance`. Customer addresses are in
`customers.address_line_*` columns + `mobile_address` on appointments.)

**Gaps/Issues:**

1. **`coupons.customer_id`** — SET NULL cascade preserves coupon row.
   Customer-targeted coupons retain `target_customer_type`,
   `customer_tags`, `requires_*` arrays — possibly identifying.
   Operator decision: hard-delete customer-scoped coupons on Purge?
   (Recommendation: yes — append to Step 4.)
2. **`print_jobs.payload`** — receipt text with PII may persist after
   `transaction_id` is SET NULL. Operator decision: delete print_jobs
   rows for matched transactions, OR null the payload column, OR
   accept as historical noise. (Recommendation: delete in Step 1
   before transactions delete.)
3. **`audit_log` rows** — `entity_type='customer'` rows include the
   customer's UUID + first/last name in `entity_label`. Per CCPA, the
   audit trail of a deleted customer may itself need scrubbing.
   Operator decision: out-of-scope (audit trail integrity vs PII
   purge — likely keep as-is and document).
4. **Conversation persistence root cause (Issue 28 evidence)** — Purge
   IS configured to delete conversations. The persisting conversation
   `4645b6e9-...` is more likely explained by Open Question #1 (operator
   used per-customer DELETE soft-delete handler, not Data Management
   Purge). The DELETE handler does NOT touch conversations.

**Recommended fix:** Per S4.4 above plus the operator answer to Q1.

**Session assignment:** Session 2 + Session 4 (small Purge route extensions
bundle with S4.4).

---

### Target 2: send_quote_sms error handling for rate-limit responses (Issue 26)

**Files read:**
- `src/app/api/voice-agent/send-quote-sms/route.ts` (321 lines)
- `src/lib/sms-ai/tool-dispatcher.ts` (548 lines, full read)
- `src/app/api/webhooks/twilio/inbound/route.ts:67-720` (rate limit gate)

**Current behavior:**

The `MAX_AI_REPLIES_PER_HOUR = 25` constant at
`twilio/inbound/route.ts:67` is a **webhook-level gate**. Logic at
lines 481-491:

```ts
const { count: recentAiCount } = await admin
  .from('messages')
  .select('id', { count: 'exact', head: true })
  .eq('conversation_id', conversation.id)
  .eq('sender_type', 'ai')
  .eq('direction', 'outbound')
  .gte('created_at', oneHourAgo);

if ((recentAiCount ?? 0) < MAX_AI_REPLIES_PER_HOUR) {
  // ... v2 routing decision + agent invocation
} else {
  console.warn(`[Messaging] Rate limit hit for conversation ${conversation.id}`);
}
```

When `recentAiCount >= 25`, the agent NEVER runs. No tool call. The
warning log fires; Twilio gets empty TwiML; conversation goes silent.

**Tool dispatcher error wire format** (lines 178-198):
```
errResult(`Tool call returned ${status}: ${snippet}`)
errResult(`Tool call timed out after ${timeoutMs}ms`)
errResult(`Tool call failed: ${msg}`)
```

Where snippet is `text.length > 200 ? text.slice(0, 200)+'…' : text` —
the raw HTTP body, truncated.

**`send_quote_sms` endpoint error returns:**

| Status | Body | Trigger |
|--------|------|---------|
| 401 | `{ error: auth.error }` | Bearer key invalid/missing |
| 400 | `{ error: 'phone is required' }` | missing phone |
| 400 | `{ error: 'services is required' }` | missing services |
| 400 | `{ error: 'Invalid phone number' }` | `normalizePhone()` returns null |
| 400 | `{ error: 'No valid services provided' }` | empty after parse |
| 500 | `{ error: 'Failed to create customer record' }` | customer INSERT fails |
| 400 | `{ error: 'None of the specified services were found' }` | no resolve |
| 500 | `{ error: 'Internal server error' }` | outer catch |

**None reference rate limit.** Rate limit is enforced one layer up.

**Gaps/Issues:**

1. **Issue 26's attribution chain is misidentified.** PM2 logs show
   the rate limit fired at the webhook level (`[Messaging] Rate limit
   hit for conversation ...`). The agent never ran for those inbounds.
   The `notify_staff` that attributed failure to "phone number issue"
   came from a DIFFERENT inbound — one where the agent DID run and
   `send_quote_sms` returned 400 "Invalid phone number" (the only error
   string close to "phone number issue"). The agent paraphrased into
   the staff notification details field.
2. **Dispatcher error wire format is opaque to the model.** The string
   `Tool call returned 400: {"error":"Invalid phone number"}` is
   technically truthful but the model paraphrases it (Issue 27's
   confabulation surface). Possible improvement: dispatcher could
   normalize the error into a structured shape the prompt rules can
   pattern-match against.
3. **No explicit error class for "tool refused because preconditions
   missing"** — e.g., the agent passing a malformed phone. Currently
   indistinguishable from a downstream DB error.

**Recommended fix:** Session 3 prompt rule (S3.2) — agent must use
verbatim error string in notify_staff details, not paraphrase. Session 2
adds `quote_sms_failed` reason. Future hardening: structured error
shape from dispatcher (Issue 27 recommendation).

**Session assignment:** Session 2 (notify_staff reason) + Session 3
(prompt rule for verbatim error).

---

### Target 3: Conversation lookup behavior on customer deletion (Issue 26)

**Files read:**
- `src/app/api/webhooks/twilio/inbound/route.ts:369-425` (conversation lookup)
- `docs/dev/DB_SCHEMA.md` lines 421-454 (conversations table)

**Current behavior:**

Inbound webhook conversation lookup at line 371-375:

```ts
let { data: conversation } = await admin
  .from('conversations')
  .select('*')
  .eq('phone_number', normalizedPhone)
  .single();
```

**Lookup key = `phone_number` only.** No filter on customer_id.
`conversations.phone_number` is UNIQUE NOT NULL with CHECK
`phone_number ~ '^\+1\d{10}$'` (E.164 enforced at DB layer).

If found:
- Existing conversation reused
- `last_message_at`, `last_message_preview`, `last_channel`,
  `unread_count`, `status='open'` updated
- If `customerId` from current inbound is non-null AND
  `conversation.customer_id` is null, conversation is re-associated
  (line 408-410)

If not found:
- New conversation INSERTed with current `customerId` (may be null
  for unknown phones)

**Decision tree for deleted customers:**

| Customer state | conversation.customer_id | New inbound from same phone |
|---|---|---|
| Hard-deleted via Purge (cascade SET NULL would fire, BUT Purge also deletes conversation) | conversation row gone | Lookup finds none → new conversation created |
| Soft-deleted via DELETE handler | unchanged (FK SET NULL fires only on hard-delete) | Lookup finds existing conversation, customer_id still references soft-deleted customer |
| Created new during agent run (via `send_quote_sms` find-or-create) | not changed; customer_id stays as-is | Re-association happens at line 408 only if existing customer_id is NULL |

**Gaps/Issues:**

1. **Soft-delete leaves conversation orphaned to a deleted_at customer.**
   Next inbound from same phone re-uses the conversation, picks up
   message history, accumulates message count toward rate limit. This
   matches Issue 26 / 28 evidence pattern.
2. **The phone-only lookup is intentional — design tradeoff.** Customers
   move, change names, get re-created; the phone is the only stable
   identity in SMS context. Resetting on customer deletion would lose
   the audit trail of staff replies / consent history.
3. **No "conversation hygiene" cron.** Stale conversations from
   long-deleted customers persist forever. Not a leak per se, but
   contributes to long-term rate-limit and storage drift.

**Recommended fix:** Two options not exclusive:
- (a) Extend the per-customer DELETE handler to also reset the
  conversation (delete messages + zero rate-limit-relevant fields, OR
  delete the conversation row). This satisfies soft-delete callers who
  expected fuller cleanup.
- (b) Document the design clearly: soft-delete = "stop billing /
  marketing", hard-delete (Purge) = "GDPR-grade scrub including
  conversation."

**Session assignment:** Open Question #1 determines whether Session 2
includes (a). (b) is a doc edit only.

---

### Target 4: Rate limit threshold

**Files read:** Already covered in Targets 2 + 3 — single source at
`src/app/api/webhooks/twilio/inbound/route.ts:66-67`.

**Current configuration:**

```ts
/** Max AI auto-replies per conversation per hour */
const MAX_AI_REPLIES_PER_HOUR = 25;
```

- **Threshold:** 25
- **Window:** 1 hour (rolling — `now - 60*60*1000` ms ago)
- **Scope:** per `conversation_id`
- **Counts:** `messages` WHERE `sender_type='ai' AND
  direction='outbound' AND created_at >= oneHourAgo`. Does NOT
  distinguish v1 vs v2 AI replies — both count.
- **Configurability:** none. Hardcoded constant. Not env-var, not DB.
- **Inbound-vs-outbound:** counts outbound only (the cap is on the
  agent's replies, not the customer's volume).
- **AI-vs-staff:** counts AI only (sender_type='ai'). Staff replies
  (sender_type='staff' / 'system') do not count.

**Gaps/Issues:**

1. **Hardcoded — operator cannot tune.** For a long-running multi-turn
   refined-flow conversation (quote discovery → quote sent → time
   negotiation → conversion), 25 turns may be tight, especially for
   Spanish conversations or multi-vehicle quotes.
2. **Per-hour window means a stale conversation accumulates rapidly.**
   If a conversation gets 25 messages in 30 min and then customer
   pauses, agent is silent for the next 30 min — exactly when staff
   needs help most.
3. **No distinction between transactional and non-transactional turns.**
   A `lookup_customer` followed by a thinking turn followed by a
   `send_quote_sms` is three outbound messages even though it's one
   "complete a quote" intent.

**Recommended fix (optional, not blocking refined-flow):**
- Move threshold to `business_settings` table with default 25, allow
  operator tuning per environment
- Consider per-day rolling window in addition to per-hour
- Defer scope changes (transactional-vs-not) to future hardening; YAGNI
  today

**Session assignment:** Not blocking Workstream J. Note for future
hardening session.

---

### Target 5: notify_staff template for quote_sms_failed reason

**Files read:**
- `src/lib/services/staff-notification.ts` (264 lines, full)
- `src/lib/sms-ai/tools.ts` lines 189-218 (notify_staff tool def)

**Current behavior:**

`StaffNotificationReason` enum at lines 32-49:
- `appointment_change`
- `custom_quote`
- `beyond_scope`
- `transfer_request`
- `mobile_distance`
- `human_handoff`
- `other`

`REASON_LABELS` at lines 51-59 maps each to human-readable text.

Single SMS template: `staff_notification` (DB-driven, in `sms_templates`
table). Chips passed by `notifyStaff()`:
- `customer_name`, `customer_phone`, `reason_label`, `details` (the
  free-form text)
- Optional cheap-adds left undefined: `customer_email`, `last_name`,
  `vehicle_description`

Tool schema `notify_staff.input_schema` at lines 193-217 takes
`reason` (enum constrained to the 7 values above) + free-form `details`.

**Gaps/Issues:**

1. **NO `quote_sms_failed` reason.** Agent has to pick from the 7
   existing reasons. Current behavior: agent picks `custom_quote` or
   `other` and stuffs failure context into `details` (per Issue 26
   evidence).
2. **NO `error_message` / `tool_error` chip.** All failure context
   funnels through `details` free-form. Agent paraphrases (see
   Issue 26 / 27 confabulation surface).
3. **Single staff template handles all 7 reasons.** Per-reason
   templating would let operator route quote_sms_failed differently
   (e.g., to a dev-on-call number for diagnosis). Out of scope; flag
   for future hardening.

**Recommended fix:**
- Append `quote_sms_failed` to enum + label (S2.3 spec above)
- Tool description tightens "use verbatim error in details"
- No new chip needed — `details` is sufficient if prompt rule enforces
  verbatim

**Session assignment:** Session 2 (schema enum + tool description) +
Session 3 (prompt rule on verbatim error).

---

### Target 6: send_quote_sms parameter schema

**Files read:**
- `src/lib/sms-ai/tools.ts` lines 219-236 (tool def)
- `src/app/api/voice-agent/send-quote-sms/route.ts` lines 28-46 (endpoint destructure)

**Current behavior:**

Tool schema (canonical):
```ts
{
  name: 'send_quote_sms',
  input_schema: {
    properties: {
      phone, customer_name, services,
      vehicle_year, vehicle_make, vehicle_model, vehicle_color,
    },
    required: ['phone', 'services'],
  },
}
```

Endpoint accepts identical shape (drift-free between tool and
endpoint as of session #53 verification).

**Gaps/Issues:**

1. **No `customer_type`** parameter — per Issue 18 / D-classification.
   Agent has been instructed (per session #53) to infer Enthusiast /
   Professional from conversation signals, but has no tool channel to
   persist it. Endpoint defaults new customer to nothing (DB default).
2. **No `notes`** parameter — per D19/D24. Refined flow needs to
   carry preferred-time prose from the inbound into the quote's
   `notes` field. Endpoint currently hardcodes
   `notes: 'Generated during phone call'` at line 245.

**Recommended fix:** Per S2.2 above.

**Session assignment:** Session 2.

---

### Target 7: create_appointment tool/endpoint

**Files read:**
- `src/lib/sms-ai/tools.ts` lines 125-146 (tool def)
- `src/app/api/voice-agent/appointments/route.ts` (720 lines)
- `src/lib/quotes/convert-service.ts` (212 lines)

**Current behavior:**

Tool schema accepts both branches (per current description):
- Direct: `service_id` + `date` + `time` + customer details
- Conversion: `quote_id` (UUID or Q-XXXX) + `date` + `time`

Endpoint POST has two explicit branches:

**Branch A (Quote conversion)** — line 210 onward:
1. Resolves quote_id (UUID or Q-XXXX)
2. Looks up customer by phone (deleted_at filtered)
3. Computes total duration from quote_items via services table
4. Calls `convertQuote(supabase, quote_id, {date,time,duration_minutes}, {appointmentStatus:'pending', channel:'phone'})`
5. Sends `appointment_confirmed` SMS (if consent)
6. Logs system message to conversation thread
7. Returns appointment data + serviceNames

`convertQuote()` does:
- Reject if `status` in ('expired', 'converted')
- Auto-assign detailer if none provided
- INSERT appointment with full quote modifier carryover (mobile, coupon,
  loyalty, manual discount, totals)
- INSERT appointment_services from quote_items (with `price_at_booking`,
  `tier_name` from quote items — pricing PRESERVED)
- UPDATE quote → `status='converted'` + `converted_appointment_id`
- Fire webhook

**Branch B (Direct booking)** — line 376 onward (the $0.00 bug surface):
1. Read service for duration
2. Check for overlapping appointments → 409 if conflict
3. Find or create customer (creates with `sms_consent: true`, no
   `customer_type` — bug)
4. Find or create vehicle (size-class soft compatibility check, warns
   only)
5. **INSERT appointment with `subtotal: 0, tax_amount: 0,
   discount_amount: 0, total_amount: 0`** (line 522-525)
6. **INSERT appointment_services with `price_at_booking: 0,
   tier_name: null`** (line 549-551)
7. Send `appointment_confirmed` SMS (with `total: undefined` when 0)
8. Log system message

**Gaps/Issues vs refined-flow needs:**

1. **Branch B is the $0.00 surface** (Issue 25 evidence). Refined flow
   eliminates this path for agent calls. Defense in depth: remove
   `create_appointment` from tool surface (S4.2) so agent CAN'T
   accidentally call Branch B.
2. **Branch A ignores incoming `notes` parameter.** Spec already
   accommodates `notes` but it's not threaded into convertQuote() or
   post-conversion UPDATE. S2.1 spec patches this.
3. **D21 (verbal acceptance → quote 'accepted') not enforced.**
   Branch A skips status='accepted' — quote goes straight to
   'converted'. For audit trail (operator knowing customer verbally
   accepted vs link-accepted), need explicit flip.
4. **D23 already satisfied** — Branch A passes
   `appointmentStatus: 'pending'`. ✓
5. **convertQuote does NOT block conversion based on quote.status
   being non-'sent'.** Currently blocks only 'expired' / 'converted'.
   So 'draft' / 'sent' / 'viewed' / 'accepted' all convertible. Fine
   for refined flow.

**Recommended fix:** Per S2.1 (extend Branch A for notes + D21) plus
S4.2 (remove create_appointment from agent tool surface).

**Session assignment:** Session 2 (endpoint extensions) + Session 4
(tool surface cleanup).

---

### Target 8: get_availability tool

**Files read:**
- `src/lib/sms-ai/tools.ts` lines 102-124 (tool def)
- `src/app/api/voice-agent/availability/route.ts` (200 lines, full)

**Current behavior:**

GET endpoint takes `date` (required, YYYY-MM-DD), optional `service_id`
(drives duration), optional `expected_day` (lowercase day name for
agent-day-name validation).

Data sources (all DB, no cache):
- `business_settings.business_hours` → per-day open/close
- `business_settings.booking_config.slot_interval_minutes` (default 30)
- `services.base_duration_minutes` if service_id provided
- `appointments` WHERE date AND status != 'cancelled' (start/end times)

Returns `{ date, slots: ['09:00', '09:30', ...] }` — concrete free
slots of (service_duration + buffer) length.

Day-of-week validation: if `expected_day` provided and date is actually
a different day, returns `{ error: 'day_mismatch', corrected_date }`.

**Reliability assessment:**

- **Read side:** reliable. Live DB. No cache.
- **Conflict detection:** correct (overlap check on existing appts).
- **Treats shop as single bay** — does NOT segment by detailer /
  employee. If Smart Details has multiple detailers, the tool
  over-restricts (one slot can be booked at a time across all
  detailers). Verify with operator whether this matters today.
- **Counts pending + confirmed appointments equally.** Pending
  appointment from previous agent run blocks the slot — correct
  behavior for the refined flow.

**Why Issue 23's slot hallucination happened:**

The tool returned correct slots when called. After successful
appointment creation, on the NEXT inbound the agent re-reasoned about
availability WITHOUT calling the tool again — confabulated based on
prompt history. The bug is in the agent's multi-turn reasoning, not
the tool. Session #53 already shipped the prompt rule banning specific
slot claims.

**Gaps/Issues:**

1. None at the tool level.
2. Prompt-side rule (session #53) addresses the hallucination class.
3. Multi-detailer awareness is a future enhancement, not a refined-flow
   blocker.

**Recommended fix:** S4.3 — reinforce in tool description that the
result is "for your reasoning only, never quoted to customer." No
endpoint code change.

**Session assignment:** Session 4 (tool description tightening only).

---

### Target 9: Quote → appointment conversion path (staff-side)

**Files read:**
- `src/lib/quotes/convert-service.ts` (212 lines, full)
- `src/app/api/voice-agent/appointments/route.ts` lines 200-374 (Branch A)

**Current behavior — canonical conversion:**

`convertQuote(supabase, quoteId, {date, time, duration_minutes, employee_id?}, options?)` is the single source of truth. Two known callers:
- Voice agent: POST `/api/voice-agent/appointments` with quote_id (passes `appointmentStatus: 'pending', channel: 'phone'`)
- POS: TBD — need to verify the POS handler path. Likely
  `src/app/api/pos/quotes/[id]/convert/route.ts` or similar. (Out of
  scope for this audit; relevance to refined flow is "the new SMS-agent
  tool reuses convertQuote without disturbing the POS path.")

`convertQuote()` behavior summary:
- Status gates: rejects 'expired' or 'converted'; permits draft / sent
  / viewed / accepted
- Carries: customer_id, vehicle_id, all mobile fields, coupon, loyalty,
  manual discount (with per-modifier columns preserved), subtotal,
  tax, total
- Defaults: status='confirmed' (POS) — overridable to 'pending' (voice
  + SMS agent)
- Creates `appointment_services` from quote_items with
  `price_at_booking` from `quote_items.unit_price` + `tier_name`
- Updates quote → 'converted' + `converted_appointment_id`
- Fires `appointment_confirmed` webhook
- Returns `{success, appointment, serviceNames}`

**Gaps/Issues:**

1. **No `notes` parameter on convertQuote signature.** Quote's existing
   `notes` field is copied to `appointment.job_notes` via the INSERT.
   To support D24 (preferred-time prose), the caller must either (a)
   pre-update quote.notes before convert, or (b) post-update
   appointment.job_notes after convert. The new
   `convert_quote_to_appointment` tool should do (b) for clarity (don't
   mutate quote on conversion).
2. **No D21 logic** — convertQuote skips quote.status='accepted' and
   goes straight to 'converted'. For audit-trail purposes (knowing
   customer verbally accepted before staff confirmed), the new tool
   wrapper should flip to 'accepted' BEFORE calling convertQuote (with
   the same `updated_at` timestamp).

**Recommended fix:** New tool `convert_quote_to_appointment(quote_id,
date, time, notes?)` wraps Branch A of `/api/voice-agent/appointments`
with:
- Pre-convert: UPDATE quotes SET status='accepted', accepted_at=now()
  WHERE id=$quote_id AND status IN ('sent', 'viewed')
- Convert: call existing Branch A logic (unchanged)
- Post-convert: UPDATE appointments SET job_notes=CONCAT(job_notes,
  '\n', $notes) WHERE id=$new_appt_id (if notes provided)

This contains all D20-D29 refined-flow logic without disturbing the
shared convertQuote() helper used by POS.

**Session assignment:** Session 2.

---

### Target 10: customer-context.ts schema for D20 refresh

**Files read:**
- `src/lib/services/customer-context.ts` (385 lines, full)
- `src/lib/sms-ai/agent-runner.ts:265-272` (call site)

**Current behavior:**

`getCustomerContext()` is called once per inbound at
`agent-runner.ts:265` with `{phone, conversationId, maxHistoryMessages:
20, includeTransactions: true}`. Single bundle returned. No caching.

Quote loading at customer-context.ts:233-246:
```ts
admin
  .from('quotes')
  .select(`id, quote_number, status, total_amount, created_at, quote_items ( item_name )`)
  .eq('customer_id', customer.id)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(RECENT_QUOTES_LIMIT)  // 3
```

**`status` is already selected.** Per-inbound fresh fetch. **D20 is
mostly already satisfied** — quote_status reflects DB state at the
moment of every inbound.

`CustomerContextQuote` interface (lines 82-89):
```ts
{ id, quote_number, services, total_amount_cents, status, created_at }
```

**Gaps/Issues:**

1. **Missing `valid_until`** — agent can't reason about "this quote
   expires soon, mention urgency."
2. **Missing `accepted_at`** — agent can't distinguish a self-accepted
   quote (link click) from a verbally-accepted one.
3. **Missing `sent_at` / `viewed_at`** — agent can't reason about
   "customer hasn't opened the link" pressure.

All four columns exist on the `quotes` table per DB_SCHEMA.md. Adding
them to the SELECT is zero new round-trips.

**Recommended fix:** Per S4.1 above.

**Session assignment:** Session 4.

---

## Risk matrix

| Fix | Files touched | Blast radius | Risk level | Session |
|---|---|---|---|---|
| Add `convert_quote_to_appointment` tool | `tools.ts`, `tool-dispatcher.ts` | SMS-agent only | LOW — additive | 2 |
| Extend `send_quote_sms` schema + endpoint | `tools.ts`, `send-quote-sms/route.ts` | Voice agent + SMS agent share endpoint; voice ignores new fields | LOW — additive | 2 |
| Add `quote_sms_failed` notify_staff reason | `staff-notification.ts`, `tools.ts` | Voice agent + SMS agent + template flow | LOW — additive enum | 2 |
| Extend voice-agent appointments Branch A for notes + D21 | `voice-agent/appointments/route.ts` | Voice agent + new SMS agent path | MEDIUM — touches shared endpoint, voice agent regression risk | 2 |
| Purge route — add coupons + print_jobs | `customers/purge/route.ts` | Admin Purge tool only | LOW | 2 or 4 |
| Soft-delete DELETE → conversation cleanup (if Q1=a) | `customers/[id]/route.ts` | Admin per-customer DELETE | MEDIUM — changes destructive semantics | 2 |
| Prompt rewrite — refined flow rules | `system-prompt.ts` | SMS agent only | MEDIUM — prompt regressions are subtle | 3 |
| Prompt rule — tool-failure consistency | `system-prompt.ts` | SMS agent only | LOW — additive section | 3 |
| Customer-context quote SELECT extension | `customer-context.ts` | All callers of getCustomerContext | LOW — additive columns | 4 |
| Remove create_appointment from agent tool surface | `tools.ts` | SMS agent only | LOW — defense in depth | 4 |
| Tighten get_availability tool description | `tools.ts` | SMS agent only | LOW — text only | 4 |
| Live verification (Session 5) | none | runtime only | LOW | 5 |

---

## Sequencing summary

Recommended: **1 (this diagnostic) → 2 ∥ 4 → 3 → 5**

Session 2 and Session 4 can run in parallel (different files, no
collisions). Session 3 depends on both because the new prompt rules
reference the new tools. Session 5 verifies the entire stack at the
end. Matches existing roadmap sequencing.

Estimated session sizes:
- Session 2: ~3-4 hours (new tool + 2 endpoint extensions + 1 enum
  addition + tests)
- Session 3: ~2-3 hours (prompt rewrite + ~5 new sections + char count
  verification)
- Session 4: ~1-2 hours (3 small additive edits + tool surface trim +
  Purge gap fixes + tests)
- Session 5: ~1-2 hours of operator + CC time for live verification

---

## What this diagnostic deliberately does NOT cover

- POS-side `convertQuote()` caller — out of scope; refined flow doesn't
  touch POS UX
- ElevenLabs voice agent prompt — separate workstream
- Workstream I (supersession) — already-scoped separately
- `create_appointment` endpoint Branch B refactor — out of scope; the
  fix is "agent doesn't call it," not "endpoint deleted"
- Multi-detailer slot segmentation — future enhancement, not refined-
  flow blocker
- Audit log scrubbing on Purge — operator decision deferred

These intentionally remain in the existing roadmap as separate
workstreams or future-enhancement notes.
