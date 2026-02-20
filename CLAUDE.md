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

1. **Timezone**: All scheduling, cron, logs, and time displays use `America/Los_Angeles` (PST). Never UTC.
2. **Internal cron only**: ALL scheduling via `src/lib/cron/scheduler.ts` + `src/instrumentation.ts`. NEVER suggest n8n, Vercel Cron, or external schedulers.
3. **Hostinger only**: Deployed on dedicated Hostinger server. Never reference or suggest Vercel.
4. **No quick fixes**: Provide fully thought-out solutions covering all scenarios and edge cases.
5. **Session end**: Update CHANGELOG.md, CLAUDE.md (if architectural changes), and related docs. Then: `git add -A && git commit -m "..." && git push`
6. **Commit format**: Conventional commits — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
7. **Multi-session prompts**: Separate files per session (session-1.md, session-2.md) — never combine.
8. **Business info**: NEVER hardcode business name/phone/address/email. Use `getBusinessInfo()` from `@/lib/data/business.ts`.
9. **SMS**: ALL sends go through `sendSms()` or `sendMarketingSms()` in `src/lib/utils/sms.ts`. NEVER inline Twilio API calls. Consent changes MUST use `updateSmsConsent()` from `@/lib/utils/sms-consent`.

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

## Current Phase

Phase 9: E-commerce / Online Store — Cart, checkout, Shippo shipping, order management — **complete**.

CMS/website features also complete: theme system, dark/light toggle, seasonal presets, CMS pages, HTML editor toolbar, configurable footer, announcement tickers, hero carousel with per-slide color overrides.

## Build Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1–8 | Foundation through Job Management | Done |
| 9 | Native Online Store (cart, checkout, orders, shipping, CMS) | Done |
| 10 | Recurring Services | Not started |
| 11 | Intelligence & Growth | Done |
| 12 | iPad POS Optimization | Not started |

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

## Production Env Vars (Required)

`NEXT_PUBLIC_APP_URL`, `TWILIO_WEBHOOK_URL`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `ANTHROPIC_API_KEY`, `CRON_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`

## Reference Docs

Read the relevant doc when working on that system:

| System | Location |
|--------|----------|
| Architecture & deployment | `docs/dev/ARCHITECTURE.md` |
| Coding conventions | `docs/dev/CONVENTIONS.md` |
| Theme & design tokens | `docs/dev/DESIGN_SYSTEM.md` |
| Dashboard calculations | `docs/dev/DASHBOARD_RULES.md` |
| POS security | `docs/dev/POS_SECURITY.md` |
| QuickBooks integration | `docs/dev/QBO_INTEGRATION.md` |
| Service catalog | `docs/dev/SERVICE_CATALOG.md` |
| Data migrations | `docs/dev/DATA_MIGRATION_RULES.md` |
| Version history | `docs/CHANGELOG.md` |
| Roadmap & specs | `docs/planning/` |
| System audits | `docs/audits/` |
| User manual (skeleton) | `docs/manual/` |
