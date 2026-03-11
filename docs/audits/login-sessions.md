# Login & Session Audit

*Date: 2026-03-10*

---

## Summary of Prior Auth Changes

### From TROUBLESHOOTING.md

1. **Web Locks AbortError (2026-02-26)** — Supabase's `navigator.locks.request()` caused `AbortError` in Next.js dev mode due to HMR module re-execution creating orphaned lock holders. Fixed by providing a custom `lock` pass-through in the browser client config (`src/lib/supabase/client.ts`). This replaces Web Locks with a direct function call — safe for single-tab usage.

2. **Auth Resilience attempt (2026-02-26)** — Added try/catch + `signOut()` in error handlers across `auth-provider.tsx` and `supabase/middleware.ts`. This **made things WORSE** — `signOut()` is server-side session invalidation, not local cleanup. It killed sessions during `SIGNED_IN` events. Middleware catch block deleted `sb-*` cookies. Result: infinite login loop. **Fully reverted.**

3. **Stale Auth Cookies (2026-02-26)** — Browser holds Supabase session token from previous server state. Fixed with `window.__supabase_browser_client` singleton to survive HMR. Edge cases still possible after branch switches or major rebuilds.

4. **Loading state guarantee (2026-02-26)** — `getSession().catch()` now includes `setLoading(false)` as a fallback. `onAuthStateChange` both branches also call `setLoading(false)`.

### From CHANGELOG.md

5. **OTP Infinite Spinner — inline-auth.tsx (2026-02-28)** — `onSuccess()` (async `handleAuthSuccess`) was not awaited, and `setLoading(false)` was never called on success paths. Fixed with `await` before `onSuccess()`.

6. **OTP Infinite Spinner — inline-auth.tsx (2026-03-01)** — Multiple auth functions had missing `setLoading(false)` on certain code paths and no top-level try/catch. Wrapped all 5 auth handler functions in try/catch/finally.

7. **OTP Spinner — signin/signup pages (2026-03-10)** — `verifyOtp` had no try/catch wrapping post-verification logic (getUser, employee check, customer linking). If any async call threw, spinner was never cleared. Added try/catch/finally + 15-second fallback timeout.

**Pattern**: OTP spinner bugs have been fixed **three separate times** across different files, each time with the same root cause (missing error handling leaving `loading` stuck at `true`). This suggests a systemic pattern rather than isolated bugs.

---

## Login Entry Points

| # | Surface | Path | Auth Method | Supabase Client | Post-Auth Action | User Type |
|---|---------|------|-------------|-----------------|------------------|-----------|
| 1 | Customer Portal Sign-In | `src/app/(customer-auth)/signin/page.tsx` | Phone OTP, Email+Password | Browser (`createClient()`) | `router.push(redirectTo)` + `router.refresh()` | Customer |
| 2 | Customer Portal Sign-Up | `src/app/(customer-auth)/signup/page.tsx` | Phone OTP, Email+Password | Browser (`createClient()`) | `router.push('/account')` + `router.refresh()` | Customer |
| 3 | Staff/Admin Login | `src/app/(auth)/login/page.tsx` | Email+Password | Browser (`createClient()`) | `router.push(redirectTo)` + `router.refresh()` | Staff/Admin |
| 4 | POS Login | `src/app/pos/login/page.tsx` | PIN (via `PinScreen` → `/api/pos/auth/login`) | None (custom HMAC JWT) | `storePosSession()` → `router.replace('/pos')` | Staff |
| 5 | Booking Inline Auth | `src/components/booking/inline-auth.tsx` | Phone OTP, Email+Password, Sign-Up | Browser (`createClient()`) | `onAuthComplete(data)` callback | Customer |
| 6 | Auth Callback | `src/app/auth/callback/route.ts` | Code exchange (email confirm, password reset) | Server (`createServerClient`) | `redirect(origin + next)` | Any |
| 7 | Password Reset (Staff) | Via `/auth/callback?next=/login/reset-password` | Email link → code exchange | Server (callback) → Browser (reset form) | Redirect to login | Staff |
| 8 | Password Reset (Customer) | Via `/auth/callback?next=/signin/reset-password` | Email link → code exchange | Server (callback) → Browser (reset form) | Redirect to signin | Customer |

