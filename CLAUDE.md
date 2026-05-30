# Smart Details Auto Spa — Management App

> Full-stack business management app for a mobile auto detailing company.
> Handles jobs, customers, POS, online store, CMS website, marketing, and accounting.

## Tech Stack

- Next.js 16.x (Turbopack), React 19, TypeScript 5
- Supabase (Postgres + Auth + Storage + Row Level Security)
- Tailwind CSS 4 with CSS variable theme system
- Stripe (payments), Square (catalog), Shippo (shipping)
- Deployed on dedicated Hostinger server

## Critical Rules

- CRITICAL: Do NOT upgrade Next.js version. Currently pinned to 15.3.3. Next.js 16 requires major migration (async params, proxy.ts, caching changes). Only upgrade when explicitly instructed.

1. **Timezone**: All scheduling, cron, logs, and time displays use `America/Los_Angeles` (PST). Never UTC.
2. **Internal cron only**: ALL scheduling via `src/lib/cron/scheduler.ts` + `src/instrumentation.ts`. NEVER suggest n8n, Vercel Cron, or external schedulers.
3. **Hostinger only**: Currently delpoyed locally on MBP, but once fully developed it will become Deployed on dedicated Hostinger server. Never reference or suggest Vercel.
4. **No quick fixes**: Provide fully thought-out solutions covering all scenarios and edge cases.
5. **Session end**: Update docs/CHANGELOG.md and relevant docs/dev/ files. Only update CLAUDE.md if the tech stack, project structure, critical rules, or current phase changed. For feature work and bug fixes, CHANGELOG.md is sufficient. Write or update an ADR in `docs/adr/` if the session made an architecturally significant decision per the trigger criteria in `docs/adr/README.md`. Then: `git add -A && git commit -m "..." && git push && rm -rf .next`
After commit, push, and cache clear, print: `⚠️ Session complete. Run: npm run dev`
6. **Commit format**: Conventional commits — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
7. **Multi-session prompts**: Separate files per session (session-1.md, session-2.md) — never combine.
8. **Business info**: NEVER hardcode business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`.
9. **SMS**: ALL sends go through `sendSms()` or `sendMarketingSms()` in `src/lib/utils/sms.ts`. NEVER inline Twilio API calls. Phase Normalization-1: those helpers normalize `to` to E.164 at entry and reject unparseable input before Twilio is contacted; `findOrCreateConversation()` in `src/lib/utils/conversation-helpers.ts` does the same. New code that writes a phone column (employees, conversations.phone_number, sms_delivery_log.to_phone, sms_consent_log.phone, etc.) MUST normalize via `normalizePhone()` from `@/lib/utils/format` before INSERT/UPDATE. **Phase Schema-Hardening-1: 5 phone-bearing columns now carry E.164 CHECK constraints** at the DB layer — `customers.phone`, `employees.phone` (existing), plus `conversations.phone_number`, `sms_delivery_log.to_phone`, `sms_conversations.phone_number`, `sms_consent_log.phone` (new). **`quote_communications.sent_to` carries a channel-aware CHECK (`valid_sent_to`)**: `NULL` allowed, `channel='sms'` requires E.164, `channel='email'` requires email shape. Adding any new value to `quote_communications.channel` (voice, push, etc.) requires updating the constraint definition BEFORE app code writes the new value — or the INSERT will be rejected. Canonical writer for these rows is `recordCommunication` in `src/lib/quotes/send-service.ts`; inline DB-contract comment above the function documents this. **Phone DISPLAY (Phase Lint-Hardening-1)**: never render a raw phone in JSX (`{customer.phone}`, `{user.phoneNumber}`, etc.) — wrap with `formatPhone()` for visible display, `phoneToE164()` for `tel:`/JSON-LD `href`, or `formatPhoneInput()` for live-formatting controlled inputs. The `phone/no-raw-display` ESLint rule (`eslint-rules/phone-no-raw-display.js`, currently `'warn'`, scheduled for `'error'` after Phase Lint-Hardening-1.4 lands the remaining prop-pass-through warnings at zero) flags violations at write time. Phase 1.3 added 5 context-aware skip patterns (boolean/ternary test, `formatPhone(x) \|\| x` fallback, `key={x}`, `<input value={x}>`, bare `cell`/`mobile` identifiers) — see `docs/dev/PHONE_LINT.md` for the full list of patterns the rule deliberately ignores and the negative cases it still catches. See `docs/dev/PHONE_LINT.md` for opt-out and details. Consent changes MUST use `updateSmsConsent()` from `@/lib/utils/sms-consent`. SMS template engine architecture (Session 2A): chip palette at `src/lib/sms/palette.ts` (`SMS_PALETTE`); per-slug contracts (required/optional chips) in DB columns `sms_templates.required_variables` + `sms_templates.optional_variables`; Zod validation in `src/lib/sms/contract.ts`; composite-chip builders (caller-built strings the engine treats as chip values) in `src/lib/sms/composites.ts`. **Required-vs-optional design principle**: for customer-facing transactional SMS, prefer optional + fallback prose over hard-skip. `Required` is reserved for chips whose absence makes the message incoherent (e.g., `service_name` in a reminder). Name chips and prose-decoration chips default to optional unless the message is meaningless without them. **Source-of-truth + codegen (Session 2A.5)**: `src/lib/sms/sms-contracts.source.ts` is the hand-edited source for chip metadata and per-slug contracts. Both `src/lib/sms/palette.ts` and `src/lib/sms/generated-contracts.ts` are auto-generated from it; do not hand-edit either generated file. After any migration that touches `sms_templates.required_variables` or `optional_variables`, run `npx tsx scripts/regen-sms-contracts.ts` before commit — same ritual as `DB_SCHEMA.md` regen from Session 1B. `renderSmsTemplate` is now generic (`<S extends SmsSlug>`) — callers must satisfy the per-slug typed shape (`RenderVarsBySlug[slug]`); extra-key passes and missing-required passes fail at compile time. Test-only synthetic-slug code uses `__renderSmsTemplateForTesting` from the same module. **Admin UI validation**: admin chip picker and PUT save validation read `sms_templates.required_variables` + `optional_variables` joined against `SMS_PALETTE`. Two validation tiers on body save: chips outside `SMS_PALETTE_KEYS` are typos → 400 hard reject; chips in palette but not in slug's contract → 409 with `warnings`, client re-POSTs with `confirm_warnings: true` to commit (mirrors the existing `confirm_silence` round-trip pattern).
10. **POS dark mode**: Every `bg-white` container in POS must have a corresponding `dark:bg-gray-900` (or appropriate dark variant). Audit dropdowns, modals, popovers, and tooltips.
11. **Component Reuse** — Before writing ANY new component, search /src/components for existing reusable components.
12. **File paths**: Exact file paths are in docs/dev/FILE_TREE.md. Read it before modifying any files. Never guess paths.
13. **FILE_TREE.md**: If a session creates new files in API routes, admin pages, lib modules, components, POS components, or migrations, update `docs/dev/FILE_TREE.md` with the new paths before committing.
14. **Service category management** (create, rename, merge, reorder) should be done through the Admin UI, not SQL migrations. The admin already supports full category CRUD.
15. **iOS format-detection**: Root layout includes `format-detection: telephone=no` meta tag. Never render phone numbers as plain text in customer-facing components — always wrap in `<a href="tel:...">` to prevent iOS Safari from auto-linking and causing hydration mismatches.
16. **iOS input zoom prevention**: All text inputs in customer-facing forms must use `text-base sm:text-sm` to prevent iOS auto-zoom on focus (iOS zooms inputs with font-size < 16px).
17. **Schema reference**: Read `docs/dev/DB_SCHEMA.md` when session touches pricing, services, or booking.
18. **Customer soft delete**: Customers table uses soft delete (`deleted_at` column). All forward-looking queries (search, selection, eligibility, enrollment, creation uniqueness) MUST filter `.is('deleted_at', null)`. Historical joins (transactions, receipts, refunds, analytics, lifecycle engine) are intentionally unfiltered. One phone = one customer record; archived match surfaced on creation with restore as default path.
19. **Vehicle size taxonomy**: `size_class` is the canonical vehicle size taxonomy (5 values: sedan, truck_suv_2row, suv_3row_van, exotic, classic). All vehicle attributes that influence size-based pricing, booking gating, or agent handoff MUST be expressed as `size_class` values. Do NOT introduce parallel boolean flags (is_exotic, is_classic, requires_custom_quote, etc.). The admin vehicle edit dropdown uses `size_class_manual_override` to persist staff overrides across classifier runs. **Vehicle classifier (`resolveVehicleClassification` in `src/lib/utils/vehicle-categories.ts`) is a context-driven optional feature**, not a global pipeline (per `docs/dev/VEHICLE_FORM_UNIFICATION_AUDIT.md` NO-UNIFICATION verdict — four context-driven vehicle-form patterns are intentional). It is **structurally mandatory** for public booking (`step-vehicle.tsx` — customer-facing dropdown is restricted to 3 size_classes via `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`, so the classifier is the only path that can route a Ferrari/classic customer to the specialty tier) and **opt-in** for the customer portal (`account/vehicle-form-dialog.tsx` — surfaces an inline advisory). POS (`pos/vehicle-create-dialog.tsx`) and admin (`admin/customers/[id]/page.tsx`) operate on the operator-trust boundary and intentionally **do NOT use the classifier** — operators pick `size_class` directly from the full 5-value dropdown. **When wiring the classifier into any caller, gate the category auto-override on `model.trim() !== ''`** (the #129 C1 corrective) — the resolver silently defaults to `'automobile'` in three paths (`vehicle-categories.ts:302-305/691/712-714`) and would otherwise overwrite the user's explicit non-automobile category pick. The `size_class` write is server-authoritative via the POST/PATCH routes in `/api/customer/vehicles` — those routes already run the classifier and override client-supplied `size_class` with the classifier's `exotic`/`classic` result (Session 29 anti-gaming).
20. **Money (Money-Unify epic in progress, Phase Unify-1 complete)**: New money-handling code MUST use integer cents — column suffix `_cents`, variable suffix `Cents` (camelCase) or `_cents` (snake_case). Canonical helpers live in `src/lib/utils/money.ts`: `toCents()`, `fromCents()`, `STRIPE_MIN_AMOUNT_CENTS = 50`, `STRIPE_MIN_DOLLARS` (derived). Format helpers in `src/lib/utils/format.ts`: `formatMoney(cents)` for all display, `formatMoneyForInput(cents)` for controlled dollar-edit inputs. The legacy `formatCurrency(dollars)` survives the epic and is removed at Unify-Final. Loyalty: `LOYALTY.REDEEM_RATE_CENTS = 5` for cents-context math (alongside legacy `LOYALTY.REDEEM_RATE = 0.05`). The `money/no-unsuffixed-money-prop` ESLint rule (`eslint-rules/money-no-unsuffixed-money-prop.js`, currently `'warn'`, scheduled for `'error'` at Unify-Final once all family phases land) flags violations at write time. Existing dollars-canonical code in families not yet migrated stays as-is until that family's phase. The Stripe minimum value (50 cents = $0.50) is duplicated at the DB layer via `appointments.payment_link_amount_cents_check` — changing it requires both a code change AND a migration. Loyalty `REDEEM_RATE` is duplicated as both the float (`0.05`) and the integer (`5`) until Unify-Final. See `docs/dev/MONEY.md` for full canonical-model documentation, opt-out details, and the per-family migration status table.
21. **Roadmap (post-Money-Unify rollback)**: Read `docs/dev/ROADMAP-13-ITEMS.md` before starting any work on the 13 active bug/feature items (Wave 1-5). Each item section defines status, severity, acceptance criteria, out-of-scope boundaries, files likely affected, and session plan. **Update the item's Status, Notes/decisions log, and the session-by-session ledger at session end** — the roadmap is the working source of truth and must reflect reality after each session. If scope changes mid-session, pause and update the doc first.
22. **Service pricing — canonical engine only**: Any code that computes a service price MUST go through `resolveServicePrice` / `resolveServicePriceWithSale` from `src/lib/services/picker-engine.ts` (the canonical engine). Operator UI surfaces that let a user add/remove services MUST mount the `useServicePicker` hook from `src/lib/services/use-service-picker.ts` rather than building a bespoke picker. The two patterns (column-based `is_vehicle_size_aware` + `vehicle_size_*_price` columns, and row-based `tier_name` = size_class) both flow through the canonical resolver — never inspect `service_pricing.price` or `vehicle_size_*_price` columns directly outside the engine. **Selecting WHICH `service_pricing` row to price for a given vehicle MUST go through `selectPricingTierForVehicle(pricing, size_class)` from the same engine** — never hand-pick `pricing[0]` or re-implement the `tier_name === size_class` match inline (Session #113 fixed the prerequisite auto-add that did exactly that — `prereqPricing[0]` is always the sedan/first tier, mispricing a Suburban prereq at $75 instead of $110). It returns `null` on no-match (unrecognized multi-tier shape, no vehicle, or no row for the size); interactive add paths treat `null` as "fall through to the manual picker," automated paths (prerequisite auto-add) treat `null` as "block with a warning, add nothing." All 6 tier-selection sites (catalog-browser direct/unchecked/prereq, register-tab, quote-builder prereq, `routeServiceTap`) route through this one selector. Customer-facing surfaces (e.g., Booking Wizard `step-service-select.tsx`) may keep bespoke UI but their price math MUST use the canonical resolver. **The `services/no-bespoke-pricing` ESLint rule (`eslint-rules/services-no-bespoke-pricing.js`) ships at `'error'` (Item 15f Layer 4, 2026-05-17)** — three smoking-gun signals: bespoke function-name pattern (`resolveServicePrice` / `resolvePrice` / `getServicePrice` / `computeServicePrice` outside the engine), `switch (X.pricing_model)` that performs money math without calling the engine, and direct `vehicle_size_*_price` reads in arithmetic/return contexts. Engine files (`src/lib/services/**`) and test files are exempt. The ONLY sanctioned in-source disable comment is on Item 15a's dead-code `resolveServicePrice` inside `<EditServicesModal>` (scheduled for deletion in Phase 1 Layer 8e); any other disable is a smell — the fix is to migrate the bespoke pricer to a thin wrapper around `resolveServicePriceWithSale`. See Item 15f in `docs/dev/ROADMAP-13-ITEMS.md` for the full architecture and migration history. **Add-time validation — canonical helper only (Track A, #121; gate order LOCKED #122):** any operator surface that adds a service to a ticket/quote MUST route the add through `useValidatedServiceAdd` from `src/app/pos/hooks/use-validated-service-add.tsx` — the single add-time gate. **Gate order (LOCKED, do not flip):** (1) the **prerequisite check is PRIMARY** (`use-prerequisite-check`) — when prereqs are configured they ARE the gate: unmet → `PrerequisiteWarningDialog` (add a prereq, or manager-override behind its OWN Override button); satisfied → commit. (2) the **add-on-only gate is CONDITIONAL** — it fires ONLY when the service has **no prerequisites configured** (a pure add-on with no parent dependency) AND `classification === 'addon_only'` AND is solo (no `primary`/`both` anchor on the order) → warn + manager-PIN override via `pos.override_prerequisites`. (3) commit via the caller's `onAdd`. Rationale (#122): a satisfied/overridden prerequisite implicitly authorizes the add-on, so the add-on PIN must never preempt the prereq dialog. The helper owns both warning dialogs + the prerequisite auto-add (which selects the prereq tier via `selectPricingTierForVehicle`); `usePrerequisiteCheck` returns `hasPrerequisites` so the helper knows whether the add-on gate applies. All three add surfaces use it — Sale `catalog-browser`, Quotes `quote-builder` (search/picker + browse via `customerIdOverride`/`vehicleIdOverride`/`serviceIdsOverride` props on `<CatalogBrowser>`), and `register-tab` favorites. NEVER dispatch `ADD_SERVICE` directly from a new operator add path or re-implement the prereq/add-on checks inline — pass the surface's context (`customerId`/`vehicleId`/`serviceIds`/`services`) into the helper and a thin `onAdd` commit primitive. `usePrerequisiteCheck` stays the surface-agnostic network primitive the helper wraps.

## Project Structure

```
src/
├── app/
│   ├── admin/           — Admin dashboard, CRUD, settings (12 sub-pages)
│   ├── (public)/        — Customer-facing website, CMS pages, store
│   ├── (account)/       — Customer portal (orders, services, loyalty)
│   ├── (customer-auth)/ — Login, signup, password reset
│   ├── pos/             — POS system (PIN auth, HMAC API)
│   ├── api/             — API routes (admin/, pos/, public/, cron/, webhooks/)
│   └── layout.tsx       — Root layout
├── components/
│   ├── admin/           — Admin UI (icon-picker, html-editor-toolbar)
│   ├── public/          — Public site (header, footer, hero, CMS, cart)
│   └── ui/              — Shared primitives (shadcn/ui based)
├── lib/
│   ├── supabase/        — Client (browser), server (cookie), admin (service role)
│   ├── auth/            — Roles, permissions, check-permission, require-permission
│   ├── hooks/           — useFeatureFlag, usePermission, useIsSuperAdmin
│   ├── utils/           — Formatters, validators, sms, email, constants
│   ├── cron/            — Internal scheduler (node-cron)
│   ├── qbo/             — QuickBooks sync engines
│   └── services/        — AI messaging, content writer, job-addons
└── types/               — TypeScript definitions
```

## Database Schema Reference

The full database schema is documented in `docs/dev/DB_SCHEMA.md`. This file contains:
- All table definitions with column types, constraints, and notes
- JSONB structures (e.g., `receipt_config` in `business_settings`)
- Key triggers, enums, and relationships
- Receipt system architecture and file locations

### Rules for Database Changes

1. **Always check `docs/dev/DB_SCHEMA.md` first** before creating new fields or tables. Reuse existing fields whenever possible to avoid inflating the database and duplicating data.
2. **If a new field IS needed**, create a proper migration in `supabase/migrations/` and update `docs/dev/DB_SCHEMA.md` to reflect the change.
3. **If a new table IS needed**, document it fully in `docs/dev/DB_SCHEMA.md` with all columns, types, constraints, and notes.
4. **JSONB fields** (like `receipt_config`, `business_settings.value`) should be extended before creating new columns — check if the data logically belongs in an existing JSONB structure.
5. **Never guess** what fields exist — always verify against `docs/dev/DB_SCHEMA.md` or the actual migrations.
6. **Regenerate the schema doc after schema changes**: run `npx tsx scripts/regen-db-schema.ts` at the end of any session that adds/modifies tables or columns. The doc is auto-generated from the live database — do not hand-edit it (changes will be overwritten on the next regen).

## Key Patterns

- Server components by default; `'use client'` only when state/interactivity needed
- **Admin API**: `createClient()` for auth check → `createAdminClient()` (service role) for data
- **POS API**: `authenticatePosRequest()` (HMAC) → `createAdminClient()` for data
- **Customer portal**: `createClient()` with RLS — customers see only their own data
- **Session checks**: Use `getUser()` (server-validated) NOT `getSession()` (cached)
- **Session expiry**: Use `adminFetch()` from `@/lib/utils/admin-fetch` for auto-redirect on 401
- **Theme system**: CSS variable indirection (`--lime` in `:root`, `var(--lime)` in `@theme inline`). See `docs/dev/DESIGN_SYSTEM.md`
- **Feature toggles**: `business_settings` table, checked via `isFeatureEnabled()` server-side or `useFeatureFlag()` client-side
- **POS access = PIN presence**: No role-based gating. Set PIN → POS access. Clear PIN → no access.
- **Quotes are READ-ONLY in admin**: All creation/editing via POS builder deep-links
- **Soft-delete**: Quotes use `deleted_at`. ALL queries MUST include `.is('deleted_at', null)` except `quote-number.ts` and public quote page
- **Supabase `.or()` on related tables**: Does NOT work. Query related table first, then `.in('foreign_key', ids)`
- **Supabase relation cardinality (embedded selects)**: PostgREST infers cardinality from constraint metadata. When you embed a relation joined on a column that has a **UNIQUE constraint** (e.g. `jobs.appointment_id` per migration `20260329000002`), the result is a **single object `{...}` (or `null`), NOT an array** — even though it visually reads like a to-many embed (`jobs:jobs!appointment_id(...)`). Embeds on non-unique FK columns return arrays. A TS cast `as Array<...>` compiles but does NOT reshape at runtime, so `.some()`/`.map()`/`?? []` on the single object throws `(intermediate value).some is not a function` (Session #110 production crash on admin Customers + Appointments). **Always normalize an embedded relation to an array before iterating** — `const arr = Array.isArray(v) ? v : v ? [v] : []` (see `src/app/admin/appointments/has-active-job.ts` `asRelationArray`). Verify the FK's uniqueness before assuming shape.
- **POS auth expiry**: 3 layers — (1) `posFetch()` in `pos-fetch.ts` catches 401 → redirect to `/pos/login?reason=session_expired`, (2) global error listeners in `pos-shell.tsx` catch Stripe SDK auth errors → redirect, (3) login page shows session expired toast on `?reason=session_expired`
- **POS has TWO timeout systems**: Idle timeout (Admin > Settings, transparent overlay, PIN re-entry, session alive) vs JWT token expiry (12hr hardcoded, full redirect to login, session dead). Both are needed.
- **Stripe Terminal in PWA**: Requires pfSense DNS exception — `private-domain: "stripe-terminal-local-reader.net"` in Unbound custom options. Without this, iPad Safari PWA can't resolve Stripe's local reader DNS (desktop browsers bypass via DoH).
- **Vehicle categories**: 5 categories — automobile, motorcycle, rv, boat, aircraft. Constants in `src/lib/utils/vehicle-categories.ts`. Specialty vehicle pricing tiers map to `service_pricing.tier_name` via `vehicles.specialty_tier`. Automobiles use `vehicle_type` for pricing resolution instead.
- **Coupon discount rules**: ALL coupon business logic (sale/combo no-stacking, discount calculation, eligible-item filtering) lives in `src/lib/utils/coupon-helpers.ts`. Both POS (`/api/pos/coupons/validate`) and booking (`/api/book/validate-coupon`) endpoints use `calculateCouponDiscount()`. Add new coupon rules to the shared utility, NOT to individual endpoints.

## Current Phase

All core build phases complete. App is in active daily use with ongoing refinement and bug fixes.

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1–8 | Foundation through Job Management | Done |
| 9 | Native Online Store (cart, checkout, orders, shipping, CMS) | Done |
| 10 | Recurring Services | Postponed indefinitely |
| 11 | Intelligence & Growth (campaigns, lifecycle, loyalty, coupons, AI responder) | Done |
| 12 | iPad POS Optimization & POS Polish (dark mode, Stripe Terminal, auth) | Done |
| — | Bug fix marathon (45+ booking/POS/admin bugs across Sessions 0–8) | Done |
| — | Customer Portal Redesign (6 sub-phases: profile, transactions, loyalty, vehicles, appointments, dashboard) | Done |
| — | CMS Overhaul (Phases A–E: page builder, navigation, footer, hero, tickers, city SEO, theme system, preview, revisions, global blocks) | Done |
| — | QuickBooks Integration (OAuth, sync engines, auto-sync cron) | Done |
| — | Hardcoded Audit & Admin Settings Expansion (147-item audit, JSON-LD, business profile, homepage settings, deposit/validity config) | Done |
| — | Photo Gallery Audit & Unification (zone-level pairing, tagging, infinite scroll, admin curation, gallery preview) | Done |
| 13 | Full QA — section-by-section testing checklist across every module/tab | Not started |
| 14 | User Manual — complete how-to document (see `docs/manual/README.md`) | Done |
| 15 | Store Setup & Hardware — scanners, receipt printer, copier, water system, email/SMS final checks | Not started |
| 16 | Launch Prep — set go-live date, purge all test data, reimport real data | Not started |

**Phase 16 details:** Delete ALL test data from Square, test jobs, test accounts — everything from Jan 1, 2026 to launch date. Then reimport real Square transactions from 01/01/2026 to launch date. Confirm that deleting test product purchases restores inventory levels back to correct counts before reimporting.

## Recent Completions (March 2026)

**Photo Gallery Audit & Unification:**
- Public gallery: zone-level before/after pairing (1 pair per job+zone, not 1 per job), infinite scroll, tag-based filtering (Interior/Exterior pills + service dropdown + manual tags), URL state, SEO
- Admin photos: manual tag management (single + bulk), featured star pair-gating (requires both intake + completion), gallery preview mode, tag filter, numbered pagination with direct page input
- DB: dropped orphaned `photos` table, added `tags TEXT[]` to `job_photos`
- New API endpoints: `/api/admin/photos/tags`, `/api/admin/photos/gallery-preview`
- Feature flag `photo_gallery` must be enabled for public gallery

## Previous Completions (Late February 2026)

**Hardcoded Audit & Fixes:**
- 147-item audit across 12 categories (report: `docs/planning/HARDCODED_AUDIT.md`)
- Bug fixes: Place ID, loyalty constants, AI city reference, OG image, POS header — all dynamic
- JSON-LD geo data (lat/lng, area, radius, price range) → `business_settings` with admin UI
- `SITE_URL` → env var; `SITE_DESCRIPTION` → `business_settings`
- Business Profile admin: "SEO & Location" card (6 fields), "Booking & Quotes" card (deposit + validity)

**Homepage Settings Expansion:**
- Hero tagline, CTA defaults, services descriptions → all admin-editable
- Homepage admin: 5 sections (Hero, CTA Defaults, Section Content, Differentiators, Google Reviews)

**Quote Validity Sync:**
- Single source of truth: `business_settings.quote_validity_days`
- Synced across POS date picker, voice agent route, Twilio webhook, email template
- New API: `GET /api/pos/settings/quote-defaults`

**Staff Management:**
- Password reset: admin-set + send reset email + dedicated Security tab
- Role dropdown: dynamic from `roles` table (supports custom roles from Role Management)

**Booking:**
- OTP verification infinite spinner fix (await onSuccess + clear loading state)
- Configurable deposit amount from admin settings (was hardcoded $50)

**Admin UI:**
- Website sidebar: 4 collapsible groups (Content, Data, Layout, Appearance)
- Global Blocks + Homepage sidebar entries added
- City AI generate button in content editor
- Footer copyright HTML rendering (sanitized dangerouslySetInnerHTML)
- Add-on service URLs use addon's own category slug

**Admin UI Polish:**
- Website → Pages: "In Nav" toggle disabled when unpublished, auto-clears on unpublish
- Global OG Image upload in Business Profile (custom social share image with auto-generated fallback)
- Homepage Settings: removed dead Hero Settings card, moved CTA images to CTA Defaults card
- SEO page restored to Website sidebar (Data group) — full per-page SEO manager with AI generation

## Integrations

| Service | Purpose | Auth |
|---------|---------|------|
| Supabase | DB + Auth + Storage + RLS | Project: `zwvahzymzardmxixyfim` |
| Stripe | Payments (booking + e-commerce) | Webhook: `payment_intent.succeeded/failed` |
| Twilio | SMS (+14244010094) | Signature validation in production |
| Mailgun | Email (transactional + marketing) | Webhook signing key required |
| Anthropic Claude | AI messaging auto-responder | `ANTHROPIC_API_KEY` env var |
| QuickBooks Online | Accounting sync | OAuth, `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` env vars |
| Shippo | Shipping rates + labels | API keys in `shipping_settings` table |

## Cron Jobs (Internal)

| Job | Schedule | Endpoint |
|-----|----------|----------|
| Lifecycle engine | Every 10 min | `/api/cron/lifecycle-engine` |
| Quote reminders | Hourly at :30 | `/api/cron/quote-reminders` |
| Stock alerts | Daily 8 AM PST | `/api/cron/stock-alerts` |
| QBO auto-sync | Every 30 min | `/api/cron/qbo-sync` |
| Order cleanup | Every 6 hours | `/api/cron/cleanup-orders` |
| Booking reminders | Daily 8 AM PST | `/api/cron/booking-reminders` |
| Conversation summaries | Every 6 hours | `/api/cron/conversation-summaries` |
| Voice calls poll | Every 5 min | `/api/cron/voice-calls-poll` |
| Audit log cleanup | Daily 3:30 AM PST | `/api/cron/cleanup-audit-log` |
| Verification code cleanup | Daily 4 AM PST | `/api/cron/cleanup-verification-codes` |

## Production Env Vars (Required)

`NEXT_PUBLIC_APP_URL`, `TWILIO_WEBHOOK_URL`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `ANTHROPIC_API_KEY`, `CRON_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`

## Reference Docs

Read the relevant doc when working on that system:

| System | Location |
|--------|----------|
| **Database schema** | **`docs/dev/DB_SCHEMA.md`** |
| Architecture & deployment | `docs/dev/ARCHITECTURE.md` |
| Coding conventions | `docs/dev/CONVENTIONS.md` |
| Theme & design tokens | `docs/dev/DESIGN_SYSTEM.md` |
| Dashboard calculations | `docs/dev/DASHBOARD_RULES.md` |
| POS security | `docs/dev/POS_SECURITY.md` |
| QuickBooks integration | `docs/dev/QBO_INTEGRATION.md` |
| Voice agent (ElevenLabs) | `docs/dev/VOICE_AGENT.md` |
| Service catalog | `docs/dev/SERVICE_CATALOG.md` |
| Data migrations | `docs/dev/DATA_MIGRATION_RULES.md` |
| Troubleshooting (WSOD, auth, build) | `docs/dev/TROUBLESHOOTING.md` |
| Phone format lint rule | `docs/dev/PHONE_LINT.md` |
| Money canonical model + lint rule | `docs/dev/MONEY.md` |
| Version history | `docs/CHANGELOG.md` |
| Roadmap & specs | `docs/planning/` |
| System audits | `docs/audits/` |
| User manual (skeleton) | `docs/manual/` |
