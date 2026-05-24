# Name-First Customer Creation Flow — Diagnostic (2026-05-23)

> Read-only audit of existing infrastructure for the operator-proposed flow:
> create customer record IMMEDIATELY when the customer provides their first
> name (not as a side effect of `send_quote_sms` succeeding). Goal: eliminate
> the orphan-conversation class of bugs (Issues 26-28) at the source.
>
> Operator principle (CLAUDE.md spirit): "Never take the lazy path. Always
> reuse existing code, components, and architecture." This audit prioritizes
> reuse and documents structural reasons whenever new infrastructure is
> genuinely required.

## TL;DR

**What exists today:** the codebase has **seven distinct customer find-or-create
implementations** across as many files (admin, POS, booking form, Twilio
webhook auto-quote, voice-agent quotes / appointments / send-quote-sms,
voice-post-call service helper) — each with slightly different default-field
choices. The shared retroactive-conversation-linkage pattern is well-
established in `src/lib/utils/conversation-helpers.ts:42-50` and in
`voice-post-call.ts:268-270`. The `customers` table schema is sufficient for
the proposed flow — no new columns or migrations needed. The phone-injection
mechanism shipped earlier today (commit `9273ff1c` on
`feat/sms-ai-v2-tool-dispatcher-phone-injection`) already supplies phone to
all phone-bearing tools.

**What's reusable:** virtually every primitive. The existing
`/api/voice-agent/customers/route.ts` file (currently GET-only) is the
natural home for a new POST handler. The `findOrCreateConversation()` helper
already retroactively backfills `conversations.customer_id` when the
conversation existed before the customer record. The `runtimeContext`
already carries `conversationId` for direct UPDATE. The
`customer_type` CHECK constraint already enforces the right enum
(`'enthusiast'` / `'professional'`). The dispatcher's `okResult` /
`errResult` wire format already supports structured JSON payloads.

**What genuinely needs to change:**
1. **One new tool definition** in `src/lib/sms-ai/tools.ts` (~20 lines:
   `upsert_customer` — accepts `first_name` required, `last_name` / `email`
   / address fields / `customer_type` optional)
2. **One new POST handler** in `src/app/api/voice-agent/customers/route.ts`
   (~80-100 lines: find-or-create-or-update with phone from runtime, plus
   retroactive conversation linkage UPDATE)
3. **Three small prompt rule additions** to `src/lib/sms-ai/system-prompt.ts`
   (when to call `upsert_customer`, deflection-handling, existing-customer
   skip)
4. **Dispatcher passthrough patch** (~10 lines: structured error pass-
   through when response body carries `instructions_for_agent` field — needed
   for instructional-error pattern across all phone-required tools, not
   just this one)

**Recommended approach:** **Option C** (genuinely new tool + endpoint, reusing
every supporting helper) for the focused-scope code session. **Option B**
(extract a shared `findOrCreateCustomer` helper, refactor the 7 duplicate
paths) deferred to a separate cleanup session — useful tech-debt reduction
but not blocking the operator's workflow.

**Estimated implementation effort:** **1 focused session (~1.5-2 hours)** for
Option C. Code change small. Test coverage moderate (8-12 new tests).
Verification through structural tests + one manual operator test.

---

## Implementation specification (Option C, ready for follow-up session)

### Code changes

#### 1. New tool definition (`src/lib/sms-ai/tools.ts`)

Append a 13th tool. Phone is NOT in the schema — dispatcher injects it (same
pattern as the 5 existing phone-bearing tools shipped via commit `9273ff1c`).

