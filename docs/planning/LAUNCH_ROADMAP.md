# Smart Details Auto Spa — Launch Roadmap
*Last updated: March 10, 2026*

---

## Current State

```
Codebase:     MBP localhost, branch main, pushed to GitHub origin/main
              Session 9-A complete — auth fixes, TS cleanup, admin employee check
App status:   Phases 1–12 complete. Active daily use on localhost dev server.
VPS:          Hostinger, running TorranceNotary.com, sales.lomitamail.com, 121Media.com
              Smart Details NOT yet deployed on VPS
Subdomains:   None created yet for Smart Details
GitHub:       main branch (current), feature/vehicle-silhouettes (pending resolution)
Database:     Supabase project zwvahzymzardmxixyfim — single project, production data
```

---

## Roadmap Overview

```
Phase 1 — Finish remaining app features (Sessions 9-B through 9-H)
Phase 2 — Git cleanup and branch strategy
Phase 3 — VPS staging environment setup
Phase 4 — app.smartdetailsautospa.com setup (admin + POS, live immediately)
Phase 5 — Session isolation (cookie separation or subdomain enforcement)
Phase 6 — Full QA on staging
Phase 7 — SEO audit and 301 redirect map
Phase 8 — Production go-live
Phase 9 — Post-launch monitoring
```

---

## Phase 1 — Remaining App Features

All items below are open from the Session 9 handoff doc. Complete in order.
Each is a separate Claude Code session.

### Task B — POS Print Button → window.print() / AirPrint
**Priority:** High
Revert POS Print button from the current print server path back to `window.print()` for
native AirPrint support on iPads. The AltaLink C8070 now has native AirPrint enabled and
Avahi reflects mDNS cross-subnet. Print path: iPad → AirPrint → AltaLink C8070.
Konica still uses raw TCP 9100 via print server — that path is unchanged.

### Task C — SMS Receipt Redesign
**Priority:** High
Redesign SMS receipt to fit under 160 characters. Format: summary line + link to full
receipt in customer portal. Avoids multi-part SMS charges and improves deliverability.
All SMS through `sendSms()` in `src/lib/utils/sms.ts`.

### Task D — Coupon Stacking Audit
**Priority:** High
Audit and enforce no-stacking rules: coupons cannot stack with add-ons, combos,
closeout pricing, or active promotions. Document the exact matrix of what can and
cannot combine. Fix any POS paths where stacking is currently possible.
Reference `docs/COUPONS.md` before starting.

### Task E — Loyalty Points as Payment Line Item
**Priority:** Medium
Add loyalty points redemption as a payment line item in the POS checkout flow.
Points appear as a credit line reducing the balance due. Check DB_SCHEMA.md for
existing loyalty fields before adding any new columns.

### Task F — Add-on Savings Sub-text + DB Migration
**Priority:** Medium
Display savings sub-text on add-ons showing the discount vs standalone price.
Requires DB migration: add `is_addon` (boolean) and `original_price` (numeric) to
`transaction_items` table. Check DB_SCHEMA.md first — reuse existing fields if possible.
Migration must be backwards-compatible with existing transaction records.

### Task G — Barcode Scanner Handler in POS
**Priority:** Medium
Add keyboard wedge barcode scanner input handler to POS. Scanners emulate rapid
keyboard input ending in Enter. Handler must: detect scan vs manual typing by input
speed, look up product/coupon/customer by barcode, not interfere with normal
keyboard navigation in POS forms.

### Task H — Logo Base64 in receipt-template.ts
**Priority:** Low
Embed the business logo as a base64 string at line 617 of `receipt-template.ts`
so receipts render the logo without a network dependency. Reference
`docs/hardware/STAR_PRINTER_LOGO.md` for ESC/POS constraints.

---

## Phase 2 — Git Cleanup and Branch Strategy

### Branch Resolution

**feature/vehicle-silhouettes:**
The silhouette feature (vehicle type icons in zone picker for intake/completed jobs)
is confirmed working in the current codebase. The branch contains one code commit
(`a59b9e0`) that is already reflected in the working app. The branch also contains
older versions of docs that have since been superseded on main.

