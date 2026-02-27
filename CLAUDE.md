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
5. **Session end**: Update docs/CHANGELOG.md and relevant docs/dev/ files. Only update CLAUDE.md if the tech stack, project structure, critical rules, or current phase changed. For feature work and bug fixes, CHANGELOG.md is sufficient. Then: `git add -A && git commit -m "..." && git push && rm -rf .next`
After commit, push, and cache clear, print: `⚠️ Session complete. Run: npm run dev`
6. **Commit format**: Conventional commits — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
7. **Multi-session prompts**: Separate files per session (session-1.md, session-2.md) — never combine.
8. **Business info**: NEVER hardcode business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`.
9. **SMS**: ALL sends go through `sendSms()` or `sendMarketingSms()` in `src/lib/utils/sms.ts`. NEVER inline Twilio API calls. Consent changes MUST use `updateSmsConsent()` from `@/lib/utils/sms-consent`.
10. **POS dark mode**: Every `bg-white` container in POS must have a corresponding `dark:bg-gray-900` (or appropriate dark variant). Audit dropdowns, modals, popovers, and tooltips.
11. **Component Reuse** — Before writing ANY new component, search /src/components for existing reusable components.
12. **File paths**: Exact file paths are in docs/dev/FILE_TREE.md. Read it before modifying any files. Never guess paths.
13. **FILE_TREE.md**: If a session creates new files in API routes, admin pages, lib modules, components, POS components, or migrations, update `docs/dev/FILE_TREE.md` with the new paths before committing.
14. **Service category management** (create, rename, merge, reorder) should be done through the Admin UI, not SQL migrations. The admin already supports full category CRUD.
15. **iOS format-detection**: Root layout includes `format-detection: telephone=no` meta tag. Never render phone numbers as plain text in customer-facing components — always wrap in `<a href="tel:...">` to prevent iOS Safari from auto-linking and causing hydration mismatches.
16. **iOS input zoom prevention**: All text inputs in customer-facing forms must use `text-base sm:text-sm` to prevent iOS auto-zoom on focus (iOS zooms inputs with font-size < 16px).
17. **Schema reference**: Read `docs/dev/DB_SCHEMA.md` when session touches pricing, services, or booking.

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
- **POS auth expiry**: 3 layers — (1) `posFetch()` in `pos-fetch.ts` catches 401 → redirect to `/pos/login?reason=session_expired`, (2) global error listeners in `pos-shell.tsx` catch Stripe SDK auth errors → redirect, (3) login page shows session expired toast on `?reason=session_expired`
- **POS has TWO timeout systems**: Idle timeout (Admin > Settings, transparent overlay, PIN re-entry, session alive) vs JWT token expiry (12hr hardcoded, full redirect to login, session dead). Both are needed.
- **Stripe Terminal in PWA**: Requires pfSense DNS exception — `private-domain: "stripe-terminal-local-reader.net"` in Unbound custom options. Without this, iPad Safari PWA can't resolve Stripe's local reader DNS (desktop browsers bypass via DoH).
- **Vehicle categories**: 5 categories — automobile, motorcycle, rv, boat, aircraft. Constants in `src/lib/utils/vehicle-categories.ts`. Specialty vehicle pricing tiers map to `service_pricing.tier_name` via `vehicles.specialty_tier`. Automobiles use `vehicle_type` for pricing resolution instead.

## Current Phase

Phase 12: iPad POS Optimization & POS Polish — header/nav reorganization, Stripe Terminal PWA fix, dark mode, auth resilience — **in progress**.

Previous: Phase 9 (E-commerce/Online Store) and Phase 11 (Intelligence & Growth) complete. CMS/website complete.

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1–8 | Foundation through Job Management | Done |
| 9 | Native Online Store (cart, checkout, orders, shipping, CMS) | Done |
| 10 | Recurring Services | Postponed indefinitely |
| 11 | Intelligence & Growth (campaigns, lifecycle, loyalty, coupons, AI responder) | Done |
| 12 | iPad POS Optimization & POS Polish | In progress |
| 13 | Full QA — section-by-section testing checklist across every module/tab | Not started |
| 14 | User Manual — complete how-to document (see `docs/manual/README.md`) | Not started |
| 15 | Store Setup & Hardware — scanners, receipt printer, copier, water system, email/SMS final checks | Not started |
| 16 | Launch Prep — set go-live date, purge all test data, reimport real data | Not started |

**Phase 16 details:** Delete ALL test data from Square, test jobs, test accounts — everything from Jan 1, 2026 to launch date. Then reimport real Square transactions from 01/01/2026 to launch date. Confirm that deleting test product purchases restores inventory levels back to correct counts before reimporting.

## Phase 12: iPad POS Optimization — Details

### Completed (Sessions D–D9)

**Layout & Navigation (D, D1, D2, D4, D7)**
- Header reduced from 16 → 8 elements: [Scanner] [CC Reader●] ... company name ... [⚡offline] [Role] | Staff | [→🚪]
- Bottom nav reduced from 6 → 5 tabs (Sale renamed to Register)
- More menu: 7 items with theme segmented control (Light/Dark/System) above Cash Drawer
- All pill backgrounds removed from header; status icons at h-4 w-4
- Role pill removed from header — only in ticket panel + More menu
- Staff name moved to ticket panel header opposite "TICKET"
- Held tickets (PauseCircle) button moved to ticket panel header
- Logout moved from More menu to header (icon button)
- Company text: "Smart Details Auto Spa - POS"

**Stripe Terminal PWA Fix (D2 — CRITICAL)**
- Root cause: pfSense DNS Rebind Protection blocks Stripe Terminal local reader DNS
- Stripe SDK resolves `192-168-X-X.[random].device.stripe-terminal-local-reader.net` → local IP
- Desktop browsers use DNS-over-HTTPS (bypasses pfSense); iPad Safari PWA uses system DNS → blocked
- Fix: pfSense > Services > DNS Resolver > Custom options: `server: private-domain: "stripe-terminal-local-reader.net"`
- NOT a code bug — 4 sessions of code attempts before discovering network-level root cause

**Auth & Security (D5, D6)**
- Auth expiry: 3 defensive layers (posFetch 401 catch, global error listeners, login toast)
- CRON resilience: BASE_URL changed to `http://localhost:${PORT || 3000}`, 30s timeout, single retry with 5s delay

