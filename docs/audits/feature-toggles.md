# Feature Toggle Audit Report

**Date:** 2026-02-11
**Scope:** All 13 feature flags in `feature_flags` table
**Method:** Full codebase search of `src/` for every flag key, `FEATURE_FLAGS.`, `useFeatureFlag(`, and all feature-specific code paths

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total flags defined | 13 |
| **Category A — WIRED (flag is checked before feature runs)** | 4 |
| **Category B — ORPHAN (feature built, flag NOT checked)** | 5 |
| **Category C — PLACEHOLDER (feature not built yet)** | 3 |
| **Category D — SPECIAL (handled separately)** | 1 (qbo_enabled) |
| Server-side flag-checking utility | **NONE** (critical gap) |

**Highest priority finding:** 5 flags exist where the feature runs unconditionally regardless of the toggle state. Admins think they can disable these features, but the toggles do nothing.

---

## 1. Summary Table

| # | Flag Key | Seed Default | Category | Feature Built? | Flag Checked? | What Happens When OFF | Action Needed |
|---|----------|-------------|----------|---------------|---------------|----------------------|---------------|
| 1 | `loyalty_rewards` | `true` | **B — ORPHAN** | Yes (POS earn/redeem, portal, template vars) | No | Nothing — loyalty runs unconditionally | Wire flag into earn/redeem API routes + POS UI + portal |
| 2 | `recurring_services` | `false` | **C — PLACEHOLDER** | No (Phase 10, dormant) | N/A | N/A | Keep — Phase 10 placeholder |
| 3 | `online_booking_payment` | `true` | **A — WIRED** | Yes (Stripe checkout in booking) | Yes (booking.ts + wizard) | Payment step skipped, books without payment | None — works correctly |
| 4 | `sms_marketing` | `true` | **B — ORPHAN** | Yes (campaigns, automations, lifecycle) | No | Nothing — SMS campaigns send unconditionally | Wire into campaign send + scheduled send routes |
| 5 | `email_marketing` | `true` | **B — ORPHAN** | Yes (Mailgun campaigns) | No | Nothing — email campaigns send unconditionally | Wire into campaign send + scheduled send routes |
| 6 | `google_review_requests` | `true` | **A — WIRED** | Yes (lifecycle engine, settings page) | Yes (lifecycle-engine + reviews page) | Review SMS skipped by lifecycle engine | None — works correctly |
| 7 | `two_way_sms` | `true` | **B — ORPHAN** | Yes (inbound webhook, AI, inbox) | No | Nothing — Twilio webhook processes all inbound SMS | Wire into inbound webhook |
| 8 | `waitlist` | `true` | **A — WIRED** | Yes (API + admin UI + cancel notifications) | Yes (waitlist API + cancel route) | POST rejects with 400; cancellations skip waitlist notify | None — works correctly |
| 9 | `photo_documentation` | `false` | **C — PLACEHOLDER** | No (Phase 8) | N/A | N/A | Keep — Phase 8 placeholder |
| 10 | `cancellation_fee` | `true` | **B — ORPHAN** | Yes (cancel dialog fee field, DB column) | No | Nothing — cancel dialog always shows fee input | Wire into cancel dialog + cancel API |
| 11 | `referral_program` | `false` | **C — PLACEHOLDER** | No (not on any phase) | N/A | N/A | Consider removal or assign to phase |
| 12 | `mobile_service` | `true` | **B — ORPHAN** | Yes (booking flow, zones, surcharges) | No | Nothing — mobile toggle in booking always visible | Wire into booking configure step |
| 13 | `qbo_enabled` | `false` | **D — SPECIAL** | Yes (full QBO sync) | Yes (`isQboSyncEnabled()` + status route) | All QBO sync blocked | None — handled in separate session |

---

## 2. Infrastructure Overview

### Table Schema
```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### RLS Policies
- `feature_flags_select`: All authenticated users can **read**
- `feature_flags_write`: Only `is_super_admin()` can **write**

### Client-Side Hook (`src/lib/hooks/use-feature-flag.ts`)
- `useFeatureFlag(key)` — returns `{ enabled, loading }` with 60s module-level cache
- `useFeatureFlags()` — returns all flags with `refresh()` method
- `invalidateFeatureFlagCache()` — clears module cache (called after toggle)
- Uses `createClient()` (RLS) — queries `feature_flags` table directly

### Server-Side Flag Checking
**NONE.** No `checkFeatureFlag()` or `getFeatureFlag()` utility exists. Each API route that needs a flag does an inline query:
```typescript
const { data: flag } = await admin
  .from('feature_flags')
  .select('enabled')
  .eq('key', FEATURE_FLAGS.SOME_KEY)
  .single();
