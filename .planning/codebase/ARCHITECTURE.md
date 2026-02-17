# Architecture

**Analysis Date:** 2026-02-16

## Pattern Overview

**Overall:** Full-Stack Next.js Application with Multi-Tenant Role-Based Access Control

**Key Characteristics:**
- Server-side rendering (SSR) for public pages with SEO optimization
- Client-side state management for interactive applications (POS, admin)
- Multi-authentication strategy (cookie-based admin, HMAC-based POS, customer portal)
- Row-Level Security (RLS) enforcement via Supabase
- Service role bypass for admin operations after authentication
- Real-time data synchronization via Supabase Realtime
- Feature flag system for progressive rollout (14 flags across 7 categories)

## Layers

**Public Layer:**
- Purpose: Customer-facing marketing and booking surfaces
- Location: `src/app/(public)`
- Contains: Server Components for SEO, dynamic pages, booking wizard, quote acceptance
- Depends on: Supabase (RLS queries), business data layer, CMS content
- Used by: Public visitors, search engines, embedded booking widget

**Customer Portal Layer:**
- Purpose: Authenticated customer self-service
- Location: `src/app/(account)/account`
- Contains: Service history, loyalty points, profile management, appointments
- Depends on: Supabase RLS (customer-owned data only), cookie authentication
- Used by: Registered customers

**POS Layer:**
- Purpose: Point-of-sale application for staff iPad
- Location: `src/app/pos`
- Contains: Ticket builder, checkout, quotes, jobs, end-of-day close
- Depends on: HMAC authentication, POS-specific API routes, Stripe Terminal
- Used by: Cashier, Detailer, Admin roles with POS access

**Admin Layer:**
- Purpose: Business management and configuration
- Location: `src/app/admin`
- Contains: Customers, catalog, inventory, marketing, settings, analytics
- Depends on: Cookie authentication + admin client (service role bypass)
- Used by: Admin, Super-Admin roles

**API Layer:**
- Purpose: REST endpoints for all application operations
- Location: `src/app/api`
- Contains: Admin routes (service role), POS routes (HMAC auth), public routes, webhooks
- Depends on: Authentication middleware, permission checking, Supabase
- Used by: All layers, external integrations (Twilio, Mailgun, 11 Labs voice agent)

**Data/Business Logic Layer:**
- Purpose: Reusable data access and business logic
- Location: `src/lib`
- Contains: Auth helpers, data queries, services, utilities, type definitions
- Depends on: Supabase clients (admin/cookie), external APIs
- Used by: All layers

## Data Flow

**Customer Booking Flow:**

1. Public user visits `/book` (Server Component)
2. Page loads business info, services, mobile zones from Supabase
3. Client-side wizard captures vehicle, service, date/time selections
4. Form submits to `POST /api/book` with Stripe payment intent
5. API creates customer (if new), vehicle, appointment, quote records
6. Stripe payment succeeds → appointment confirmed, SMS/email sent
7. Appointment appears in admin calendar and POS jobs queue

**POS Transaction Flow:**

1. Staff authenticates via PIN → HMAC session stored in localStorage
2. POS shell wraps app with TicketProvider, CheckoutProvider contexts
3. Staff adds services/products → ticket state managed in context + localStorage
4. Checkout overlay opens → calculates totals, applies discounts, validates coupon
5. Stripe Terminal processes payment → `POST /api/pos/transactions`
6. API uses `authenticatePosRequest()` + `createAdminClient()` to create transaction
7. Fire-and-forget hooks: QBO sync, job linking, loyalty points earned
8. Receipt printed, ticket cleared

**Admin Data Access:**

1. Admin user logs in via `/login` → Supabase cookie auth
2. Middleware checks `getUser()` → redirects if unauthenticated
3. Admin page loads → server action calls `createClient()` for session
4. API route checks auth → `createAdminClient()` bypasses RLS
5. Permission check via `requirePermission()` or `checkPermission()`
6. Data returned to client, rendered in DataTable or detail page

**State Management:**
- POS: React Context (Ticket, Checkout, HeldTickets, Reader, Quote) + localStorage persistence
- Admin: Server-fetched data + client-side filtering/sorting (no global state)
- Customer Portal: Server Components + cookie-authenticated API calls
- Real-time: Supabase Realtime subscriptions for messaging inbox, POS updates

## Key Abstractions

**Authentication Clients:**
- Purpose: Three authentication patterns for different surfaces
- Examples: `src/lib/supabase/server.ts` (cookie), `src/lib/supabase/admin.ts` (service role), `src/lib/pos/auth.ts` (HMAC)
- Pattern: Factory functions return configured Supabase client instances

**Permission System:**
- Purpose: Granular role-based access control
- Examples: `src/lib/auth/check-permission.ts`, `src/lib/auth/require-permission.ts`, `src/lib/auth/permissions.ts`
- Pattern: 76 permission keys across 11 categories, resolution hierarchy (super_admin bypass → user override → role default → deny)