---

## Supabase Client Instances

| # | File | Type | Web Locks Patch | Storage Adapter | Singleton? | Context |
|---|------|------|----------------|-----------------|------------|---------|
| 1 | `src/lib/supabase/client.ts` | `createBrowserClient` (SSR) | YES — custom `lock` pass-through | Default (localStorage + cookies) | YES — `window.__supabase_browser_client` | Browser |
| 2 | `src/lib/supabase/server.ts` | `createServerClient` (SSR) | N/A (server) | Cookies via `next/headers` | NO — fresh per call | Server Components / Route Handlers |
| 3 | `src/lib/supabase/middleware.ts` | `createServerClient` (SSR) | N/A (server) | Cookies via request/response | NO — fresh per request | Middleware |
| 4 | `src/lib/supabase/admin.ts` | `createClient` (vanilla) | N/A (server) | None (`persistSession: false`) | NO — fresh per call | Server-only (service role) |
| 5 | `src/middleware.ts` (IP whitelist) | `createClient` (vanilla) | N/A (server) | None (`persistSession: false`) | NO — fresh per request | Middleware (IP whitelist query only) |
| 6 | `src/app/auth/callback/route.ts` | `createServerClient` (SSR) | N/A (server) | Cookies via `next/headers` | NO — fresh per call | Auth callback |

**All browser-context clients** go through `client.ts` which has the Web Locks patch and singleton. No unpatched browser clients found.

---

## Cookie & Session Lifecycle

### At Login

**Supabase cookie naming**: All surfaces use the same Supabase project (`zwvahzymzardmxixyfim`), which means cookies are named `sb-zwvahzymzardmxixyfim-auth-token` (chunked). These are HttpOnly, path `/`, set by `@supabase/ssr` via the cookie adapter.

**Admin/Customer login flow:**
1. User submits credentials → `supabase.auth.signInWithPassword()` or `supabase.auth.verifyOtp()`
2. Supabase JS client stores JWT + refresh token in cookies (via `@supabase/ssr` storage adapter)
3. Client calls `router.push(redirectTo)` + `router.refresh()`
4. `router.refresh()` triggers server-side re-render → middleware reads fresh cookies → `updateSession()` calls `getUser()` → validates JWT

**POS login flow:**
1. User enters PIN → `POST /api/pos/auth/login` → server validates PIN against employee record
2. Server returns custom HMAC JWT (NOT a Supabase session) with employee data
3. Client stores in `localStorage` as `pos_session` key
4. POS uses `posFetch()` with `X-POS-Session` header for all API calls
5. **POS does NOT use Supabase auth cookies at all** — completely independent auth system

### On Session Expiry (JWT — 1 hour default)

**Admin (`auth-provider.tsx`):**
- `onAuthStateChange` listener fires on `TOKEN_REFRESHED` event — Supabase auto-refreshes JWT using refresh token
- Periodic `getUser()` call every 60 seconds (`SESSION_CHECK_INTERVAL`) — if error or no user, clears state and redirects to `/login?reason=session_expired`
- Window focus event also triggers validation
- Global fetch interceptor in `admin-shell.tsx` catches 401 responses from API routes → redirects to login

**Customer Portal (`customer-auth-provider.tsx`):**
- Same 60-second periodic `getUser()` check
- Same window focus validation
- Same global fetch 401 interceptor → redirects to `/signin?reason=session_expired`

**POS (`pos-auth-context.tsx`):**
- Custom HMAC JWT with 12-hour expiry (hardcoded server-side)
- Periodic `isTokenExpired()` check every 60 seconds (client-side payload decode)
- If expired: `signOut('token_expired')` → clears localStorage → triggers redirect to `/pos/login`

### On Refresh Token Expiry (7 days default)