```ts
{
  name: 'upsert_customer',
  description:
    'Create or update the customer record for the current conversation. Call this AS SOON AS you learn the customer\'s first name — do not wait for a quote or booking trigger. Call AGAIN with additional fields (last_name, email, address, customer_type signal) as they emerge in conversation; only provided fields are updated, nulls do not overwrite existing values. The customer\'s phone is captured automatically from the SMS conversation — do NOT pass it. Existing customers (already in your CUSTOMER CONTEXT) do NOT need this tool — their record already exists.',
  input_schema: {
    type: 'object',
    properties: {
      first_name: { type: 'string', description: 'Customer\'s first name. Required on the first call; on later calls pass the same value or omit.' },
      last_name: { type: 'string', description: 'Customer\'s last name. Optional; pass when learned.' },
      email: { type: 'string', description: 'Customer\'s email address. Optional; pass when learned.' },
      address_line_1: { type: 'string', description: 'Street address. Optional; pass when learned (e.g. mobile-service location).' },
      city: { type: 'string', description: 'City. Optional.' },
      state: { type: 'string', description: 'State (2-letter US code). Optional.' },
      zip: { type: 'string', description: 'ZIP code. Optional.' },
      customer_type: {
        type: 'string',
        enum: ['enthusiast', 'professional'],
        description: 'B2C personal-vehicle customer (enthusiast) vs B2B bulk/wholesale (professional). Defaults to "enthusiast" on creation when omitted. Only pass "professional" on EXPLICIT B2B signals — "for my shop", "for my dealership", "for my fleet", bulk/wholesale ask. Never ask the customer directly which type they are.',
      },
    },
    required: ['first_name'],
  },
}
```

#### 2. Dispatcher additions (`src/lib/sms-ai/tool-dispatcher.ts`)

Two changes:

(a) Add `upsert_customer: 5000` to `TOOL_TIMEOUT_MS`. Add case to switch:
```ts
case 'upsert_customer':
  result = await callUpsertCustomer(input.input, key);
  break;
```

(b) Add the helper, modeled on `callSendQuoteSms`. Injects phone AND
conversationId from runtime context:
```ts
async function callUpsertCustomer(input: Record<string, unknown>, key: string): Promise<DispatchToolResult> {
  if (!_runtimeContext?.phone) {
    return errResult('upsert_customer: internal — runtime phone not set');
  }
  const injectedBody = {
    ...input,
    phone: _runtimeContext.phone,
    conversation_id: _runtimeContext.conversationId,
  };
  return voiceAgentFetch(
    `/api/voice-agent/customers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(injectedBody),
    },
    TOOL_TIMEOUT_MS.upsert_customer,
    key,
  );
}
```

(c) Optional but recommended: passthrough patch in `voiceAgentFetch` for
structured errors carrying `instructions_for_agent`. Lets ALL phone-bearing
tools return rich agent-facing instructions instead of generic
"Tool call returned 400: ..." strings.
```ts
if (!res.ok) {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.instructions_for_agent) {
      return { content: text, isError: true };
    }
  } catch { /* fall through to legacy snippet */ }
  const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  return errResult(`Tool call returned ${res.status}: ${snippet}`);
}
```

#### 3. New POST handler (`src/app/api/voice-agent/customers/route.ts`)

Add to the existing route file (currently GET-only). ~80-100 lines.
Reuses every supporting helper. Returns structured JSON.

```ts
// (Pseudocode for the spec — final implementation in the follow-up session)
export async function POST(request: NextRequest) {
  // 1. validateApiKey (Bearer auth — same as GET)
  // 2. Parse body: first_name (required), last_name?, email?, address fields?,
  //    customer_type?, phone (injected), conversation_id (injected)
  // 3. normalizePhone(phone) — reject if invalid (defensive)
  // 4. Find existing customer by phone (deleted_at IS NULL)
  // 5a. EXISTING: build UPDATE payload from only-provided fields,
  //     skip overwrites of non-null existing values for first_name/last_name
  //     unless current value is a generic ("phone caller", "new customer"),
  //     match the pattern at send-quote-sms/route.ts:85-105.
  //     RETURN { customer_id, was_created: false, conversation_linked: ... }
  // 5b. NEW: INSERT with first_name, last_name || '', phone (E.164-validated),
  //     email?, address fields?, customer_type ?? 'enthusiast', sms_consent: true
  //     (implied — customer is actively texting). Log sms_consent_log entry
  //     via existing updateSmsConsent() helper.
  // 6. RETROACTIVE CONVERSATION LINKAGE: UPDATE conversations SET customer_id = $1
  //    WHERE id = $conversation_id AND customer_id IS NULL.
  //    (Defensive `.is('customer_id', null)` guard — never overwrite.)
  // 7. RETURN structured success:
  //    { customer_id, first_name, was_created, conversation_linked }
}
```

Error responses should use the `instructions_for_agent` pattern. Example
for duplicate-email case:

```json
{
  "error": "duplicate_email",
  "instructions_for_agent": "The email address you tried to save (alice@example.com) belongs to a different customer. Do NOT share this with the customer. Politely ask if they meant a different email, or proceed without recording an email.",
  "do_not_share_with_customer": true
}
```

The agent reads `content` (full JSON string), uses `instructions_for_agent` to
shape its next turn, and respects `do_not_share_with_customer` by NOT
mentioning the conflict.

#### 4. Prompt rule additions (`src/lib/sms-ai/system-prompt.ts`)

Three small additions, all under existing sections. Estimated +400 chars net.

**(a) Under `# Discovery and conversation flow` → "For NEW conversations":**
Change step 1 to explicitly link name-capture with `upsert_customer`:
```
1. Greet warmly. If a name is in context, use it. If not, ask for first name
   early ("Hi! Happy to help. Quick question first — what's your name?").
   The moment the customer provides any usable first name, call
   `upsert_customer` with that first_name. The customer record exists from
   that turn forward; later tools (send_quote_sms, create_appointment) will
   UPDATE rather than CREATE.
```

