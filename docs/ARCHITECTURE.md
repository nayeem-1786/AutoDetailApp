# Architecture — Codebase Map & Shared Registry

> **Purpose:** This document maps every shared utility, component, and pattern in the codebase. Sub-agents MUST read this before writing any code. If a utility or component exists here, USE IT — do not create a duplicate.
>
> **Parent Document:** See [`PROJECT.md`](./PROJECT.md) for full specs and [`CONVENTIONS.md`](./CONVENTIONS.md) for auth patterns and component APIs.

---

## Table of Contents

1. [Directory Map](#1-directory-map)
2. [Shared Utilities — MUST REUSE](#2-shared-utilities--must-reuse)
3. [Shared UI Components — MUST REUSE](#3-shared-ui-components--must-reuse)
4. [Feature Components — MUST REUSE](#4-feature-components--must-reuse)
5. [Data Access Layer](#5-data-access-layer)
6. [State Management Patterns](#6-state-management-patterns)
7. [API Route Patterns](#7-api-route-patterns)
8. [Page Architecture Patterns](#8-page-architecture-patterns)
9. [Quote Service Layer](#9-quote-service-layer-srclibquotes)
10. [Known Duplication Debt](#10-known-duplication-debt)
11. [Rules for Adding New Code](#11-rules-for-adding-new-code)
12. [Scheduled Jobs & Cron Infrastructure](#12-scheduled-jobs--cron-infrastructure)

---

## 1. Directory Map

```
src/
├── app/
│   ├── admin/                          # Admin panel — all pages 'use client'
│   │   ├── page.tsx                    # Dashboard (stat cards, calendar, quick links)
│   │   ├── customers/                  # Customer CRUD, detail with tabs
│   │   ├── catalog/
│   │   │   ├── products/               # Product list, detail
│   │   │   └── services/               # Service list, detail
│   │   ├── marketing/
│   │   │   ├── coupons/                # Coupon list, 6-step wizard, detail
│   │   │   └── campaigns/              # Campaign list, create, detail
│   │   ├── quotes/                     # Quote list (READ-ONLY), detail, stats
│   │   ├── settings/                   # Business profile, POS security, roles
│   │   └── appointments/               # Calendar view, waitlist
│   │
│   ├── api/                            # REST API routes
│   │   ├── admin/                      # Admin-specific (current-ip, customers/search, quotes oversight)
│   │   ├── marketing/coupons/          # Coupon CRUD
│   │   ├── quotes/                     # Quote CRUD, send, convert, activities, stats
│   │   ├── pos/                        # POS-specific routes (HMAC auth)
│   │   │   ├── quotes/                 # POS quote CRUD, send, convert, activities
│   │   │   ├── coupons/                # POS coupon validation
│   │   │   └── transactions/           # POS transaction processing
│   │   ├── webhooks/                   # Mailgun, Stripe, external webhooks
│   │   ├── customer/                   # Customer portal API (RLS-scoped)
│   │   ├── book/                       # Public booking (payment-intent, validate-coupon)
│   │   └── voice-agent/                # 11 Labs API (6 endpoints, API key auth)
│   │
│   ├── pos/                            # POS system — PIN auth, iPad-optimized
│   │   ├── page.tsx                    # Main POS layout (catalog + ticket)
│   │   ├── components/                 # POS-specific components
│   │   │   ├── checkout/               # Payment flow, tip, receipt
│   │   │   ├── quotes/                 # Quote list, detail, builder, helpers
│   │   │   ├── catalog/                # Product/service browsing
│   │   │   └── transactions/           # Transaction history, refunds
│   │   └── context/                    # POS state (React Context + useReducer)
│   │
│   ├── (public)/                       # Public pages (Server Components for SEO)
│   │   ├── book/                       # Online booking wizard
│   │   ├── services/                   # Service catalog (public)
│   │   ├── products/                   # Product catalog (public)
│   │   ├── quote/[token]/              # Public quote view/accept
│   │   └── unsubscribe/                # Notification opt-out
│   │
│   └── (account)/                      # Customer portal (authenticated)
│       ├── portal/                     # Dashboard, appointments, vehicles
│       └── signin/                     # Customer OTP login
│
├── components/
│   ├── ui/                             # ⭐ SHARED UI LIBRARY (see Section 3)
│   └── quotes/                         # ⭐ SHARED QUOTE COMPONENTS (see Section 4)
│
├── lib/
│   ├── supabase/                       # Database clients and types
│   │   ├── client.ts                   # Browser client (anon key, singleton)
│   │   ├── server.ts                   # Server client (cookie-based sessions)
│   │   ├── admin.ts                    # Admin client (service role, bypasses RLS)
│   │   └── types.ts                    # ⭐ HAND-WRITTEN TYPES (see Section 2)
│   │
│   ├── auth/                           # Auth providers, roles, permissions
│   ├── data/
│   │   └── business.ts                 # ⭐ getBusinessInfo() — NEVER hardcode biz info
│   ├── cron/                          # Internal cron scheduler
│   │   └── scheduler.ts              # node-cron job definitions
│   ├── hooks/                          # ⭐ SHARED HOOKS (see Section 2)
│   └── utils/                          # ⭐ SHARED UTILITIES (see Section 2)
│
└── supabase/
    └── migrations/                     # Postgres migrations (append only)
```

---

## 2. Shared Utilities — MUST REUSE

These files contain logic that MUST be imported, never recreated inline.

### Types (`src/lib/supabase/types.ts`)

Single source of truth for all TypeScript interfaces matching the database schema.

**Contains:**
- Every table interface: `Customer`, `Employee`, `Quote`, `QuoteItem`, `QuoteCommunication`, `QuoteActivity`, `Service`, `Product`, `Appointment`, `Vehicle`, `Coupon`, `CouponReward`, `Transaction`, `Campaign`, etc.
- Enum types: `QuoteStatus`, `FollowUpStatus`, `ActivityType`, `EmployeeRole`, `AppointmentStatus`
- Utility types: `ActionResult<T>`

**Rules:**
- Every new table gets an interface here
- `id`, `created_at`, `updated_at` on every type
- Foreign keys are `string | null`
- Joined relations are optional (`rewards?: CouponReward[]`)
- Timestamps are `string` (ISO 8601)

### Constants (`src/lib/utils/constants.ts`)

All label maps, color maps, and business constants.

**Contains:**
- `FOLLOW_UP_STATUS_LABELS` / `FOLLOW_UP_STATUS_COLORS`
- `ACTIVITY_TYPE_LABELS` / `ACTIVITY_OUTCOMES`
- `QUOTE_STATUS_LABELS` / badge variant mappings
- Feature flag keys
- Business constants (tax rate 10.25%, default valid_until 10 days, etc.)

**Rule:** If you need a display label or color for any enum value, it's here. Do not create local mappings.

### Formatters (`src/lib/utils/format.ts`)

All display formatting functions.

**Contains:**
- `formatCurrency(amount)` — consistent $ formatting
- `formatDate(date)` / `formatDateTime(date)` — consistent date display
- `formatDateFull(date)` — full date with long month (e.g., "January 15, 2026")
- `formatDateWithWeekday(date)` — date with weekday prefix (e.g., "Wednesday, Jan 15, 2026")
- `formatDateLong(date)` — long-form date (used by PDF route)
- `formatPhone(phone)` — E.164 → display format
- `formatRelativeDate(date)` — "2 hours ago", "Yesterday", etc.
- `formatTime(time)` — 24h to 12h time conversion
- `formatPoints(points)` — loyalty points display
- `formatPercent(value)` — percentage display

**Rule:** Never use `toLocaleDateString()` or `Intl.NumberFormat` inline. Always import from here.

### Validation (`src/lib/utils/validation.ts`)

All Zod schemas for form and API validation.

**Contains:**
- `createQuoteSchema`, `updateQuoteSchema`
- `createCouponSchema`, `updateCouponSchema`
- `createCustomerSchema`
- `createAppointmentSchema`
- `convertSchema` — quote-to-appointment conversion validation
- `logActivitySchema` — quote activity logging validation
- `unsubscribePrefsSchema` — notification preference validation
- Shared field validators (phone, email, price)
- `follow_up_status` enum in `updateQuoteSchema`

**Rule:** All API routes and forms validate through schemas defined here. No inline Zod schemas.

### Form Utilities (`src/lib/utils/form.ts`)

- `formResolver(schema)` — wraps Zod schema for react-hook-form

### Class Name Utility (`src/lib/utils/cn.ts`)

- `cn(...classes)` — Tailwind class merger (clsx + twMerge)

### Business Data (`src/lib/data/business.ts`)

- `getBusinessInfo()` — returns name, phone, address, email from DB

**CRITICAL:** NEVER hardcode business name, phone, address, or email anywhere. Always call this function.

### Quote Number Generation (`src/lib/utils/quote-number.ts`)

- Generates `Q-0001`, `Q-0002`, etc. from `quote_number DESC` ordering
- Queries ALL quotes including soft-deleted (only exception to `deleted_at` filter)

### Communication Utilities

| File | Purpose |
|------|---------|
| `src/lib/utils/email.ts` | Send email via Mailgun (with open/click tracking) |
| `src/lib/utils/sms.ts` | Send SMS via Twilio |
| `src/lib/utils/template.ts` | Variable replacement in message templates |
| `src/lib/utils/webhook.ts` | Dispatch webhooks for lifecycle events |
| `src/lib/cron/scheduler.ts` | Internal cron scheduler — node-cron jobs for lifecycle-engine + quote-reminders |

### Audience & Campaign

| File | Purpose |
|------|---------|
| `src/lib/utils/audience.ts` | Campaign audience filter helpers |

### Hooks (`src/lib/hooks/`)

| Hook | Purpose | Used By |
|------|---------|---------|
| `useFeatureFlag(key)` | Feature flag with 60s cache | Any togglable feature |
| `usePermission(perm)` | Check employee permission | Admin pages with RBAC |
| `useIsSuperAdmin()` | Role check shortcut | Settings, dangerous actions |
| `useIsAdminOrAbove()` | Role check shortcut | Most admin features |

### Auth Utilities

| File | Purpose |
|------|---------|
| `src/lib/auth/auth-provider.tsx` | `useAuth()` — session, employee, role, permissions |
| `src/lib/auth/roles.ts` | `ROUTE_ACCESS` map for role-based route access |
| `src/lib/auth/permissions.ts` | Permission checking helpers |
| `src/lib/utils/admin-fetch.ts` | `adminFetch()` — auto-redirect on 401 session expiry |

### POS-Specific Auth

| Utility | Purpose | File |
|---------|---------|------|
| `usePosAuth()` | POS session context (employee, role) | POS components |
| `posFetch()` | HMAC-signed fetch for POS API routes | POS components |
| `authenticatePosRequest()` | Server-side HMAC validation | POS API routes |

**CRITICAL:** POS files must use `usePosAuth()` (never `useAuth`), `posFetch()` (never `fetch`), and `authenticatePosRequest()` in API routes.

---

## 3. Shared UI Components — MUST REUSE

Located in `src/components/ui/`. These are the building blocks for ALL pages.

| Component | Purpose | Used By |
|-----------|---------|---------|
| `Button` | All buttons (variants: default, destructive, outline, secondary, ghost, link) | Everywhere |
| `Badge` | Status badges (variants: default, info, warning, success, destructive, secondary) | Status displays |
| `DataTable` | All tabular data (wraps @tanstack/react-table) | Every list page |
| `Dialog` / `ConfirmDialog` | Modal dialogs with focus trap | All confirmation flows |
| `Select` / `SelectTrigger` / `SelectContent` | Dropdown selects | Filters, forms |
| `Input` | Text inputs | All forms |
| `Textarea` | Multi-line inputs | Notes, descriptions |
| `Card` | Content containers | Dashboard, detail pages |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | Tab navigation | List pages, detail pages |
| `Spinner` | Loading indicator | Loading states |
| `PageHeader` | Page title + description + action buttons | Every page |
| `SearchInput` | Search with debounce | All list pages |
| `SendMethodDialog` | Unified email/SMS/both send dialog | Quotes, receipts, notifications |
| `LogActivityDialog` | Quote follow-up activity logger | Admin quotes, POS quotes |
| `Skeleton` | Loading placeholder | Data-loading views |
| `SlideOver` | Right slide-in panel (md/lg/xl/2xl widths) | Quote detail preview, detail panels |

**Rules:**
- NEVER create a new button, badge, input, or dialog component. Use the existing ones.
- NEVER create a custom table. Use `DataTable` with column definitions.
- NEVER create a custom loading spinner. Use `Spinner` or `Skeleton`.
- All list pages use `PageHeader` + `SearchInput` + filter `Select` + `DataTable`.

---

## 4. Feature Components — MUST REUSE

### Quote Components (`src/components/quotes/`)

| Component | Purpose | Used By |
|-----------|---------|---------|
| `LogActivityDialog` | Log call/SMS/email/note with outcome | Admin quote detail, POS quote detail |
| (Planned) `QuoteTimeline` | Unified activity + communication timeline | Should be shared, currently duplicated |

### Known Duplication in Quotes (TO FIX)

The admin quote detail page and POS quote detail page each have their OWN timeline rendering logic. This should be extracted into a shared `QuoteTimeline` component in `src/components/quotes/`.

---

## 5. Data Access Layer

### Three Supabase Clients

| Client | File | Auth | RLS | Use When |
|--------|------|------|-----|----------|
| Browser | `src/lib/supabase/client.ts` | Anon key | Yes | Client components, customer portal |
| Server | `src/lib/supabase/server.ts` | Cookie session | Yes | API routes (auth check step) |
| Admin | `src/lib/supabase/admin.ts` | Service role | No (bypasses) | API routes (data access after auth) |

### Auth Check → Data Access Pattern

```
Admin API route: createClient() → getUser() → verify employee role → createAdminClient() → query
POS API route:   authenticatePosRequest() → createAdminClient() → query
Customer API:    createClient() → getUser() → query (RLS scopes to user)
Public endpoint:  No auth → createAdminClient() → query (access_token in params)
```

### Critical Query Rules

- **Soft-delete filter:** ALL quote queries MUST include `.is('deleted_at', null)` EXCEPT `quote-number.ts` and the public quote page.
- **Supabase `.or()` on related tables** doesn't work. Query the related table first, then `.in('foreign_key', ids)`.
- **Use `getUser()` not `getSession()`** — `getUser()` is server-validated, `getSession()` is cached and unreliable.

---

## 6. State Management Patterns

### Admin Pages

Simple `useState` + `useEffect` + `useMemo` for filtering. No global state manager.

```
useState(items) → useEffect(load) → useMemo(filtered) → DataTable
```

### POS System

React Context + `useReducer` pattern:
- `QuoteProvider` + `useQuote()` for quote builder state
- `TicketProvider` + `useTicket()` for POS checkout state
- `PosAuthProvider` + `usePosAuth()` for POS session

### Customer Portal

`CustomerAuthProvider` with `createClient()` (RLS-scoped).

---

## 7. API Route Patterns

### Admin Routes

Every admin API route follows this exact pattern:

```typescript
export async function GET(request: NextRequest) {
  // Step 1: Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Step 2: Role check
  const { data: employee } = await supabase
    .from('employees').select('role').eq('auth_user_id', user.id).single();
  if (!employee || !['super_admin', 'admin'].includes(employee.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Step 3: Data access with admin client
  const admin = createAdminClient();
  // ... query logic
}
```

⚠️ **KNOWN SECURITY DEBT:** Several admin quote routes are MISSING auth checks (see QUOTES_AUDIT.md Part 3). These must be fixed.

### POS Routes

```typescript
export async function GET(request: NextRequest) {
  const auth = await authenticatePosRequest(request);
  if (!auth.success) return NextResponse.json({ error: auth.error }, { status: 401 });

  const admin = createAdminClient();
  // ... query logic
}
```

### Response Shapes

```typescript
// Success
{ data: item }                          // 200 single
{ data: items }                         // 200 list
{ data: items, total, page, limit }     // 200 paginated

// Error
{ error: 'Unauthorized' }              // 401
{ error: 'Forbidden' }                 // 403
{ error: 'Not found' }                 // 404
{ error: 'Code already exists' }       // 409
{ error: 'Validation failed', details: {...} }  // 400
```

---

## 8. Page Architecture Patterns

### List Page Pattern

Every list page follows:

```
PageHeader (title + count + create button)
├── Search + Filter row (SearchInput + Select dropdowns)
├── Tabs (optional, for status filtering)
└── DataTable (columns, data, empty state)
```

### Detail Page Pattern

Every detail page follows:

```
PageHeader (title + status badge + action buttons)
├── Info Cards (grid: sm:2 lg:4)
├── Main Content (services table, form sections)
├── Timeline/History (activity log, communications)
└── Action Dialogs (confirm, send, convert)
```

### Inline Edit Pattern

Used on detail pages for quick field updates:

```
editingField state → show input → save via PATCH → update local state → toast
```

See `CONVENTIONS.md` for the full inline edit code pattern.

---

## 9. Quote Service Layer (`src/lib/quotes/`)

Shared business logic for quotes, consumed by both admin and POS API routes. Each function takes an authenticated `SupabaseClient` as its first parameter — auth stays in the route, logic lives here.

| File | Functions | Purpose |
|------|-----------|---------|
| `quote-service.ts` | `listQuotes()`, `createQuote()`, `getQuoteById()`, `updateQuote()`, `softDeleteQuote()`, `getQuotePipelineStats()`, `getQuoteMetrics()`, `getQuoteSentCounts()`, `listQuotesAdmin()` | CRUD operations, tax calculation, access token generation, item management, pipeline analytics, admin oversight queries |
| `send-service.ts` | `sendQuote()` | Email (Mailgun) + SMS (Twilio MMS) delivery, email HTML/text template generation, communication record logging, status update, webhook dispatch |
| `convert-service.ts` | `convertQuote()` | Quote-to-appointment conversion, appointment_services creation, detailer auto-assignment, status update, webhook dispatch |

**Error handling:** `quote-service.ts` exports `QuoteNotFoundError` and `QuoteDraftOnlyError` classes. API routes catch these to return the correct HTTP status codes (404, 400).

**Usage pattern:**
```typescript
// In API route — auth stays here, logic delegates to service
const supabase = createAdminClient();
const result = await sendQuote(supabase, id, method);
if (!result.success) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
return NextResponse.json(result);
```

---

## 10. Known Duplication Debt

| What's Duplicated | Admin Location | POS Location | Fix |
|-------------------|---------------|--------------|-----|
| Timeline rendering | Admin quote detail (inline JSX) | POS quote detail (inline JSX) | Extract to `src/components/quotes/quote-timeline.tsx` |
| Currency/date formatters | `src/app/pos/components/quotes/quote-helpers.ts` | `src/lib/utils/format.ts` | Remove POS helpers, use shared `format.ts` |

---

## 11. Rules for Adding New Code

### Before Writing ANY Code

1. **Read this document** — know what shared utilities and components exist
2. **Read `DESIGN_SYSTEM.md`** — follow visual patterns exactly
3. **Search the codebase** for similar functionality: `grep -r "functionName" src/`
4. **If a shared utility exists, USE IT** — do not create a local version
5. **If you need new reusable logic**, add it to the appropriate shared file, not inline

### Where New Code Goes

| What You're Building | Where It Goes |
|---------------------|---------------|
| New TypeScript type | `src/lib/supabase/types.ts` |
| New display label or color map | `src/lib/utils/constants.ts` |
| New formatting function | `src/lib/utils/format.ts` |
| New validation schema | `src/lib/utils/validation.ts` |
| New reusable UI component | `src/components/ui/` |
| New feature-specific shared component | `src/components/{feature}/` |
| New shared business logic | `src/lib/{domain}/` (e.g., `src/lib/quotes/`) |
| New hook | `src/lib/hooks/` |
| New admin page | `src/app/admin/{section}/` |
| New API route | `src/app/api/{section}/` |
| Page-specific component (not reusable) | `src/app/{section}/_components/` |

### What You Must NOT Do

- ❌ Create a local `formatCurrency()` — use `src/lib/utils/format.ts`
- ❌ Create a local status label map — use `src/lib/utils/constants.ts`
- ❌ Create a new button or badge variant — use existing `Button` and `Badge`
- ❌ Create a new dialog component — use `Dialog` or `ConfirmDialog`
- ❌ Create a new table component — use `DataTable`
- ❌ Inline a Zod schema in an API route — add it to `validation.ts`
- ❌ Hardcode business name/phone/address — use `getBusinessInfo()`
- ❌ Use `getSession()` for auth — use `getUser()`
- ❌ Use `fetch()` in POS components — use `posFetch()`
- ❌ Use `useAuth()` in POS components — use `usePosAuth()`
- ❌ Use inline styles — use Tailwind classes per `DESIGN_SYSTEM.md`
- ❌ Skip the soft-delete filter on quote queries — always `.is('deleted_at', null)`

---

## 12. Scheduled Jobs & Cron Infrastructure

ALL scheduling is handled internally — no external schedulers, no n8n, no Vercel Cron.

### Mechanism A: pg_cron (In-Database SQL)

Runs PL/pgSQL functions directly inside Postgres. Pure SQL only — no HTTP, no Node.js.

| Job Name | Schedule | Function | Migration |
|----------|----------|----------|-----------|
| `conversation-lifecycle` | `0 * * * *` (hourly) | `auto_close_and_archive_conversations()` | `20260209000012` |

**When to use:** Pure data manipulation (UPDATE/INSERT/DELETE) with no external API calls.

**Pattern:**
```sql
CREATE OR REPLACE FUNCTION my_task() RETURNS void AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;
SELECT cron.schedule('job-name', '0 * * * *', $$SELECT my_task()$$);
```

**Limitations:** Cannot call external APIs, cannot run Node.js, cannot use app utilities.

### Mechanism B: Internal Cron via node-cron + instrumentation.ts

App-internal scheduler using `node-cron`. Runs inside the Next.js server process, calls API cron endpoints via self-fetch with `CRON_API_KEY` auth.

**Infrastructure files:**
| File | Purpose |
|------|---------|
| `src/instrumentation.ts` | Next.js hook — calls `setupCronJobs()` once on server startup |
| `src/lib/cron/scheduler.ts` | Defines all scheduled jobs, self-fetches API endpoints |

**Registered jobs:**
| Endpoint | Purpose | Schedule | Auth |
|----------|---------|----------|------|
| `/api/cron/lifecycle-engine` | Lifecycle automation (review requests, follow-ups) | Every 10 minutes | `CRON_API_KEY` |
| `/api/cron/quote-reminders` | 24hr quote nudge SMS | Every hour at :30 | `CRON_API_KEY` |

**API cron endpoint auth pattern:**
```typescript
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... job logic
}
```

**Adding a new scheduled job:**
1. Create API route at `src/app/api/cron/{job-name}/route.ts` with `CRON_API_KEY` auth
2. Add `cron.schedule()` entry in `src/lib/cron/scheduler.ts`
3. Document in this section's tables above

**Guards:**
- `NEXT_RUNTIME === 'nodejs'` check in instrumentation.ts (skips build/edge)
- Module-level `initialized` flag prevents duplicate setup on hot reload

### Decision Guide: pg_cron vs node-cron API Endpoint

| Question | pg_cron | node-cron + API |
|----------|---------|-----------------|
| Needs external APIs (Twilio, Mailgun)? | No | Yes |
| Needs Node.js utilities (sendSms, templates)? | No | Yes |
| Pure SQL data cleanup/updates? | Yes | Overkill |
| Failure visibility | Postgres logs only | Console logs + HTTP response |
