# Addon Authorization Flow — Discovery Audit

**Date:** 2026-05-19
**Scope:** End-to-end read-only audit of the in-job addon-authorization flow (detailer → customer SMS → landing page → ticket join → second SMS → AI fallback parse block in Twilio webhook).
**Branch:** `audit/addon-authorization-flow`
**Status:** Discovery only. Facts only — no design recommendations. Zero source/test/migration changes.
**Trigger:** Input for SMS AI v2 Layer 4 planning (Twilio webhook integration). Layer 3 discovery audit (`docs/dev/SMS_AI_V2_LAYER_3_DISCOVERY.md`) flagged the `[AUTHORIZE_ADDON]` parsing block at `webhooks/twilio/inbound/route.ts:869-913` and asked whether it's dead code, fallback, or active.

---

## TL;DR for Layer 4 planner

### 1. What is the addon-authorization flow? (end-to-end)

A mid-job detailer-driven SMS flow for selling a customer an additional service while the vehicle is already on-site and the customer is absent. Sequence:

1. **Detailer trigger** — While a job is `status='in_progress'`, the detailer taps the orange "Flag Issue" button in the POS Jobs card (`src/app/pos/jobs/components/job-detail.tsx:1453`), launching the `<FlagIssueFlow>` (`flag-issue-flow.tsx`, 893 lines, 7 wizard steps).
2. **Detailer composition** — Detailer picks an issue type (scratches / water spots / paint damage / pet hair stains / interior stains / odor / headlight haze / wheel damage / tar sap overspray / other), captures + annotates photos of the issue (via `<PhotoCapture>` writing to the existing `job_photos` table — same storage pipeline as job intake/completion photos), picks a catalog service / product / custom item, sets a price + optional discount, sets pickup-delay minutes, then picks one of **3 hardcoded message templates** (`MESSAGE_TEMPLATES` at `flag-issue-flow.tsx:78-94`) or writes a custom message. There is **NO AI message-drafting integration** — no Anthropic / Claude call, no model variants generated.
3. **Send** — POST to `/api/pos/jobs/[id]/addons` (POS-HMAC auth, `pos.jobs.flag_issue` permission check). Server INSERTs a `job_addons` row with `status='pending'`, `authorization_token = crypto.randomUUID()`, `expires_at = now() + addon_auth_expiration_minutes` (default 30 min, configurable in `business_settings`), `customer_notified_via = []`, plus the price/discount/photo_ids/issue-type/issue-description/message_to_customer. If `pickup_delay_minutes > 0` and the job has `estimated_pickup_at` set, the job's ETA is bumped by the same delta.
4. **Customer outbound** — Server renders SMS template slug `addon_authorization` (chip-driven via `renderSmsTemplate`) and sends to `customer.phone`. URL embedded in the body is `${NEXT_PUBLIC_APP_URL}/authorize/<authorization_token>` — **no `createShortLink` involvement** (UUID is the link path itself). Server also sends an HTML email to `customer.email` if present, with photo + Approve/Decline CTAs that auto-submit via `?action=approve|decline` query param. Outbound channels used are tracked in the addon row's `customer_notified_via` array.
5. **Customer landing** — Customer taps the SMS link, lands at `/authorize/<token>` (`src/app/authorize/[token]/page.tsx`, server-rendered, 314 lines). Page renders: business logo + name, "Hi {first_name}", the detailer's name, the issue, the captured photos (with `<AnnotationOverlay>`), the proposed service name + description, original/discount/additional price, new ticket total, and pickup-delay banner. Then mounts `<AuthorizationClient>` (104-line client component) with two big buttons: Approve / Decline.
6. **Customer decision** — Client `fetch`-POSTs to `/api/authorize/<token>/approve` (50 lines) or `/api/authorize/<token>/decline` (50 lines). Each endpoint is **public, token-scoped, no Bearer auth**. Each endpoint resolves token → addon id and delegates to `approveAddon(addonId)` / `declineAddon(addonId)` in `src/lib/services/job-addons.ts:83-244`.
7. **Status mutation + second outbound** — Helper validates current status is `pending`, checks `expires_at`, sets `status='approved'|'declined'` + `responded_at=now()`, and sends a confirmation SMS to the customer using slug `addon_approved` or `addon_declined` (`logToConversation: true`). **`jobs.services` JSONB is NOT mutated** — the approved addon row lives in `job_addons` independently and is joined at checkout time (`/api/pos/jobs/[id]/checkout-items/route.ts:146-172` filters `addons.status === 'approved'` and folds them into the checkout line items).
8. **Detailer notification** — **NONE.** Neither `approveAddon()` nor `declineAddon()` sends any SMS, push, or in-app notification to the detailer or staff. The detailer learns the result by visual feedback in the POS Jobs UI: the job-queue card shows badges based on addon status (`src/app/pos/jobs/components/job-queue.tsx:128`) and the in-progress job's detail screen lists the addon row with its current `status`. There is no real-time push — the UI surfaces it on the next polling refresh / page reload.

### 2. What does the Twilio inbound webhook's `[AUTHORIZE_ADDON]` parsing block actually do today?

**It is a designed-on-purpose fallback path that has NEVER fired in production.** Specifically:

- **The path IS intentional, not dead code.** `src/lib/services/messaging-ai.ts:202-211` (the LEGACY single-shot SMS handler) injects a `PENDING SERVICE AUTHORIZATION` section into the AI system prompt for any inbound from a customer with a pending addon. That section explicitly instructs the AI to emit `[AUTHORIZE_ADDON:<addon_id>]` on affirmative reply or `[DECLINE_ADDON:<addon_id>]` on negative reply (see `job-addons.ts:340-345` for the verbatim prompt). The webhook block at `src/app/api/webhooks/twilio/inbound/route.ts:866-913` regex-parses those tokens out of the AI's reply, strips them from the customer-visible text, and dispatches to `approveAddon()` / `declineAddon()`.
- **The path is designed to capture customers who reply "yes" / "no" via SMS without clicking the landing-page link.** It is documented in `docs/planning/PHASE8_JOB_MANAGEMENT.md:670-705`.
- **DB evidence — never exercised in production:**
  - `SELECT count(*) FROM messages WHERE body ILIKE '%[AUTHORIZE_ADDON%' OR body ILIKE '%[DECLINE_ADDON%'` returns **0 rows** (live query, 2026-05-19).
  - `SELECT count(*) FROM job_addons` returns **0 rows** (live query, 2026-05-19). The entire `job_addons` table is empty.