**(b) New `## Customer-record creation timing` subsection (under Discovery):**
```
You have one tool whose JOB is to persist the customer record:
`upsert_customer`. Use it the MOMENT you have a first name, not later.

When to call:
- Brand-new conversation, customer is not in CUSTOMER CONTEXT, you have
  just learned a usable first name → call `upsert_customer({first_name})`.
- Later in the same conversation, customer reveals email / last name /
  address / a customer_type signal → call `upsert_customer` again with
  those NEW fields (only the new ones — don't repeat what you already
  passed). The tool is an upsert: nulls don't overwrite existing values.

When NOT to call:
- Customer is already in CUSTOMER CONTEXT (record exists; you'd just be
  creating noise).
- You don't have a first name yet — wait for it. Don't pass placeholder
  values like "Customer" or "Caller".
- Customer is "just browsing" / "just looking" / refuses to give a name
  after one polite ask — proceed without creating a record. The
  conversation will stay orphaned and operator will clean it up via the
  Data Management UI (Orphan Conversations card).

How to handle deflection:
- If the customer ignores or deflects the name question (e.g. answers a
  different question), do NOT re-ask immediately. Wait for a natural
  moment (mid-conversation, before sending a quote, etc.) and ask once
  more. After one polite re-ask, proceed without the name.
```

**(c) Update the existing `## Customer type classification` subsection:**
Today this section says "If `send_quote_sms` tool accepts a `customer_type`
parameter, pass the inferred value." Change to:
```
The `upsert_customer` tool accepts a `customer_type` parameter. On the
first `upsert_customer` call, omit it — the server defaults to
'enthusiast' (the dominant case). Only call `upsert_customer` AGAIN with
`customer_type: 'professional'` if you observe explicit B2B signals
later in the conversation: "for my shop", "for my dealership",
"for my fleet", bulk/wholesale ask. Never ask the customer directly
which type they are.
```

### Tests required

Tool-dispatcher tests (`tool-dispatcher.test.ts`):
- `upsert_customer` injection-when-LLM-provides-none (verifies phone +
  conversation_id are added by dispatcher)
- `upsert_customer` override (LLM-provided phone is ignored)
- `upsert_customer` defensive guard (returns errResult when runtime context
  unset)
- Structured-error passthrough: when response body carries
  `instructions_for_agent`, dispatcher returns full JSON in content (not the
  truncated snippet)

Endpoint tests (`src/app/api/voice-agent/customers/__tests__/route.test.ts`,
new file):
- POST 401 on missing/invalid Bearer
- POST 400 on missing first_name
- POST 400 on invalid phone format (defensive — dispatcher should always
  inject valid E.164, but the endpoint validates anyway)
