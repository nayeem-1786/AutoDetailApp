# Mobile Detailer Access Architecture — Phase 0.4 Audit

> Read-only Component Behavior audit (Memory #29 type 3), 2026-06-05.
> Branch: `audit/phase-0-4-mobile-detailer-access`.
>
> Phase 0.4 of the locked QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE plan
> (v1.0, locked 2026-06-04). Final foundational audit; gates Phase 4
> implementation. Sibling to Sessions 0.1 (`SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md`,
> merge `69b15b0f`), 0.2 (`QUOTE_TO_APPOINTMENT_CONVERSION_AUDIT.md`,
> merge `dcf511df`), and 0.3 (`POPULATE_DEPENDENCIES_AUDIT.md`, merge
> `98a5f30d`).
>
> **No source / migration / test changes. No fix recommendations.
> No operator-decision pre-resolution.** The audit's deliverable IS
> the current-state picture of how — and whether — a mobile detailer
> at the customer's site interacts with the POS surface, plus an
> evenhanded enumeration of architectural options for Phase 4.

---

## Executive summary

**There is essentially NO mobile-detailer-specific infrastructure in the codebase.** The same PIN-based POS auth, the same `/pos/*` URL surface, the same role-permission matrix, and the same job-detail screen serve both the shop-bench detailer on the iPad and the (hypothetical) mobile detailer at the customer site. Three pieces of infrastructure incidentally lean toward mobile-friendliness — the PWA manifest (`public/manifest.json` scoped to `/pos`), the camera-capture file input (`photo-capture.tsx:123-130` uses `accept="image/*" capture="environment"`), and the offline transaction queue (`src/lib/pos/offline-queue.ts:1-164`, IndexedDB-backed for cash sales) — but none were designed for the mobile-detailer use case specifically; they're shop-iPad infrastructure that happens to also work on a phone. Conversely, the production architecture actively works AGAINST mobile-from-anywhere: a host-routing IP whitelist enforced at middleware (`src/middleware.ts:31-42` for `app.` domain, `:64-75` for staging) gates ALL POS access by IP when enabled, and the Stripe Terminal LAN-DNS dependency (CLAUDE.md Critical Rule: `private-domain: "stripe-terminal-local-reader.net"` in pfSense) means in-person card swipe IS NOT POSSIBLE off the shop's network — payment from the customer site routes through the existing `SendPaymentLinkDialog` flow instead. The detailer role's permission grant set (`src/lib/utils/role-defaults.ts:308-406`) already restricts the mobile-relevant detailer to jobs.view / jobs.manage / jobs.flag_issue / photos.upload / appointments.update_status / appointments.add_notes — exactly the action set a mobile detailer needs, and notably WITHOUT card-processing permissions that would fail off-LAN anyway. **Architectural conclusion: Phase 4's mobile workflow can be built on the existing surface with two open decisions — (1) how to handle the IP whitelist for off-shop access (whitelist-disable, whitelist-update, cellular bypass, separate token); (2) where Start Intake fires (shop side / detailer side / hybrid).** No new entity, no new auth flow, no separate "mobile operator app" is structurally required to enable the basic mobile workflow — but the audit surfaces seven operator decisions (F.1–F.7) including Stripe Terminal alternatives, dispatch-state addition, photo-bandwidth realities, and per-device session policy that the operator should resolve before Phase 4 scoping.

---

## Target A — Current mobile workflow inventory

### A.1 — What "mobile" means in the codebase

The codebase uses "mobile" in two distinct senses that the audit disambiguates:

**Sense 1: Mobile service** — the customer's appointment is at the customer's location; the detailer travels to them. This is a service-attribute / appointment-attribute concept, captured by `services.mobile_eligible` (BOOLEAN, `src/app/api/book/route.ts:138`) at the catalog layer and `appointments.is_mobile` (BOOLEAN, `DB_SCHEMA.md:163`) at the appointment layer. **All mobile_* schema columns refer to this sense.** Source: `src/lib/utils/resolve-mobile-fields.ts`, `src/components/jobs/edit-mobile-modal.tsx`, `src/app/pos/components/quotes/mobile-fee-picker.tsx`, etc.

**Sense 2: Mobile device** — the operator/detailer is using a mobile-form-factor device (phone or small tablet) rather than the shop's iPad. **Zero schema columns refer to this sense.** Source-code occurrences (`grep navigator.userAgent`, `iPad`, `iOS`) found only UX comments and CSS-breakpoint references in `src/app/pos/jobs/components/schedule-pill-row.tsx:79, :207`, `src/app/pos/components/ticket-panel.tsx:639-641`, and `src/app/pos/components/quotes/quote-ticket-panel.tsx:1155`. No client-side device-type gate exists.

**Phase 4 scope:** primarily Sense 2 (mobile device → mobile detailer at customer site), but tightly coupled to Sense 1 (the appointment is_mobile=true is the natural trigger for the Sense 2 workflow). The audit uses "mobile service" for Sense 1 and "mobile detailer" or "mobile device" for Sense 2 throughout.

### A.2 — Mobile service infrastructure (Sense 1)

For mobile-service appointments (customer at their location):

**Schema columns** (`DB_SCHEMA.md:163-166, 188`):

| Column | Type | Default | Notes |
|---|---|---|---|
| `appointments.is_mobile` | BOOLEAN | `false` | The canonical mobile-service flag |
| `appointments.mobile_zone_id` | UUID | `NULL` | FK → `mobile_zones(id)` ON DELETE SET NULL |
| `appointments.mobile_address` | TEXT | `NULL` | Customer-typed free-text address |
| `appointments.mobile_surcharge` | NUMERIC(10,2) | 0 | Snapshot from zone at creation time |
| `appointments.mobile_zone_name_snapshot` | TEXT | `NULL` | Snapshot of zone display name |

CHECK constraint `appointments_mobile_consistency` (`DB_SCHEMA.md:196`) — `(is_mobile=false AND mobile_surcharge=0) OR (is_mobile=true AND mobile_surcharge > 0)`. **A mobile appointment MUST have a non-zero surcharge.** Custom-fee path bypasses zone match via the `'Custom'` label (`pos/jobs/route.ts:286`).

The same fields exist on `quotes` (`DB_SCHEMA.md:2103-2107`) and propagate via `convertQuote` (`src/lib/quotes/convert-service.ts:139-143`).

**`mobile_zones` table** (`DB_SCHEMA.md:1421-1438`):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | TEXT | Display label (e.g., "Local — Torrance") |
| `min_distance_miles` / `max_distance_miles` | NUMERIC(5,1) | Concentric ring boundaries |
| `surcharge` | NUMERIC(10,2) | Flat fee for the zone |
| `is_available` | BOOLEAN | Operator toggle |
| `display_order` | INTEGER | Pick-list sort order |

**Critical fact:** Mobile zones are **distance-based concentric rings**, NOT polygons or coordinate boundaries. There is NO geocoding of the customer's typed address, NO validation that the address actually falls within the chosen zone, and NO map-deep-link / navigation affordance on the operator-facing job-detail surface. The customer self-attests to which zone applies based on the ring labels at booking time (`src/app/api/book/route.ts:521-540` only validates zone exists + surcharge matches, not address-to-zone correspondence).

**Operator-facing mobile surfacing in POS Jobs** (`src/app/pos/jobs/components/job-detail.tsx:1097-1198`):
- The job-detail card renders a **Mobile Service** block when `job.appointment.is_mobile === true` (`:1097`).
- Shows zone name + surcharge + address (free text, plaintext, no link, no map button).
- Pencil-edit opens `<EditMobileModal>` for in-place updates.
- When `!is_mobile`, an `+ Enable` affordance is shown for editable jobs (`:1180-1198`) — converts a shop job to mobile mid-flow.
- **No address-tap-to-navigate, no "directions" button, no map preview, no distance-to-shop calculation.** The detailer reads the address and uses external Maps app independently.

### A.3 — The detailer-on-site workflow (current state)

Based on cross-referencing the entire `src/app/pos/`, `src/app/api/pos/`, and `src/components/jobs/` trees:

**There is NO detailer-on-site code path distinct from the in-shop detailer.** Specifically:

- No "remote detailer login" route — only `/pos/login` (`src/app/pos/login/page.tsx`).
- No mobile-device PIN variant — `pin-login/route.ts:79-104` validates a single 4-digit PIN against `employees.pin_code`.
- No geo-fence at auth time — the only geo concept is the IP whitelist at middleware level (A.3 below).
- No detailer-specific token mint — the 12-hour POS token shape (`src/lib/pos/session.ts:1-94`) is identical regardless of role.
- No "detailer dispatched" / "detailer en route" / "detailer arrived" status — `grep -i "dispatched|enRoute|arrived"` found only the React `dispatched` (Redux-vocabulary) usage in component tests/comments; the `jobs.status` enum at `DB_SCHEMA.md:1234` (`scheduled | intake | in_progress | pending_approval | completed | closed | cancelled`) has no en-route or dispatched state.

**Current operational pattern (inferred from infrastructure absence + operator's earlier conversation context):** the mobile detailer would log in with their detailer-role PIN on whichever device they have (shop iPad they drive to the customer's location, or their personal phone using the same `/pos` URL). The same `posFetch` + `X-POS-Session` header reaches all endpoints; the same `is_mobile`-aware job-detail screen renders; the same Start Intake → Start Work → Complete progression fires PATCH calls. **Memory #11 caveat:** the audit cannot verify the operator's actual operational practice from the codebase — what the code SUPPORTS (one PIN, any device, same surface) is documented; what the OPERATOR currently DOES is outside the audit's reach without operator interview.

### A.4 — The Start Intake gap (the Phase 4 anchor question)

Per [AC-3](docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md#ac-3-start-intake-as-materialization-trigger) the operator pressing **Start Intake** is the canonical materialization event. The handler is `handleStartIntake` at `src/app/pos/jobs/components/job-detail.tsx:419-442` — PATCHes `/api/pos/jobs/{jobId}` with `{status: 'intake', intake_started_at: new Date().toISOString()}` and then auto-opens the intake zone picker if photos are enabled (`:433-435`).

**For a mobile appointment, today's job-detail UI does not differentiate Start Intake.** The same button renders, the same PATCH fires, the same zone picker opens. There is NO:
- "Are you at the customer's site?" prompt
- Geo-validation that the detailer's device is at the appointment's `mobile_address` location
- Distinction between shop-side dispatch and customer-site arrival
- Two-stage materialization (mark-dispatched → mark-arrived → mark-intake-started)

**The Phase 4 question this surfaces** (deferred to Target E below): when does Start Intake fire for a mobile job? Cross-referencing Phase 0.3 (`POPULATE_DEPENDENCIES_AUDIT.md`, merge `98a5f30d`) shows that the populate seam being replaced by AC-3's Start Intake materialization trigger is structurally shallow — its only consumers are the Today scope header and list render. The mobile-detailer workflow is the FIRST mover where Start Intake's exact firing location matters operationally (timer accuracy, on-time arrival metrics).

---

## Target B — Authentication and authorization for remote access

### B.1 — Staff authentication mechanism

**The single POS auth flow is PIN-based.** Source: `src/app/api/pos/auth/pin-login/route.ts:52-173`.

| Stage | File | Notes |
|---|---|---|
| 1. PIN entry UI | `src/app/pos/login/page.tsx` | 47 lines; renders pin-screen, captures input |
| 2. POST `/api/pos/auth/pin-login` | `src/app/api/pos/auth/pin-login/route.ts:52-173` | 4-digit numeric PIN (`/^\d{4}$/`, `:79`) |
| 3. Employee lookup | `:86-91` | `SELECT FROM employees WHERE pin_code=$1 AND status='active'` |
| 4. Token mint | `src/lib/pos/session.ts:40-63` | HMAC-SHA256 over base64url(payload); secret = `SUPABASE_SERVICE_ROLE_KEY` |
| 5. Token shape | `src/lib/pos/session.ts:5-14` | `{employee_id, auth_user_id, role, first_name, last_name, email, iat, exp}` |
| 6. Token lifetime | `src/lib/pos/session.ts:3` | `TOKEN_LIFETIME_HOURS = 12` |
| 7. Client storage | `src/app/pos/context/pos-auth-context.tsx:14, :101-103` | `localStorage` key `'pos_session'` |
| 8. Per-request transport | `src/app/pos/lib/pos-fetch.ts` + endpoints | Header `X-POS-Session: <token>` |
| 9. Server verify | `src/lib/pos/api-auth.ts:19-38` | `verifyPosToken` → timing-safe HMAC compare + exp check |

**Rate limiting:** in-memory per-IP at `pin-login/route.ts:6-50` — 5 failures in 5 minutes → 15-minute lockout. Per-process map; resets on deploy.

**Session expiry:** dual-layer per CLAUDE.md ("POS has TWO timeout systems: Idle timeout vs JWT token expiry"). Idle timeout is operator-configured (default 15 min, fetched from `business_settings.pos_idle_timeout_minutes`, `pin-login/route.ts:133-143`); JWT exp is hardcoded 12h. Idle locks the screen (PIN re-entry), JWT expiry forces full re-login.

**No biometric integration, no SSO, no SMS-OTP, no magic-link auth at POS layer.** Only PIN.

### B.2 — Multi-device support

**Multiple concurrent sessions on the same employee are NOT prevented at the token-mint layer.** Source: `pin-login/route.ts:123-131` — `createPosToken` does not consult any existing-session registry. Each successful PIN entry mints a fresh independent token. Two devices logged in with the same PIN each carry their own valid token until expiry; neither invalidates the other.

Cross-tab sync on the SAME device exists (`pos-auth-context.tsx:164-198` listens to `storage` events). This is a same-origin same-localStorage sync, NOT a cross-device coordination.

**Implication for mobile detailer:** they CAN log in on their phone simultaneously with the shop iPad without interfering. Stale tokens on a lost device persist for up to 12 hours unless the operator manually changes the employee's PIN (which doesn't invalidate existing tokens — only blocks new logins; the HMAC signature on issued tokens stays valid until `exp`).

### B.3 — Network / location restrictions

**Two-layer IP gating exists and applies to POS:**

**Layer 1: middleware page-level** (`src/middleware.ts`):
- `app.` host (`getHostType` at `src/lib/security/host-routing.ts:24`): IP whitelist applies to ALL paths including `/pos/*` (`:31-42`). 403 with body `"Access denied: Your IP address (X) is not authorized."` if `enabled && !ips.includes(clientIp)`.
- `staging.` host: same enforcement, scoped to `/pos/*` only (`:64-75`).
- `dev` host (localhost / unset `NEXT_PUBLIC_MAIN_DOMAIN`): no enforcement (`host-routing.ts:20-22`).

**Layer 2: API-level** (`src/lib/pos/api-auth.ts:27-28`):
- Every `authenticatePosRequest` call invokes `isIpAllowed(headers)` from `src/lib/security/ip-whitelist.ts:97-106`. Returns `null` (= 401 to caller) on IP mismatch.

**Whitelist config** (`src/lib/security/ip-whitelist.ts:14-89`):
- Source: `business_settings` rows `pos_allowed_ips` (JSONB array) + `pos_ip_whitelist_enabled` (boolean).
- 10-second in-memory cache (`CACHE_TTL_MS`, `:7`).
- Env-var fallback `ALLOWED_POS_IPS` (comma-separated) if DB unreachable.
- **When disabled or empty: `enabled=false` → all IPs allowed.** Default state for current MBP deployment per CLAUDE.md ("Currently deployed locally on MBP, but once fully developed it will become Deployed on dedicated Hostinger server").

**`getClientIp` semantics** (`ip-whitelist.ts:80-89`): reads `x-forwarded-for` (first IP), falls back to `x-real-ip`. Returns `null` for localhost / `::1` / `::ffff:127.0.0.1` → treated as allowed (dev-friendly).

**Implication for mobile detailer:**
- **If whitelist is disabled** (current default): no network restriction — detailer's phone on cellular reaches POS fine.
- **If whitelist is enabled** (production-intended per CLAUDE.md): cellular IPs are not whitelistable (carrier-grade NAT, rotating). The mobile detailer is structurally locked out unless the whitelist is configured to either (a) add their cellular carrier's range (impractical — large + shared), (b) require VPN-into-shop-LAN, or (c) use the host-routing distinction to leave `/pos` open on cellular while restricting `/admin`. Choice C is not currently implemented — the middleware whitelist is whole-domain at the `app.` host.

**No IP whitelist applied to /book (customer) or /quote/[token] (customer):** those are on the main domain (`smartdetailsautospa.com`) per `host-routing.ts:18-26, :29-32` — only `/admin`, `/pos`, `/login`, `/auth`, `/_next`, `/favicon` are on the `app.` subdomain.

### B.4 — Mobile-specific auth approaches

**None exist.** Greps for `detailer.*token`, `mobile.*detailer`, `hotlink`, `magic.link` returned:
- `gallery_token` on `jobs` (`DB_SCHEMA.md:1227`) — CUSTOMER-facing post-completion photo viewer at `/jobs/[token]/photos` (`src/app/jobs/[token]/photos/page.tsx`). NOT a detailer access path.
- `access_token` on `quotes` (`DB_SCHEMA.md:2098`) — CUSTOMER-facing quote view at `/quote/[token]` (`src/app/(public)/quote/[token]/page.tsx`). NOT a detailer access path.
- `/authorize/[token]` (`src/app/authorize/[token]/page.tsx` + `authorization-client.tsx`) — CUSTOMER-facing addon-authorization flow when the detailer flags an issue (`jobs.status='pending_approval'`). NOT a detailer access path.

**Architectural pattern that exists but isn't used for detailer:** token-based public-page UI shells. The three flows above prove the codebase can mint, persist, and gate a public-token URL surface. Phase 4 could in principle reuse this pattern for a detailer-facing job-specific URL — but no such code exists today.

---

## Target C — UX considerations for mobile detailer

### C.1 — Photo capture

Source: `src/app/pos/jobs/components/photo-capture.tsx:1-238`.

**Capture mechanism:** standard HTML5 `<input type="file" accept="image/*" capture="environment">` (`:123-130`). The `capture="environment"` hint requests the rear camera on mobile browsers; on desktop the same input falls back to the file picker.

**Implication:** photo capture is the SINGLE part of the codebase that works equally well on a mobile detailer's phone as on the shop iPad. No mobile-specific code is needed — the HTML5 input handles both. iOS Safari, Android Chrome, and desktop browsers all support `capture="environment"` to varying degrees (iOS: rear camera; Android: rear camera; Desktop: ignored, file picker).

**Permissions:** browser-prompted at first capture. Not stored in session; re-prompts per-domain per-camera-API per browser policy. The PWA install (per `public/manifest.json`, `start_url: "/pos"`, `scope: "/pos"`, `display: "standalone"`) does not change camera-permission behavior — same browser-policy applies.

**Upload path:** `POST /api/pos/jobs/[id]/photos` (`src/app/api/pos/jobs/[id]/photos/route.ts:23` — `authenticatePosRequest`). Auth follows the standard B.1 stack: requires valid POS token + IP whitelist (B.3). Photos uploaded to Supabase Storage bucket `'job-photos'` (`:173-174`) using the admin client (service role); URL accessed via `getPublicUrl`.

**Bandwidth consideration (operator):** the upload route does NOT compress server-side; what the browser sends is what Storage receives. Mobile devices on weak cellular may experience long upload times for 12MP iPhone photos (~3-5MB each). No client-side compression / resize in `photo-capture.tsx`. Not currently a blocker, but worth surfacing for the mobile context (F.6).

### C.2 — Timer (work_started_at / work_completed_at)

Source: `src/app/api/pos/jobs/[id]/start-work/route.ts` (referenced from `job-detail.tsx:444-459`).

**Timer is operator-press-driven, not auto-derived.** `jobs.work_started_at` is set when the detailer presses **Start Work** (the second action after Start Intake). `jobs.work_completed_at` is set on **Complete Job**.

**For a mobile detailer:** if Start Work is pressed at the shop iPad before driving out, the timer captures the drive time as work time. If pressed at the customer site (on the detailer's phone), the timer captures only actual work time but requires the detailer to have device access at the moment of physical work-start.

**There is no architectural distinction enforced.** The PATCH endpoint accepts whatever timestamp the client sends; the role-permission gate (`pos.jobs.manage`, detailer has it per `role-defaults.ts:323`) is the only check.

**Phase 4 implication:** timer accuracy depends on Phase 4's chosen Start Intake / Start Work firing pattern (Target E).

### C.3 — Addon flag-issue / customer notification

Source: `src/app/api/pos/jobs/[id]/addons` (route directory).

**Existing flow** (inferred from `job-detail.tsx:480-489` `handleResendAddon` + the `/authorize/[token]/*` routes):
1. Detailer mid-job identifies an unforeseen need (paint correction, deep stain, etc.).
2. Detailer creates an addon row (presumably `jobs.addons` JSONB or a separate `job_addons` table — not fully traced in this audit, out of scope).
3. Customer gets an SMS with the `/authorize/[token]` link.
4. Customer accepts or declines; job stays at or leaves `pending_approval` status.

**For mobile detailer:** identical to the shop-bench flow. The detailer presses **Flag Issue** on POS, customer SMS dispatched, customer responds, status changes. **Detailer needs POS access (token + IP) at the customer site for the initial flag press.** Once flagged, the customer authorization is detailer-independent — it happens via the customer's own phone and the public token URL.

**Permission gate:** `pos.jobs.flag_issue` — detailer has it (`role-defaults.ts:324`).

### C.4 — Checkout

Source: `src/app/api/pos/transactions/route.ts` (transactions creation), plus the in-shop `<CardPayment>` / `<SplitPayment>` flow (`src/app/pos/components/checkout/`).

**The detailer role does NOT have checkout permissions** by default (`role-defaults.ts:309-321`):
- `pos.open_close_register: false`
- `pos.process_card: false`
- `pos.process_cash: false`
- `pos.process_split: false`
- `pos.issue_refunds: false`

**This is operationally sensible for the mobile context** because:

1. **Stripe Terminal does not work off-LAN.** Per CLAUDE.md Critical Rule: *"Stripe Terminal in PWA: Requires pfSense DNS exception — `private-domain: 'stripe-terminal-local-reader.net'` in Unbound custom options. Without this, iPad Safari PWA can't resolve Stripe's local reader DNS (desktop browsers bypass via DoH)."* The detailer's phone on cellular cannot reach the shop's local Stripe Terminal reader. `src/app/pos/context/reader-context.tsx:33-50` auto-connects on POS mount; off-LAN this fails silently (toast error), but POS continues to function for non-card actions.

2. **Cash drawer is at the shop.** Detailer at customer site can't take cash without a physical receptacle there.

3. **The natural mobile payment path is the payment link.** `SendPaymentLinkDialog` (`src/app/pos/jobs/components/job-detail.tsx:1799` mount; `src/components/jobs/send-payment-link-dialog.tsx` component) sends the customer a Stripe Checkout URL via SMS. Customer pays on their own phone. The amount-due flow (`:1781-1797`) supports partial-amount selection. This works from any device on any network.

**Implication:** the absence of detailer checkout permissions PRE-IMPLEMENTS the "mobile detailer cannot close out the transaction" pattern. Either a manager finishes checkout from the shop iPad (later, after the job is `completed`), or the customer pays via the SMS payment link from their phone — neither requires the detailer's device to support card processing.

**Offline queue:** `src/lib/pos/offline-queue.ts:1-164` (IndexedDB) handles **cash sales** when the POS is offline (e.g., network outage at the shop). It does NOT handle the mobile-detailer case directly — the detailer doesn't have cash processing permission, and the queue's `QueuedTransaction` shape (`:27-46`) is bench-cash-shaped (`cash_tendered`, `cash_change`). Existing but tangential to mobile detailer.

---

## Target D — Architectural options for Phase 4

The audit ENUMERATES; the operator DECIDES. Each option is described with current-codebase feasibility evidence.

### Option 1: Bring the iPad

**Pattern:** detailer drives the shop iPad to the customer site, performs all POS actions on it, drives it back.

**Codebase support:** total — the existing surface is the iPad surface. Zero new code.

**Operational constraints:**
- One iPad per detailer in flight (or sharing the iPad means dispatch coordination).
- iPad on cellular plan OR tethered to detailer's phone hotspot.
- IP whitelist (B.3): the iPad's cellular IP rotates; whitelist must be either disabled or accept-cellular-by-CIDR (impractical) — same blocker as any device on cellular.
- Stripe Terminal off-LAN: card payment still NOT possible without VPN-back-to-shop (per Critical Rule). Use payment links from the iPad instead.

**Net structural newness:** zero code, possibly new business_settings for IP whitelist policy if cellular access is needed.

### Option 2: Same-credentials on detailer's personal device

**Pattern:** detailer installs the POS PWA (or visits `/pos`) on their phone, logs in with their PIN.

**Codebase support:** total — multi-device login already works (B.2). PWA manifest (`public/manifest.json`) supports phone install. Camera capture works (C.1). Job-detail screen is responsive (Tailwind mobile-first).

**Operational constraints:**
- Same IP whitelist + Stripe Terminal issues as Option 1.
- Detailer's phone PIN-securing the device is a separate matter from POS PIN — if the phone is unlocked and the localStorage POS token is fresh, anyone with the phone has POS access for up to 12 hours (the JWT exp; B.1).
- Multi-device sessions (B.2): a lost personal device retains a valid token until expiry. No remote revoke mechanism in code today.

**Net structural newness:** zero code. Operator policy decisions about device hygiene + lost-device protocol are out of scope.

### Option 3: Job-specific hotlink (detailer access token)

**Pattern:** when an appointment is assigned to a detailer, the system mints a job-specific token. The detailer receives a URL (SMS to detailer's phone, push notification, etc.) that opens a stripped-down job-specific UI without requiring PIN login.

**Codebase support:** PATTERN-PROVEN but NOT IMPLEMENTED for detailer use case. The three existing token-based public URL flows (`/quote/[token]`, `/jobs/[token]/photos`, `/authorize/[token]`) demonstrate that the codebase can mint, validate, and gate token-based access. None is detailer-facing.

**What would need to be built:**
- New `jobs.detailer_access_token` (or similar) column + generator at assignment time
- New `/detailer/[token]` route + UI
- New API endpoints OR a token→employee shim that converts the public token to a POS session server-side
- IP whitelist exception path for these tokens (otherwise still blocked at cellular)

**Net structural newness:** moderate — new schema column, new route family, new auth shim. Pattern is proven, scope is constrained per-job.

### Option 4: Dedicated mobile operator app / PWA

**Pattern:** a separate UI optimized for the mobile context (perhaps `/pos/mobile/*` or a separate manifest scope), with possibly its own auth flow.

**Codebase support:** the PWA manifest at `public/manifest.json` could be split or sub-scoped. Tailwind responsive classes already produce a phone-shaped UI from the existing `/pos` surface.

**What would need to be built:** depends on scope. Minimum: a route prefix + mobile-shaped layout that reuses existing components but rearranges the action surface for thumb-friendly use. Maximum: a parallel app with its own auth + token model.

**Net structural newness:** significant. Per Memory #11 + CLAUDE.md Rule 11 (component reuse) the operator should weigh whether the existing `/pos` is actually deficient on phone vs whether Option 2 + targeted UI polish suffices.

### Option 5: Hybrid (shop-side initiation + site-side execution)

**Pattern:** the shop-bench operator presses Start Intake on the shop iPad (or web admin) at dispatch time (or arrival-confirmed via SMS). Materialization happens then. The detailer at customer site uses lightweight access (Option 2 or Option 3) for the actual work-mode actions (Start Work, photos, flag-issue, Complete).

**Codebase support:** the lifecycle audit `2293fb3d` and Phase 0.3 `POPULATE_DEPENDENCIES_AUDIT.md` both confirm that materialization is currently implicit via populate; AC-3 commits to making Start Intake the explicit trigger. This option splits the AC-3 trigger across two events (one shop-side, one site-side). The intermediate state — appointment is `in_progress` but job hasn't actually started work — already EXISTS in the data model (job at status `intake`, `intake_started_at` set, `work_started_at` NULL). No new schema needed; just an operator-workflow contract about WHO presses WHAT WHEN.

**Net structural newness:** zero schema. Workflow-design heavy. Possibly a new role-permission split or a "detailer mode" UI variant. Compatible with any of Options 1–4 for the site-side leg.

---

## Target E — Connection to AC-3 (Start Intake)

### E.1 — Where does Start Intake fire from for mobile appointments?

Three architectural patterns, each with codebase implications:

**Pattern A — Operator-side (shop iPad presses Start Intake when detailer dispatched)**
- Materialization happens at dispatch time. Detailer arrives at site with `jobs.status='intake'`, `intake_started_at` set to dispatch time.
- Timer (`work_started_at`) still controlled by detailer separately, so actual-work timing stays accurate.
- Detailer-side: needs Start Work, photos, addons, Complete — all already gated by detailer role permissions (`role-defaults.ts:323-325, :340, :368`).
- Pros: shop operator owns dispatch coordination; the iPad's IP whitelist passes; no off-LAN auth concerns at the materialization moment.
- Cons: `intake_started_at` is no longer "when the customer's vehicle was inspected" — it's "when the detailer left the shop." Conceptual drift.

**Pattern B — Detailer-side (detailer at customer site presses Start Intake)**
- Materialization happens at physical handoff. `intake_started_at` = "when the detailer is at the vehicle with the customer."
- Detailer-side: needs full Start Intake access from the mobile device.
- Pros: timing semantically clean — `intake_started_at`, `work_started_at`, `work_completed_at` all reflect actual physical events.
- Cons: requires the detailer's device to have working POS auth at the site. If IP whitelist is enabled and cellular isn't allowed, this pattern fails. If the detailer's device is dead / left at the shop, no Start Intake fires and the job never materializes.

**Pattern C — Hybrid (operator marks "dispatched"; detailer marks "arrived and starting")**
- New intermediate state. Either a new `jobs.status` value (`dispatched` or `en_route`) or a new column (`dispatched_at` separate from `intake_started_at`).
- Two interactions, two surface affordances. Tighter timing data.
- Pros: BI-friendly (dispatch-to-arrival time, arrival-to-work-start time, etc.).
- Cons: more schema, more UX surfaces, more permissions split. None of the existing infrastructure suggests this is currently anticipated.

**Cross-reference with AC-3:** the locked AC-3 (`QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:299-318`) doesn't explicitly choose A/B/C. It commits to Start Intake as the materialization trigger and adds gating (future-dated → popup, status NOT IN (confirmed, in_progress) → blocked). It does NOT specify which device or which actor fires Start Intake — both shop iPad and detailer device satisfy the locked semantic. The Phase 4 design is the place to lock A/B/C.

### E.2 — Materialization timing accuracy

| Pattern | `intake_started_at` semantic | Timer accuracy | BI implication |
|---|---|---|---|
| A | "Detailer dispatched from shop" | Independent of materialization (`work_started_at` is operator-press) | Dispatch-to-pickup ≠ inspect-to-complete |
| B | "Detailer at vehicle with customer" | Same as today (`work_started_at` operator-press) | Semantic clean; timing precise |
| C | "Detailer at vehicle" (new state captures dispatch separately) | Cleanest — three timestamps for three events | New schema + new UX; richest data |

Cross-reference with Phase 0.3 finding that POS Jobs Today scope counts `totalJobs` from materialized rows (`POPULATE_DEPENDENCIES_AUDIT.md`): in Pattern A, the daily summary card shows the day's dispatched jobs (early in the day); in Pattern B, it shows actually-started jobs (later in the day, but real). Neither is wrong; they answer different questions.

---

## Target F — Open operator decisions surfaced (NOT pre-resolved)

### F.1 — Mobile detailer device strategy

Which of Options 1–4 (or which combination via Option 5) does the operator commit to? The decision drives all subsequent Phase 4 sizing. **No code-level constraint forces the choice** — all five are feasible, with differing scope.

### F.2 — IP whitelist policy for off-shop access

The IP whitelist (B.3) is currently UNUSED in dev but commits to being USED in production per CLAUDE.md (Hostinger deployment). If enabled:

- Disable for `/pos` specifically while keeping for `/admin`? Requires middleware-rule split.
- Add a per-employee bypass token / cellular-allow flag at auth time? Requires new column + auth-layer logic.
- Require detailer-VPN-into-shop-LAN? Operational; no code change.
- Leave it disabled in production entirely? Acknowledges no-IP-restriction posture.

**No current code path supports any of these**; the middleware is whole-host whitelist or off.

### F.3 — Job-specific access tokens (Option 3)

Build the `jobs.detailer_access_token` infrastructure? Or rely on existing PIN auth?

- The existing token pattern (`/quote/[token]`, `/jobs/[token]/photos`, `/authorize/[token]`) PROVES this is doable.
- Constraints: token rotation policy, expiry, revocation (none of the existing public-token flows have revocation either).

### F.4 — Mobile checkout strategy

Confirmed structural fact: card processing at customer site (Stripe Terminal) requires LAN access to the shop's reader, which is NOT available off-LAN. Three operator paths:

- **Payment link only** (`SendPaymentLinkDialog` already supports this) — customer pays from their phone, detailer never touches money.
- **Stripe Tap to Pay / smartphone reader** — separate Stripe product line; not currently integrated in the codebase (no `TapToPay` / `mobile reader SDK` greps). Would require new Stripe SDK + UI surface.
- **Cash collected, manually entered later** — defer transaction creation to the next shop visit; detailer carries a receipt pad. No code change; operational discipline.

### F.5 — Authentication on detailer phone

Same 4-digit PIN as the shop iPad? Or a separate detailer-only PIN (longer, biometric-backed, or per-device)?

- Existing PIN system is one-PIN-per-employee. Multiple PINs per employee not supported.
- Biometric: WebAuthn is not currently integrated; would be a new addition.
- Per-device binding: not currently supported; the token has no device claim.

### F.6 — Photo bandwidth / device storage

Mobile detailer on weak cellular taking many 3-5MB photos:

- Upload route does not compress (C.1). 
- Should client compress before upload? Service-worker queue + retry? Background upload?
- Storage cost implications for high-mobile-volume operation.

No current code supports any of this — the upload is a direct fetch.

### F.7 — Dispatch / en-route state (Pattern C from E.1)

Add a `dispatched` / `en_route` state to capture the "detailer has left but hasn't arrived" interval? Or leave the lifecycle at the current 7-state `jobs_status_check`?

Adds operational data; adds UX and schema work. Operator-only decision.

---

## File:line reference index

### Authentication

| Topic | File | Range |
|---|---|---|
| POS PIN login endpoint | `src/app/api/pos/auth/pin-login/route.ts` | 52-173 |
| Rate limit per IP | `src/app/api/pos/auth/pin-login/route.ts` | 6-50 |
| PIN format gate | `src/app/api/pos/auth/pin-login/route.ts` | 79 |
| Token mint | `src/lib/pos/session.ts` | 40-63 |
| Token lifetime constant | `src/lib/pos/session.ts` | 3 |
| Token verify | `src/lib/pos/session.ts` | 65-93 |
| Per-request auth | `src/lib/pos/api-auth.ts` | 19-38 |
| Client session storage | `src/app/pos/context/pos-auth-context.tsx` | 14, 90-107, 109-265 |
| Cross-tab sync | `src/app/pos/context/pos-auth-context.tsx` | 164-198 |
| Logout endpoint | `src/app/api/pos/auth/logout/route.ts` | full file |

### IP whitelist

| Topic | File | Range |
|---|---|---|
| Whitelist config + cache | `src/lib/security/ip-whitelist.ts` | 14-89 |
| `isIpAllowed` predicate | `src/lib/security/ip-whitelist.ts` | 97-106 |
| Client IP extraction | `src/lib/security/ip-whitelist.ts` | 80-89 |
| Middleware app-host enforcement | `src/middleware.ts` | 31-42 |
| Middleware staging POS-only | `src/middleware.ts` | 64-75 |
| Host-type detection | `src/lib/security/host-routing.ts` | 18-26 |
| App-allowed paths | `src/lib/security/host-routing.ts` | 29-32 |
| API-layer enforcement | `src/lib/pos/api-auth.ts` | 27-28 |

### Mobile service (Sense 1)

| Topic | File / Anchor | Notes |
|---|---|---|
| `appointments.is_mobile` schema | `docs/dev/DB_SCHEMA.md:163-166, 188` | + mobile_consistency CHECK at `:196` |
| `quotes` mobile columns | `docs/dev/DB_SCHEMA.md:2103-2107` | + mobile_consistency CHECK at `:2119` |
| `mobile_zones` table | `docs/dev/DB_SCHEMA.md:1421-1438` | Distance-ring zone model |
| Booking-route zone validation | `src/app/api/book/route.ts` | 510-541 |
| Walk-in-route zone validation | `src/app/api/pos/jobs/route.ts` | 252-293 |
| convertQuote mobile field copy | `src/lib/quotes/convert-service.ts` | 139-143 |
| Job-detail mobile card | `src/app/pos/jobs/components/job-detail.tsx` | 1090-1198 |
| EditMobileModal component | `src/components/jobs/edit-mobile-modal.tsx` | full file |

### Mobile-device-relevant infrastructure

| Topic | File | Range |
|---|---|---|
| PWA manifest | `public/manifest.json` | full file |
| POS service worker | `public/pos-sw.js` | 158 lines |
| Camera-capable file input | `src/app/pos/jobs/components/photo-capture.tsx` | 123-130 |
| Photo upload endpoint | `src/app/api/pos/jobs/[id]/photos/route.ts` | 23, 75, 173-174 |
| Offline cash queue (IndexedDB) | `src/lib/pos/offline-queue.ts` | 1-164 |
| Start Intake handler | `src/app/pos/jobs/components/job-detail.tsx` | 419-442 |
| Start Work handler | `src/app/pos/jobs/components/job-detail.tsx` | 444-459 |
| Send payment link dialog mount | `src/app/pos/jobs/components/job-detail.tsx` | 1799-1819 |

### Stripe Terminal LAN dependency

| Topic | File / Anchor | Notes |
|---|---|---|
| pfSense DNS exception rule | `CLAUDE.md` (Key Patterns) | *"Stripe Terminal in PWA: Requires pfSense DNS exception"* |
| Reader auto-connect | `src/app/pos/context/reader-context.tsx` | 33-50 |
| Terminal SDK helpers | `src/app/pos/lib/stripe-terminal.ts` | 60-152 |
| `ensureConnected` reader discovery | `src/app/pos/lib/stripe-terminal.ts` | 138-152 |

### Role permissions

| Topic | File | Range |
|---|---|---|
| `UserRole` type | `src/lib/supabase/types.ts` | 4 |
| Detailer role permission defaults | `src/lib/utils/role-defaults.ts` | 308-406 |
| Permissions detailer has (mobile-relevant subset) | `src/lib/utils/role-defaults.ts` | 322-324, 334, 340-341, 368-369 |

### Customer-facing token URL precedents (Option 3 pattern)

| Token | URL | File |
|---|---|---|
| `quotes.access_token` | `/quote/[token]` | `src/app/(public)/quote/[token]/page.tsx` |
| `jobs.gallery_token` | `/jobs/[token]/photos` | `src/app/jobs/[token]/photos/page.tsx` |
| Job-addon authorize token | `/authorize/[token]` | `src/app/authorize/[token]/page.tsx` |

### Cross-references to sibling audits

| Audit | File | Merge |
|---|---|---|
| SMS/Phone agent booking flow (Phase 0.1) | `docs/dev/SMS_PHONE_AGENT_BOOKING_FLOW_AUDIT.md` | `69b15b0f` |
| Quote → Appointment conversion (Phase 0.2) | `docs/dev/QUOTE_TO_APPOINTMENT_CONVERSION_AUDIT.md` | `dcf511df` |
| Populate dependencies (Phase 0.3) | `docs/dev/POPULATE_DEPENDENCIES_AUDIT.md` | `98a5f30d` |
| Materialization lifecycle (foundational) | `docs/dev/APPOINTMENT_TO_JOB_MATERIALIZATION_LIFECYCLE_AUDIT.md` | `2293fb3d` |

### Architectural commitments referenced

| AC | Lifecycle doc anchor |
|---|---|
| Stage 3 Job | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:152-191` |
| AC-3 Start Intake materialization | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:299-318` |
| Phase 4 stub | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:961-973` |
| Phase 0.4 entry | `docs/dev/QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md:619-636` |

---

**End of audit.**