- **Why empty:** The "Flag Issue" surface is in the POS Jobs card behind `pos.jobs.flag_issue` permission and only mounts when the job is `status='in_progress'`. The shop is still in pre-launch mode (per CLAUDE.md "Phase 16 Launch Prep — Not started"). No customer has ever received an `addon_authorization` SMS, so no customer has ever replied with affirmative text, so the parsing block has never had input to parse.
- **Implication:** Layer 4 cannot reason about real-world bugs in this fallback path because production has no observed behavior to compare against. The path is functionally untested at integration level.

### 3. What's the relationship between addons and the SMS AI v2 agent?

**Today, NONE.** Specifically:

- **Legacy single-shot AI (`messaging-ai.ts`)** — DOES inject pending-addon context via `getPendingAddonsForCustomer` + `buildAddonPromptSection` and DOES emit `[AUTHORIZE_ADDON]` / `[DECLINE_ADDON]` markers per the system-prompt rules in `job-addons.ts:310-358`.
- **SMS AI v2 agent (Layer 3a + Layer 3b shipped on `main` as of HEAD)** — has **ZERO** addon awareness:
  - No file under `src/lib/sms-ai/` mentions "addon" anywhere (grep verified across `feature-flag.ts`, `system-prompt.ts`, `tools.ts`, `agent-runner.ts`, `tool-dispatcher.ts` and tests).
  - The v2 system prompt at `src/lib/sms-ai/system-prompt.ts` does NOT include `getPendingAddonsForCustomer` output and has no rule about `[AUTHORIZE_ADDON]` tokens.
  - The v2 tool surface (10 tools in `src/lib/sms-ai/tools.ts`) has no `approve_addon`, `decline_addon`, or any addon-shaped tool.
  - `src/lib/services/customer-context.ts` (Layer 1+2 helper used to bootstrap v2 turn context) does NOT load `job_addons` — addons are absent from `CustomerContext`.
- **Voice agent `/context` endpoint** — also does NOT load `job_addons`.
- **Consequence for Layer 4 routing** — When Layer 4 wires `shouldUseSmsAiV2(phone, flags)` into the Twilio inbound webhook, a customer with a pending addon who is on the v2 allowlist (or covered by `sms_ai_v2_globally_enabled`) would see their inbound reply routed to the v2 agent, which has no `[AUTHORIZE_ADDON]` emission rules and no addon-approval tool, and therefore would NOT produce a token for the parse block to catch. The customer's "yes" would receive whatever conversational reply the v2 model generates from its current tool-less view of the conversation, and the `job_addons` row would stay `pending` until it expired. Whether the production impact is meaningful today is bounded by §1 fact above: the `job_addons` table is empty so no real customer has ever hit this branching.

---

## §A — Detailer-side initiation surface

### Files

| Path | Lines | Role |
|---|---|---|
| `src/app/pos/jobs/components/job-detail.tsx:1451-1459` | 9 | "Flag Issue" button mount site. Visible only when `canFlagIssue` is true. Imports `<FlagIssueFlow>` at line 50. |
| `src/app/pos/jobs/components/flag-issue-flow.tsx` | 893 | 7-step wizard component: issue-type → photo → zone-select → catalog → discount → delay → message → preview. |
| `src/app/pos/jobs/components/photo-capture.tsx` (not opened) | — | Camera/upload widget invoked at the `photo` step. Saves to `job_photos` table (same as job intake/completion photos). |

### Launch site

- **Surface:** POS Jobs card (`/pos/jobs`) — detail view for a single `jobs.status='in_progress'` row.
- **Button:** Orange "Flag Issue" with `AlertTriangle` icon (`job-detail.tsx:1455-1458`), full-width alongside an optional "Photos" button.
- **Visibility gate:** `canFlagIssue` flag derived from the job's status + the operator's `pos.jobs.flag_issue` permission. (Not re-derived here — referenced as a precomputed boolean in render code.)
- **Layout context:** appears below the job's services list, alongside "Photos" and above the green "Complete" button — i.e., the detailer's main action area on an in-progress job.

### Wizard steps (sequenced via `step` state machine, `flag-issue-flow.tsx:74`)

| Step | Inputs |
|---|---|
| `issue-type` | One of 10 issue types from `ISSUE_TYPES` (`src/lib/utils/issue-types.ts`) — `scratches`, `water_spots`, `paint_damage`, `pet_hair_stains`, `interior_stains`, `odor`, `headlight_haze`, `wheel_damage`, `tar_sap_overspray`, `other`. Picking `other` reveals a free-text description input. |
| `zone-select` | Pick a zone from `EXTERIOR_ZONES` / `INTERIOR_ZONES` (in `@/lib/utils/job-zones`) for the photo. |
| `photo` | `<PhotoCapture>` opens camera/file picker. Captured photos persisted to `job_photos` table with `phase='progress'` and the chosen `zone`. `onSaved` callback returns a `JobPhoto` row. Annotation overlay is supported (rendered in preview). |
| `catalog` | 3 tabs: `services` / `products` / `custom`. Services use `resolveServicePrice` (canonical engine) to pull tier-aware pricing for the job's vehicle `size_class`. Products use `product.retail_price` directly. Custom is free-text + free-number. Already-on-job services are blocked from re-selection. |
| `discount` | Optional dollar discount applied to the chosen item's price. |
| `delay` | Optional pickup-delay minutes. Auto-prefilled from `selectedItem.base_duration_minutes` when service was picked. |
| `message` | Pick one of 3 `MESSAGE_TEMPLATES` (`flag-issue-flow.tsx:78-94`) — `noticed` / `benefit` / `inspection`. Each is a string template with placeholders `{issue}`, `{vehicle}`, `{friendly_service}`, `{price}` (`finalPrice` after discount). Or toggle "Write custom message" and type freeform text. |
| `preview` | Renders a mock customer landing-page card with all data + the resolved messageText + a final Send button. |

### AI-message-drafting integration

**NONE.** `grep -n "anthropic\|claude\|ai_draft\|aiDraft" src/app/pos/jobs/components/flag-issue-flow.tsx` returns zero hits. The 3 message variants are 100% hardcoded string templates with placeholder substitution. There is no "Generate message variants" button, no model call, no prompt anywhere on the detailer side of this flow.