Actions:
```bash
# Verify the feature commit is already in main
git log main --oneline | head -20
# If a59b9e0 is NOT in main, cherry-pick it:
git cherry-pick a59b9e0
git push origin main

# Delete the branch (local and remote)
git branch -d feature/vehicle-silhouettes
git push origin --delete feature/vehicle-silhouettes
```

### Create Staging Branch
```bash
git checkout -b staging
git push -u origin staging
```

Staging branch is created from the current state of main — all Phase 1 work complete,
all auth fixes in place. This becomes the branch deployed to the VPS staging environment.

### Branch Strategy Going Forward

```
main      ← production only. Never commit directly.
            Receives merges from staging after testing.
            Deployed to: smartdetailsautospa.com

staging   ← active development and pre-production testing.
            All new work commits here.
            Deployed to: staging.smartdetailsautospa.com
```

**Workflow for every change after launch:**
```
Code on MBP (localhost)
  → commit to staging branch
    → push to GitHub
      → pull on VPS staging environment
        → test on staging.smartdetailsautospa.com
          → merge staging → main on GitHub
            → pull on VPS production
              → production updated
```

**Protect main branch on GitHub:**
GitHub → Settings → Branches → Add rule → Branch name: `main`
→ Check: Require a pull request before merging
→ Check: Require approvals: 1 (you reviewing your own PR is fine)
This prevents accidental direct pushes to production.

---

## Phase 3 — VPS Staging Environment Setup

### Prerequisites
- SSH access to Hostinger VPS confirmed
- Existing sites (TorranceNotary, LomitaMail, 121Media) already running
- Traefik already configured with dynamic configs in `~/infra/traefik/dynamic/`
- GitHub repo accessible from VPS (SSH key or deploy token)

### DNS Records to Create
Add these A records at your DNS registrar. All point to the same VPS IP.

```
Type  Name             Value         TTL
A     staging          [VPS IP]      3600
A     app              [VPS IP]      3600
```

That is two new DNS records. `staging.smartdetailsautospa.com` and
`app.smartdetailsautospa.com`. No others needed.

Verify propagation before proceeding to Traefik config:
```bash
dig staging.smartdetailsautospa.com
dig app.smartdetailsautospa.com
```

### VPS Directory Structure
```
/var/www/
├── smartdetails-staging/     ← staging branch, port 3001
├── smartdetails-production/  ← main branch, port 3000 (set up at go-live)
└── [existing sites...]
```

### Clone and Configure Staging
```bash
ssh into VPS
cd /var/www
git clone git@github.com:[username]/AutoDetailApp.git smartdetails-staging
cd smartdetails-staging
git checkout staging
cp .env.example .env  # or create .env manually
npm ci
npm run build
```

### Environment Variables for Staging
Create `/var/www/smartdetails-staging/.env`:
```env
NEXT_PUBLIC_SITE_URL=https://staging.smartdetailsautospa.com
NEXT_PUBLIC_APP_URL=https://app.smartdetailsautospa.com
NODE_ENV=production
# All other vars identical to local .env (Supabase, Stripe, Twilio, Mailgun, Square)
# Single Supabase project — staging reads/writes real data
# Do not run bulk operations or destructive queries from staging
```

### PM2 Process for Staging
```bash
pm2 start npm --name "sd-staging" -- start -- -p 3001
pm2 save
pm2 startup  # if not already configured
```

### Traefik Config for Staging
New file: `~/infra/traefik/dynamic/smartdetails-staging.yml`

```yaml
http:
  routers:
    smartdetails-staging:
      rule: "Host(`staging.smartdetailsautospa.com`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: smartdetails-staging-service

  services:
    smartdetails-staging-service:
      loadBalancer:
        servers:
          - url: "http://localhost:3001"
```

No IP restriction on staging — you need to access it from any device for testing.
Staging has no real customers and no public SEO presence.