- Supabase refresh token has a 7-day default lifetime
- If expired: `getUser()` returns error → session validation catches it → redirect to login
- No explicit handling for the "days away" scenario beyond the periodic check
- **FINDING**: Both `auth-provider.tsx` and `customer-auth-provider.tsx` call `getSession()` on mount, which reads the local cached session. If JWT is expired but refresh token is valid, Supabase should auto-refresh. If both are expired, `getSession()` returns null → `setLoading(false)` → admin-shell redirects to login.

### On Hard Refresh

- Session state is read from cookies on every server render (middleware calls `updateSession()` → `getUser()`)
- Client-side re-initializes: `getSession()` reads from cookies, `onAuthStateChange` sets up
- Browser client is a singleton on `window`, so it survives soft navigation but is recreated on hard refresh

**Service Worker impact**: POS has a service worker (`public/pos-sw.js`) scoped to `/pos`. It uses network-first strategy for POS pages and caches specific read-only API routes. **It does NOT intercept auth-related routes** (auth routes are under `/api/` but not in `CACHEABLE_API_PATTERNS`). It also doesn't intercept non-POS routes at all.

**FINDING**: The POS service worker does NOT intercept `/signin`, `/signup`, `/account`, or any customer portal route (scope is `/pos` only). **Not the cause of the customer portal OTP issue.**

---

## Admin vs POS Session Isolation

### Cookie Namespacing — WARNING

| Surface | Auth Mechanism | Storage Location | Cookie/Key Name |
|---------|---------------|------------------|-----------------|
| Admin | Supabase Auth | Cookies | `sb-zwvahzymzardmxixyfim-auth-token*` |
| Customer Portal | Supabase Auth | Cookies | `sb-zwvahzymzardmxixyfim-auth-token*` (SAME) |
| POS | Custom HMAC JWT | localStorage | `pos_session` |
| Booking (inline) | Supabase Auth | Cookies | `sb-zwvahzymzardmxixyfim-auth-token*` (SAME) |

**CRITICAL FINDING**: Admin, Customer Portal, and Booking all share the **same Supabase cookie**. They use the same Supabase project, so there is only one cookie namespace. This means:

- A staff member logged into Admin and a customer logged into the portal **on the same browser** will overwrite each other's session.
- If an admin is logged in and then someone signs into the customer portal, the customer session replaces the admin session in the cookie.
- Conversely, the admin `AuthProvider` (which checks `employees` table) won't find an employee record for a customer user → redirects to login.

**POS is fully isolated** — it uses localStorage with a custom JWT, completely separate from Supabase cookies.

### Session Bleed Scenarios

| Scenario | Risk Level | Details |
|----------|-----------|---------|
| Staff logs into admin, then opens customer portal in same browser | **HIGH** | Same Supabase cookie — admin session is active. Customer portal's `CustomerAuthProvider` reads the same session. If the user is a staff member, `customers` query returns null → portal shows no data or redirects. |
| Admin logs out → does POS get logged out? | **NONE** | POS uses separate auth (localStorage). Admin logout calls `supabase.auth.signOut()` which only affects Supabase cookies. |
| Customer signs in → admin tab still open | **HIGH** | Customer OTP creates a new Supabase session, overwriting the admin's. Admin's next periodic `getUser()` check returns the customer user → `loadEmployeeData()` fails (no employee record) → admin redirects to login. |
| Two different users on same machine (admin + portal) | **HIGH** | Last login wins — whoever signs in last overwrites the shared cookie. |
| POS session expires → affects admin? | **NONE** | POS `onAuthStateChange` doesn't exist (POS doesn't use Supabase auth). POS expiry only affects localStorage. |

### Role Enforcement

**Server-side enforcement:**
- Admin API routes: Use `createClient()` (server) → `getUser()` → check against `employees` table. Staff-only access is enforced per-request.
- Customer API routes: Use `createClient()` (server) with RLS — customers can only see their own data.
- POS API routes: Use `authenticatePosRequest()` (HMAC verification) — completely independent of Supabase auth.
- **Role is checked on every server request, not just at login time.** This is correct.