### Image upload mechanism

- **Component:** `<PhotoCapture>` (`src/app/pos/jobs/components/photo-capture.tsx`, not opened in this audit) — same component used by job intake/completion photo capture.
- **Storage:** Supabase Storage — bucket convention shared with job photos. Path convention per FILE_TREE.md sits in `src/lib/utils/render-annotations.ts` (referenced by `getAnnotatedPhotoUrl` in `/api/pos/jobs/[id]/addons/route.ts:8`).
- **DB row:** Captured photos written to `job_photos` table with `phase='progress'`, the selected `zone`, and optional `annotation_data` JSONB (drawn shapes / arrows / text overlaid on the image). The `JobPhoto.id` array is later passed back to the addon-create endpoint as `photo_ids` so the same image rows are referenced by both `job_photos` (intake/progress/completion) and `job_addons` (request payload).
- **Filesize limits:** not enforced in `flag-issue-flow.tsx`; the underlying `<PhotoCapture>` does HEIC/JPEG conversion + compression (per FILE_TREE.md comments) but specific byte limits were not inspected.

---

## §B — Detailer-initiated outbound endpoint + SMS

### File: `src/app/api/pos/jobs/[id]/addons/route.ts` (438 lines)

Exports `GET` (list addons for a job + auto-expire stale `pending` rows) and `POST` (create + notify).

### POST anatomy

| Phase | Lines | Detail |
|---|---|---|
| Auth | 66-77 | `authenticatePosRequest(request)` (POS HMAC) + `checkPosPermission('pos.jobs.flag_issue')`. 401 / 403 on failure. |
| Job validity | 82-101 | SELECT job + customer + vehicle. Requires `job.status === 'in_progress'`. 400 otherwise. |
| Expiration calc | 104-117 | Read `business_settings.addon_auth_expiration_minutes` (default 30). `expires_at = now + N min`. Token = `crypto.randomUUID()`. |
| INSERT `job_addons` | 134-156 | Row created with `status='pending'`, the token, the captured photo IDs (UUID[]), and all wizard inputs. `created_by = posEmployee.employee_id`. `customer_notified_via = []` initially. |
| Bump ETA | 164-174 | If `job.estimated_pickup_at` exists AND `pickup_delay_minutes > 0`, UPDATE `jobs.estimated_pickup_at += delay`. |
| Build SMS context | 177-225 | Resolve detailer's first name from `employees`. Build `vehicleDesc` via `cleanVehicleDescription`. Resolve `issueText` via `getIssueHumanReadable`. Resolve catalog item name via SELECT on `services` or `products`. Render annotated photo URL for **email only** (per inline comment: "NOT for MMS — removed per spec"). |
| Outbound SMS | 238-269 | Slug `addon_authorization` (chip-driven). Fallback body if template inactive. Chip values: `first_name` (optional, REMOVE_LINE if blank), `vehicle_description`, `issue_text`, `friendly_name`, `final_price` (numeric without `$`; literal `$` in body provides prefix), `authorize_url`, `detailer_name`. Send via `sendSms(customer.phone, tpl.body, { customerId, source: 'transactional', logToConversation: true, notificationType: 'addon_authorization_request', contextId: addon.id })`. |
| Outbound email | 272-305 | If `customer.email` present, render full HTML email via `buildAuthorizationEmail()` (lines 326-438) with photo + Approve/Decline CTAs (auto-submit via `?action=approve|decline` query param when tapped). Send via `sendEmail`. |
| Track channels | 308-313 | After both sends, UPDATE `job_addons.customer_notified_via = [<channels that succeeded>]`. |

### DB writes before SMS

| Table | Operation | Notes |
|---|---|---|
| `job_addons` | INSERT (full row) | Status enum: `'pending'` initially. |
| `jobs` | UPDATE `estimated_pickup_at` + `updated_at` | Only when `pickup_delay_minutes > 0` and existing ETA present. |

### Authorize URL pattern

- **Path:** `${NEXT_PUBLIC_APP_URL}/authorize/<authorization_token>`
- **Token format:** raw UUID v4 (32 hex + 4 dashes) from `crypto.randomUUID()`.
- **No short link.** `createShortLink` is NOT used in either `/api/pos/jobs/[id]/addons/route.ts` nor `/resend/route.ts`. URL is full-length.

### Outbound SMS body shape (chip-driven slug `addon_authorization`)

Fallback (when template `is_active=false` or render fails) is the literal:

```
Hi {first_name}, while working on your {vehicle_description} we noticed {issue_text}.
We recommend {friendly_name} for an additional ${final_price} — shall we go ahead?
View pictures and approve or decline here: {authorize_url}
{detailer_name}
{business_name}
```

Rendered example would be:
```
Hi Jane, while working on your Honda Accord we noticed scratches on the rear bumper.
We recommend Scratch Repair for an additional $150.00 — shall we go ahead?
View pictures and approve or decline here: https://app.smartdetailsautospa.com/authorize/abc-123-...
Mike
Smart Details Auto Spa
```

Note: per inline comment at `addons/route.ts:227-237`, the `final_price` chip carries a NUMERIC-only string ("XX.XX"); the literal `$` in the template body provides the prefix. This convention is internally inconsistent with other slugs (Path B convention) per a CHANGELOG follow-up flagged at line 5515.

### Resend endpoint (`/resend/route.ts`, 178 lines)

`POST /api/pos/jobs/[id]/addons/[addonId]/resend` — only callable on `expired` or `declined` addons. Clones the original row into a NEW row (new UUID + new token + new `expires_at`) and re-sends. Uses slug `addon_authorization_resend` (chip-driven, allows MMS photo attachment via `mediaUrl` parameter). Original row stays in `expired`/`declined` state; the new row carries `status='pending'` again.

---

## §C — Customer-side landing page

### Route: `/authorize/[token]` → `src/app/authorize/[token]/page.tsx` (314 lines)