```

This is a **critical gap** — there's no standardized server-side utility, so adding flag checks requires copy-pasting the same 4-line query pattern.

### Feature Toggles Admin Page (`src/app/admin/settings/feature-toggles/page.tsx`)
- Lists all flags sorted alphabetically
- Switch toggle per flag, directly updates DB
- Invalidates client cache on change
- No categories/grouping — flat list
- 112 lines, clean implementation

---

## 3. Detailed Findings Per Flag

### FLAG 1: `loyalty_rewards` — ORPHAN

**Seed:** enabled=`true`, name="Loyalty & Rewards", description="Customer points system (1pt per $1 eligible spend)"

**Feature scope (all running WITHOUT flag check):**
- `src/app/api/pos/loyalty/earn/route.ts` — earns points on POS transactions
- `src/app/api/pos/loyalty/redeem/route.ts` — redeems points at POS
- `src/app/api/pos/transactions/route.ts` — auto-earns loyalty on transaction completion
- `src/app/pos/components/loyalty-panel.tsx` — POS loyalty UI
- `src/app/pos/components/quotes/quote-loyalty-panel.tsx` — quote loyalty UI
- `src/app/(account)/account/loyalty/page.tsx` — customer portal loyalty page
- Template vars: `{loyalty_points}`, `{loyalty_value}` in all send routes

**What should happen when OFF:** Hide loyalty panel in POS, skip earn/redeem, hide portal loyalty page, omit loyalty template vars.

**Risk level:** MEDIUM — disabling this flag misleads admins into thinking loyalty is off while points continue accumulating.

---

### FLAG 2: `recurring_services` — PLACEHOLDER

**Seed:** enabled=`false`, name="Recurring/Subscription Services"

**Codebase search:** Zero references outside `constants.ts`. No recurring service code exists.

**Status:** Phase 10 (Dormant). Keep as placeholder.

---

### FLAG 3: `online_booking_payment` — WIRED

**Seed:** enabled=`true`, name="Online Booking Requires Payment"

**Flag check locations:**
1. `src/lib/data/booking.ts:239-242` — fetches flag, sets `require_payment` in `BookingConfig`
2. `src/components/booking/booking-wizard.tsx:128` — reads `requirePayment` from config
   - Line 569-571: Button text changes ("Continue to Payment" vs "Confirm Booking")
   - `handleReviewContinue()`: Skips payment step (step 6) when `requirePayment=false`

**Behavior when OFF:** Customers book without paying. They see "Confirm Booking" instead of "Continue to Payment". Payment step is completely skipped.

**Status:** Correctly wired. No action needed.

---

### FLAG 4: `sms_marketing` — ORPHAN

**Seed:** enabled=`true`, name="SMS Marketing"

**Feature scope (all running WITHOUT flag check):**
- `src/app/api/marketing/campaigns/send/route.ts` — sends SMS campaigns
- `src/app/api/marketing/campaigns/process-scheduled/route.ts` — sends scheduled campaigns
- `src/app/api/cron/lifecycle-engine/route.ts` — sends lifecycle SMS (partially gated by `google_review_requests` but NOT by `sms_marketing`)
- `src/app/admin/marketing/campaigns/` — campaign creation/management UI
- `sendMarketingSms()` — no flag check, only consent + frequency cap

**What should happen when OFF:** Block all campaign sends (immediate + scheduled), block lifecycle SMS, possibly hide campaign creation UI or show "SMS Marketing is disabled" banner.

**Risk level:** HIGH — an admin who disables SMS marketing expects all marketing SMS to stop. Currently they don't.

---

### FLAG 5: `email_marketing` — ORPHAN

**Seed:** enabled=`true`, name="Email Marketing"

**Feature scope (all running WITHOUT flag check):**
- `src/app/api/marketing/campaigns/send/route.ts` — sends email campaigns via Mailgun
- `src/app/api/marketing/campaigns/process-scheduled/route.ts` — sends scheduled email campaigns
- Campaign wizard allows email channel selection unconditionally

**What should happen when OFF:** Block email campaign sends, possibly hide email channel option in campaign wizard.

**Risk level:** HIGH — same issue as `sms_marketing`.

---

### FLAG 6: `google_review_requests` — WIRED

**Seed:** enabled=`true`, name="Google Review Requests"

**Flag check locations:**
1. `src/app/api/cron/lifecycle-engine/route.ts:343-349` — server-side: queries flag, stores in `reviewFlagEnabled`
   - Lines 396-401: If template uses `{google_review_link}` or `{yelp_review_link}` AND flag is disabled → execution skipped with reason "Google review requests feature disabled"
2. `src/app/admin/settings/reviews/page.tsx:41-42` — client-side: `useFeatureFlag(FEATURE_FLAGS.GOOGLE_REVIEW_REQUESTS)` shows Enabled/Disabled badge + links to Feature Toggles

**Behavior when OFF:** Lifecycle engine skips any execution whose template references review link variables. Settings page shows "Disabled" badge.

**Important nuance:** The lifecycle engine only gates executions that USE review link variables. If a lifecycle rule's template doesn't include `{google_review_link}` or `{yelp_review_link}`, it sends even when this flag is off. This is by design — non-review automations should still fire.

**Status:** Correctly wired. No action needed.

---

### FLAG 7: `two_way_sms` — ORPHAN

**Seed:** enabled=`true`, name="Two-Way SMS"

**Feature scope (all running WITHOUT flag check):**
- `src/app/api/webhooks/twilio/inbound/route.ts` — processes ALL inbound SMS (conversation creation, AI routing, auto-quote, STOP/START handling)
- `src/app/admin/messaging/` — team inbox UI (conversation list, thread view)
- `src/app/api/messaging/` — conversation/message CRUD APIs
- `src/lib/services/messaging-ai.ts` — AI auto-responder
- AI-initiated auto-quote flow

**What should happen when OFF:** Inbound SMS webhook should return 200 (acknowledge to Twilio) but skip processing. AI auto-responder should not fire. Inbox could still show historical conversations in read-only mode.

**Risk level:** MEDIUM — the inbound webhook is external (Twilio calls it), so even when "disabled" the webhook still runs. However, it would be reasonable to skip creating conversations and AI replies.

---

### FLAG 8: `waitlist` — WIRED

**Seed:** enabled=`true`, name="Waitlist"

**Flag check locations:**
1. `src/app/api/waitlist/route.ts:73-85` — **hard gate**: POST returns 400 "Waitlist is not currently available" when disabled
2. `src/app/api/appointments/[id]/cancel/route.ts:81-91` — **soft gate**: When enabled, cancellations auto-notify matching waitlist entries

**Behavior when OFF:** Public join endpoint rejects requests. Cancellations don't notify waitlist. GET endpoint (admin list) still works (no flag check on GET — admin can still view existing entries).

**Admin UI:** `src/app/admin/appointments/waitlist/page.tsx` (437 lines) — no flag check on the page itself. Accessible regardless of flag state.

**Minor gap:** Admin waitlist page could show a banner when the flag is off (informational, not blocking — admin should still be able to manage existing entries).

**Status:** Correctly wired for core functionality. Minor UI improvement possible.

---

### FLAG 9: `photo_documentation` — PLACEHOLDER

**Seed:** enabled=`false`, name="Photo Documentation"

**Codebase search:** Zero references outside `constants.ts`. No photo documentation code exists.

**Status:** Phase 8 (Not started). Keep as placeholder.

---

### FLAG 10: `cancellation_fee` — ORPHAN

**Seed:** enabled=`true`, name="Cancellation Fee Enforcement"

**Feature scope (all running WITHOUT flag check):**
- `src/app/admin/appointments/components/cancel-appointment-dialog.tsx:96,106` — fee input always visible in cancel dialog
- `src/app/api/appointments/[id]/cancel/route.ts:55` — saves `cancellation_fee` to DB unconditionally
- `src/app/admin/appointments/components/appointment-detail-dialog.tsx:205-206` — displays fee in detail view

**What should happen when OFF:** Hide fee input in cancel dialog. API should reject or ignore `cancellation_fee` field. Display should still show historical fees.

**Risk level:** LOW — cancellation fees are manually entered by admin, not automated. But the toggle description says "Less than 24hr cancellation fee" suggesting it should enforce a policy, not just show/hide a field.

---

### FLAG 11: `referral_program` — PLACEHOLDER

**Seed:** enabled=`false`, name="Referral Program"

**Codebase search:** Zero references outside `constants.ts`. No referral code exists.

**Status:** Not assigned to any phase. Consider removal if not planned, or assign to Phase 11 (Intelligence & Growth).

---

### FLAG 12: `mobile_service` — ORPHAN

**Seed:** enabled=`true`, name="Mobile Service"

**Feature scope (all running WITHOUT flag check):**
- `src/components/booking/step-configure.tsx:153` — "Mobile Service" switch always visible in booking
- `src/components/booking/booking-wizard.tsx` — mobile zone selection, surcharge calculation
- `src/app/api/book/route.ts:248-249` — mobile surcharge included in total
- `src/lib/data/booking.ts:180` — `getMobileZones()` always fetches zones
- `src/app/admin/settings/mobile-zones/page.tsx` — admin zone management (454 lines)

**What should happen when OFF:** Hide "Mobile Service" switch in booking flow. Skip mobile zone fetch. Admin mobile zones page could show "Feature disabled" banner.

**Risk level:** MEDIUM — if an admin turns this off, customers should not see mobile booking options. Currently they always do.

---

### FLAG 13: `qbo_enabled` — SPECIAL (Separate Session)

**Seed:** enabled=`false`, name="QuickBooks Online Integration"

**Flag check locations:**
1. `src/lib/qbo/settings.ts:75-82` — `isQboSyncEnabled()` checks flag first, then connection status
2. `src/app/api/admin/integrations/qbo/status/route.ts:49-53` — returns flag state in API response

**All sync engines** (`sync-customer.ts`, `sync-catalog.ts`, `sync-transaction.ts`) call `isQboSyncEnabled()` before any operation.

**Migration history:** Added → Removed → Restored as master toggle. `business_settings.qbo_enabled` was removed; `feature_flags.qbo_enabled` is the single source of truth.

**Status:** Correctly wired. Being handled in a separate session — DO NOT touch.

---

## 4. Critical Gaps — Category B (Orphan Flags)

These are the **highest priority** issues. The toggle switch on the Feature Toggles page does nothing for these features.

### Gap 1: `loyalty_rewards` — Loyalty always active
**Impact:** Points accumulate, customers redeem, portal shows loyalty regardless of toggle.
**Fix locations:**
- `src/app/api/pos/loyalty/earn/route.ts` — check flag, return early if disabled
- `src/app/api/pos/loyalty/redeem/route.ts` — check flag, return error if disabled
- `src/app/api/pos/transactions/route.ts` — skip loyalty earn on completion if disabled
- `src/app/pos/components/loyalty-panel.tsx` — hide panel if disabled
- `src/app/(account)/account/loyalty/page.tsx` — show "not available" if disabled

### Gap 2: `sms_marketing` + `email_marketing` — Campaigns send regardless
**Impact:** Even when "disabled," scheduled campaigns fire, lifecycle SMS sends (non-review).
**Fix locations:**
- `src/app/api/marketing/campaigns/send/route.ts` — check `sms_marketing`/`email_marketing` by channel
- `src/app/api/marketing/campaigns/process-scheduled/route.ts` — same check
- `src/app/api/cron/lifecycle-engine/route.ts` — check `sms_marketing` before ANY lifecycle SMS (not just review ones)

### Gap 3: `two_way_sms` — Inbound processing unconditional
**Impact:** AI auto-responder runs, conversations created, auto-quotes generated regardless.
**Fix locations:**
- `src/app/api/webhooks/twilio/inbound/route.ts` — check flag early; if disabled, acknowledge Twilio but skip processing (or only handle STOP/START for compliance)

### Gap 4: `cancellation_fee` — Fee input always visible
**Impact:** Low risk (admin-entered), but toggle misleads.
**Fix locations:**
- `src/app/admin/appointments/components/cancel-appointment-dialog.tsx` — conditionally show fee field
- `src/app/api/appointments/[id]/cancel/route.ts` — ignore fee when flag disabled

### Gap 5: `mobile_service` — Mobile booking always available
**Impact:** Customers see mobile option even when disabled.
**Fix locations:**
- `src/components/booking/step-configure.tsx` — hide mobile switch if disabled
- `src/lib/data/booking.ts` — skip `getMobileZones()` fetch if disabled

---

## 5. Missing Infrastructure: Server-Side Flag Utility

Currently, each API route that checks a flag does an inline 4-line query. This should be a shared utility.

**Recommended:** Create `src/lib/utils/feature-flags.ts`:
```typescript
import { createAdminClient } from '@/lib/supabase/admin';

