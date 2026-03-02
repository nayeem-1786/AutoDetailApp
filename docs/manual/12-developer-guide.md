# 12. Developer Guide

This chapter is for a developer inheriting or contributing to the codebase. It covers architecture, local setup, key patterns, and common gotchas — everything you need to be productive on day 1. For deep dives, each section links to the detailed reference doc in `docs/dev/`.

---

## 12.1 Architecture Overview

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 15.3.3 (pinned — do NOT upgrade) |
| Language | TypeScript (strict mode) | 5.x |
| UI | React | 19.x |
| Styling | Tailwind CSS with CSS variable theme system | 4.x |
| Database | PostgreSQL via Supabase (Auth + Storage + RLS) | — |
| Payments | Stripe (online checkout + POS Terminal) | SDK 20.x |
| SMS | Twilio (send/receive, signature validation) | — |
| Email | Mailgun (transactional + marketing, open/click tracking) | — |
| Shipping | Shippo (rates, label generation) | SDK 2.x |
| AI | Anthropic Claude (auto-responder, content writer, SEO) | — |
| Accounting | QuickBooks Online (OAuth, one-way sync) | — |
| Forms | react-hook-form + Zod validation | 7.x / 4.x |
| Tables | @tanstack/react-table | 8.x |
| Charts | Recharts | 3.x |
| Icons | lucide-react | — |
| Toasts | sonner | — |
| PDF | PDFKit | — |
| Animations | Framer Motion | — |

> Full architecture details: [`docs/dev/ARCHITECTURE.md`](../dev/ARCHITECTURE.md)

### App Structure

The application serves five distinct audiences through route groups:

| Route Group | Path | Auth | Purpose |
|-------------|------|------|---------|
| Admin | `/admin/*` | Supabase Auth (email/password) | Back-office management |
| POS | `/pos/*` | PIN → JWT → HMAC | In-shop point-of-sale on iPad |
| Public | `/(public)/*` | None | Customer-facing website, SEO |
| Customer Portal | `/(account)/*` | Phone OTP or email/password | Customer self-service |
| API | `/api/*` | Varies by route | REST endpoints |

### Server vs Client Components

- **Server Components** are the default. All public-facing pages are server-rendered for SEO.
- **`'use client'`** is added only when state or interactivity is needed. All admin and POS pages are client components.
- API routes (`route.ts`) are always server-only — never add `'use client'`.

---

## 12.2 Getting Started (Local Development)

### Prerequisites

- **Node.js** — LTS version (20.x or later)
- **npm** — Comes with Node.js (no yarn/pnpm)
- **Git** — For version control

### Clone & Install

```bash
git clone <repo-url>
cd AutoDetailApp
npm install
```

### Environment Variables

Create `.env.local` in the project root. Every variable listed below is required for full functionality:

**Supabase (required)**
```env
NEXT_PUBLIC_SUPABASE_URL=https://zwvahzymzardmxixyfim.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

**App URL (required)**
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Stripe (required for payments)**
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<pk_live_or_test>
STRIPE_SECRET_KEY=<sk_live_or_test>
STRIPE_WEBHOOK_SECRET=<whsec_...>
```

**Twilio (required for SMS)**
```env
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_PHONE_NUMBER=+14244010094
TWILIO_WEBHOOK_URL=<public-url>/api/webhooks/twilio/inbound
```

**Mailgun (required for email)**
```env
MAILGUN_API_KEY=<key>
MAILGUN_DOMAIN=<domain>
MAILGUN_WEBHOOK_SIGNING_KEY=<signing-key>
```

**Anthropic (required for AI features)**
```env
ANTHROPIC_API_KEY=<key>
```

**Cron (required for scheduled jobs)**
```env
CRON_API_KEY=<random-secret>
```

**QuickBooks (optional — only if QBO sync enabled)**
```env
QBO_CLIENT_ID=<client-id>
QBO_CLIENT_SECRET=<client-secret>
```

**Shippo (optional — only if shipping enabled)**
```env
SHIPPO_API_KEY_LIVE=<key>
```

**Other (optional)**
```env
ALLOWED_POS_IPS=<comma-separated-ips>     # Fallback if DB unavailable
GOOGLE_PLACES_API_KEY=<key>                # Google Places/reviews
CRON_SECRET=<legacy-key>                   # Deprecated alias for CRON_API_KEY
```