### Verify Staging
```
[ ] https://staging.smartdetailsautospa.com loads the app
[ ] SSL cert issued (check Traefik dashboard)
[ ] Customer portal reachable
[ ] Admin panel reachable at staging.smartdetailsautospa.com/admin
[ ] POS reachable at staging.smartdetailsautospa.com/pos
[ ] OTP login works on staging
[ ] No console errors on load
```

---

## Phase 4 — app.smartdetailsautospa.com Setup

`app.` is the permanent home for admin and POS. It goes live immediately because it is
IP restricted from day one — no customer can reach it, no SEO implications.

### What app. Hosts
```
app.smartdetailsautospa.com/admin    ← Admin panel
app.smartdetailsautospa.com/pos      ← POS system
app.smartdetailsautospa.com/login    ← Staff login
app.smartdetailsautospa.com/auth/callback  ← Auth callback for staff
```

### VPS Directory for app.
```bash
cd /var/www
git clone git@github.com:[username]/AutoDetailApp.git smartdetails-app
cd smartdetails-app
git checkout staging  # same codebase as staging initially
cp .env.example .env
```

Environment variables for app.:
```env
NEXT_PUBLIC_SITE_URL=https://app.smartdetailsautospa.com
NEXT_PUBLIC_APP_URL=https://app.smartdetailsautospa.com
NODE_ENV=production
# All other vars same as staging
```

```bash
npm ci
npm run build
pm2 start npm --name "sd-app" -- start -- -p 3002
pm2 save
```

### Traefik Config for app. with IP Restriction
New file: `~/infra/traefik/dynamic/smartdetails-app.yml`

```yaml
http:
  routers:
    smartdetails-app:
      rule: "Host(`app.smartdetailsautospa.com`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - smartdetails-ip-allowlist
      service: smartdetails-app-service

  middlewares:
    smartdetails-ip-allowlist:
      ipAllowList:
        sourceRange:
          - "127.0.0.1/32"
          - "[STORE-PUBLIC-IP]/32"
          - "[OWNER-HOME-IP]/32"
          # Add additional permanent IPs here
          # Mirror your core IPs from POS Settings whitelist

  services:
    smartdetails-app-service:
      loadBalancer:
        servers:
          - url: "http://localhost:3002"
```

**Two-layer IP enforcement:**
- Layer 1: Traefik rejects non-whitelisted IPs before request reaches Next.js
- Layer 2: Existing in-app middleware whitelist (POS Settings) remains active as fallback

**Login page exception:** `app.smartdetailsautospa.com/login` should remain reachable
so staff attempting access from an unwhitelisted IP see a proper redirect rather than
a raw 403. Handle this in Traefik by either excluding `/login` from the IP rule or
accepting that staff must be on an approved network to log in at all (recommended —
if they can't access the app, they don't need the login page either).

### Update Supabase Redirect URLs
In Supabase Dashboard → Authentication → URL Configuration → Redirect URLs, add:
```
https://app.smartdetailsautospa.com
https://app.smartdetailsautospa.com/login
https://app.smartdetailsautospa.com/auth/callback
https://staging.smartdetailsautospa.com
https://staging.smartdetailsautospa.com/auth/callback
```

Existing `https://smartdetailsautospa.com` entries stay unchanged.

### Update Old URL Redirects
In `next.config.js`, add redirects so existing bookmarks to `/admin` and `/pos`
on the main domain forward to `app.`:

```js
async redirects() {
  return [
    {
      source: '/admin/:path*',
      destination: 'https://app.smartdetailsautospa.com/admin/:path*',
      permanent: true,
    },
    {
      source: '/pos/:path*',
      destination: 'https://app.smartdetailsautospa.com/pos/:path*',
      permanent: true,
    },
    {
      source: '/login/:path*',
      destination: 'https://app.smartdetailsautospa.com/login/:path*',
      permanent: true,
    },
  ];
},
```

This goes in the staging branch and deploys with the app.

