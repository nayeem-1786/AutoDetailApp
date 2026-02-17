# External Integrations

**Analysis Date:** 2026-02-16

## APIs & External Services

**Payment Processing:**
- Stripe - Payment intents, card readers, customers
  - SDK/Client: `stripe` (server), `@stripe/stripe-js` + `@stripe/react-stripe-js` (browser)
  - Terminal SDK: `@stripe/terminal-js` (POS card reader)
  - Auth: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - Implementation: `src/lib/pos/stripe-terminal.ts`, `src/app/api/pos/stripe/`, `src/app/api/admin/stripe/`

**SMS & Voice:**
- Twilio - SMS/MMS, delivery tracking, inbound webhooks
  - SDK/Client: Direct REST API (no SDK installed)
  - Auth: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
  - Webhook: `/api/webhooks/twilio/inbound`, `/api/webhooks/twilio/status`
  - Implementation: `src/lib/utils/sms.ts`, `src/app/api/webhooks/twilio/`

**Email:**
- Mailgun - Transactional email, delivery tracking
  - SDK/Client: Direct REST API (no SDK installed)
  - Auth: `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`
  - Webhook: `/api/webhooks/mailgun`
  - Implementation: `src/lib/utils/email.ts`, `src/lib/utils/mailgun-signature.ts`

**AI:**
- Anthropic Claude - AI auto-responder, auto-quotes, SEO generation, content writing
  - SDK/Client: Direct REST API (no SDK installed)
  - Auth: `ANTHROPIC_API_KEY`
  - Model: `claude-sonnet-4-20250514`
  - Implementation: `src/lib/services/messaging-ai.ts`, `src/lib/services/ai-seo.ts`, `src/lib/services/ai-content-writer.ts`

**Accounting:**
- QuickBooks Online - Customer sync, catalog sync, transaction sync
  - SDK/Client: Direct REST API (no SDK installed)
  - Auth: OAuth 2.0 - `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`
  - Tokens: Stored in `business_settings` (access/refresh tokens, realm ID, expiry)
  - OAuth flow: `/api/admin/integrations/qbo/connect`, `/api/admin/integrations/qbo/callback`
  - Implementation: `src/lib/qbo/client.ts`, `src/lib/qbo/sync-*.ts`

**Maps & Reviews:**
- Google Places API - Review fetching (optional)
  - SDK/Client: Direct REST API (no SDK installed)
  - Auth: `GOOGLE_PLACES_API_KEY`
  - Implementation: `src/app/api/cron/google-reviews/route.ts`

## Data Storage

**Databases:**
- Supabase (PostgreSQL 17)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`
  - Client: `@supabase/supabase-js` with SSR support
  - Auth modes:
    - Anonymous client: `src/lib/supabase/anon.ts` (public queries)
    - Cookie client: `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts` (SSR)
    - Service role: `src/lib/supabase/admin.ts` (bypasses RLS)
  - Migrations: 129 SQL files in `supabase/migrations/`
  - Tables: 50+ (customers, transactions, products, services, appointments, jobs, etc.)

**File Storage:**
- Supabase Storage - Images, PDFs
  - Buckets: `job-photos/`, `product-images/`, `service-images/`
  - Access: Public read, authenticated write/update/delete
  - Implementation: Direct Supabase client storage API

**Caching:**
- None (relies on Next.js request deduplication)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: Cookie-based sessions for admin/customer portals
  - POS: Custom HMAC authentication (`src/lib/pos/session.ts`, `src/lib/pos/check-permission.ts`)
  - Customer login: Email/password via Supabase Auth
  - Admin login: Email/password via Supabase Auth
  - POS login: PIN-based via employees table

## Monitoring & Observability

**Error Tracking:**
- None

**Logs:**
- Console logging (stdout/stderr)
- PM2 file logging: `/var/log/autodetailapp/error.log`, `/var/log/autodetailapp/out.log`

## CI/CD & Deployment

**Hosting:**
- Self-hosted (path: `/var/www/autodetailapp`)

**CI Pipeline:**
- None

**Process Manager:**
- PM2 with `ecosystem.config.cjs`

## Environment Configuration

**Required env vars:**
- Database: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Mailgun: `MAILGUN_DOMAIN`, `MAILGUN_API_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- QBO: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`
- App: `NEXT_PUBLIC_APP_URL`, `CRON_API_KEY`

**Optional env vars:**
- Google: `GOOGLE_PLACES_API_KEY`
- Twilio Lookup: `TWILIO_LOOKUP_ENABLED` (phone validation)

**Secrets location:**
- Development: `.env.local`
- Production: Environment variables (not in repo)

## Webhooks & Callbacks

**Incoming:**
- `/api/webhooks/twilio/inbound` - Inbound SMS messages (signature validated)
- `/api/webhooks/twilio/status` - SMS delivery status callbacks
- `/api/webhooks/mailgun` - Email delivery events (signature validated)
- QuickBooks OAuth callback: `/api/admin/integrations/qbo/callback`

**Outgoing:**
- Twilio status callbacks: `${NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status` (passed per-message)
- Mailgun webhooks: Configured in Mailgun dashboard (delivered, failed, clicked, complained, unsubscribed)

## Scheduled Jobs

**Internal Cron (node-cron):**
- Scheduler: `src/lib/cron/scheduler.ts` + `src/instrumentation.ts`
- Jobs:
  - Lifecycle engine: Every 10 minutes
  - Quote reminders: Hourly at :30
  - Stock alerts: Daily 8 AM PST (16:00 UTC)
  - QBO sync: Every 30 minutes
  - Theme activation: Every 15 minutes
  - Google reviews: Daily 6 AM PST (14:00 UTC)
- Auth: `x-api-key: CRON_API_KEY` header
- Endpoints: `/api/cron/*`

## Third-Party Data Flow

**Stripe Terminal:**
- Browser → Terminal SDK → Stripe API → Payment Intent → Webhook → App

**Twilio SMS:**
- App → Twilio API (send) → Customer
- Customer → Twilio → Webhook (`/api/webhooks/twilio/inbound`) → App
- Twilio → Status Webhook (`/api/webhooks/twilio/status`) → App (delivery tracking)

**QuickBooks:**
- App → QBO API (create/update customers, items, sales receipts)
- Sync direction: One-way (App → QBO only)
- OAuth tokens: Stored in `business_settings`, refreshed automatically on 401

**Anthropic Claude:**
- App → Claude API (text generation) → Response
- Use cases: SMS auto-responder, auto-quotes, SEO metadata, page content

---

*Integration audit: 2026-02-16*