- **Auth:** Public — no Bearer header, no login, no session check. Token in the path is the sole credential.
- **Token semantics:** `addon.authorization_token` column has `UNIQUE` constraint (`job_addons_authorization_token_key` index). Token is `crypto.randomUUID()` so collision probability is negligible.
- **Token validity:**
  - Lookup: SELECT addon JOIN job JOIN customer + vehicle + creator (employee) WHERE `authorization_token = token`. (`page.tsx:31-44`)
  - Not found → 404-ish render: "Authorization Not Found" card. Page does NOT return HTTP 404; status code is 200 with the not-found UI. (`page.tsx:47-63`)
  - Already responded (`status` in `'approved'|'declined'`) → renders a status banner with a fixed copy + business name. No second action allowed. (`page.tsx:78-106`)
  - Expired (`status='expired'`, or `status='pending' && expires_at < now()`) → renders "Authorization Expired" card with a `tel:` link to the business phone. When the row is `pending` but past `expires_at`, the page UPDATEs the row to `status='expired'` + `responded_at=now()` BEFORE rendering (`page.tsx:69-75`). (`page.tsx:108-129`)
  - Otherwise → renders the full authorization card (proposed service + photos + price + new ticket total + pickup delay + buttons). (`page.tsx:188-313`)

### Replay protection / one-time-use

- The token is permanent (no rotation, no cookie). Tapping the link multiple times before a decision is harmless — the page re-renders the same card.
- After Approve/Decline, the page checks `addon.status !== 'pending'` and renders the read-only status banner — no second action button is rendered, so the user cannot re-approve / re-decline. The endpoints also re-check status server-side (see §D).

### Rendered content

- Business logo + name + "Additional Service Authorization Request" header.
- "Hi {first_name}" + "While working on your {vehicleDesc}, {detailerName} noticed {issueText}".
- Photos with `<AnnotationOverlay>` (canvas-based shape/arrow/text overlay on the image).
- Proposed Add-On Service card: catalog item name + description.
- Pricing: original/discount/additional cost lines + "New Ticket Total" bar.
- Pickup-delay banner if delay > 0.
- `<AuthorizationClient>` mount (Approve/Decline buttons or auto-submit handler).

### Client behavior: `src/app/authorize/[token]/authorization-client.tsx` (104 lines)

- `'use client'` component.
- `initialAction` prop comes from the page's `?action=` query string (email CTA links arrive with `?action=approve|decline` and auto-trigger the corresponding endpoint via `useEffect`).
- Manual: two buttons → `fetch('/api/authorize/<token>/<approve|decline>', { method: 'POST' })`.
- Loading state shows "Processing..." / "...".
- On HTTP 200 → render success card ("Approved!" / "Declined").
- On HTTP 409 with `data.status === 'approved'|'declined'` → render the same success card (race-condition tolerance).
- On HTTP 410 with `data.status === 'expired'` → "This authorization has expired."
- On other errors → red error card with `data.error || 'Something went wrong'`.

### `GET /api/authorize/[token]` (72 lines)

A separate GET endpoint exists at `src/app/api/authorize/[token]/route.ts` returning the addon JSON (+ photos + catalog item name) for any other client. The page DOES NOT use this endpoint — server-renders the same data directly via `createAdminClient()`. The endpoint appears to be an unused public read API; only the approve/decline POST endpoints are invoked from the client.

---

## §D — Accept + Decline endpoints

### Endpoints

| Path | File | Lines | Auth |
|---|---|---|---|
| `POST /api/authorize/[token]/approve` | `src/app/api/authorize/[token]/approve/route.ts` | 50 | **Public — none.** Token in URL is the sole credential. |
| `POST /api/authorize/[token]/decline` | `src/app/api/authorize/[token]/decline/route.ts` | 50 | **Public — none.** Token in URL is the sole credential. |

Both endpoints are byte-identical structurally: resolve token → addon id, delegate to helper, surface helper result as HTTP 200/410/409.

### HTTP responses

| Scenario | Status | Body |
|---|---|---|
| Success | 200 | `{ success: true, status: 'approved'|'declined' }` |
| Token not found | 404 | `{ error: 'Authorization not found' }` |
| Already approved/declined (non-pending) | 409 | `{ error: 'Addon already <status>', status: 'error' }` |
| Expired | 410 | `{ error: 'This authorization has expired', status: 'expired' }` |
| DB failure | 500 | `{ error: 'Internal server error' }` |

### Helper: `approveAddon(addonId)` / `declineAddon(addonId)` — `src/lib/services/job-addons.ts:83-244`

Both helpers follow the same structure. Reported below for `approveAddon` (decline differs only in the status value + the slug rendered for the second SMS).

| Step | Lines (approveAddon) | Detail |
|---|---|---|
| Fetch | 86-104 | SELECT addon + JOIN job → customer (id, first_name, last_name, email, phone) + service (name) + product (name). |
| Status precheck | 106-112 | Must be `'pending'`. If `'expired'` returns `{success:false, expired:true}` (→ 410). Otherwise returns `{success:false, error:"Addon already <status>"}` (→ 409). |
| Expiry recheck | 114-122 | If `expires_at < now()`, UPDATE row `status='expired'`, return `{success:false, expired:true}`. (Race-condition safe.) |
| Status flip | 124-136 | UPDATE `job_addons.status='approved'`, `responded_at=now()`. |
| Confirmation SMS | 138-162 | Render slug `addon_approved` (chips: `service_name`, `first_name`, `last_name`, `vehicle_description=undefined`). Send via `sendSms` with `logToConversation: true`, `customerId`, `notificationType='addon_approved'`, `contextId=addonId`. |
| Log + return | 164-165 | `console.log` + return `{success:true}`. |

### Ticket mutation

**`jobs.services` JSONB is NOT mutated.** The approved addon row stays in `job_addons`. The "ticket" formation happens lazily at checkout time — `src/app/api/pos/jobs/[id]/checkout-items/route.ts:146-172` selects `approved` addons and folds them into the line-item list returned to the POS register. Other consumer sites (`src/app/admin/jobs/[id]/page.tsx:295`, `src/app/pos/jobs/components/job-detail.tsx:814`, etc.) similarly filter `addons.filter(a => a.status === 'approved')` at render time.

### Second outbound SMS to customer

- **Approval:** slug `addon_approved`. Chips: `service_name`, `first_name`, `last_name`, `vehicle_description` (undefined here — not loaded by the helper).
- **Decline:** slug `addon_declined`. Same chip set.
- Both calls pass `logToConversation: true`, so the message lands in the customer's `conversations` thread and `messages` rows. `notificationType` is `addon_approved` / `addon_declined`. `contextId` is the addon ID.
- Customer must have a non-null `phone` for the second SMS to fire.

