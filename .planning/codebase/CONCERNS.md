# Codebase Concerns

**Analysis Date:** 2026-02-16

## Tech Debt

**129 Database Migrations — Migration Sprawl:**
- Issue: 129 sequential migrations from 20260201 through 20260212, many with iterative fixes (e.g., 7 consecutive merge_customers migrations). Complex migration history increases deployment risk.
- Files: `supabase/migrations/*.sql`
- Impact: Migration rollback/replay is fragile. New environments take minutes to bootstrap. Migration conflicts between parallel work. Debugging production schema issues requires archeology through 100+ files.
- Fix approach: Squash migrations into logical phases after launch stabilizes. Create "v2" baseline migration that captures entire schema, archive old migrations.

**Empty Catch Blocks — Silent Error Swallowing:**
- Issue: 32+ instances of `.catch(() => {})` with no logging or error handling (webhooks, JSON parsing, fire-and-forget operations)
- Files: `src/lib/data/team.ts:45,53`, `src/components/booking/step-customer-info.tsx:70`, `src/lib/quotes/send-service.ts:219`, `src/components/account/transaction-detail.tsx:58`, `src/lib/qbo/client.ts:120,222`
- Impact: Production errors invisible in logs. Webhook failures undetected. Fire-and-forget operations silently fail without telemetry.
- Fix approach: Add structured logging to all catch blocks using `console.error()` with context. Implement error tracking service (Sentry, Bugsnag). Add alerting for critical paths (webhooks, payment processing, QBO sync).

**117 Direct DOM/BOM Access Calls — Server Component Landmines:**
- Issue: `window.`, `document.`, `navigator.` calls in 41 files. Some in components that could become Server Components in future refactors.
- Files: Spread across admin pages, POS components, booking wizard, auth pages
- Impact: Server Component conversion blocked. Next.js build fails when Server Components access browser APIs. Runtime errors if component rendering context changes.
- Fix approach: Extract browser API calls into client-only hooks (`useMounted`, `useLocalStorage`, `useMediaQuery`). Add `'use client'` directive auditing to CI. Use `typeof window !== 'undefined'` guards.

**141 Untyped Fetch Calls — No Runtime Validation:**
- Issue: Raw `fetch()` calls without Zod validation on responses. API contract changes cause silent runtime failures.
- Files: 74 files including booking wizard, admin pages, POS components, utilities
- Impact: Production errors when API response shape changes. No type safety between client/server. Invalid data passes through to UI.
- Fix approach: Create typed API client layer with Zod schemas for all routes. Centralize fetch in `api-client.ts` with automatic validation. Generate types from OpenAPI spec or tRPC migration.

**No Test Coverage — Zero Automated Testing:**
- Issue: 0 test files (`.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx`) in entire codebase
- Files: N/A
- Impact: No regression detection. Manual testing required for every change. High risk of breaking existing features. Refactoring is dangerous.
- Fix approach: Start with critical paths (payment processing, POS transaction creation, booking flow). Add Vitest + React Testing Library. Target 60% coverage on business logic within 3 months. Add E2E tests with Playwright for checkout/POS flows.

**Middleware Deprecation Warning:**
- Issue: Next.js 16 shows `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.`
- Files: `src/middleware.ts`
- Impact: Breaking change in Next.js 17. Current auth/IP restriction logic will need rewrite.
- Fix approach: Migrate to Proxy API before Next.js 17 adoption. Test IP whitelist, session refresh, and auth redirects in new pattern.

**Hardcoded Stripe Minimum — Magic Number:**
- Issue: Stripe $0.50 minimum duplicated in `booking-wizard.tsx` lines 380 and 602
- Files: `src/components/booking/booking-wizard.tsx`
- Impact: If Stripe changes minimums or business wants regional pricing, needs multi-file update
- Fix approach: Extract to `STRIPE_MINIMUM_CHARGE` constant in `constants.ts`. Reference from business_settings if needs to vary by region.

**QBO Client Missing Request Timeout:**
- Issue: `QboClient.request()` in `src/lib/qbo/client.ts` has no timeout configured. QuickBooks API can hang indefinitely.
- Files: `src/lib/qbo/client.ts`
- Impact: POS transactions can freeze waiting for QBO response. Admin sync operations hang. No circuit breaker for QBO downtime.
- Fix approach: Add 30s timeout to all QBO API calls. Implement exponential backoff with max retries. Add circuit breaker pattern for repeated failures.

