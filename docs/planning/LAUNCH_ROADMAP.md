# Smart Details Auto Spa — Launch Roadmap
*Last updated: March 24, 2026*

---

## Current State

```
Codebase:     MBP localhost, branch main, pushed to GitHub origin/main
              All features code-complete (Sessions 9-12+ plus role audit, email templates, manual)
Staging:      staging.smartdetailsautospa.com — running on Hostinger VPS, port 5003
              Single-domain test environment. Admin login confirmed working.
App domain:   app.smartdetailsautospa.com — DNS + Apache proxy configured, returning 200
              Middleware code changes pending (CC plan approved, ready to execute)
VPS:          Hostinger, /home/media/repositories/smart-details/
              PM2 via start.sh wrapper (sources .env.local), Apache/cPanel proxy
Database:     Supabase project zwvahzymzardmxixyfim — single project
```

---

## Production Architecture (Two Domains, One App)

Both domains point to the SAME Next.js app instance on port 5003. A new `host-routing.ts` utility detects the domain via Host header. The `NEXT_PUBLIC_MAIN_DOMAIN` env var gates all subdomain logic — when unset (local dev, ngrok, staging), no host-based routing fires.

```
smartdetailsautospa.com (PUBLIC — open to all)
├── /                    → Homepage
├── /book                → Booking wizard
├── /services/*          → Service pages
├── /products/*          → Product pages + shop
├── /cart, /checkout     → Product checkout
├── /gallery             → Photo gallery
├── /account/*           → Customer portal (auth required, NO IP restriction)
├── /areas/*             → City/area SEO pages
├── /receipt/[token]     → Public receipt page
├── /quote/[token]       → Public quote view
├── /admin/*             → 302 REDIRECT to app.smartdetailsautospa.com/admin/*
├── /pos/*               → 302 REDIRECT to app.smartdetailsautospa.com/pos/*
├── /login               → 302 REDIRECT to app.smartdetailsautospa.com/login
└── /api/public/*        → Public APIs (open)
    /api/book/*          → Booking APIs (open)
    /api/customer/*      → Customer APIs (auth required)
    /api/webhooks/*      → Webhook receivers (open)

app.smartdetailsautospa.com (STAFF — entire domain IP restricted)
├── /                    → Redirect to /admin
├── /admin/*             → Admin panel (IP restricted + session auth)
├── /pos/*               → POS system (IP restricted + HMAC auth)
├── /login               → Staff login (IP restricted)
├── /auth/callback       → Auth callback
├── (any public path)    → Redirect to smartdetailsautospa.com
└── /api/admin/*         → Admin APIs (IP restricted via getEmployeeFromSession)
    /api/pos/*           → POS APIs (IP restricted via authenticatePosRequest)

staging.smartdetailsautospa.com (TESTING — single-domain mode)
├── Everything works as one domain (no redirects)
├── /pos/* only          → IP restricted (preserves current behavior)
└── NEXT_PUBLIC_MAIN_DOMAIN is unset → host routing disabled
```

**Cookie separation:** Different subdomains = different cookie jars. Staff sessions on `app.` never collide with customer sessions on the main domain. Permanently fixes the OTP spinner issue.

**IP restriction:** The ENTIRE `app.` domain is gated by the IP whitelist (Admin → Settings → POS Security). Admin APIs are also IP-checked via `getEmployeeFromSession(request)`. POS APIs via `authenticatePosRequest(request)`.

**Redirects use 302 initially.** Switch to 301 after architecture is confirmed stable in production (prevents aggressive browser caching during setup).

---

## Roadmap

```
Phase 1 — ✅ COMPLETE — All app features finished
Phase 2 — Git cleanup
Phase 3 — ✅ COMPLETE — Staging deployed (single-domain test)
Phase 4 — ✅ PARTIAL — app. proxy configured, middleware code pending
Phase 5 — External service configuration
Phase 6 — SEO audit and redirect map
Phase 7 — Data prep + production go-live
Phase 8 — Post-launch monitoring
```