### Running the Dev Server

```bash
npm run dev
```

This starts the Next.js dev server on `http://localhost:3000` with Turbopack. The internal cron scheduler also boots via `instrumentation.ts`.

### Accessing the App Locally

| Section | URL | Notes |
|---------|-----|-------|
| Public website | `http://localhost:3000` | No auth needed |
| Admin dashboard | `http://localhost:3000/admin` | Requires employee account |
| Admin login | `http://localhost:3000/login` | Email + password |
| POS | `http://localhost:3000/pos` | Requires PIN |
| Customer portal | `http://localhost:3000/account` | Requires customer account |

### Build

```bash
npm run build     # Production build
npm run start     # Start production server
```

After deploying or switching branches, always clear the build cache:

```bash
rm -rf .next
npm run dev
```

---

## 12.3 Project Structure

> Full file tree with exact paths: [`docs/dev/FILE_TREE.md`](../dev/FILE_TREE.md)

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
│   ├── admin/           — Admin-specific (icon-picker, html-editor-toolbar)
│   ├── public/          — Public site (header, footer, hero, CMS, cart)
│   └── ui/              — Shared primitives (shadcn/ui based)
├── lib/
│   ├── supabase/        — Client (browser), server (cookie), admin (service role)
│   ├── auth/            — Roles, permissions, check-permission, require-permission
│   ├── hooks/           — useFeatureFlag, usePermission, useIsSuperAdmin
│   ├── utils/           — Formatters, validators, sms, email, constants
│   ├── cron/            — Internal scheduler (node-cron)
│   ├── qbo/             — QuickBooks sync engines
│   ├── services/        — AI messaging, content writer, job-addons
│   └── data/            — Server data access (business info, CMS, etc.)
├── types/               — TypeScript definitions
└── supabase/
    └── migrations/      — Postgres migrations (append only, never delete)