**AI API Keys in Process Environment — No Runtime Validation:**
- Issue: `process.env.ANTHROPIC_API_KEY` accessed without validation at module load time in 3 AI services
- Files: `src/lib/services/messaging-ai.ts`, `src/lib/services/ai-seo.ts`, `src/lib/services/ai-content-writer.ts`
- Impact: Runtime errors in production if env var missing. No startup validation. Features fail silently.
- Fix approach: Validate all required env vars at app startup in `instrumentation.ts`. Throw early with clear error messages. Add env var checklist to deployment docs.

**Outdated Dependencies — 11 Packages Behind:**
- Issue: `@types/node` (20.x when latest is 25.x), `eslint` (9.x when latest is 10.x), several minor updates available
- Files: `package.json`
- Impact: Missing security patches. No access to new TypeScript/ESLint features. Dependency drift increases over time.
- Fix approach: Monthly dependency update schedule. Use `npm audit` in CI. Pin major versions, auto-update minors. Test thoroughly before updating framework deps (Next.js, React).

## Known Bugs

**Campaign A/B Variant Persistence Gap:**
- Symptoms: Campaign wizard A/B variants saved but not loaded correctly on edit — variant fields empty when reopening campaign
- Files: `src/app/admin/marketing/campaigns/[id]/edit/page.tsx`, `src/app/api/marketing/campaigns/[id]/route.ts`
- Trigger: Create campaign with A/B variants → Save → Edit → Variants missing
- Workaround: Re-enter variant data on every edit
- Status: FIXED in Session 4 (20260210000009 migration, buildPayload includes variants, PATCH deletes+reinserts, GET joins)

**Quote Soft-Delete Number Collision:**
- Symptoms: Deleted quotes didn't release their quote number. Next quote reused number, creating confusion.
- Files: `src/lib/quotes/quote-number.ts`, quote queries across 8 files
- Trigger: Delete draft quote → Create new quote → Same number
- Workaround: Manual DB cleanup
- Status: FIXED in Session 6 (quote-number sorts by quote_number DESC, all queries filter `.is('deleted_at', null)`)

**POS Session Mount Double-Fire:**
- Symptoms: React Strict Mode in development caused double-mount, triggering session validation twice
- Files: `src/app/pos/pos-shell.tsx`
- Trigger: Load any POS page in dev mode
- Workaround: None — caused UX confusion with duplicate toasts
- Status: FIXED in Session 27 (useRef guard prevents duplicate calls)

**Customer Type Filtering in Coupon Wizard:**
- Symptoms: Eligible customer count didn't filter by customer type selection — showed all customers regardless of "Enthusiast"/"Professional" toggle
- Files: `src/app/admin/marketing/coupons/new/page.tsx`
- Trigger: Select "Professional Only" → Eligible count still shows all customers
- Workaround: Manual verification in customer list
- Status: FIXED in Session 9 (refreshEligibleCount filters by targetCustomerType in all 3 branches)

**Coupon Category Validation Always Passed:**
- Symptoms: Category-targeted coupons validated successfully even when cart items had wrong category
- Files: `src/lib/supabase/types.ts`, `src/app/pos/reducers/ticket-reducer.ts`, `src/app/pos/reducers/quote-reducer.ts`, 5 cart serialization points
- Trigger: Apply category-specific coupon to cart with mismatched items
- Workaround: Manual coupon removal
- Status: FIXED in Session 8 (added categoryId to TicketItem, populated from product/service FK, threaded through validation)

## Security Considerations

**Service Role Key in Middleware:**
- Risk: Middleware uses `SUPABASE_SERVICE_ROLE_KEY` for IP whitelist queries. Service role bypasses all RLS.
- Files: `src/middleware.ts:27`
- Current mitigation: Only queries business_settings table (low risk). Cached for 10 seconds.
- Recommendations: Move IP whitelist to Redis/Upstash for edge-compatible access. Avoid service role in edge middleware.

**No Rate Limiting on Public APIs:**
- Risk: Public booking (`/api/book`), quote acceptance (`/api/quotes/[id]/accept`), customer auth endpoints have no rate limiting
- Files: `src/app/api/book/route.ts`, `src/app/api/quotes/[id]/accept/route.ts`, `src/app/api/customer/*`
- Current mitigation: None
- Recommendations: Add Upstash Rate Limit middleware. 10 req/min per IP for booking, 5 req/min for auth. Block after 3 failed payment attempts.