**Data Layer Services:**
- Purpose: Centralized business logic and data access
- Examples: `src/lib/data/business.ts`, `src/lib/qbo/sync-transaction.ts`, `src/lib/services/messaging-ai.ts`
- Pattern: Server-only functions using `createAdminClient()`, unstable_cache for performance

**Feature Flags:**
- Purpose: Progressive feature rollout and toggles
- Examples: `src/lib/utils/feature-flags.ts`, `src/lib/hooks/use-feature-flag.ts`
- Pattern: 14 flags in 7 categories (Core POS, Marketing, Communication, Booking, Integrations, Operations, Future)

**Business Info Provider:**
- Purpose: Eliminate hardcoded business details
- Examples: `src/lib/data/business.ts` (server), `/api/public/business-info` (client)
- Pattern: Single source of truth from `business_settings` table, cached, revalidated on demand

## Entry Points

**Public Homepage:**
- Location: `src/app/(public)/page.tsx`
- Triggers: Public HTTP request to `/`
- Responsibilities: Server-render hero, services, reviews, trust bar with SEO metadata

**Booking Page:**
- Location: `src/app/(public)/book/page.tsx`
- Triggers: Public/authenticated request to `/book`
- Responsibilities: Multi-step wizard (vehicle → services → configure → schedule → payment), Stripe checkout

**POS Application:**
- Location: `src/app/pos/page.tsx` (redirects to register tab)
- Triggers: PIN login via `/pos/login`
- Responsibilities: Mounts POS shell with contexts, bottom nav, session management, idle timeout

**Admin Dashboard:**
- Location: `src/app/admin/page.tsx`
- Triggers: Cookie-authenticated request to `/admin`
- Responsibilities: KPI cards, charts, quick actions, route access based on permissions

**Customer Portal:**
- Location: `src/app/(account)/account/page.tsx`
- Triggers: Customer cookie auth to `/account`
- Responsibilities: Dashboard with appointments, transactions, loyalty, last service

**API Endpoints:**
- Location: `src/app/api/**/*.ts`
- Triggers: HTTP requests from clients, webhooks (Twilio, Mailgun, Stripe)
- Responsibilities: REST operations, authentication enforcement, permission checks, external integrations

**Middleware:**
- Location: `src/middleware.ts`
- Triggers: Every HTTP request (except static assets, API routes)
- Responsibilities: IP restriction (POS routes), session refresh, auth redirects

## Error Handling

**Strategy:** Defensive programming with fail-safe defaults and explicit error boundaries

**Patterns:**
- API routes: try/catch with `NextResponse.json({ error }, { status })` responses
- Admin routes: `requirePermission()` returns 403 on permission denial
- POS routes: `authenticatePosRequest()` returns 401 on HMAC failure
- RLS enforcement: Returns empty results for unauthorized queries (no exceptions)
- Feature flags: `isFeatureEnabled()` fails closed (false) on query errors
- Supabase queries: `.maybeSingle()` pattern for optional records, explicit null checks
- Toast notifications: User-facing errors via `sonner` toast library
- Validation: Zod schemas on all form inputs and API request bodies
- Session expiry: `adminFetch()` utility auto-redirects to login on 401

## Cross-Cutting Concerns

**Logging:** Server-side console logs with structured context (env detection, user IDs, timestamps)

**Validation:** Zod schemas for all API inputs, form validation via react-hook-form + Zod resolvers

**Authentication:**
- Admin: Cookie-based via Supabase Auth, `getUser()` session validation
- POS: HMAC signature with shared secret, `authenticatePosRequest()` middleware
- Customer Portal: Cookie-based via Supabase Auth with RLS
- Webhooks: Provider-specific signature validation (Twilio, Mailgun, Stripe)

**Authorization:**
- Permission system: 76 keys, 4 system roles (super_admin, admin, cashier, detailer), custom roles
- Server-side enforcement: `checkPermission()`, `requirePermission()` before data access
- Client-side enforcement: `usePosPermission()`, `usePermission()` hooks gate UI elements
- Route access: `ROUTE_ACCESS` mapping in `src/lib/auth/roles.ts`, admin-shell enforces

**Caching:**
- Business info: `unstable_cache` with 60s revalidation + tag-based invalidation
- IP whitelist: In-memory cache with 10s TTL
- Next.js: Automatic page caching for static Server Components

**TCPA/Compliance:**
- SMS consent: `updateSmsConsent()` helper logs all changes to `sms_consent_log`
- Marketing SMS: `sendMarketingSms()` checks consent + daily frequency cap
- Transactional SMS: `sendSms()` for confirmations, receipts (no consent check)
- STOP/START keywords: Always processed, even when `two_way_sms` flag disabled
- Opt-out: Public unsubscribe page, admin compliance dashboard

---

*Architecture analysis: 2026-02-16*