### Detailer notification

**NONE.** Searched the entire codebase for `addon` × `notify` × `detailer` / `employee` cross-references:

```
$ grep -rn "addon.*notify.*detailer\|detailer.*notify\|push.*detailer\|notify.*employee" src/
src/app/api/pos/jobs/[id]/reschedule/route.ts:85  (unrelated — staff reassignment in reschedule path)
```

Neither helper sends any SMS / push / in-app notification to the detailer or to staff after Approve/Decline. The PHASE8 design doc at `docs/planning/PHASE8_JOB_MANAGEMENT.md:640-641` describes detailer notification as "in-app badge + console log for now", which matches: the POS Jobs UI surfaces the addon's new status when the operator next loads / polls the job, and the helper writes a `console.log` line.

### Audit log writes to conversation thread

- Both `approveAddon` and `declineAddon` set `logToConversation: true` on their `sendSms` call, which causes `sendSms` to INSERT a `messages` row attributed to the customer's conversation. `sender_type` of those inserted rows comes from `sendSms` defaults — based on `src/lib/utils/sms.ts` (not re-opened in this audit) the convention is `sender_type='ai'` for system-generated outbound (per the prior SMS AI v2 audit's note on `sender_type='ai'` overload). `channel='sms'`.
- The conversation's `last_message_at` / `last_message_preview` are updated by the `sendSms` helper through the same `logToConversation` path.
- NO direct DB write inside the addon helpers — they delegate all conversation logging to `sendSms`.

### Error paths summary

| Path | Scenario | Helper return | HTTP code | Customer-visible UI |
|---|---|---|---|---|
| Approve | token not found | n/a (404 before helper) | 404 | "Authorization Not Found" card |
| Approve | already approved | `{success:false, error:"Addon already approved"}` | 409 | Approved status banner (client tolerates 409) |
| Approve | already declined | `{success:false, error:"Addon already declined"}` | 409 | Red error card with the message string |
| Approve | status='expired' (already flipped) | `{success:false, expired:true}` | 410 | "This authorization has expired." |
| Approve | pending but `expires_at` past | helper auto-expires, returns `{success:false, expired:true}` | 410 | Same as above. |
| Approve | UPDATE DB error | `{success:false, error:"Failed to approve addon"}` | 409 | Red error card. |

---

## §E — Twilio inbound webhook `[AUTHORIZE_ADDON]` parsing block

### Block boundaries (live HEAD)

Per Layer 3 discovery the block was cited at lines 869-913. At current HEAD (`c58ec9c6`), confirmed location:

- **L_start = 866** (block header comment "10. Addon authorization processing")
- **L_end = 913** (closing brace of `if (autoReply)` block)
- Surrounding context (auto-quote `[GENERATE_QUOTE]` parsing) ends at line 864 and outbound SMS send begins at line 915.

Source (`src/app/api/webhooks/twilio/inbound/route.ts:866-913` verbatim):

```ts
    // -------------------------------------------------------------------
    // 10. Addon authorization processing — extract and handle AUTHORIZE/DECLINE blocks
    // -------------------------------------------------------------------
    if (autoReply) {
      const { authorizeIds, declineIds, cleanedMessage } = extractAddonActions(autoReply);

      // Session 3A: chip-driven (slug `addon_authorization_expired`). Body has
      // zero chips; engine returns either the rendered body or — if operator
      // toggled the slug off — isActive:false and we skip. Conversation
      // logging intentionally NOT enabled here to preserve pre-3A behavior;
      // see CHANGELOG note flagging this for future operator decision.
      const expiredFallback = 'That authorization has expired. Would you like us to send a new one?';

      // Process authorizations
      for (const addonId of authorizeIds) {
        try {
          const result = await approveAddon(addonId);
          if (!result.success && result.expired) {
            const tpl = await renderSmsTemplate('addon_authorization_expired', {}, expiredFallback);
            if (tpl.isActive && tpl.body) {
              await sendSms(normalizedPhone, tpl.body);
            }
          }
        } catch (err) {
          console.error(`[AddonAuth] Failed to approve addon ${addonId}:`, err);
        }
      }

      // Process declines
      for (const addonId of declineIds) {
        try {
          const result = await declineAddon(addonId);
          if (!result.success && result.expired) {
            const tpl = await renderSmsTemplate('addon_authorization_expired', {}, expiredFallback);
            if (tpl.isActive && tpl.body) {
              await sendSms(normalizedPhone, tpl.body);
            }
          }
        } catch (err) {
          console.error(`[AddonAuth] Failed to decline addon ${addonId}:`, err);
        }
      }

      // Use cleaned message (blocks stripped) for the conversation
      if (authorizeIds.length > 0 || declineIds.length > 0) {
        autoReply = cleanedMessage;
      }
    }
```

### Trigger condition

The block runs when `autoReply` is non-null at the end of step 9 (auto-quote processing). `autoReply` is non-null only when the legacy `getAIResponse()` call returned a string AND the auto-quote `[GENERATE_QUOTE]` parser didn't reset it. The block then regex-extracts tokens from `autoReply`. If neither pattern matches, `authorizeIds=[]` and `declineIds=[]` and nothing happens.

### Tokens parsed

`extractAddonActions(aiResponse)` in `src/lib/services/job-addons.ts:53-77`:

- `/\[AUTHORIZE_ADDON:([a-f0-9-]+)\]/gi` — captures one UUID per match into `authorizeIds`.
- `/\[DECLINE_ADDON:([a-f0-9-]+)\]/gi` — captures one UUID per match into `declineIds`.
- After extraction, both patterns are stripped from `aiResponse` to produce `cleanedMessage`.

There are no variant tokens (no `AUTHORIZE_ALL_ADDONS`, no `APPROVE_ADDON`, no shorthand). The regex is case-insensitive but the prompt always emits the canonical uppercase form.

### What it calls

| Function | Where | Outcome |
|---|---|---|
| `approveAddon(addonId)` | `src/lib/services/job-addons.ts:83` | Full approve path — status flip + confirmation SMS to customer (§D). |
| `declineAddon(addonId)` | `src/lib/services/job-addons.ts:172` | Full decline path — status flip + confirmation SMS to customer (§D). |
| `renderSmsTemplate('addon_authorization_expired', {}, fallback)` + `sendSms` | inline | Only when the helper returns `{success:false, expired:true}`. Sends a customer-visible follow-up explaining the expiration. Zero chips. |