**HMAC Secret Rotation Not Implemented:**
- Risk: POS HMAC secret (`pos_api_secret` in business_settings) has no rotation mechanism. Compromised secret = permanent POS access.
- Files: `src/lib/pos/auth.ts`
- Current mitigation: Secret is UUID, not guessable. Only accessible to admin.
- Recommendations: Add secret rotation UI in Settings > POS Security. Invalidate sessions on rotation. 90-day rotation policy.

**Twilio Webhook Signature Validation Skipped in Dev:**
- Risk: `NODE_ENV=development` bypasses signature validation in Twilio inbound webhook
- Files: `src/app/api/webhooks/twilio/inbound/route.ts`
- Current mitigation: Only in dev environment
- Recommendations: Use ngrok webhook forwarding in dev to test real signatures. Never deploy with dev mode.

**Customer Portal RLS — Delete Customer Bug:**
- Risk: Customer portal uses `createClient()` with RLS. If admin hard-deletes customer while logged in, customer session remains valid but queries return empty (graceful fail). Soft-delete preferred.
- Files: Customer portal RLS policies in `20260201000041_customer_portal_rls.sql`
- Current mitigation: Customers are soft-deleted (`deleted_at`) not hard-deleted
- Recommendations: Audit all admin delete flows to confirm soft-delete pattern. Add RLS policy to block deleted customers from portal access.

**Environment Variables Logged in Build Output:**
- Risk: `npm run build` output may expose partial env var names in error messages
- Files: Build process
- Current mitigation: No secrets in var names
- Recommendations: Sanitize build logs before sharing. Never commit build output to git.

## Performance Bottlenecks

**Middleware IP Whitelist Query on Every Request:**
- Problem: Every POS route request queries Supabase for IP whitelist config (with 10s cache)
- Files: `src/middleware.ts:14-73`
- Cause: Edge middleware can't use Redis/KV
- Improvement path: Move to Vercel KV or Upstash Redis with edge-compatible SDK. 1-hour TTL. Invalidate on settings change.

**Job Queue Auto-Populate on Tab Mount:**
- Problem: `/pos/jobs` page calls `POST /api/pos/jobs/populate` on every mount to create job records from today's appointments. Full appointment scan + vehicle/service FK joins.
- Files: `src/app/pos/jobs/page.tsx`, `src/app/api/pos/jobs/populate/route.ts`
- Cause: No background job scheduler for appointment→job bridge
- Improvement path: Move to cron job (runs every 15 min). Use appointment status webhooks to trigger job creation immediately. Add cache to skip if no new appointments.

**Lifecycle Engine Sequential Batch Processing:**
- Problem: Lifecycle engine Phase 2 processes 1000s of pending SMS sends sequentially with 300ms delay between each
- Files: `src/app/api/cron/lifecycle-engine/route.ts`
- Cause: Twilio rate limiting avoidance
- Improvement path: Batch SMS sends in parallel (Twilio allows 100 req/sec). Queue in Redis, process with workers. Add progress tracking.

**Campaign Send No Background Queue:**
- Problem: Campaign send endpoint processes 1000s of recipients in single HTTP request. Timeout risk >30s.
- Files: `src/app/api/marketing/campaigns/[id]/send/route.ts`
- Cause: No background job infrastructure
- Improvement path: Move to BullMQ/Redis queue. Return 202 Accepted immediately. Process recipients in batches of 100. Add progress webhook.

**Admin Customer List Unoptimized Queries:**
- Problem: Customer list query joins vehicles, appointments, transactions for each customer without pagination limits
- Files: `src/app/admin/customers/page.tsx`, `src/app/api/admin/customers/route.ts`
- Cause: DataTable loads all data client-side
- Improvement path: Server-side pagination. Virtual scrolling for large lists. Index on `(customer_type, created_at)`. Lazy-load vehicle/appointment counts.

**Photo Upload Sharp Processing in Main Thread:**
- Problem: Job photo uploads run `sharp` resize/compress synchronously in API route. Blocks other requests during processing.
- Files: `src/app/api/pos/jobs/[id]/photos/route.ts`
- Cause: No worker threads or queue
- Improvement path: Move sharp processing to background worker. Return 202 immediately after upload to storage. Thumbnail generation async. Use Vercel/Supabase Edge Functions.