### Verify app.
```
[ ] https://app.smartdetailsautospa.com/admin loads admin login
[ ] https://app.smartdetailsautospa.com/pos loads POS login
[ ] SSL cert issued
[ ] Admin login and session works
[ ] POS PIN login works
[ ] From non-whitelisted IP: 403 returned
[ ] From whitelisted IP: full access
[ ] Staff password reset email links resolve to app. subdomain
```

---

## Phase 5 — Session Isolation

### The Problem
Admin, Customer Portal, and Booking all share one Supabase cookie:
`sb-zwvahzymzardmxixyfim-auth-token*`

One active session per browser. Logging into admin overwrites customer session.
Logging out of admin logs out customer portal simultaneously.

### The Solution: Subdomain-Based Cookie Separation
Moving admin and POS to `app.smartdetailsautospa.com` (Phase 4) resolves this
automatically at the browser level. Browsers scope cookies by domain:

```
smartdetailsautospa.com     cookie: sb-*-auth-token  → customer session
app.smartdetailsautospa.com cookie: sb-*-auth-token  → staff session
```

Same cookie name. Different domain. Completely separate cookie jars.
No code changes to auth logic required.

### App Code Changes Required

**1. Middleware cleanup (`src/middleware.ts`):**
Remove `/admin` and `/pos` from the route matcher on the main domain since these
routes will exclusively live on `app.`. Update the IP whitelist check to cover
`/admin/*` routes in addition to `/pos/*` (defense-in-depth for the app. domain).

**2. Staff password reset emails:**
Any email template linking back to admin must use `app.smartdetailsautospa.com`
as the base URL, not `smartdetailsautospa.com`. Audit all transactional email
templates that contain admin-facing links.

**3. Environment variable audit:**
Search the codebase for any hardcoded `smartdetailsautospa.com` references in
admin-facing code. Replace with `process.env.NEXT_PUBLIC_APP_URL`.
Customer-facing references use `process.env.NEXT_PUBLIC_SITE_URL`.

**4. Remove signOut() on mount hacks (after confirming subdomain separation works):**
The `signOut()` on mount added in Session 9-A was a workaround for the shared
cookie problem. Once admin lives on `app.` and customer portal on the main domain,
these two sessions can never collide. The signOut on mount is no longer needed.
Remove it from `signin/page.tsx`, `signup/page.tsx`, and `login/page.tsx` only
after verifying session isolation works correctly on staging.

### Verify Session Isolation
```
[ ] Log into admin at app.smartdetailsautospa.com/login
[ ] In same browser, open staging.smartdetailsautospa.com/signin — customer OTP works
[ ] Both tabs remain logged in simultaneously
[ ] Log out of admin — customer portal stays logged in
[ ] Log out of customer — admin stays logged in
[ ] Customer portal loads vehicles, transactions, loyalty, appointments correctly
[ ] Booking flow with inline auth works while admin is logged in on app. subdomain
[ ] OTP works in normal browser (no private/incognito needed)
```

---

## Phase 6 — Full QA on Staging

Run the complete smoke test suite on `staging.smartdetailsautospa.com` before
touching production. Test on real devices (iPad for POS, mobile for customer portal).

### POS
```
[ ] Staff PIN login
[ ] New job creation — all vehicle types
[ ] Service selection with combos and add-ons
[ ] Coupon application — no stacking with add-ons/combos (Task D fix verified)
[ ] Loyalty points as payment line item (Task E fix verified)
[ ] Barcode scanner input (Task G fix verified)
[ ] Payment processing — Stripe card present
[ ] Receipt printing — Star TSP100III (logo, cut)
[ ] Receipt printing — Konica via raw TCP 9100
[ ] AirPrint receipt — iPad → AltaLink C8070 (Task B fix verified)
[ ] SMS receipt sent under 160 chars (Task C fix verified)
[ ] Cash drawer trigger
[ ] POS session expiry at 12 hours — clean redirect to PIN screen
[ ] IP whitelist enforcement — access blocked from non-whitelisted IP
```