---

## Phase 1 — ✅ COMPLETE

All features finished across Sessions 9-12+:

| Feature | Status |
|---------|--------|
| POS Print (AirPrint) | ✅ |
| SMS Receipt Redesign | ✅ |
| Coupon Stacking Audit | ✅ |
| Loyalty Points Payment | ✅ |
| Add-on Savings Sub-text | ✅ |
| Barcode Scanner | ✅ |
| Logo Base64 in Receipts | ✅ |
| Customer Soft Delete | ✅ |
| Hot Shampoo Multi-Qty | ✅ |
| Enter-Key-as-Submit (42 files) | ✅ |
| Prerequisites System + Manager PIN | ✅ |
| Role Audit (90/97 permissions enforced) | ✅ |
| Email Templates + Brand Kit + Drip Sequences | ✅ |
| Welcome Email + Template Coupon Picker | ✅ |
| Transactional Emails (confirm/remind/cancel) | ✅ |
| Two-Column Block Editor | ✅ |
| Business Info Single Source of Truth | ✅ |
| IP Whitelist on POS API Routes | ✅ |
| App Manual (12 chapters verified against codebase) | ✅ |

---

## Phase 2 — Git Cleanup

```bash
# Verify feature/vehicle-silhouettes is merged
git log main --oneline | grep silhouette

# If merged, delete the branch
git branch -d feature/vehicle-silhouettes
git push origin --delete feature/vehicle-silhouettes
```

Branch strategy: single `main` branch for now. Post-launch, consider `staging` branch for pre-production testing of risky changes.

---

## Phase 3 — ✅ COMPLETE — Staging Deployed

Completed March 23, 2026. Single-domain test environment at `staging.smartdetailsautospa.com`.

### Server details
```
Directory:    /home/media/repositories/smart-details/
Port:         5003
PM2:          start.sh wrapper (sources .env.local, exec node server.js)
Apache proxy: /etc/apache2/conf.d/userdata/ssl/2_4/davidsegundo/staging.smartdetailsautospa.com/proxy.conf
```

### Key setup details discovered during deploy
- Next.js standalone `server.js` does NOT auto-load `.env.local` — the `start.sh` wrapper sources it explicitly
- `ecosystem.config.js` JavaScript parser mangles long keys (added leading spaces) — abandoned in favor of `start.sh`
- `NEXT_PUBLIC_*` vars are baked at build time — must be correct BEFORE `npm run build`
- Apache proxy requires `RequestHeader set X-Forwarded-For` and `X-Real-IP` for IP whitelist to work
- cPanel user for Smart Details subdomains: `davidsegundo`

---

## Phase 4 — app.smartdetailsautospa.com Setup

### Step 1: Apache proxy — ✅ COMPLETE
```
/etc/apache2/conf.d/userdata/ssl/2_4/davidsegundo/app.smartdetailsautospa.com/proxy.conf
```
Configured March 23. Proxy to port 5003 with X-Forwarded-For, X-Real-IP, X-Forwarded-Proto headers. Returning 200.

### Step 2: Middleware code changes — PENDING

CC has audited and produced the final merged plan. Ready to execute.

**Implementation summary (6 steps, ~110 files):**

| Step | File(s) | Change |
|------|---------|--------|
| 1 | `src/lib/security/host-routing.ts` | NEW — `getHostType()` utility with `NEXT_PUBLIC_MAIN_DOMAIN` env var gate |
| 2 | `src/middleware.ts` | Rewrite: host-based routing replaces old `/pos`-only IP check |
| 3 | `src/lib/auth/get-employee.ts` + ~110 admin API routes | Optional `request` param on `getEmployeeFromSession()` + IP check |
| 4 | `src/app/api/admin/staff/[id]/reset-password/route.ts` | Use `NEXT_PUBLIC_STAFF_URL` for staff email links |
| 5 | `next.config.ts` | Add `redirects()` with host conditions (belt-and-suspenders) |
| 6 | `.env.local` updates | Add `NEXT_PUBLIC_MAIN_DOMAIN` and `NEXT_PUBLIC_STAFF_URL` |