**QBO Sync Batch — No Parallelization:**
- Problem: EOD batch sync processes transactions sequentially (25 at a time in batches, but each batch is serial)
- Files: `src/lib/qbo/sync-batch.ts`
- Cause: Fear of QBO rate limits
- Improvement path: QBO allows 500 req/min. Process batches in parallel with Promise.all. Add retry queue for failures.

## Fragile Areas

**POS Session Management — Multi-Tab State:**
- Files: `src/app/pos/pos-shell.tsx`, `src/lib/pos/session.ts`, `src/app/pos/context/pos-auth-context.tsx`
- Why fragile: Cross-tab session sync via localStorage events. Token expiry checks every 60s. Three-state validation (valid/expired/missing).
- Safe modification: NEVER modify session structure without updating all 3 files. Test with 3+ tabs open. Always increment session version number. Add migration for old session format.
- Test coverage: None

**Quote-to-Job Conversion Flow:**
- Files: `src/lib/quotes/convert-service.ts`, `src/app/api/pos/quotes/[id]/convert/route.ts`, `src/app/pos/jobs/components/job-detail.tsx`
- Why fragile: 7-step async flow: (1) Quote validation (2) Customer/vehicle FK checks (3) Service snapshot serialization (4) Job creation (5) Quote status update (6) Appointment FK linking (7) Webhook fire-and-forget
- Safe modification: Use DB transaction for steps 4-6. Validate quote not already converted. Test with deleted customers/vehicles. Handle partial failures (job created but appointment link fails).
- Test coverage: None

**Booking Payment Step — Stripe + Supabase Atomicity:**
- Files: `src/components/booking/booking-wizard.tsx`, `src/app/api/book/route.ts`
- Why fragile: (1) Create Stripe PaymentIntent (2) Confirm payment (3) Create Supabase appointment (4) Link services (5) Send confirmation email/SMS. No rollback if step 3-5 fail after Stripe charge.
- Safe modification: Stripe PaymentIntent is idempotent. Appointment creation must be idempotent (check duplicate by customer_id + scheduled_date + time). Add payment_intent_id to appointments table for reconciliation. Retry email/SMS sends don't duplicate.
- Test coverage: None

**Addon Authorization Expiration Logic:**
- Files: `src/app/api/pos/jobs/[id]/addons/route.ts`, `src/app/authorize/[token]/approve/route.ts`, `src/lib/services/job-addons.ts`
- Why fragile: Addon expires after 30 min (configurable). Three places check expiration: (1) Addon list GET (auto-expires stale), (2) Authorization page (shows expired message), (3) Approve/decline API (rejects expired). Race conditions if expiry happens between checks.
- Safe modification: Always re-check expiration in approve/decline transaction. Use DB NOW() not application time. Add 5-second grace period for clock skew. Test timezone edge cases.
- Test coverage: None

**AI Auto-Quote Flow — Multi-Step State Machine:**
- Files: `src/app/api/webhooks/twilio/inbound/route.ts`, `src/lib/services/messaging-ai.ts`
- Why fragile: (1) Parse SMS for quote request (2) Validate required fields (first+last name, vehicle, service) (3) AI generates quote (4) Create customer (if new) (5) Create vehicle (6) Create quote record (7) Generate short link (8) Send SMS. Partial success = orphaned records.
- Safe modification: Wrap quote creation in transaction (customer, vehicle, quote). Validate all fields before DB writes. Handle duplicate customer by phone. Test with malformed AI responses. Add retry queue for SMS send failures.
- Test coverage: None

**Role Permission Resolution — Three-Layer Hierarchy:**
- Files: `src/lib/auth/check-permission.ts`, `src/lib/auth/roles.ts`, DB permissions tables
- Why fragile: Permission lookup: (1) Super admin bypass (2) User override (3) Role default (4) Deny. Breaking changes if any layer logic changes.
- Safe modification: NEVER change super_admin bypass. User overrides must be nullable (not boolean). Role defaults must exist for all keys. Test with all 4 role types. Add integration tests for every permission key.
- Test coverage: None

## Scaling Limits

**Node-Cron In-Process Scheduler:**
- Current capacity: 4 cron jobs (lifecycle-engine, quote-reminders, stock-alerts, qbo-sync) running in single Next.js process
- Limit: Next.js serverless function 10-minute timeout. Job overlap causes memory spikes. No distributed lock.
- Scaling path: Migrate to Vercel Cron (cron jobs as serverless functions). Or external scheduler (Railway Cron, EasyCron). Add distributed lock via Redis. Split long-running jobs into chunks.