### Admin Panel
```
[ ] Admin login and session persistence
[ ] Dashboard loads — job stats, revenue, activity
[ ] Job management — create, edit, complete, void
[ ] Customer management — search, view history, edit
[ ] Service catalog — add, edit, pricing, add-ons
[ ] Coupon management — create, set rules, expiry
[ ] Loyalty program settings
[ ] POS Settings — IP whitelist add/remove/toggle
[ ] Receipt printer settings
[ ] Staff management — add, permissions, PIN reset
[ ] SMS settings — Twilio number, templates
[ ] Reports and exports
[ ] Admin password reset flow — email link resolves to app. subdomain
```

### Customer Portal
```
[ ] OTP login — phone and email — normal browser (no private/incognito)
[ ] Sign up — new customer registration
[ ] Account dashboard loads
[ ] Vehicle list — add, edit, delete
[ ] Transaction history — correct data, correct customer
[ ] Loyalty points balance and history
[ ] Appointments — upcoming and past
[ ] Profile edit — name, phone, email
[ ] Password reset flow
[ ] Session persistence — return after days away
[ ] Session expiry — clean redirect to signin
[ ] Mobile layout on real device
```

### Booking Flow
```
[ ] Full 3-step booking wizard
[ ] Inline auth during booking — new customer OTP
[ ] Inline auth during booking — returning customer OTP
[ ] Booking while admin logged in on app. subdomain — no session conflict
[ ] Booking confirmation email
[ ] Post-booking redirect to account
[ ] Combo pricing display
[ ] Add-on selection
```

### Cross-Surface
```
[ ] Admin and customer portal in same browser simultaneously — independent sessions
[ ] POS and admin in same browser simultaneously — no conflict (POS uses localStorage)
[ ] Clear all site data, re-login to all three — all work independently
```

### Cron Jobs
```
[ ] All internal cron jobs fire correctly (no n8n, no Vercel Cron — internal only)
[ ] Scheduled tasks run in America/Los_Angeles timezone
[ ] No cron errors in PM2 logs after 24 hours
```

---

## Phase 7 — SEO Audit and 301 Redirect Map

This phase must be completed before the production DNS switch. Doing it after causes
Google to index 404s or wrong URLs, losing any ranking the current site has.

### Step 1 — Export Current Indexed URLs
From Google Search Console → Coverage → Valid → Export all indexed URLs.
Also run Screaming Frog (or equivalent) on the current live `smartdetailsautospa.com`
to crawl all accessible URLs regardless of index status.

### Step 2 — Audit the Built-in SEO Section
The app has a complete SEO section built out. Before go-live, audit:
- Every public-facing route in the app has a corresponding `metadata` export
  (title, description, canonical URL, Open Graph)
- Service pages use structured data (LocalBusiness, Service schema)
- 38-city schema implementation is intact (from TorranceNotary SEO audit pattern)
- `sitemap.xml` is generated and accurate
- `robots.txt` is correct — allows customer-facing routes, disallows `/admin`, `/pos`

### Step 3 — Map Old URLs to New URLs
Compare every currently-indexed URL against every route in the new app.
For each URL that has changed path, write a 301 redirect rule.

Common cases to check:
```
/services          → verify route exists and slug matches
/services/[slug]   → verify all service slugs are identical
/about             → verify route exists
/contact           → verify route exists
/book              → verify route exists
/blog/[slug]       → if blog routes changed, map each one
```

### Step 4 — Implement Redirects in next.config.js
All 301s go in the `redirects()` array in `next.config.js`. They are permanent
(301 not 302) and must be in place at the moment the new app goes live.

```js
async redirects() {
  return [
    // Staff tool redirects (from Phase 4)
    { source: '/admin/:path*', destination: 'https://app.smartdetailsautospa.com/admin/:path*', permanent: true },
    { source: '/pos/:path*', destination: 'https://app.smartdetailsautospa.com/pos/:path*', permanent: true },
    { source: '/login/:path*', destination: 'https://app.smartdetailsautospa.com/login/:path*', permanent: true },

    // Content URL changes (fill in based on audit)
    // { source: '/old-path', destination: '/new-path', permanent: true },
  ];
},
```