The block does NOT use `notifyStaff()` and does NOT mutate any other table.

### Follow-up SMS

Per inline comment at `route.ts:872-876`: when `addon_authorization_expired` fires, **conversation logging is intentionally NOT enabled** (`sendSms` called without `{logToConversation: true}`). This is flagged in CHANGELOG entry "2026-04-26 Session 3A" lines ~5613 as "Preserved-for-now: addon_authorization_expired conversation logging" — pending operator decision.

### When does this block actually fire in production?

**Designed answer (per `docs/planning/PHASE8_JOB_MANAGEMENT.md:670-705`):**
- (b) **a fallback for customers who reply "YES" / "approve" / similar without clicking the link.** The AI is taught (via `buildAddonPromptSection` injection into the system prompt) to detect such replies and emit `[AUTHORIZE_ADDON:<uuid>]` or `[DECLINE_ADDON:<uuid>]` markers. The webhook strips those markers and routes them to `approveAddon` / `declineAddon`.

**Observed answer (production DB, 2026-05-19):**
- **Never fired.** Evidence:
  - Live query `SELECT id,body,created_at,sender_type,direction,conversation_id FROM messages WHERE body ILIKE '%[AUTHORIZE_ADDON%' OR body ILIKE '%[DECLINE_ADDON%' ORDER BY created_at DESC LIMIT 20` → **empty result** (zero rows).
  - Live query `SELECT * FROM job_addons LIMIT 20` → **empty result** (zero rows — entire table empty).
- The entire upstream chain has never been exercised: the shop is pre-launch, no detailer has used "Flag Issue" against a real customer, no `addon_authorization` SMS has been sent, so no customer has had reason to reply with affirmative text.

### AI prompt that emits the tokens

The token-emission rules live in `src/lib/services/job-addons.ts:310-358` inside `buildAddonPromptSection(addons)`. The function returns a string that is concatenated into the legacy single-shot system prompt at `src/lib/services/messaging-ai.ts:222-223`. Exact rules (`job-addons.ts:339-345`):

```
RULES:
- If the customer says yes, approve, go ahead, do it, sounds good, or similar affirmative → confirm you'll let the team know and output [AUTHORIZE_ADDON:${addon.id}]
- If the customer says no, decline, skip it, not today, or similar negative → acknowledge gracefully, mention they can get it done next visit, and output [DECLINE_ADDON:${addon.id}]
- If they ask questions about the service, timing, or price → answer from the context above. Be helpful and informative.
- You CANNOT negotiate price. If they push back on cost, empathize and suggest they call the shop to discuss options.
- If they ask "how long will it take?" → tell them the estimated additional time (${addon.pickup_delay_minutes} minutes).
- Only output the [AUTHORIZE_ADDON] or [DECLINE_ADDON] block ONCE per addon.
```

Only the legacy single-shot path injects these rules. The SMS AI v2 system prompt at `src/lib/sms-ai/system-prompt.ts` does not.

---

## §F — Addon DB schema

### Primary table: `job_addons` (per `docs/dev/DB_SCHEMA.md:1124-1161` + migration `20260212000003_phase8_jobs_schema.sql:124-175`)

| Column | Type | Constraints | Role |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT `gen_random_uuid()` | — |
| `job_id` | UUID | NOT NULL, FK → `jobs(id)` ON DELETE CASCADE | Parent job. |
| `service_id` | UUID | FK → `services(id)` ON DELETE SET NULL | Catalog service (mutually exclusive with `product_id` / `custom_description`). |
| `product_id` | UUID | FK → `products(id)` ON DELETE SET NULL | Catalog product. |
| `custom_description` | TEXT | — | Free-text item when neither service_id nor product_id. |
| `price` | NUMERIC(10,2) | NOT NULL | Dollars (pre-Money-Unify column). |
| `discount_amount` | NUMERIC(10,2) | NOT NULL, DEFAULT 0 | Dollars. |
| `status` | TEXT | NOT NULL, DEFAULT `'pending'`, CHECK in `('pending','approved','declined','expired')` | Enum-by-CHECK. |
| `authorization_token` | TEXT | UNIQUE, NOT NULL | UUID v4 string; URL-path component. |
| `message_to_customer` | TEXT | — | Operator-typed message body (rendered on landing page + used for resend SMS body). |
| `sent_at` | TIMESTAMPTZ | — | When the initial SMS/email was attempted. |
| `responded_at` | TIMESTAMPTZ | — | When Approve/Decline POST returned, OR when auto-expired. |
| `expires_at` | TIMESTAMPTZ | — | `sent_at + addon_auth_expiration_minutes` (default 30). |
| `pickup_delay_minutes` | INTEGER | DEFAULT 0 | Additional time the addon will take. |
| `photo_ids` | UUID[] | DEFAULT `'{}'::uuid[]` | References to `job_photos` rows captured during the flag-issue wizard. |
| `customer_notified_via` | TEXT[] | — | Array tracking which channels succeeded — possible values today: `'sms'`, `'email'`. |
| `created_by` | UUID | FK → `employees(id)` ON DELETE SET NULL | The detailer who initiated. |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT `now()` | — |
| `issue_type` | TEXT | CHECK NULL or in 10-value enum below | — |
| `issue_description` | TEXT | — | Free-text used only when `issue_type='other'`. |

### CHECK constraints

- `job_addons_issue_type_check`: `issue_type IS NULL OR issue_type IN ('scratches','water_spots','paint_damage','pet_hair_stains','interior_stains','odor','headlight_haze','wheel_damage','tar_sap_overspray','other')` (10 values).
- `job_addons_status_check`: `status IN ('pending','approved','declined','expired')` (4 values).

### Indexes

- `idx_job_addons_job (job_id)`
- `idx_job_addons_status (status)`
- `idx_job_addons_token (authorization_token)` + UNIQUE `job_addons_authorization_token_key (authorization_token)`
- `idx_job_addons_pending (status, expires_at) WHERE status='pending'` — partial index for the GET `/api/pos/jobs/[id]/addons` route's stale-expire UPDATE pattern.

### RLS