**Supabase Realtime Connections:**
- Current capacity: ~10 active connections (POS register, job queue, messaging inbox)
- Limit: Supabase free tier = 200 concurrent connections. Pro = 500. Each POS tab = 1 connection. 50 concurrent staff = 50 connections.
- Scaling path: Connection pooling. Close idle connections after 5 min. Use server-sent events for non-critical updates. Upgrade Supabase plan if >100 staff.

**Stripe Terminal Reader Count:**
- Current capacity: 1 card reader (settings page assumes single location)
- Limit: Settings UI doesn't support multiple readers. No reader-to-register assignment.
- Scaling path: Add reader registry table (`stripe_terminal_readers`). Multi-reader settings UI. Reader assignment per POS session. Test with 3+ readers at same location.

**Campaign Recipient Processing:**
- Current capacity: Campaign send processes all recipients in single HTTP request (tested up to 1,000)
- Limit: Vercel serverless function 60s timeout. Memory limit 1GB. 10,000+ recipients = timeout.
- Scaling path: Move to background queue (BullMQ/Redis). Stream recipients from DB. Process in batches of 100. Add progress tracking via webhook.

**Job Photo Storage:**
- Current capacity: Supabase storage `job-photos/` bucket with no size limit configured
- Limit: Supabase free tier = 1GB storage. Pro = 100GB. 10,000 jobs × 15 photos × 400KB = 60GB.
- Scaling path: Add retention policy (delete photos >2 years old). Compress thumbnails more aggressively. Move to S3/Cloudflare R2 for cheaper storage. Add CDN.

**Message History in Messaging Inbox:**
- Current capacity: All messages for all conversations loaded client-side (no pagination)
- Limit: 10,000+ messages = slow query, UI lag
- Scaling path: Paginate messages (20 per page, infinite scroll). Add message archive after 90 days. Index on `(conversation_id, created_at DESC)`. Virtual scrolling.

## Dependencies at Risk

**Next.js 16 Middleware Deprecation:**
- Risk: `middleware.ts` pattern deprecated in favor of `proxy.ts`. Breaking change in Next.js 17.
- Impact: IP restriction, session refresh, auth redirects all break
- Migration plan: Test Proxy API in Next.js 16. Rewrite middleware as proxy handlers. Update docs. Deploy before Next.js 17 stable.

**Stripe Terminal SDK Version Lock:**
- Risk: `@stripe/terminal-js@0.26.0` may have breaking changes in 1.0 release
- Impact: Card reader initialization, payment processing, reader discovery all break
- Migration plan: Pin to 0.x until 1.0 stable. Test beta versions in staging. Review Stripe migration guide.

**Recharts Module Warning:**
- Risk: Build shows "Module not found" warnings for recharts (non-blocking)
- Impact: Analytics charts may break in future recharts versions
- Migration plan: Evaluate lightweight alternatives (Chart.js, visx, plotly). Consider native Canvas API for simple charts.

**Sharp Native Dependencies:**
- Risk: `sharp` requires platform-specific binaries. Docker/ARM deployment may fail.
- Impact: Photo uploads, thumbnail generation fail
- Migration plan: Use Vercel/Supabase Edge Functions (WebAssembly builds). Test on ARM instances. Add sharp preinstall script for Docker.

**Supabase PostgREST Version:**
- Risk: Database types generated for PostgREST 14.1. Breaking changes in 15.x+.
- Impact: Query syntax, RLS policies, auth helpers may break
- Migration plan: Pin `@supabase/supabase-js` version. Test updates in staging. Regenerate types after Supabase upgrades.

## Missing Critical Features

**No Job/Transaction Reconciliation:**
- Problem: Jobs and transactions linked by fire-and-forget hook. If POS transaction completes but job link fails, job stays "completed" instead of "closed". No reconciliation UI.
- Blocks: Accurate job status reporting, detailer performance metrics
- Status: Identified, not built

**No Customer Merge Undo:**
- Problem: Merge duplicate customers is permanent. No undo, no audit trail showing which records were merged.
- Blocks: Recovery from accidental merges
- Status: Soft-delete audit exists, but no UI to reverse merge

**No Email Template Editor:**
- Problem: Email templates are hardcoded in API routes. No admin UI to customize text, branding, or variables.
- Blocks: Business owner customization without code changes
- Status: Template variables exist, but templates themselves are code