### Step 5 — Verify Sitemap and Canonical URLs
After deploying to staging, fetch `staging.smartdetailsautospa.com/sitemap.xml`.
All URLs in the sitemap must use `smartdetailsautospa.com` as the canonical domain
(not `staging.`). Confirm `NEXT_PUBLIC_SITE_URL` drives the sitemap generation.

---

## Phase 8 — Production Go-Live

All phases above must be complete and verified before starting this phase.

### Pre-Launch Checklist
```
[ ] All Phase 1 tasks (B–H) complete and tested on staging
[ ] app.smartdetailsautospa.com live and verified
[ ] Session isolation verified on staging
[ ] Full QA (Phase 6) passed — zero blocking issues
[ ] SEO audit complete — all 301 redirects written and tested on staging
[ ] Sitemap accurate, canonical URLs correct
[ ] All environment variables confirmed for production .env
[ ] Staff notified of new admin/POS URLs (app.smartdetailsautospa.com)
[ ] Supabase redirect URLs include production domain entries
[ ] PM2 and Traefik configs ready for production
[ ] DNS TTL lowered to 300s (5 min) on smartdetailsautospa.com at least 24 hours before go-live
    (allows fast rollback if needed)
```

### Production Deploy Sequence

**Step 1 — Final merge**
```bash
# On MBP, after all staging testing passes:
git checkout main
git merge staging
git push origin main
```

**Step 2 — Set up production environment on VPS**
```bash
cd /var/www
git clone git@github.com:[username]/AutoDetailApp.git smartdetails-production
cd smartdetails-production
git checkout main
```

Create `/var/www/smartdetails-production/.env`:
```env
NEXT_PUBLIC_SITE_URL=https://smartdetailsautospa.com
NEXT_PUBLIC_APP_URL=https://app.smartdetailsautospa.com
NODE_ENV=production
# All production credentials — Supabase, Stripe live keys, Twilio, Mailgun, Square
# Verify: Stripe LIVE keys, not test keys
# Verify: Twilio production number
# Verify: Mailgun production domain
```

```bash
npm ci
npm run build
pm2 start npm --name "sd-production" -- start -- -p 3000
pm2 save
```

**Step 3 — Traefik config for production**
New file: `~/infra/traefik/dynamic/smartdetails-production.yml`

```yaml
http:
  routers:
    smartdetails-production:
      rule: "Host(`smartdetailsautospa.com`) || Host(`www.smartdetailsautospa.com`)"
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      service: smartdetails-production-service

  services:
    smartdetails-production-service:
      loadBalancer:
        servers:
          - url: "http://localhost:3000"
```

**Step 4 — DNS switch**
Update `smartdetailsautospa.com` A record to point to VPS IP.
(If already pointing to VPS from a previous deploy, this step may already be done.)

**Step 5 — Verify SSL and routing**
Traefik ACME will issue cert automatically. Monitor Traefik logs.
```bash
pm2 logs sd-production --lines 50
```

**Step 6 — Run DB migrations if any**
```bash
cd /var/www/smartdetails-production
# Run any pending Supabase migrations
# Verify migrations don't break existing data
```

### Production Smoke Test
```
[ ] https://smartdetailsautospa.com loads — correct new app, not old site
[ ] https://www.smartdetailsautospa.com redirects to non-www
[ ] https://app.smartdetailsautospa.com/admin — admin login works
[ ] https://app.smartdetailsautospa.com/pos — POS loads
[ ] Customer OTP login — real phone number receives real SMS
[ ] Booking flow — completes successfully, confirmation email received
[ ] Stripe payment — test with real card on production (refund immediately)
[ ] Customer portal — real customer account loads correct data
[ ] Receipt printing — physical receipt prints correctly
[ ] Old URL redirects — /admin → app.smartdetailsautospa.com/admin
[ ] SSL valid on all three domains (smartdetails, staging, app)
[ ] PM2 logs — no errors after 10 minutes of activity
[ ] Google Search Console — submit new sitemap URL
```