**Client-side enforcement:**
- `AuthProvider` loads employee data including role, permissions, `is_super`, `can_access_pos` — used for UI gating only.
- `CustomerAuthProvider` loads customer data — used for UI only.
- **FINDING**: If a customer session is active in the cookie but the user navigates to `/admin`, middleware will see a valid Supabase user and NOT redirect to login. The `AdminContent` component will then try `loadEmployeeData()`, fail (no employee record), and redirect to `/login`. This works but relies on client-side redirect rather than middleware-level role check.

### onAuthStateChange Listener Locations

| # | File | Scope | What it does |
|---|------|-------|-------------|
| 1 | `src/lib/auth/auth-provider.tsx` | Admin layout (via `AdminShell`) | Sets session/user/employee state, loads permissions |
| 2 | `src/lib/auth/customer-auth-provider.tsx` | Customer portal layout (via `(account)/layout.tsx`) | Sets session/user/customer state |
| 3 | `src/components/public/header-client.tsx` | Every public/customer page with header | Updates display name on sign-in/sign-out |

**FINDING**: Listeners #1 and #2 are in different React trees (admin layout vs account layout) — they don't coexist on the same page. No cross-contamination risk from listeners themselves. However, listener #3 (header) is present on both customer portal pages AND public pages. If an admin is signed in and visits a public page, the header listener fires on `TOKEN_REFRESHED`, queries `employees` to skip staff → works correctly.

---

## OTP Resend Timer Bug — Root Cause

The resend countdown timer in `signin/page.tsx`:

```tsx
const [resendCooldown, setResendCooldown] = useState(0);

// Set to 60 on OTP send:
setResendCooldown(60);

// Countdown effect:
useEffect(() => {
  if (resendCooldown <= 0) return;
  const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
  return () => clearTimeout(t);
}, [resendCooldown]);
```

**Analysis:**
- Timer is managed via `useState` + `useEffect` with `setTimeout`.
- The timer **resets to 60** whenever `resendOtp()` is called (line 295: `setResendCooldown(60)`).
- The "5s → 60s jump" can occur if:
  1. **Component remounts**: If the parent conditionally renders the OTP form based on `mode` state, switching modes causes full unmount/remount → `resendCooldown` resets to initial `0`. But `sendOtp()` sets it to `60` when entering OTP mode, so the initial value is `60`. A remount during countdown would reset to `0`, not `60`.
  2. **`resendOtp()` called unintentionally**: If the verify button triggers resend logic, `setResendCooldown(60)` runs. But `resendOtp()` has a guard: `if (resendCooldown > 0) return;` — this should prevent it.
  3. **Form resubmission or double render**: If `verifyOtp` fails and the error path somehow triggers `sendOtp` again (via form submit propagation or state change cascading into a mode switch back to `phone` then back to `otp`), `setResendCooldown(60)` fires again.

**Most likely cause**: The 15-second fallback timer fires (`setError('Something went wrong...')`) which shows an error. If the user is still on the OTP screen, the countdown was at ~5s. Then if they need to re-request a code, `resendOtp()` fires and resets to 60. The "jump" is actually two different events: timer counting down to 5, then user action or auto-retry resetting it to 60.

**NOTE**: The timer itself is correctly implemented. The perceived "jump" is more likely related to the OTP verify failure triggering UI state changes that make it appear the timer reset.

---

## Private vs Normal Browser — Root Cause Analysis

### Differences Between Private and Normal Browsing

| Factor | Normal Browser | Private/Incognito | Impact |
|--------|---------------|-------------------|--------|
| Cookies | Has stale `sb-*` cookies from prior sessions | Empty — no prior cookies | **HIGH** |
| localStorage | Has prior Supabase storage data | Empty | **MEDIUM** |
| Service Worker | Active (if POS was visited before) | Not registered | **LOW** (POS SW scoped to `/pos` only) |
| Browser Extensions | Active | Disabled or limited | **LOW** |

### Root Cause Hypothesis