- POST CREATE happy path — new customer, sms_consent_log row written,
  conversation backfilled
- POST UPDATE happy path — existing customer, only provided fields updated,
  existing values preserved
- POST CREATE with customer_type omitted → DB row has 'enthusiast'
- POST CREATE with customer_type='professional' → DB row has 'professional'
- POST CREATE duplicate phone → returns 409 with `instructions_for_agent`
- POST CREATE duplicate email → returns 409 with `instructions_for_agent`
- POST conversation backfill: existing orphan conversation gets linked

Estimated test count delta: **+12 to +15 new tests.**

### Migrations

**NONE.** Schema is sufficient.

---

## Audit findings by target

### Target 1: Existing customer creation paths

**Seven distinct find-or-create implementations identified.** Each has
subtly different default-field choices.

| Path | File | Auth | Required | Defaults applied | UPDATE on find? | Notes |
|---|---|---|---|---|---|---|
| Admin manual | `src/app/api/admin/customers/route.ts:117-134` | session + `customers.create` | first_name, last_name, phone | sms_consent ?? false, email_consent ?? false, customer_type if valid | N/A — rejects duplicates with 409 | Strict validation, archived-match check, welcome email |
| POS walk-in | `src/app/api/pos/customers/route.ts:96-108` | HMAC POS | first_name, last_name, phone, sms_consent (boolean required) | none implicit | N/A — rejects duplicates | TCPA-strict: requires explicit sms_consent boolean |
| Booking form | `src/app/api/book/route.ts:184-196` | none (public) | first_name, last_name, phone | customer_type='enthusiast' (forced) | YES — updates missing email / customer_type / consent (never downgrades consent) | Find-or-create by phone, fallback to email |
| Twilio webhook auto-quote (legacy) | `src/app/api/webhooks/twilio/inbound/route.ts:747-757` | Twilio signature | firstName, lastName, phone | sms_consent=true, email_consent=false, customer_type='enthusiast' | NO — find returns existing id, no update | Implied consent from inbound SMS |
| voice-agent send-quote-sms | `src/app/api/voice-agent/send-quote-sms/route.ts:119-129` | Bearer (voice_agent_api_key) | first_name, last_name?, phone | sms_consent=true. **NO customer_type set.** | YES — but ONLY upgrades generic names ("phone caller", etc.) to a real name | The side-effect path Issue 26-28 root cause |
| voice-agent appointments (Branch B direct) | `src/app/api/voice-agent/appointments/route.ts:452-461` | Bearer | first_name, last_name, phone | sms_consent=true. **NO customer_type set.** | NO — find returns existing id only | Same pattern as send-quote-sms |
| voice-agent quotes | `src/app/api/voice-agent/quotes/route.ts:89-97` | Bearer | first_name, last_name, phone | **NO sms_consent set. NO customer_type set.** | NO | Most minimal — relies on column defaults |
| voice-post-call service helper | `src/lib/services/voice-post-call.ts:159-174` (UPDATE path) + new inserts elsewhere | n/a (internal service) | varies | varies; has the name-upgrade pattern for generic names | YES — upgrades generic name to real name | Library helper, called by finalize-call + cron |

**Implications:**
- No two paths use the same defaults set. `customer_type` is set in 3 of 7;
  `sms_consent` is set in 5 of 7. **Refactoring all 7 to a shared helper is
  worthwhile tech-debt cleanup** but a SEPARATE session — not blocking the
  proposed name-first flow.
- **None of these endpoints can be called by the agent with just first_name
  + phone.** send-quote-sms requires `services`. create_appointment requires
  date/time/service_or_quote_id. quotes route is internal/manual. book route
  requires full booking payload. admin + pos routes require different auth.
  So the agent's only path to create a customer today is "side effect of a
  flow that also requires a quote or appointment" — which is exactly the
  fragility being audited.

**Reusable pattern for the new endpoint:** `send-quote-sms/route.ts:85-105`
(generic-name upgrade) and `book/route.ts:121-146` (consent upgrade) are the
two cleanest UPDATE patterns to model the new POST after.