export async function isFeatureEnabled(key: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('feature_flags')
    .select('enabled')
    .eq('key', key)
    .single();
  return data?.enabled ?? false;
}
```

This would:
- Standardize the server-side check pattern
- Make it trivial to add flag checks to new API routes
- Allow future enhancements (server-side caching, logging, etc.)

---

## 6. Features That Might Need Toggles

### Currently controlled outside feature flags:

| Feature | Current Mechanism | Should it be a feature flag? |
|---------|-------------------|------------------------------|
| AI Auto-Responder | 3 layers: conversation `is_ai_enabled`, business settings `messaging_ai_unknown_enabled` + `messaging_ai_customers_enabled` | No — current layered approach is better (global + audience + per-conversation) |
| Auto-Quote via SMS | Embedded in AI flow (no separate toggle) | Maybe — could be a sub-toggle under AI settings rather than a feature flag |
| After-Hours Auto-Responder | Business hours logic in inbound webhook | No — derived behavior, not a toggleable feature |
| Coupon Engine | Per-coupon `status` field (active/disabled) | No — per-item control is appropriate |
| Conversation Auto-Close/Archive | Business settings (hours/days) | No — config values (0 = disabled) work fine |
| Online Store | Doesn't exist yet (Phase 9) | Yes — should add flag when built |
| Inventory Management | Partially built (Phase 6) | Consider — hide nav/pages when not ready |

---

## 7. Suggested Toggle Categories

The Feature Toggles page currently shows a flat alphabetical list. Grouping would improve UX:

### Core POS
- `loyalty_rewards` — Loyalty & Rewards
- `cancellation_fee` — Cancellation Fee Enforcement

### Booking
- `online_booking_payment` — Online Booking Requires Payment
- `mobile_service` — Mobile Service
- `waitlist` — Waitlist

### Marketing
- `sms_marketing` — SMS Marketing
- `email_marketing` — Email Marketing
- `google_review_requests` — Google Review Requests

### Communication
- `two_way_sms` — Two-Way SMS

### Integrations
- `qbo_enabled` — QuickBooks Online Integration

### Future (disabled, not yet built)
- `recurring_services` — Recurring/Subscription Services
- `photo_documentation` — Photo Documentation
- `referral_program` — Referral Program

---

## 8. Recommendations Summary

### Priority 1 — Wire Orphan Flags (5 flags)
1. Create `src/lib/utils/feature-flags.ts` server-side utility
2. Wire `sms_marketing` into campaign send routes + lifecycle engine
3. Wire `email_marketing` into campaign send routes
4. Wire `loyalty_rewards` into POS earn/redeem + portal
5. Wire `two_way_sms` into inbound webhook (skip processing when off, but always handle STOP/START for TCPA compliance)
6. Wire `mobile_service` into booking configure step
7. Wire `cancellation_fee` into cancel dialog

### Priority 2 — Placeholders
- `recurring_services` — Keep (Phase 10)
- `photo_documentation` — Keep (Phase 8)
- `referral_program` — Keep if planned; remove if not

### Priority 3 — UI Improvements
- Group flags by category on Feature Toggles page
- Show informational banners on admin pages when their feature flag is off (e.g., waitlist page, mobile zones page)
- Consider adding flag descriptions that clarify what toggling off actually does

### Not Recommended
- Do NOT add feature flags for AI auto-responder (current 3-layer approach is better)
- Do NOT add feature flags for per-item controls (coupons, campaigns)
- Do NOT consolidate QBO flag (already correctly split: `feature_flags` = master toggle, sync functions check connection)

---

## Appendix: File Reference Index

### Infrastructure
| File | Purpose |
|------|---------|
| `src/lib/utils/constants.ts:174-189` | `FEATURE_FLAGS` constant definition (13 keys) |
| `src/lib/hooks/use-feature-flag.ts` | Client-side hook with 60s cache |
| `src/app/admin/settings/feature-toggles/page.tsx` | Admin toggle UI (112 lines) |
| `supabase/migrations/20260201000031_create_feature_flags.sql` | Table DDL |
| `supabase/migrations/20260201000035_rls_policies.sql:168-170` | RLS (read all, write super_admin) |
| `supabase/seed.sql:7-20` | Seed data (13 rows) |

### Active Feature Gates
| Flag | File | Line | Type |
|------|------|------|------|
| `online_booking_payment` | `src/lib/data/booking.ts` | 239-242 | Server query |
| `online_booking_payment` | `src/components/booking/booking-wizard.tsx` | 128, 569 | Client conditional |
| `google_review_requests` | `src/app/api/cron/lifecycle-engine/route.ts` | 343-349, 396-401 | Server query + gate |
| `google_review_requests` | `src/app/admin/settings/reviews/page.tsx` | 41-42 | Client hook (display) |
| `waitlist` | `src/app/api/waitlist/route.ts` | 73-85 | Server query + hard gate |
| `waitlist` | `src/app/api/appointments/[id]/cancel/route.ts` | 81-91 | Server query + soft gate |
| `qbo_enabled` | `src/lib/qbo/settings.ts` | 75-82 | Server query via `isQboSyncEnabled()` |
| `qbo_enabled` | `src/app/api/admin/integrations/qbo/status/route.ts` | 49-53 | Server query (status) |

### Orphan Features (need flag wiring)
| Flag | Feature Files (not checking flag) |
|------|-----------------------------------|
| `loyalty_rewards` | `src/app/api/pos/loyalty/earn/route.ts`, `src/app/api/pos/loyalty/redeem/route.ts`, `src/app/api/pos/transactions/route.ts`, `src/app/pos/components/loyalty-panel.tsx`, `src/app/(account)/account/loyalty/page.tsx` |
| `sms_marketing` | `src/app/api/marketing/campaigns/send/route.ts`, `src/app/api/marketing/campaigns/process-scheduled/route.ts`, `src/app/api/cron/lifecycle-engine/route.ts` |
| `email_marketing` | `src/app/api/marketing/campaigns/send/route.ts`, `src/app/api/marketing/campaigns/process-scheduled/route.ts` |
| `two_way_sms` | `src/app/api/webhooks/twilio/inbound/route.ts`, `src/app/api/messaging/` |
| `cancellation_fee` | `src/app/admin/appointments/components/cancel-appointment-dialog.tsx`, `src/app/api/appointments/[id]/cancel/route.ts` |
| `mobile_service` | `src/components/booking/step-configure.tsx`, `src/lib/data/booking.ts`, `src/app/api/book/route.ts` |

---

## Remediation Complete — 2026-02-11

### Session 1: Server-side utility + marketing orphans
- Created `src/lib/utils/feature-flags.ts` with `isFeatureEnabled()`
- Wired `sms_marketing` into campaign send routes + lifecycle engine
- Wired `email_marketing` into campaign email send routes

### Session 2: POS + booking orphans
- Wired `loyalty_rewards` into points accumulation, redemption, POS panel, portal, booking
- Wired `cancellation_fee` into cancel dialogs and fee processing
- Wired `mobile_service` into booking flow and travel fee calculation

### Session 3: Two-way SMS (nuanced)
- Wired `two_way_sms` into inbound webhook (after STOP/START), sidebar nav, inbox UI
- STOP/START keyword processing preserved regardless of toggle (TCPA compliance)

### Session 4: Cleanup + organization
- Removed `referral_program` (dead flag, no roadmap)
- Added `online_store` placeholder (Phase 9)
- Added `inventory_management` (Operations — gates sidebar nav)
- Added `category` column to `feature_flags` table
- Organized all flags into categories: Core POS, Marketing, Communication, Booking, Integrations, Operations, Future
- Updated all labels and descriptions to be specific about what toggling off does
- Feature Toggles page now groups by category with "Coming Soon" badge for Future flags
- Inventory nav section hidden when `inventory_management` flag disabled

### Final Flag Status
| Flag | Category | Status | Wired |
|------|----------|--------|-------|
| loyalty_rewards | Core POS | Active | Session 2 |
| cancellation_fee | Core POS | Active | Session 2 |
| sms_marketing | Marketing | Active | Session 1 |
| email_marketing | Marketing | Active | Session 1 |
| google_review_requests | Marketing | Active | Already wired |
| two_way_sms | Communication | Active | Session 3 |
| online_booking_payment | Booking | Active | Already wired |
| waitlist | Booking | Active | Already wired |
| mobile_service | Booking | Active | Session 2 |
| qbo_enabled | Integrations | Active | Separate session |
| inventory_management | Operations | Active | Session 4 |
| recurring_services | Future | Placeholder | N/A — Phase 10 |
| photo_documentation | Future | Placeholder | N/A — Phase 8 |
| online_store | Future | Placeholder | N/A — Phase 9 |
| ~~referral_program~~ | — | Removed | — |