**No Staff Performance Dashboard:**
- Problem: No metrics for revenue per staff, services completed, average ticket value, customer ratings
- Blocks: Performance reviews, commission calculations, detailer leaderboards
- Status: Data exists (jobs, transactions, appointments), no aggregation queries or UI

**No Inventory Reorder Alerts:**
- Problem: Stock alerts email when qty hits threshold. No proactive reorder suggestions based on usage rate.
- Blocks: Optimal inventory management
- Status: Low stock alerts exist, predictive reordering not built

**No Campaign Analytics Export:**
- Problem: Campaign analytics drill-down shows data in UI. No CSV export for external analysis.
- Blocks: Executive reporting, data warehouse integration
- Status: CSV export exists for sync logs, not for campaigns

## Test Coverage Gaps

**Payment Processing — Zero Test Coverage:**
- What's not tested: Stripe PaymentIntent creation, confirmation, refund flow, webhook processing, Terminal reader discovery, card-present payments
- Files: `src/app/api/book/route.ts`, `src/app/api/pos/transactions/route.ts`, `src/app/api/pos/refunds/route.ts`, `src/app/pos/components/checkout/*`
- Risk: Regression in payment flow = revenue loss. No way to detect edge cases before production.
- Priority: **High** — Critical business function

**POS Transaction Creation — Zero Test Coverage:**
- What's not tested: Cart serialization, tax calculation, discount application, loyalty points earn/redeem, coupon validation, transaction item creation, receipt generation
- Files: `src/app/api/pos/transactions/route.ts`, `src/app/pos/reducers/ticket-reducer.ts`, `src/lib/utils/tax.ts`
- Risk: Tax miscalculation = compliance issues. Cart bugs = pricing errors. Loyalty bugs = customer complaints.
- Priority: **High** — Financial accuracy critical

**Booking Flow — Zero Test Coverage:**
- What's not tested: Service selection, vehicle size pricing, mobile zone validation, time slot availability, calendar logic, appointment creation, confirmation email/SMS
- Files: `src/components/booking/*`, `src/app/api/book/route.ts`, `src/app/api/book/slots/route.ts`
- Risk: Broken booking = lost revenue. Time slot conflicts = double-bookings. Email failures = no-shows.
- Priority: **High** — Primary revenue channel

**AI Auto-Quote — Zero Test Coverage:**
- What's not tested: Quote request parsing, vehicle info extraction, service matching, customer creation, quote generation, SMS link sending
- Files: `src/app/api/webhooks/twilio/inbound/route.ts`, `src/lib/services/messaging-ai.ts`
- Risk: AI parsing breaks silently. Quotes created with wrong data. Duplicate customers. SMS failures.
- Priority: **Medium** — Automated sales funnel

**QBO Sync Engines — Zero Test Coverage:**
- What's not tested: OAuth token refresh, transaction→SalesReceipt mapping, customer sync, catalog sync, error retry logic, batch processing
- Files: `src/lib/qbo/*`, `src/app/api/admin/integrations/qbo/*`
- Risk: Accounting data inconsistencies. Tax reporting errors. Failed syncs undetected.
- Priority: **Medium** — Accounting compliance

**Quote-to-Job Conversion — Zero Test Coverage:**
- What's not tested: Service snapshot serialization, appointment linking, status transitions, webhook firing, duplicate prevention
- Files: `src/lib/quotes/convert-service.ts`, `src/app/api/pos/quotes/[id]/convert/route.ts`
- Risk: Jobs created with wrong services. Appointments unlinked. Quote status stuck.
- Priority: **Medium** — POS workflow integrity

**Campaign Send Logic — Zero Test Coverage:**
- What's not tested: Audience filtering, A/B split logic, template variable replacement, coupon injection, URL tracking, SMS/email delivery, variant stats
- Files: `src/app/api/marketing/campaigns/[id]/send/route.ts`, `src/lib/utils/audience.ts`, `src/lib/utils/template.ts`
- Risk: Campaigns sent to wrong audience. Template variables break. URLs not tracked. A/B split incorrect.
- Priority: **Low** — Can verify manually before send

**Permission Resolution — Zero Test Coverage:**
- What's not tested: Super admin bypass, user override precedence, role default fallback, permission key validation
- Files: `src/lib/auth/check-permission.ts`, `src/lib/auth/require-permission.ts`
- Risk: Authorization bypasses. Wrong users see admin features. Permission changes break access.
- Priority: **Medium** — Security boundaries

---

*Concerns audit: 2026-02-16*