**Primary cause: Stale Supabase session cookie conflicts with new OTP verification.**

When a customer signs in via OTP in a normal browser:
1. The browser already has `sb-zwvahzymzardmxixyfim-auth-token*` cookies from a **prior session** (possibly a staff/admin session or an old customer session).
2. `supabase.auth.verifyOtp()` is called from the browser client.
3. The Supabase JS client sends the existing cookie alongside the OTP verify request.
4. The server receives the OTP token AND the stale session cookie → potential conflict.
5. The response may try to merge or refresh the stale session instead of cleanly establishing a new one.
6. Post-verification calls (`getUser()`, `employees` check, `customers` check) may operate on the stale session instead of the fresh OTP session.

**Supporting evidence:**
- The prior fix (2026-03-10 in CHANGELOG) identified that post-verification async calls (`getUser`, employee check, customer linking) could throw and leave the spinner stuck. If a stale session causes `getUser()` to return a different user than expected, the employee/customer linking logic could fail in unexpected ways.
- The `signInWithOtp()` + `verifyOtp()` flow creates a new session. But if the browser client singleton still holds a reference to the old session, `onAuthStateChange` may fire with stale data before the new session is fully established.
- In private browsing, there are no prior cookies → clean slate → OTP flow works perfectly.

**Secondary factor: `onAuthStateChange` firing during OTP verification.**

When `verifyOtp()` succeeds:
1. Supabase client fires `SIGNED_IN` event via `onAuthStateChange`
2. If the header's listener (#3) fires simultaneously, it queries `employees` and `customers` tables
3. These queries run under the new user's RLS context
4. If the previous session was a staff account, the `TOKEN_REFRESHED` event for the OLD session might fire before `SIGNED_IN` for the new session — creating a race condition

### Recommended Manual Test

To confirm the root cause, try in a normal browser:
1. Open DevTools → Application → Cookies
2. Delete all `sb-*` cookies
3. Also clear `localStorage` (Application → Local Storage → clear site data)
4. Try OTP login again
5. **If this works**, the root cause is confirmed: stale cookies/storage interfere with fresh OTP login.

---

## Issue Severity Rankings

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| 1 | **Shared Supabase cookie across Admin, Customer Portal, and Booking** | **Critical** | All three surfaces share the same `sb-*` cookie. Logging into one overwrites the session for the other. A staff member using admin and a customer on the same browser will collide. |
| 2 | **Stale cookies cause OTP failure in normal browsers** | **Critical** | Prior session cookies (especially from staff/admin) interfere with customer OTP verification. Root cause of the reported "works in private, fails in normal" bug. |
| 3 | **No server-side role check in middleware for /admin routes** | **High** | Middleware only checks `if (!user)` for `/admin` routes. A valid customer session can pass middleware and reach the admin layout, relying on client-side redirect. Should be rejected at middleware level. |
| 4 | **CustomerAuthProvider missing `.catch()` on `getSession()`** | **High** | Unlike `auth-provider.tsx` (which has `.catch()`), `customer-auth-provider.tsx` has NO `.catch()` on `getSession()`. If `getSession()` throws, `loading` stays `true` forever → permanent spinner. |
| 5 | **CustomerAuthProvider `onAuthStateChange` missing `setLoading(false)` fallback** | **High** | `loadCustomerData()` in the `onAuthStateChange` handler does NOT have `.finally(() => setLoading(false))`. If `loadCustomerData` throws, loading stays `true`. The admin provider has this fix but customer provider doesn't. |
| 6 | **Duplicate global fetch interceptors** | **Medium** | Both `admin-shell.tsx` and `customer-auth-provider.tsx` monkey-patch `window.fetch` with 401 interceptors. If both are somehow active (e.g., during route transitions), they could stack. Each should only be active in its own layout tree, but cleanup depends on React effect teardown timing. |
| 7 | **Session-expired signOut on signin page may race with OTP** | **Medium** | `signin/page.tsx` line 66-70: if `?reason=session_expired` is present, it calls `supabase.auth.signOut()` in a `useEffect`. If the user simultaneously begins OTP verification (unlikely but possible), the signOut could interfere with the new session. The `signedOutRef` guard prevents double-fire but not race with user action. |
| 8 | **No Cache-Control headers on customer auth API routes** | **Medium** | Customer API routes like `/api/customer/check-exists`, `/api/customer/link-by-phone`, `/api/customer/link-account` don't have `Cache-Control: no-store`. Browser/CDN caching of these responses could cause stale auth-related data. |
| 9 | **Admin login page has no fallback timeout** | **Low** | Unlike the customer signin/signup pages (which have 15-second fallback timers), the admin login page (`login/page.tsx`) has no timeout on the `signInWithPassword` call. A hanging request leaves the spinner running forever. |
| 10 | **POS idle timeout vs JWT expiry confusion** | **Low** | Already documented in CLAUDE.md. Two separate timeout systems coexist. Not a bug, but operational complexity. |