**UX Polish (D2, D5, D7, D8, D9)**
- Cash Drawer: green/red Vault icon + status text
- Toast duration: 1.5s success, 3s error, max 3 visible
- POS tabs light mode: bg-gray-200 container + white active pill
- PIN entry lag: 200ms delay before auto-submit, touch-action: manipulation, transition-colors
- CustomerLookup: inputMode="numeric" + pattern="[0-9]*" for native iOS number pad
- Customer lookup results: dark mode fix — bg-white dark:bg-gray-900 on results container, professional badge dark variants

### Remaining
- Additional dark mode audit as issues surface during real-world use
- Any further POS polish from daily use feedback

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
| Audit log cleanup | Daily 3:30 AM PST | `/api/cron/cleanup-audit-log` |

## Production Env Vars (Required)

`NEXT_PUBLIC_APP_URL`, `TWILIO_WEBHOOK_URL`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `ANTHROPIC_API_KEY`, `CRON_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`

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
| Service catalog | `docs/dev/SERVICE_CATALOG.md` |
| Data migrations | `docs/dev/DATA_MIGRATION_RULES.md` |
| Troubleshooting (WSOD, auth, build) | `docs/dev/TROUBLESHOOTING.md` |
| Version history | `docs/CHANGELOG.md` |
| Roadmap & specs | `docs/planning/` |
| System audits | `docs/audits/` |
| User manual (skeleton) | `docs/manual/` |