Enabled on `job_addons` (migration line 164: `ALTER TABLE job_addons ENABLE ROW LEVEL SECURITY`) but policies are wide-open:

```sql
CREATE POLICY job_addons_select ON job_addons FOR SELECT TO authenticated USING (true);
CREATE POLICY job_addons_insert ON job_addons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY job_addons_update ON job_addons FOR UPDATE TO authenticated USING (true);
```

No DELETE policy (delete attempts via authenticated session would be denied). All code-path writes go through `createAdminClient()` (service-role) which bypasses RLS entirely, so the wide-open policies have no operational impact today.

### Related setting

- `business_settings.addon_auth_expiration_minutes` (seeded by `20260212000003_phase8_jobs_schema.sql:181` to `'"30"'`, JSONB string). Read by both POST + resend endpoints.

### Distinct from: `service_addon_suggestions`

A separate table `service_addon_suggestions` exists (referenced in FILE_TREE.md migrations) used by the **in-store** add-on chip UI (`src/app/pos/components/addon-suggestions.tsx`). That table is a catalog of "service X suggests add-on Y at combo-price Z" — NOT related to the authorization flow. Combo pricing strategy documented in `docs/planning/ADDON_SEED_PLAN.md`. The two paths share the word "addon" but are entirely separate features and write to different tables.

### Production state

- Row count at audit time (2026-05-19): **0 rows.**

---

## §G — AI context exposure of pending addons

Three AI-bearing context paths checked:

| Context source | File | Loads `job_addons`? |
|---|---|---|
| Legacy SMS AI single-shot system prompt | `src/lib/services/messaging-ai.ts:202-211` | **YES.** Calls `getPendingAddonsForCustomer(customerId)` → `buildAddonPromptSection(addons)` → concatenated into the system prompt. |
| SMS AI v2 system prompt | `src/lib/sms-ai/system-prompt.ts` | **NO.** Zero `addon` mentions in the file. The `{CUSTOMER_CONTEXT}` placeholder is filled by `getCustomerContext()` which also does not load addons. |
| `getCustomerContext()` (Layer 1+2 helper) | `src/lib/services/customer-context.ts` | **NO.** Loads customer + vehicles + upcoming_appointments + recent_quotes + recent_transactions + conversation_history. No `job_addons` query. |
| Voice-agent `/api/voice-agent/context` endpoint | `src/app/api/voice-agent/context/route.ts` | **NO.** Zero `addon` mentions. |
| Legacy SMS handler customer-context block | `src/app/api/webhooks/twilio/inbound/route.ts:520-558` | **NO** — that block builds `customerCtx` from a 5-parallel-query block (customers, transactions, vehicles, appointments, quotes). The addon-context injection is downstream in `messaging-ai.ts` via the `customerId` argument, not from `customerCtx`. |

Confirmed via:
```
$ grep -rln "addon" src/lib/sms-ai/        → (empty)
$ grep -n "addon\|job_addons" src/lib/services/customer-context.ts → (empty)
$ grep -n "addon\|job_addons" src/app/api/voice-agent/context/route.ts → (empty)
$ grep -n "addon\|job_addons" src/app/api/webhooks/twilio/inbound/route.ts → only the §E parse block (import + parse+approve+decline calls)
```

### Path map (where addon context exists today)

```
Inbound SMS
  │
  ├─ shouldUseSmsAiV2(phone) === false  →  Legacy single-shot getAIResponse()
  │                                          │
  │                                          ├─ buildSystemPrompt() includes buildAddonPromptSection
  │                                          │   if customerId has pending addons
  │                                          ├─ Model emits [AUTHORIZE_ADDON:<id>] or [DECLINE_ADDON:<id>]
  │                                          └─ Webhook §E block parses + dispatches
  │
  └─ shouldUseSmsAiV2(phone) === true   →  SMS AI v2 agent runner
                                             │
                                             ├─ buildV2SystemPrompt() — NO addon awareness
                                             ├─ Tool surface (10 tools) — NO addon tool
                                             ├─ getCustomerContext() — NO addon data
                                             └─ Model has no context, no rule, no tool → cannot approve/decline
```

---

## §H — Cross-references

### Docs that mention the addon authorization flow

| Path | Relevance |
|---|---|
| `docs/planning/PHASE8_JOB_MANAGEMENT.md:184-705` | **The original design doc.** Defines `job_addons` schema, the issue-type enum, the wizard step-by-step UX, the AI prompt injection rules (lines 670-705), the webhook parsing pattern. Single source of design intent. |
| `docs/planning/ADDON_SEED_PLAN.md` | UNRELATED — design for `service_addon_suggestions` (in-store combo pricing), not `job_addons`. |
| `docs/dev/SMS_AI_AUTOREPLY_AUDIT_2026-05-19.md:155-160` | One-line mention in §3 system-prompt assembly: "Optional pending-addon authorization context (lines 202-211)". |
| `docs/dev/SMS_AI_V2_AUDIT_2026-05-19.md:421-430` | Webhook flow diagram entry: "Parse [AUTHORIZE_ADDON:<id>] / [DECLINE_ADDON:<id>] blocks. Call approveAddon() / declineAddon() per ID. If addon expired, send 'addon_authorization_expired' template SMS." |
| `docs/dev/SMS_AI_V2_LAYER_3_DISCOVERY.md` | Cites the webhook block at lines 869-913 as a parallel parse-block (alongside auto-quote `[GENERATE_QUOTE]`). Frames the question this audit answers. |
| `docs/dev/DB_SCHEMA.md:1124-1161` | Authoritative current schema for `job_addons`. |
| `docs/dev/SERVICE_CATALOG.md` | Mentions addon-suggestion catalog (different table). |
| `docs/dev/LIFECYCLE_AUDIT_2026-05-15.md` | References approved-addons in lifecycle calculations. |
| `docs/dev/APPOINTMENT_JOB_STATUS_FLOW_AUDIT_2026-05-17.md` | References `job_addons` rows being joined at checkout. |
| `docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md` | Touches on the addon → ticket join semantics. |
| `docs/planning/HARDCODED_AUDIT.md` | Lists `addon_authorization` SMS as one of the originally-hardcoded slugs (migrated in Session 3B). |

### CHANGELOG entries