---

## Phase 9 — Post-Launch Monitoring

### First 24 Hours
```
[ ] Monitor PM2 logs on production every 2 hours: pm2 logs sd-production
[ ] Check Supabase dashboard — query volume, error rates
[ ] Confirm cron jobs ran at expected times (check logs)
[ ] No spike in SMS errors (Twilio dashboard)
[ ] No payment failures (Stripe dashboard)
[ ] Test customer OTP from a real customer device on cellular (not WiFi)
```

### First Week
```
[ ] Google Search Console — check for 404 crawl errors
[ ] Verify all redirected URLs returning 301 (not 404)
[ ] Resubmit sitemap in Search Console
[ ] Monitor Core Web Vitals in Search Console
[ ] Check PM2 memory usage — restart if climbing: pm2 restart sd-production
[ ] Staff feedback on new admin/POS URLs
```

### Ongoing Deployment Process (After Launch)
```
Bug or feature identified
  → Code fix on MBP (localhost)
    → Commit to staging branch
      → Push to GitHub
        → SSH to VPS: cd /var/www/smartdetails-staging && git pull && npm ci && npm run build && pm2 restart sd-staging
          → Test on staging.smartdetailsautospa.com
            → If good: merge staging → main on GitHub
              → SSH to VPS: cd /var/www/smartdetails-production && git pull && npm ci && npm run build && pm2 restart sd-production
                → Verify on smartdetailsautospa.com
```

For `app.` updates (admin/POS changes):
```
  → SSH to VPS: cd /var/www/smartdetails-app && git pull origin staging && npm ci && npm run build && pm2 restart sd-app
```

---

## Reference: DNS Records Summary

```
Type  Name               Value        Purpose
A     [root]             [VPS IP]     Production customer portal (existing or add)
A     www                [VPS IP]     www redirect (existing or add)
A     staging            [VPS IP]     Staging environment (NEW)
A     app                [VPS IP]     Admin + POS, IP restricted (NEW)
```

## Reference: VPS PM2 Processes

```
Name              Port   Branch    Domain                              IP Restricted
sd-app            3002   staging   app.smartdetailsautospa.com         YES (Traefik)
sd-staging        3001   staging   staging.smartdetailsautospa.com     NO
sd-production     3000   main      smartdetailsautospa.com             NO
```

## Reference: Environment Variables Per Environment

```
Variable                    staging.                    app.                        production
NEXT_PUBLIC_SITE_URL        staging.domain.com          app.domain.com              domain.com
NEXT_PUBLIC_APP_URL         app.domain.com              app.domain.com              app.domain.com
NODE_ENV                    production                  production                  production
Supabase keys               same project                same project                same project
Stripe keys                 TEST keys                   TEST keys                   LIVE keys
```

---

## Open Items / Decisions Not Yet Made

1. **CLAUDE.md update after Phase 5** — Once admin lives on `app.` and session isolation
   is confirmed, update CLAUDE.md to reflect the new domain structure and remove the
   signOut-on-mount rule added in Session 9-A.

2. **Staging Supabase project** — Currently staging uses the same Supabase project as
   production. If data isolation becomes a concern (e.g. running bulk test data), create
   a separate Supabase project for staging and replicate schema + RLS policies.
   Defer until a specific need arises.

3. **app.staging.smartdetailsautospa.com** — Not needed now. Add later only if a
   specific admin/POS change requires testing in a real-URL environment before deploying
   to `app.`. For all current work, testing admin on MBP localhost is sufficient.

4. **Phase 13 (Full QA)** and **Phase 16 (Launch Prep / data purge)** from the original
   app build plan — not yet started. These should be folded into Phase 6 and Phase 8
   of this roadmap respectively.

5. **Data purge before launch** — Phase 16 of the original plan includes clearing test
   transactions, dummy customers, and placeholder service entries created during
   development. This must happen before go-live. Add as a checklist item in Phase 8.