---

## Recommended Fixes (Prioritized)

### Priority 1 — Critical (Fix Immediately)

1. **Fix stale session interference with OTP login**
   - Before calling `supabase.auth.signInWithOtp()` or `verifyOtp()` on the customer signin page, check for and clear any existing Supabase session.
   - Option A: Call `supabase.auth.signOut()` at the start of `sendOtp()` before sending the OTP (if no active OTP flow in progress).
   - Option B: Add a `useEffect` on mount that checks for an existing session and signs out if the user explicitly navigated to `/signin` (not a session redirect).
   - This prevents stale admin/staff cookies from interfering with customer OTP.

2. **Add `.catch()` and `setLoading(false)` safety to `customer-auth-provider.tsx`**
   - Mirror the same fixes that were applied to `auth-provider.tsx`:
     - Add `.catch()` on `getSession()` with `setLoading(false)` fallback
     - Add `.finally(() => setLoading(false))` on `loadCustomerData()` in `onAuthStateChange`
   - Without this, any auth error in the customer portal creates a permanent spinner.

### Priority 2 — High (Fix Soon)

3. **Add middleware-level role check for `/admin` routes**
   - After `getUser()` in middleware, for `/admin` routes, query the `employees` table using the admin client.
   - If no employee record exists for the user, redirect to `/signin` (customer) or `/login` (generic).
   - This prevents customer sessions from reaching admin client-side code.

4. **Consider session namespacing for admin vs customer**
   - This is a larger architectural change. Options:
     - Option A: Use separate Supabase projects for admin vs customer (expensive, complex).
     - Option B: Accept shared sessions but add clear user-type detection at each entry point. When a customer user hits `/admin`, redirect immediately. When a staff user hits `/account`, redirect immediately.
     - Option C: On login pages, explicitly sign out any existing session before proceeding (simplest).
   - **Recommendation**: Option C for now — both `/login` and `/signin` pages should sign out any existing session on mount (with a ref guard to prevent re-firing). This is partially implemented already for `?reason=session_expired` but should apply unconditionally.

### Priority 3 — Medium (Fix When Convenient)

5. **Add Cache-Control headers to customer auth API routes**
   - Routes: `/api/customer/check-exists`, `/api/customer/link-by-phone`, `/api/customer/link-account`
   - Add `Cache-Control: no-store` to prevent any caching of auth-sensitive responses.

6. **Add fallback timeout to admin login page**
   - Mirror the 15-second fallback timer pattern from customer signin/signup pages.

7. **Audit fetch interceptor stacking**
   - Verify that `window.fetch` is only monkey-patched once at a time. Both `admin-shell.tsx` and `customer-auth-provider.tsx` do this. They should never coexist on the same page, but add a safety check (e.g., check `window.__fetchIntercepted` flag).

### Priority 4 — Low (Backlog)

8. **Document the dual timeout system** (POS) — Already documented in CLAUDE.md, no action needed.

9. **Add structured logging for auth events** — Would help debug future auth issues. Log `onAuthStateChange` events, session validation results, and OTP flow steps with timestamps.