```

### Naming Conventions

- **Pages**: `page.tsx` — always `'use client'` for admin/POS pages
- **API routes**: `route.ts` — server-only, never `'use client'`
- **Components**: kebab-case (`customer-lookup.tsx`)
- **Utils**: kebab-case (`validation.ts`)
- **Dynamic segments**: `[id]/`, `[slug]/` (lowercase)
- **Page-specific components**: `_components/` directory (prefixed with `_`)
- **Imports**: Use `@/` path alias (maps to `./src/*`)

---

## 12.4 Database

### Overview

- **Supabase Postgres** with Row Level Security (RLS)
- **70+ tables** — full schema documented in [`docs/dev/DB_SCHEMA.md`](../dev/DB_SCHEMA.md)
- **Hand-written TypeScript types** in `src/lib/supabase/types.ts` — this is the source of truth, not the auto-generated `database.types.ts`

### Migration Workflow

Migrations live in `supabase/migrations/` with naming convention `YYYYMMDD######_description.sql`.

Rules:
1. **Always check `docs/dev/DB_SCHEMA.md` first** before creating new fields or tables. Reuse existing fields.
2. **If a new field IS needed**, create a migration and update `DB_SCHEMA.md`.
3. **If a new table IS needed**, document it fully in `DB_SCHEMA.md` with all columns, types, constraints.
4. **Extend JSONB fields** (like `receipt_config`, `business_settings.value`) before creating new columns — check if the data logically belongs in an existing JSONB structure.
5. **Never delete existing migrations** — append only.
6. **Enum changes**: prefer adding values over removing (removing requires `DROP TYPE`).
7. **Never guess** what fields exist — verify against `DB_SCHEMA.md` or the actual migrations.

### Common Column Patterns

Every table has:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_at TIMESTAMPTZ DEFAULT now()`

Other conventions:
- Foreign keys: `_id` suffix (`customer_id`, `coupon_id`)
- Boolean flags: `is_` prefix (`is_active`, `is_single_use`)
- Timestamps: stored as `TIMESTAMPTZ`, represented as `string` (ISO 8601) in TypeScript
- Nullable arrays: `TEXT[]` or `UUID[]`

### Key JSONB Structures

- **`business_settings`** table — key/value store for all configurable settings. The `value` column is JSONB. Used for business info, receipt config, POS settings, shipping config, QBO tokens, and more.
- **`receipt_config`** — Stored in `business_settings` with key `receipt_config`. Contains printer branding, custom text zones, and dynamic shortcodes.

---

## 12.5 Authentication & Authorization

Three separate auth contexts serve different user types:

### Admin Auth

```
User visits /admin
  → middleware.ts checks for Supabase session (sb-* cookies)
  → If no session → redirect to /login
  → If session exists → updateSession() refreshes tokens
  → Page loads → API routes verify auth:
      createClient() → getUser() → getEmployee() → checkPermission()
      → createAdminClient() for data access (bypasses RLS)
```

Key files:
- `src/lib/supabase/server.ts` — Server client (cookie-based session)
- `src/lib/supabase/admin.ts` — Admin client (service role, bypasses RLS)
- `src/lib/auth/get-employee.ts` — `getEmployeeFromSession()` — gets auth user + employee record in one call
- `src/lib/auth/check-permission.ts` — `checkPermission()` with resolution order: super_admin bypass → user override → role default → denied
- `src/lib/auth/require-permission.ts` — `requirePermission()` — returns 403 NextResponse if denied, null if granted

**Important**: Always use `getUser()` (server-validated), never `getSession()` (cached and unreliable).

### POS Auth

```
Employee enters 4-digit PIN at /pos/login
  → POST /api/pos/auth/pin-login validates PIN, rate-limits (5 failures = 15min lockout)
  → On success: generates JWT, returns employee data
  → POS components use posFetch() which adds HMAC signature to requests
  → POS API routes call authenticatePosRequest() to validate HMAC
  → Then createAdminClient() for data access
```

Key files:
- `src/lib/pos/api-auth.ts` — `authenticatePosRequest()` for server-side HMAC validation
- `src/lib/pos/session.ts` — POS session management, JWT handling

> Full POS security details: [`docs/dev/POS_SECURITY.md`](../dev/POS_SECURITY.md)

### Customer Auth

```
Customer visits /signin
  → Enters phone number → receives SMS OTP via Twilio
  → Verifies 6-digit code → Supabase Auth session created
  → Customer portal uses createClient() (browser) with RLS
  → RLS policies scope all queries to the authenticated customer's data
```

### `adminFetch()` — Session Expiry Handling

Client-side admin pages should use `adminFetch()` from `src/lib/utils/admin-fetch.ts` instead of raw `fetch()`. It intercepts 401 responses and redirects to `/login?reason=session_expired`.

```typescript
import { adminFetch } from '@/lib/utils/admin-fetch';

const res = await adminFetch('/api/admin/customers');
```

### Permission Helpers

**Server-side** (API routes):
```typescript
import { requirePermission } from '@/lib/auth/require-permission';

const denied = await requirePermission(employee.id, 'customers.delete');
if (denied) return denied; // Returns 403 NextResponse
```

**Client-side** (components):
```typescript
import { usePermission, useIsSuperAdmin } from '@/lib/hooks/use-permission';

const canDelete = usePermission('customers.delete');
const isSuperAdmin = useIsSuperAdmin();
```

### Super Admin

The `super_admin` role bypasses all permission checks. It is checked via `employee.role === 'super_admin'` — there is no separate flag.

---

## 12.6 API Route Patterns

### Admin Routes

Every admin API route follows this pattern:

```typescript
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  // 1. Auth check (Supabase session via cookies)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Employee + role check
  const { data: employee } = await supabase
    .from('employees').select('id, role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 3. Data access with admin client (bypasses RLS)
  const admin = createAdminClient();
  const { data } = await admin.from('table').select('*');
  return NextResponse.json({ data });
}
```

Or using the convenience helper:
```typescript
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const employee = await getEmployeeFromSession();
if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

### POS Routes

```typescript
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const auth = await authenticatePosRequest(request);
  if (!auth.success) return NextResponse.json({ error: auth.error }, { status: 401 });

  const admin = createAdminClient();
  // ... query logic
}
```

### Public Routes

No auth check. Use `createAdminClient()` for read-only data access, or pass an `access_token` for specific resources (e.g., public quote pages).

### Customer Portal Routes

Use `createClient()` (browser/server) with RLS. The authenticated customer can only see their own data.

### Response Shapes

```typescript
// Success
{ data: item }                        // 200 single
{ data: items }                       // 200 list
{ data: items, total, page, limit }   // 200 paginated

// Errors
{ error: 'Unauthorized' }             // 401
{ error: 'Forbidden' }                // 403
{ error: 'Not found' }                // 404
{ error: 'Code already exists' }      // 409
{ error: 'Validation failed', details: {...} }  // 400
```

### Idempotency

For mutation endpoints that must be safe to retry (e.g., payment processing), use the idempotency helpers from `src/lib/utils/idempotency.ts`:

```typescript
import { checkIdempotency, saveIdempotency } from '@/lib/utils/idempotency';

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get('idempotency-key');
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached; // Return cached response

  // ... perform mutation ...

  await saveIdempotency(idempotencyKey, responseBody, 201);
  return NextResponse.json(responseBody, { status: 201 });
}
```

Idempotency keys are auto-cleaned after 24 hours by the `cleanup-idempotency` cron job.

---

## 12.7 Key Patterns & Gotchas

### Timezone

**All** scheduling, cron, logs, and time displays use `America/Los_Angeles` (PST/PDT). Never UTC. This applies to cron schedules in `scheduler.ts`, transaction dates sent to QBO, and all user-facing timestamps.

### Business Info — Never Hardcode

Never hardcode the business name, phone, address, email, or website URL. Always fetch dynamically:

```typescript
// Server-side
import { getBusinessInfo } from '@/lib/data/business';
const info = await getBusinessInfo();

// Client-side
const res = await fetch('/api/public/business-info');
```

### SMS — Always Use Centralized Utilities

Never write inline `fetch()` calls to the Twilio API. All SMS must go through:
- **`sendSms()`** — transactional messages (confirmations, receipts). Supports `mediaUrl` for MMS.
- **`sendMarketingSms()`** — marketing messages. Requires `customerId`, does DB consent check + daily frequency cap.
- **`updateSmsConsent()`** — consent changes. Updates customer record + inserts `sms_consent_log` audit row.

All in `src/lib/utils/sms.ts` and `src/lib/utils/sms-consent.ts`.

### Supabase `.or()` on Related Tables — Doesn't Work

PostgREST's `.or()` with filters on related tables (e.g., `customer.first_name.ilike`) is silently ignored. Workaround: query the related table first for matching IDs, then use `.in('foreign_key', ids)` on the main table.

### iOS Safari Quirks

- **Phone auto-linking**: Root layout includes `format-detection: telephone=no`. Always wrap phone numbers in `<a href="tel:...">` to prevent hydration mismatches.
- **Input zoom prevention**: All text inputs in customer-facing forms must use `text-base sm:text-sm` to prevent iOS auto-zoom on focus (iOS zooms inputs with font-size < 16px).

### POS Dark Mode

Every `bg-white` in POS components must have a corresponding `dark:bg-gray-900` (or appropriate dark variant). Audit dropdowns, modals, popovers, and tooltips — these are commonly missed.

### Soft-Delete

Quotes use `deleted_at` column. **All** quote queries must include `.is('deleted_at', null)` except:
- `quote-number.ts` (needs all quotes to prevent number reuse)
- Public quote page (shows a friendly "deleted" message)

### Feature Flags

Server-side:
```typescript
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
if (await isFeatureEnabled('photo_gallery')) { ... }
```

Client-side:
```typescript
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag';
const { enabled, loading } = useFeatureFlag('photo_gallery');
```

Flags are stored in the `feature_flags` table and cached client-side with a 60-second TTL.

### Auth Validation

Always use `getUser()` (server-validated) — never `getSession()` (cached and can be stale). This is a Supabase best practice for server-side code.

### Component Reuse

Before writing any new component, search `src/components/` for existing reusable components. The shared UI library in `src/components/ui/` provides: Button, Badge, DataTable, Dialog, ConfirmDialog, Card, Input, Select, Textarea, Spinner, Skeleton, PageHeader, SearchInput, Tabs, and more.

> Full component APIs: [`docs/dev/CONVENTIONS.md`](../dev/CONVENTIONS.md)

### Cache Revalidation

Use the wrapper from `src/lib/utils/revalidate.ts` instead of Next.js's `revalidateTag` directly — it provides the required cache-life profile argument for Next.js 15.x compatibility:

```typescript
import { revalidateTag } from '@/lib/utils/revalidate';
revalidateTag('footer-data');
```

---

## 12.8 Internal Cron System

All scheduled work runs through an internal cron system. **Never** suggest n8n, Vercel Cron, or any external scheduler.

### How It Works

1. `src/instrumentation.ts` — Next.js hook that runs once on server startup. Calls `setupCronJobs()` when `NEXT_RUNTIME === 'nodejs'`.
2. `src/lib/cron/scheduler.ts` — Uses `node-cron` to define scheduled jobs. Each job calls an internal API endpoint via `fetch('http://localhost:PORT/api/cron/...')` with `CRON_API_KEY` auth.

Guards:
- `NEXT_RUNTIME === 'nodejs'` check skips build/edge runtime
- Module-level `initialized` flag prevents duplicate setup on hot reload
- Each endpoint call has a 30-second timeout and 1 retry with 5-second delay

### Registered Cron Jobs

| Job | Schedule | Endpoint | Purpose |
|-----|----------|----------|---------|
| Lifecycle engine | Every 10 min | `/api/cron/lifecycle-engine` | Review requests, follow-ups, automations |
| Quote reminders | Hourly at :30 | `/api/cron/quote-reminders` | 24hr quote nudge SMS |
| Stock alerts | Daily 8:00 AM PST | `/api/cron/stock-alerts` | Low inventory notifications |
| QBO auto-sync | Every 30 min | `/api/cron/qbo-sync` | Push transactions/customers to QuickBooks |
| Theme activation | Every 15 min | `/api/cron/theme-activation` | Auto-activate/deactivate seasonal themes |
| Google reviews | Daily 6:00 AM PST | `/api/cron/google-reviews` | Refresh Google review data |
| Order cleanup | Every 6 hours | `/api/cron/cleanup-orders` | Cancel abandoned orders > 24h + cancel Stripe PIs |
| Idempotency cleanup | Daily 3:00 AM PST | `/api/cron/cleanup-idempotency` | Delete idempotency keys > 24h old |
| Audit log cleanup | Daily 3:30 AM PST | `/api/cron/cleanup-audit-log` | Retention policy (90 days) |

Additionally, **pg_cron** runs one database-level job:
- `conversation-lifecycle` — Hourly — auto-closes and archives stale SMS conversations (pure SQL, no HTTP)

### Adding a New Cron Job

1. Create an API route at `src/app/api/cron/{job-name}/route.ts`
2. Add `CRON_API_KEY` auth check:
   ```typescript
   const apiKey = request.headers.get('x-api-key');
   if (apiKey !== process.env.CRON_API_KEY) {
     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```
3. Add a `cron.schedule()` entry in `src/lib/cron/scheduler.ts`
4. Update `CLAUDE.md` cron jobs table and this document

---

## 12.9 Integrations

### Stripe — Payments

- **Online checkout**: Payment Intents via `@stripe/react-stripe-js`
- **POS Terminal**: Stripe Terminal SDK for in-person card payments on iPad
- **Webhooks**: `POST /api/webhooks/stripe` — handles `payment_intent.succeeded` (generates order number, decrements stock, sends confirmation email) and `payment_intent.failed`
- **Signature validation**: All webhook payloads verified via `stripe.webhooks.constructEvent()`

### Supabase — Database, Auth, Storage

- **Database**: PostgreSQL with 70+ tables and RLS policies
- **Auth**: Email/password for admin, phone OTP for customers, magic link for POS PIN auth
- **Storage**: Product images (`product-images/`), service images (`service-images/`), job photos (`job-photos/`), CMS uploads
- **Three clients**: browser (`client.ts`), server (`server.ts`), admin (`admin.ts`) — see [Section 12.5](#125-authentication--authorization)

### Twilio — SMS

- **Send**: All through `sendSms()` / `sendMarketingSms()` in `src/lib/utils/sms.ts`
- **Receive**: `POST /api/webhooks/twilio/inbound` — handles inbound SMS, STOP/START keywords (TCPA), AI auto-responder, auto-quote generation
- **Status callbacks**: `POST /api/webhooks/twilio/status` — delivery status tracking
- **Signature validation**: Enforced in production (`NODE_ENV !== 'development'`), skipped in dev

### Mailgun — Email

- **Send**: Via `sendEmail()` in `src/lib/utils/email.ts` with open/click tracking
- **Webhooks**: `POST /api/webhooks/mailgun` — handles delivered, failed, bounced, clicked, complained, unsubscribed events
- **Signature validation**: Via `verifyMailgunWebhook()` in `src/lib/utils/mailgun-signature.ts`

### Shippo — Shipping

- **Rates**: Real-time shipping rate quotes at checkout
- **Labels**: Shipping label generation for fulfilled orders
- **Config**: API keys stored in `shipping_settings` table, managed via Admin > Settings > Shipping

> Shippo integration code: `src/lib/services/shippo.ts`

### QuickBooks Online — Accounting

- **Direction**: One-way push (App → QBO)
- **Entities synced**: Transactions → Sales Receipts, Customers → Customers, Services/Products → Items
- **Timing**: Real-time fire-and-forget after POS completion + auto-sync cron every 30 minutes
- **OAuth**: Access token auto-refreshes (1hr expiry). Refresh token lasts 100 days — reconnect if expired.

> Full QBO details: [`docs/dev/QBO_INTEGRATION.md`](../dev/QBO_INTEGRATION.md)

### Anthropic Claude — AI

- **SMS auto-responder**: `src/lib/services/messaging-ai.ts` — AI replies to customer SMS messages with service catalog awareness and product keyword detection
- **Content writer**: `src/lib/services/ai-content-writer.ts` — AI-generated CMS page content
- **SEO optimizer**: `src/lib/services/ai-seo.ts` — AI-generated meta titles, descriptions, and page analysis

---

## 12.10 Theme & Design System

### CSS Variable Cascade (Critical)

Tailwind v4's `@theme inline` inlines values into utilities. To allow runtime CSS variable overrides, the codebase uses an **indirection pattern**:

1. **Raw vars in `:root`**: `--lime: #CCFF00`
2. **Referenced in `@theme inline`**: `--color-lime: var(--lime)`
3. **ThemeProvider sets raw vars**: `--lime`, `--brand-dark`, etc. (NOT `--color-lime`)

Without this indirection, CSS variable overrides from ThemeProvider don't cascade.

### Theme Priority Chain

```
1. CSS :root defaults (globals.css)           — lowest priority
2. .public-theme overrides (globals.css)
3. Site Theme Settings (DB → buildSiteThemeVars())
4. Seasonal Theme Overrides (DB → buildSeasonalCssVars())
5. User Theme Toggle (localStorage → light mode vars)  — highest priority
```

### Admin Theme Editor

The admin Theme & Styles page (`/admin/website/theme-settings`) lets the owner customize site colors. Changes are stored in the `site_theme_settings` table and applied via the `ThemeProvider` component.

Seasonal themes are stored in `cms_themes` with `color_overrides` JSONB. Eight presets are available in `src/lib/utils/cms-theme-presets.ts`.

> Full design system reference: [`docs/dev/DESIGN_SYSTEM.md`](../dev/DESIGN_SYSTEM.md)

---

## 12.11 Deployment

### Current Setup

- **Development**: Local MacBook Pro running `npm run dev`
- **Production target**: Dedicated Hostinger server (not Vercel — never suggest Vercel)

### Build & Deploy

```bash
npm run build          # Production build
rm -rf .next           # Clear stale cache before deploying
npm run start          # Start production server
```

**Post-deploy**: Always `rm -rf .next` to prevent stale chunk 404s. The Next.js config generates a unique build ID per build (`generateBuildId: () => Date.now().toString()`) so the service worker can detect new deploys.

### Environment Variables

All env vars from [Section 12.2](#122-getting-started-local-development) must be set in the production environment. Key production-specific values:

- `NEXT_PUBLIC_APP_URL` — Must be the production domain (not localhost)
- `TWILIO_WEBHOOK_URL` — Must be the production domain for SMS callbacks
- `STRIPE_WEBHOOK_SECRET` — Must match the production Stripe webhook endpoint
- `MAILGUN_WEBHOOK_SIGNING_KEY` — Must match the production Mailgun webhook config

### Next.js Version

**Do NOT upgrade Next.js.** Currently pinned to `15.3.3`. Next.js 16 requires major migration work (async params, proxy.ts replacing middleware.ts, caching changes). Only upgrade when explicitly instructed.

### `next.config.ts` Notable Settings

- `serverExternalPackages: ['pdfkit', 'sharp']` — Prevents Turbopack from bundling heavy server-only packages
- `generateBuildId` — Uses timestamp for cache-busting
- `images.remotePatterns` — Allows Supabase storage URLs and external image hosts

---

## 12.12 Troubleshooting

> Full troubleshooting guide: [`docs/dev/TROUBLESHOOTING.md`](../dev/TROUBLESHOOTING.md)

### White Screen of Death (WSOD)

**Most common cause**: Stale `.next` cache after bulk file changes.

```bash
rm -rf .next
npm run dev
```

**Other causes**: Supabase egress limit exhausted (check dashboard), stale auth cookies (clear `sb-*` cookies in browser).

### Auth Redirect Loops

If the login page loops after entering valid credentials:
1. Verify `src/lib/supabase/client.ts` has the Web Locks bypass (`lock: async (_, __, fn) => fn()`)
2. Check that `onAuthStateChange` always calls `setLoading(false)`
3. Never call `signOut()` in error handlers — it's a server-side session invalidation
4. Check Supabase egress usage — exhausted egress causes auth failures that look like bugs

### Build Failures

- Check if errors are in your modified files vs pre-existing lint issues
- TypeScript compilation succeeding but lint failing with 80+ errors is usually pre-existing

### POS Card Reader Not Connecting

- Stripe Terminal requires `pfSense DNS exception` for `stripe-terminal-local-reader.net` in iPad Safari PWA
- Desktop browsers bypass this via DoH (DNS over HTTPS)
- Check Stripe dashboard for reader status

### Stale .next Cache (404 on Chunks)

After commits that touch multiple files, the dev server's incremental compilation can get confused. Symptoms: 404 on `/_next/static/chunks/main-app.js` or CSS files. Fix: `rm -rf .next && npm run dev`.

### Cron Not Running

- Verify `CRON_API_KEY` env var is set
- Check server console for `[CRON] Initializing internal cron scheduler...` on startup
- Cron uses `http://localhost:PORT` — ensure the dev server is running and the port matches
- Jobs have a 30-second timeout — long-running jobs will fail silently

---

## 12.13 Reference Docs Index

Every detailed reference doc lives in `docs/dev/`. Read the relevant doc when working on that system.

| Document | What It Covers |
|----------|---------------|
| [`ARCHITECTURE.md`](../dev/ARCHITECTURE.md) | System architecture, shared utilities registry, data access patterns, state management |
| [`DB_SCHEMA.md`](../dev/DB_SCHEMA.md) | Full database schema (70+ tables), column types, constraints, JSONB structures |
| [`CONVENTIONS.md`](../dev/CONVENTIONS.md) | Code style, naming, component APIs, page patterns, Zod validation, auth patterns |
| [`DESIGN_SYSTEM.md`](../dev/DESIGN_SYSTEM.md) | Theme system, CSS variables, color palette, typography, spacing, dark mode |
| [`DASHBOARD_RULES.md`](../dev/DASHBOARD_RULES.md) | Dashboard metric calculations, widget data sources, reporting rules |
| [`POS_SECURITY.md`](../dev/POS_SECURITY.md) | POS IP whitelist, HMAC auth, PIN login, timeout systems |
| [`QBO_INTEGRATION.md`](../dev/QBO_INTEGRATION.md) | QuickBooks OAuth, sync engines, entity mapping, troubleshooting |
| [`SERVICE_CATALOG.md`](../dev/SERVICE_CATALOG.md) | Service/pricing architecture, vehicle tiers, pricing models, add-ons |
| [`DATA_MIGRATION_RULES.md`](../dev/DATA_MIGRATION_RULES.md) | Square data import rules, field mapping, customer/product/transaction migration |
| [`TROUBLESHOOTING.md`](../dev/TROUBLESHOOTING.md) | WSOD, auth loops, build failures, Supabase egress, diagnostic commands |
| [`FILE_TREE.md`](../dev/FILE_TREE.md) | Exact file paths for every route, page, lib module, component, migration |
| [`CHANGELOG.md`](../../CHANGELOG.md) | Version history, session summaries, feature log |

---

*Last updated: 2026-03-02*