### Target 2: Existing tool surface

`src/lib/sms-ai/tools.ts` has 12 tools today:

| Tool | Creates customer? | Could be repurposed for name-first? |
|---|---|---|
| lookup_customer | NO (read-only) | NO — read-only |
| get_services | NO | NO — catalog |
| classify_vehicle | NO | NO — vehicle data |
| check_availability | NO | NO — calendar |
| create_appointment | YES (Branch B side effect) | NO — endpoint requires date/time/service or quote_id |
| send_info_sms | NO | NO — link sender |
| get_products | NO | NO |
| get_product_details | NO | NO |
| notify_staff | NO | NO — alerter |
| send_quote_sms | YES (side effect) | NO — endpoint requires `services` field, returns 400 without it |
| approve_addon | NO | NO — addon flow |
| decline_addon | NO | NO — addon flow |

**Finding: NO existing tool can be called with just first_name + phone to
create a customer record.** Both side-effect creators
(`send_quote_sms`, `create_appointment`) require quote/booking data
alongside name. Calling either "in minimal mode" would require:
(a) splitting their endpoints into two flows (more invasive than adding a
focused new endpoint), OR
(b) loosening required-field validation (creates incoherent endpoint
contracts).

**This is the structural reason a new tool is genuinely needed despite the
reuse principle.** A new tool definition (~20 lines) is the minimum
addition; everything else can reuse existing infrastructure.

### Target 3: Customer record schema verification

Verified against `docs/dev/DB_SCHEMA.md:578-639` (auto-generated from live
DB).

| Field | Type | Constraints | Status |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | ✓ |
| first_name | TEXT | NOT NULL | ✓ |
| last_name | TEXT | **NOT NULL** | ✓ — but empty string `''` is the convention when not provided (existing code uses this pattern) |
| phone | TEXT | nullable, CHECK `~ '^\+1\d{10}$'` when present, UNIQUE active index | ✓ |
| email | TEXT | nullable, UNIQUE active-lowercase index when present | ✓ |
| address_line_1, address_line_2 | TEXT | nullable | ✓ |
| city, state, zip | TEXT | nullable | ✓ (note: column is `zip` not `zip_code` / `postal_code`) |
| customer_type | TEXT | CHECK in ('enthusiast', 'professional'), **nullable** | ✓ — null = unclassified; CHECK enforces lowercase only |
| sms_consent | BOOLEAN | NOT NULL DEFAULT false | ✓ |
| email_consent | BOOLEAN | NOT NULL DEFAULT false | ✓ |
| deleted_at | TIMESTAMPTZ | nullable | ✓ — soft-delete pattern |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | ✓ |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | ✓ |

**Gotchas to document in the implementation:**
1. **`last_name` is NOT NULL** — pass `''` (empty string) as default when not
   provided. The existing find-or-create paths already do this; the new
   handler must too.
2. **`customer_type` CHECK is lowercase** — the schema rejects `'Enthusiast'`
   with capital E. The proposed flow doc uses capital E informally; the
   implementation must use lowercase.
3. **`phone` UNIQUE index is `WHERE deleted_at IS NULL`** — a soft-deleted
   customer's phone CAN be reused by a new customer record (this is
   intentional — see CLAUDE.md rule 18). The new handler's find lookup must
   include `.is('deleted_at', null)` to match this behavior.
4. **`zip` column name** (not `zip_code` / `postal_code`) — minor naming
   consistency issue across the codebase; new handler should follow the
   existing column name to match all other paths.

**Schema is sufficient. No migrations needed.**

### Target 4: Customer enrichment UPDATE paths