**Admin API route update breakdown (187 call sites, 110 files):**

| Pattern | Count | Method |
|---------|-------|--------|
| `request` param available | ~73 files | Direct find-replace |
| `_request` param (underscore) | 12 files | Rename `_request` → `request`, then replace |
| No `request` param (e.g. `GET()`) | 25 files | Add `request: NextRequest` to signature, then replace |

**Edge cases handled:**

| Edge Case | Resolution |
|-----------|------------|
| ngrok/tunnel dev | `NEXT_PUBLIC_MAIN_DOMAIN` unset → `getHostType()` returns `'dev'` → no redirects |
| `www.` visitors | Config redirects handle `www.` explicitly with duplicate rules |
| Bookmarked admin URLs | 302 redirect to `app.` domain (seamless) |
| Customer on app. domain | IP blocked or redirected to main domain |
| Cron self-calls | `localhost:5003`, matcher excludes `/api/*` — no middleware hit |
| Staff reset email | Uses `NEXT_PUBLIC_STAFF_URL` → `app.` domain |
| Staff "Forgot Password" in browser | `window.location.origin` already `app.` → correct |
| Staging | Single-domain, only `/pos` IP-restricted, no redirects |
| `/receipt/*`, `/quote/*` on app. | Not in allowed paths → redirected to main domain |

### Step 3: Environment Variables — ADD to server .env.local

```
NEXT_PUBLIC_MAIN_DOMAIN=smartdetailsautospa.com
NEXT_PUBLIC_STAFF_URL=https://app.smartdetailsautospa.com
```

Local dev .env.local — ADD:
```
NEXT_PUBLIC_STAFF_URL=http://localhost:3000
```
(`NEXT_PUBLIC_MAIN_DOMAIN` intentionally unset in dev — disables all subdomain routing)

Staging .env.local: `NEXT_PUBLIC_MAIN_DOMAIN` intentionally unset (single-domain mode).

### Step 4: External Dashboard Configuration (manual)

```
[ ] Supabase Auth → add redirect URLs:
    - https://app.smartdetailsautospa.com/auth/callback
    - https://app.smartdetailsautospa.com/login
    - https://smartdetailsautospa.com/auth/callback (if not already there)
[ ] QuickBooks OAuth → update redirect URI in Intuit Developer Portal:
    - https://app.smartdetailsautospa.com/api/admin/integrations/qbo/callback
[ ] POS PWA → uninstall old PWA, reinstall from app.smartdetailsautospa.com/pos
```

### Step 5: Rebuild and deploy

```bash
cd /home/media/repositories/smart-details
git pull origin main
# Add new env vars to .env.local first
rm -rf .next
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env.local .next/standalone/.env.local
pm2 restart smart-details
```

### Step 6: Verify

```
# Local dev (must still work):
[ ] localhost:3000/admin → loads normally (no redirect)
[ ] localhost:3000/pos → loads normally
[ ] localhost:3000/ → homepage

# Main domain:
[ ] smartdetailsautospa.com/ → homepage
[ ] smartdetailsautospa.com/book → booking
[ ] smartdetailsautospa.com/account → customer portal
[ ] smartdetailsautospa.com/admin → 302 to app.smartdetailsautospa.com/admin
[ ] smartdetailsautospa.com/pos → 302 to app.smartdetailsautospa.com/pos
[ ] smartdetailsautospa.com/login → 302 to app.smartdetailsautospa.com/login
[ ] www.smartdetailsautospa.com/admin → same redirect

# App domain:
[ ] app.smartdetailsautospa.com/ → 302 to /admin
[ ] app.smartdetailsautospa.com/admin → admin (IP restricted)
[ ] app.smartdetailsautospa.com/pos → POS (IP restricted)
[ ] app.smartdetailsautospa.com/services → redirect to main domain
[ ] app.smartdetailsautospa.com/receipt/[token] → redirect to main domain
[ ] app.smartdetailsautospa.com from blocked IP → 403

# Staging:
[ ] staging.smartdetailsautospa.com/admin → loads (no redirect)
[ ] staging.smartdetailsautospa.com/pos → IP restricted

# API security:
[ ] /api/pos/* from blocked IP → 401 (authenticatePosRequest)
[ ] /api/admin/* from blocked IP → 401 (getEmployeeFromSession)

# Cookie separation:
[ ] Staff login on app. → cookie on app.smartdetailsautospa.com
[ ] Customer login on main → cookie on smartdetailsautospa.com
[ ] Both active simultaneously → no collision
```