| Date | Entry | Significance |
|---|---|---|
| 2026-03-30 (Session 13X) | "fix: addon approved/declined SMS not firing" | Pre-existing bug: both Approve/Decline endpoints lacked the second SMS to the customer. Fix rewired both endpoints to delegate to `approveAddon()` / `declineAddon()` helpers. Establishes the current "delegate to job-addons.ts" structure. |
| 2026-04-26 (Session 3A) | "refactor(sms): first hardcoded slug migration — `addon_authorization_expired` + `quote_sms_postcall`" | The `addon_authorization_expired` slug used inside the §E webhook block was migrated to chip-driven `renderSmsTemplate`. Inline comment in §E reflects this. Also documents a "Preserved-for-now" note that the expiry-reply SMS does NOT use `logToConversation: true` (operator decision pending). |
| 2026-04-26 (Session 3B) | "refactor(sms): addon authorization slug migration" | Both `addon_authorization` (initial outbound) and `addon_authorization_resend` slugs migrated from hardcoded to chip-driven. Includes a fix for the `addon_authorization_resend` "literal 'null'" bug when `message_to_customer` was NULL. Notes `final_price` chip uses Path A (literal `$` in template, numeric chip value) — internally inconsistent with the Path B convention used elsewhere; flagged for future cleanup at CHANGELOG line ~5515. |
| 2026-01-21 (estimated, Phase 8 build) | "fix: chip-driven 'your your vehicle' bug class in addon_authorization template" | Per CHANGELOG line 6707-6708: a known prose-restructuring bug in the hardcoded SMS body lived in `pos/jobs/[id]/addons/route.ts:189-195`; resolution deferred to slug migration (Session 42AC). Session 3B addressed it. |
| Various | Multiple "addon_approved", "addon_declined" chip tweaks | Chip surfaces — `first_name`, `last_name`, `vehicle_description`, `service_name` — adjusted across sessions 13X, 2D, others. |

### Inline JSDoc / comments

- `src/lib/services/job-addons.ts:1-6` — module-level JSDoc explaining "Handles addon authorization (approve/decline) via both web link and AI SMS. All status transitions, confirmation messages, and edge cases managed here."
- `src/lib/services/job-addons.ts:49-77` — section header for `extractAddonActions` documenting the two regex patterns.
- `src/lib/services/job-addons.ts:330-345` — `RULES:` block inside the AI prompt — the canonical authoritative spec for AI behavior on addon-bearing replies.
- `src/app/api/pos/jobs/[id]/addons/route.ts:227-237` + `:127-134` — long inline comments explaining the chip-driven slug migration (Session 3B), including the Path A vs Path B `final_price` convention and the optional `first_name` REMOVE_LINE behavior on rare blank-name customers.
- `src/app/api/webhooks/twilio/inbound/route.ts:872-876` — comment explaining the "Preserved-for-now" expiry-reply SMS conversation-logging gap.

### Admin UI / tooltips

No admin UI page exposes the addon-authorization flow for direct editing — `business_settings.addon_auth_expiration_minutes` is editable through the generic business-settings admin path but not in a dedicated "addon settings" pane. No user-facing help page references the flow.

---

## Follow-ups surfaced (not fixed in this session)

These are observations made during the audit. Listed here without prescription so future sessions can pick them up if and when warranted.

1. **`job_addons` table is empty in production (0 rows as of 2026-05-19).** The entire authorization flow has shipped but never been exercised against a real customer. Any latent bugs in §B-§E are observation-only — there is no production behavior to compare against. Layer 4 routing decisions cannot rely on observed production traffic for this flow.

2. **`approveAddon()` and `declineAddon()` do NOT notify the detailer.** Per PHASE8 design ("in-app badge + console log for now"), the detailer learns the customer's response only via UI polling. There is no SMS / push / in-app real-time signal to the staff member who initiated the flag-issue. If a customer approves and the detailer doesn't refresh, the addon could miss its execution window.

3. **`jobs.services` JSONB is NOT mutated when an addon is approved.** The approved row stays in `job_addons` and is joined into the line items only at checkout time (`checkout-items/route.ts:146-172`). This is a fact, not a bug — but Layer 4 planning needs to be aware that "the ticket has the addon" is not a JSONB write-event but a JOIN at render time.

4. **SMS AI v2 has zero addon awareness.** Neither `system-prompt.ts`, `tools.ts`, nor `customer-context.ts` mention `job_addons`. If Layer 4 routes a v2-enabled customer's affirmative reply to the v2 agent, the addon stays `pending` until expiration. The legacy single-shot path is the only AI path that can complete the loop via the §E parse block today.

5. **RLS policies on `job_addons` are wide-open `USING (true) WITH CHECK (true)`.** All real writes go through service-role admin client, so RLS does nothing in practice. If any future direct-from-browser write path is added (e.g., a customer self-serve "I'll think about it" button), policies need real predicates.

6. **`/api/authorize/[token]/route.ts` (GET, 72 lines) appears to be an unused public-read endpoint.** The customer landing page server-renders the same data directly via `createAdminClient()` and does NOT fetch from this GET. No other consumer was found via grep. Worth confirming before relying on it as a public-facing read API.

7. **`addon_authorization_expired` SMS sent from the §E webhook block uses `sendSms(phone, body)` without `logToConversation: true`.** Inline comment at `webhooks/twilio/inbound/route.ts:872-876` says this is "Preserved-for-now" pending operator decision. The customer's expiry-reply confirmation therefore does NOT land in the conversation thread — a gap for staff visibility.

8. **Email CTA `?action=approve|decline` query-string auto-submit (`authorization-client.tsx:14-20`) is replay-safe only because the helper rejects non-pending statuses.** If the link is shared, anyone with the URL can attempt the action; first attempt wins, subsequent attempts get 409. There is no IP / device binding.

9. **`final_price` chip in `addon_authorization` slug uses Path A (literal `$` in template body, numeric chip value).** Inconsistent with the Path B convention (chip value carries the `$` symbol) used by most other slugs. CHANGELOG line ~5515 flags this for future cleanup.

10. **Two different "addon" features in the codebase share the word.** `service_addon_suggestions` (in-store combo pricing chips) and `job_addons` (mid-job authorization flow) are entirely separate tables, code paths, and UX surfaces. The naming overlap can mislead grep-driven exploration. Worth a rename consideration but out of scope here.

---

## Verification

```
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
27
$ git status
# only docs/ files appear
```

Baseline preserved.