| Field | Updated by | Notes |
|---|---|---|
| first_name | admin PUT, POS PUT, voice-post-call (generic-name upgrade), send-quote-sms (generic-name upgrade only) | No agent-callable path today |
| last_name | same as first_name | same |
| phone | admin PUT, POS PUT, booking form (find-by-email then add phone) | No agent-callable update path |
| email | admin PUT, POS PUT, booking form (when missing on existing customer), customer portal email-add route | **NO agent tool can update email today** |
| address fields | admin PUT, POS PUT, customer portal | **NO agent tool can update addresses today** |
| customer_type | admin PUT, POS PUT, booking form (when missing → 'enthusiast'), admin/customers list-page toggle | **NO agent tool can update customer_type today** |
| sms_consent | webhook STOP/START handler + auto-opt-in for inbound + manual UPDATEs from admin/POS | Managed at the consent layer, not via agent tools |
| tags | admin PUT, list-page chip editor | n/a for agent |
| notes | admin PUT | n/a for agent |

**Gaps the new tool closes (all in one upsert call):**
- email enrichment mid-conversation
- last_name enrichment after first turn
- address enrichment for mobile-service customers
- customer_type adjustment from default 'enthusiast' to 'professional' on
  later B2B signal detection

### Target 5: Conversation-to-customer linkage

**Existing retroactive backfill patterns — REUSABLE:**

1. `src/lib/utils/conversation-helpers.ts:42-50` — `findOrCreateConversation`
   helper backfills `conversations.customer_id` when an existing conversation
   has null and a customerId is supplied. Defensive `.is('customer_id',
   null)` guard prevents overwriting.

2. `src/lib/services/voice-post-call.ts:268-270` — same backfill pattern
   inline.

3. `src/app/api/webhooks/twilio/inbound/route.ts:408-410` — only backfills
   when an EXISTING conversation is updated by a NEW inbound where the
   customer is known at webhook time. **Does NOT retroactively link when
   the customer is created mid-agent-run.** This is the gap.

**For the new endpoint:** simplest UPDATE pattern is direct, because the
runtime context carries `conversationId` (we don't need to look up by
phone):
```sql
UPDATE conversations
SET customer_id = $new_or_existing_id
WHERE id = $runtime.conversationId
  AND customer_id IS NULL
```

The `.is('customer_id', null)` guard prevents stomping if another path has
already linked.

**The existing 9 orphan conversations in production** (per
`fix/orphan-conversation-purge-gap` audit) would NOT be retroactively
healed by this flow — they have no active agent run that would call
`upsert_customer`. They're handled by the orphan-conversations Purge UI
(also shipped on that branch). The two fixes are complementary.

### Target 6: Current prompt rules around customer creation

Already prompts the agent to ask for the first name early
(`src/lib/sms-ai/system-prompt.ts:127, 165`). The gap is **persistence
timing**: the prompt today says "get first name before send_quote_sms" —
deferring write to the quote send. The new rule needs to be "as soon as
you have first name, call upsert_customer."

Existing Customer Type classification subsection
(`system-prompt.ts:283-305`) is conditional on `send_quote_sms` accepting
`customer_type` — which it doesn't today. The proposed flow makes that
conditional language obsolete: `upsert_customer` accepts `customer_type`
unconditionally, so the rule becomes "pass it directly (or omit and let
the server default to enthusiast)."

### Target 7: Instructional tool errors feasibility

Current dispatcher wire format (`src/lib/sms-ai/tool-dispatcher.ts:79-82,
181-188, 224-225`):
- `DispatchToolResult = { content: string; isError: boolean }`
- `content` is a STRING. Already used for JSON-stringified payloads via
  `okResult`. Can hold structured JSON for errors too.
- On HTTP non-2xx, dispatcher currently does:
  `errResult(\`Tool call returned ${res.status}: ${snippet}\`)` where
  `snippet = text.length > 200 ? text.slice(0, 200) + '…' : text`
- **The 200-char truncation would chop instruction-bearing error bodies.**

**Fix — 10-line dispatcher patch:** when response body parses to JSON
carrying an `instructions_for_agent` field, return the full JSON without
truncation. Legacy non-instructional errors keep their existing snippet
format.

```ts
if (!res.ok) {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.instructions_for_agent) {
      return { content: text, isError: true };
    }
  } catch { /* fall through */ }
  const snippet = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  return errResult(`Tool call returned ${res.status}: ${snippet}`);
}
```