---

## Phase 5 — External Service Configuration

### Smoke Test
```
[ ] Homepage, services, products, gallery load correctly
[ ] Booking wizard — all 3 steps complete
[ ] Customer signup + login (incognito) + welcome email received
[ ] Customer portal — profile, vehicles, appointments, transactions
[ ] Product cart + checkout reaches payment
[ ] Admin dashboard — stats load
[ ] Admin CRUD — customers, appointments, services, products, marketing, settings
[ ] POS login via PIN
[ ] POS ticket — add service, add product, coupon, loyalty, checkout
[ ] POS receipts — thermal (at store), email, SMS, public page
[ ] POS quotes — create, send, convert
[ ] POS jobs — intake, progress, complete, photos
[ ] POS refund — process, receipt updates
[ ] Cron jobs — PM2 logs clean (no errors)
```

### External Services
```
[ ] Stripe webhook → https://smartdetailsautospa.com/api/webhooks/stripe
    Events: payment_intent.succeeded, payment_intent.failed
    Copy STRIPE_WEBHOOK_SECRET to .env.local on server
[ ] Twilio webhook → https://smartdetailsautospa.com/api/webhooks/twilio/inbound
[ ] Mailgun webhooks → https://smartdetailsautospa.com/api/webhooks/mailgun (all events)
[ ] Supabase Auth → add production + app. domains to allowed redirect URLs
[ ] QuickBooks → update OAuth redirect to app. domain
[ ] Test SMS send — from admin messaging
[ ] Test email send — from email template editor
[ ] Test Stripe payment — booking or POS checkout
```

### Deploy Script

Create `/usr/local/bin/deploy-smartdetails`:
```bash
#!/bin/bash
set -e
echo "=== Deploying Smart Details ==="
cd /home/media/repositories/smart-details
git config --global --add safe.directory /home/media/repositories/smart-details
git pull origin main
npm install --silent
rm -rf .next
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env.local .next/standalone/.env.local
pm2 restart smart-details
echo "=== Deploy complete ==="
pm2 status smart-details
```
```bash
chmod +x /usr/local/bin/deploy-smartdetails
```

---

## Phase 6 — SEO Audit and Redirect Map

```
[ ] Crawl current smartdetailsautospa.com — document all existing URLs
[ ] Map old URLs to new URLs
[ ] Write 301 redirects in next.config.ts
[ ] Test redirects on staging
[ ] Lower DNS TTL to 300s at least 24 hours before go-live
[ ] Verify sitemap uses production domain as canonical
[ ] Verify OpenGraph images work
```

---

## Phase 7 — Data Prep + Production Go-Live

### Data Purge (BEFORE go-live)
```
[ ] Delete ALL test transactions
[ ] Delete ALL test customers
[ ] Delete ALL test appointments
[ ] Delete ALL test orders
[ ] Delete ALL test quotes
[ ] Delete ALL test jobs
[ ] Clear lifecycle_executions, drip_enrollments, campaign_recipients, sms_delivery_log
[ ] Verify real business data preserved (business_settings, services, products, categories, pricing, email templates, roles, permissions)
```