**Applies to all phone-bearing tools, not just `upsert_customer`** —
useful for `send_quote_sms` failures (e.g. duplicate quote within window),
`create_appointment` (slot conflict), etc. This becomes a general
improvement to the agent-error pattern.

### Target 8: Risk assessment + Option A/B/C recommendation

**Option A — Reuse existing tool with minimal-args mode**

Try to call `send_quote_sms` with just `first_name` + `phone`, skip
services.

**Rejected.** The endpoint validates `services is required` at line 51-53.
Loosening that validation breaks the endpoint's contract — the entire
function is a quote-creation pipeline (build quote items, call
`createQuote`, send SMS link). Making services optional means splitting
the endpoint into "create customer only" vs "create customer + quote"
branches, which is more invasive than a focused new endpoint.

**Option B — Split existing tool / extract shared helper**

Extract `findOrCreateCustomer()` into a shared helper, refactor 7
duplicate paths to call it.

**Useful but deferred.** This is genuine tech-debt cleanup (the 7 paths
have inconsistent defaults — see Target 1 table). But the new tool STILL
needs a tool definition + endpoint POST handler, so this option doesn't
replace Option C — it adds to it.

**Option C — New tool + endpoint, reusing every supporting helper**

New `upsert_customer` tool definition (~20 lines) + POST handler in
existing `src/app/api/voice-agent/customers/route.ts` (~80-100 lines) +
3 small prompt rule additions + dispatcher passthrough patch (~10 lines).
Reuses:
- The route file itself (currently GET-only; adds POST)
- Phone injection (shipped commit `9273ff1c`)
- `runtimeContext.conversationId` for direct conversation UPDATE (no new
  lookup)
- `findOrCreateConversation`-style backfill pattern (or simpler direct
  UPDATE — see Target 5)
- `validateApiKey` Bearer auth helper
- `normalizePhone` validator
- `updateSmsConsent` for sms_consent_log writes
- Existing customers.phone UNIQUE constraint + soft-delete filter pattern
- Existing `customer_type` CHECK constraint (no new enum values)

**Recommendation: Option C for the focused-scope code session, Option B
deferred to a separate cleanup session.**

Reasoning:
- Option C unblocks the operator's workflow in one focused session
- Reuse principle satisfied: the only NEW surfaces are (1) the tool
  definition (structurally necessary per Target 2), (2) one POST handler in
  an existing route file. Every supporting primitive is reused.
- Option B (helper extraction) is worth doing later — reduces 7 duplicates
  to one canonical helper — but doesn't change the agent-facing surface
- Option A is structurally rejected

### Target 9: Conversation-flow impact

Existing-customer conversations (customer is already in CUSTOMER CONTEXT
when the agent runs):
- **MUST NOT call `upsert_customer`** — customer record already exists,
  call would be a no-op at best, generate stale tool-result noise at
  worst.
- Prompt rule: explicit "When NOT to call" bullet in the new
  `## Customer-record creation timing` subsection (per implementation
  spec above).

Continued conversations across days (returning customer, history exists):
- Already covered by the existing "For RETURNING conversations" prompt
  section.
- The conversation-freshness rule (D14, 4-hour soft-reset) doesn't change
  customer record state. If the customer is on file, they stay on file.

Customers who deflect the name question:
- **Single re-ask at a natural moment, then proceed.** The prompt rule's
  "How to handle deflection" bullet codifies this. After one polite
  re-ask, the agent proceeds with the conversation without persisting
  a customer record.

"I'm just looking" / info-only customers:
- **No customer record created.** The conversation remains orphaned.
- Cleaned up via the **Orphan Conversations** UI shipped on
  `fix/orphan-conversation-purge-gap` (admin Data Management →
  Orphan Conversations card → multi-select + PURGE).
- This is the GOOD outcome — we don't want a customer record for every
  passing inquiry.

---

## Risk matrix