### Square Data Import
```
[ ] Decide cutover date (last day on Square → first day on Smart Details)
[ ] Export Square transaction history (cutover date through last Square day)
[ ] Export Square customer list
[ ] Use Admin → Migration tool to import customers, transactions, vehicles, products, loyalty
[ ] Spot-check imported data — customer records, transaction totals, loyalty balances
```

### Production Environment Switch

**Step 1 — Update .env.local on server:**
```
NEXT_PUBLIC_APP_URL=https://smartdetailsautospa.com
TWILIO_WEBHOOK_URL=https://smartdetailsautospa.com/api/webhooks/twilio/inbound
NEXT_PUBLIC_MAIN_DOMAIN=smartdetailsautospa.com
NEXT_PUBLIC_STAFF_URL=https://app.smartdetailsautospa.com
```

**Step 2 — Rebuild** (NEXT_PUBLIC_ vars baked at build time):
```bash
deploy-smartdetails
```

**Step 3 — Apache proxy for production domain:**
Same pattern as staging/app, under `davidsegundo` cPanel user, pointing to port 5003.

**Step 4 — DNS switch:**
Update `smartdetailsautospa.com` A record to VPS IP.

**Step 5 — SSL:** Verify AutoSSL covers production domain.

**Step 6 — Update all webhook URLs** to production domain (Stripe, Twilio, Mailgun).

**Step 7 — POS Security:** Add store's public IP to whitelist in Admin → Settings → POS Security.

### Production Smoke Test
```
[ ] smartdetailsautospa.com loads — new app
[ ] www redirect works
[ ] smartdetailsautospa.com/admin → 302 to app.smartdetailsautospa.com/admin
[ ] app.smartdetailsautospa.com/admin → admin login works
[ ] app.smartdetailsautospa.com/pos → POS login works
[ ] Customer OTP — real phone receives SMS
[ ] Booking completes, confirmation email received
[ ] Stripe payment works (test + refund)
[ ] Receipt printing at store
[ ] Cron jobs running cleanly
[ ] SSL valid on all domains
[ ] Non-whitelisted IP → 403 on app. domain
[ ] Admin + customer portal open simultaneously — no session collision
```

---

## Phase 8 — Post-Launch Monitoring

### First 24 Hours
```
[ ] PM2 logs every 2 hours: pm2 logs smart-details
[ ] Supabase dashboard — query volume, errors
[ ] Cron jobs firing correctly
[ ] Twilio dashboard — no SMS errors
[ ] Stripe dashboard — no payment failures
[ ] Mailgun dashboard — no delivery issues
[ ] Test customer OTP from real device on cellular
```

### First Week
```
[ ] Google Search Console — 404 crawl errors
[ ] Resubmit sitemap
[ ] Core Web Vitals
[ ] PM2 memory usage — restart if climbing
[ ] Staff feedback on admin/POS
[ ] Booking reminders firing at 8 AM PST
[ ] Lifecycle engine running every 10 minutes
[ ] Switch 302 redirects to 301 if architecture is stable
```

---

## Development Workflow (Post-Launch)

### Routine Bug Fixes
```
1. Code fix on MBP at localhost:3000
   (NEXT_PUBLIC_MAIN_DOMAIN unset → no subdomain routing, everything works locally)
2. Test locally — verify the fix
3. git add -A && git commit && git push
4. SSH to server: deploy-smartdetails
5. Changes live on production within minutes
```

No ngrok needed for routine development. You see changes on localhost first, then deploy.

### Risky Changes (new features, DB migrations, refactors)
```
1. Code on MBP, test locally
2. git push
3. SSH to server: deploy-smartdetails
4. Test on staging.smartdetailsautospa.com first
   (staging has NEXT_PUBLIC_MAIN_DOMAIN unset → single-domain, all features accessible)
5. If good → changes are already on production (same app instance, same port)
   OR: if separate instances needed later, set up staging on a different port
```

### Webhook Testing
Ngrok is still useful for testing inbound webhooks locally (Twilio replies, Stripe events, Mailgun notifications). For most work, test webhooks on the live server instead.

---

## Reference

### Server Paths
```
App code:         /home/media/repositories/smart-details/
Env file:         /home/media/repositories/smart-details/.env.local
Env backup:       /home/media/repositories/smart-details/.env.local.BAK
Start script:     /home/media/repositories/smart-details/start.sh
Deploy script:    /usr/local/bin/deploy-smartdetails (to be created)
Staging proxy:    /etc/apache2/conf.d/userdata/ssl/2_4/davidsegundo/staging.smartdetailsautospa.com/proxy.conf
App proxy:        /etc/apache2/conf.d/userdata/ssl/2_4/davidsegundo/app.smartdetailsautospa.com/proxy.conf
Production proxy: /etc/apache2/conf.d/userdata/ssl/2_4/davidsegundo/smartdetailsautospa.com/proxy.conf (at go-live)
PM2 logs:         ~/.pm2/logs/smart-details-*.log
```

### PM2 Port Map
```
Port  App              Domain(s)
5000  121media         121media.com
5001  sales-tracker    sales.lomitamail.com
5002  passport-photos  photos.lomitamail.com
5003  smart-details    staging. / app. / smartdetailsautospa.com
```

### Domains
```
Domain                                  Purpose              IP Restricted    Port
staging.smartdetailsautospa.com         Testing (keep)       /pos only        5003
app.smartdetailsautospa.com             Admin + POS          YES (all paths)  5003
smartdetailsautospa.com                 Public site          No               5003
```

All three domains → same app instance on port 5003. `host-routing.ts` handles separation.

### Environment Variables by Environment
```
Variable                      Local Dev              Staging                Production
NEXT_PUBLIC_APP_URL           localhost:3000         staging.sdas.com       smartdetailsautospa.com
NEXT_PUBLIC_MAIN_DOMAIN       (unset)                (unset)                smartdetailsautospa.com
NEXT_PUBLIC_STAFF_URL         localhost:3000         (unset or localhost)   app.smartdetailsautospa.com
CRON_BASE_URL                 localhost:3000         localhost:5003         localhost:5003
PORT                          (default 3000)         5003                   5003
HOSTNAME                      (default)              0.0.0.0                0.0.0.0
```

### Decisions Made

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| `app.` subdomain for staff | YES | Cookie separation, IP restriction, clean URLs |
| IP restrict entire `app.` domain | YES | All staff paths + admin APIs gated by whitelist |
| `NEXT_PUBLIC_MAIN_DOMAIN` env var gate | YES | Prevents broken redirects on ngrok/localhost/unknown hosts |
| Admin API IP restriction | YES | `getEmployeeFromSession(request)` — optional param, backwards compatible |
| 302 redirects initially | YES | Prevents cached 301s during setup; switch to 301 after stable |
| Keep staging subdomain | YES | Safety net for risky changes; costs nothing |
| Separate staging instance | NO | Same app, different domain, same port |
| Booking multi-service | SHELVED | 5-6 sessions, marginal gain, POS handles walk-ins |
| Apache (not Traefik) | YES | Server uses cPanel/Apache for Next.js apps |
| Standalone build | YES | Smaller footprint, `start.sh` for env loading |
| `ecosystem.config.js` | ABANDONED | JavaScript parser mangled Supabase keys; `start.sh` is reliable |

### Open Items

1. **Square cutover date** — decide last day on Square → first day on Smart Details
2. **SEO redirect map** — depends on current site URL structure
3. **CRON_SECRET** — generate: `openssl rand -hex 32` (placeholder still in server .env.local)
4. **STRIPE_WEBHOOK_SECRET** — create webhook endpoint in Stripe Dashboard, copy signing secret
5. **Next.js security update** — upgrade from 15.3.3 after go-live (CVE-2025-66478)
6. **301 upgrade** — switch 302 redirects to 301 after one week of stable production