| Change | Files touched | Blast radius | Risk level |
|---|---|---|---|
| New `upsert_customer` tool in `tools.ts` | 1 file (~20 lines) | SMS-AI v2 agent only | LOW — additive |
| Dispatcher: new helper + case | `tool-dispatcher.ts` (~25 lines) | SMS-AI v2 agent only | LOW — follows existing phone-injection pattern verbatim |
| Dispatcher: structured-error passthrough | `tool-dispatcher.ts` (~10 lines) | All phone-bearing tools | LOW — additive; legacy snippet format preserved as fallback |
| New POST handler in `customers/route.ts` | 1 file (~80-100 lines added) | Voice agent + SMS-AI v2 share this path | MEDIUM — new POST handler in shared endpoint; voice agent currently only uses GET, so adding POST doesn't affect voice agent |
| Prompt rule additions | `system-prompt.ts` (~400 char delta, ~3 small additions) | SMS-AI v2 agent only | MEDIUM — prompt regressions are subtle; structural tests for rule presence |
| Tests | `tool-dispatcher.test.ts` (+4) + new `customers/__tests__/route.test.ts` (+10) | n/a | LOW |

No migrations. No schema changes. No tool removals. No conversation-helpers
changes (the existing primitive is reused as-is). No `tools.ts` changes
beyond appending one tool. No new column in any table.

---

## Open questions for operator

**Q1 — Should `upsert_customer` set `sms_consent: true` on creation
unconditionally?** Five of the seven existing creation paths do
(send-quote-sms, appointments, twilio webhook auto-quote, voice-post-call,
booking form). The rationale: customer is actively texting → implied
transactional consent. Recommended answer: **YES, same as existing
patterns.** Also log to `sms_consent_log` with `source: 'inbound_sms'`
matching the legacy auto-quote pattern (`twilio/inbound/route.ts:765-772`).

**Q2 — Should the new tool ALSO accept and update vehicle data?** Today
vehicle find-or-create is a separate side effect of send-quote-sms /
appointments via `findOrCreateVehicle(...)`. Adding vehicle to
`upsert_customer` would conflate two concerns. Recommended answer: **NO**
— keep vehicle as a separate concern. If the agent later needs an
agent-callable vehicle UPSERT tool, add it as a separate `upsert_vehicle`
tool in a future session.

**Q3 — Should the helper extraction (Option B) be sequenced before the
new tool ships, or after?** Recommended answer: **AFTER.** The new tool
can land in one focused session; the 7-path helper extraction is its own
medium-sized refactor session and shouldn't block the operator workflow
fix.

**Q4 — Tool name: `upsert_customer` vs `create_customer` vs
`save_customer`?** Recommended: **`upsert_customer`** — accurately
describes the create-or-update semantics. `create_customer` would mislead
the LLM into thinking it shouldn't call twice (when calling twice with
new fields is the intended pattern). `save_customer` is more colloquial
but less precise about the upsert behavior.

**Q5 — Should `upsert_customer` deletions / archival be in scope?** No —
deletion is admin-only via the existing Data Management Purge tool.
Agent never deletes customers. Keep this out of scope.

**Q6 — `customer_type` default on creation: 'enthusiast' vs NULL?**
Existing paths split: booking form forces 'enthusiast'; send-quote-sms /
appointments leave NULL. Recommended: **default to 'enthusiast'** on
agent-initiated creation. SMS inbound conversations are overwhelmingly
B2C; setting the default at the tool layer reduces the "Unknown" pool
that operator otherwise has to reclassify manually (Issue 18). Agent
only passes `'professional'` on explicit B2B signal.

---

## What this diagnostic deliberately does NOT cover

- Helper extraction across 7 existing duplicates (Option B) — deferred to a
  separate cleanup session
- Twilio webhook customer-creation up-front (Option B from
  `fix/orphan-conversation-purge-gap` audit) — orthogonal future hardening;
  the orphan-conversations Purge tool handles backlogged orphans
- Vehicle data UPSERT tool — out of scope per Q2 above
- Agent-initiated customer deletion / archival — admin-only by design
- Refactoring `customer_type` lifecycle (Issue 18 carries forward in
  prompt; the new tool unblocks the previously-deferred branch of that
  rule)
- Changes to `customer-context.ts` rendering — out of scope; the existing
  bundle correctly reads from `customers` table and renders for known
  customers
