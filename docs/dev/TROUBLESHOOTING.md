# Troubleshooting Guide

Common issues encountered during development and their confirmed root causes.

---

## White Screen of Death (WSOD)

The app loads but shows a blank white page with no content. Multiple causes — check in this order:

### Cause 1: Stale `.next` Cache (Most Common)

**Symptoms:**
- Ngrok/browser shows 404 on `/_next/static/chunks/main-app.js` or `/_next/static/css/app/layout.css`
- Happens immediately after Claude Code commits that touch multiple files
- Dev server is running but pages are blank

**Root Cause:** Next.js dev server's incremental compilation gets confused after bulk file changes. Old chunk hashes in the manifest don't match new output → 404 → no JS/CSS → white screen.

**Fix (10 seconds):**
```bash
rm -rf .next
npm run dev
```

**Prevention:** Every Claude Code session ends with `rm -rf .next` after `git push`.

---

### Cause 2: Supabase Egress Limit Exhausted

**Symptoms:**
- Browser console shows: `AbortError: signal is aborted without reason`
- Error originates from `@supabase/auth-js/dist/module/lib/locks.js`
- Supabase dashboard shows egress at or near limit (red bar)
- Clearing cookies and `.next` cache does NOT fix it
- ALL authenticated pages fail (admin, POS), public pages may still work

**Root Cause:** Supabase free tier has a monthly egress limit. When exhausted, Supabase throttles or drops API requests. The auth client's `navigator.locks.request()` call times out → `AbortError` → React tree crashes.

**Fix:**
1. Check Supabase dashboard → Usage → Egress
2. If at limit: upgrade plan or wait for monthly reset
3. After egress is restored: `rm -rf .next && npm run dev`

**Prevention:**
- Monitor Supabase egress usage weekly
- Dev server with frequent hot reloads + 60-second auth session checks + POS/admin testing burns egress fast
- Consider upgrading from free tier for active development

---

### Cause 3: Stale Auth Cookies (Rare After Singleton Fix)

**Symptoms:**
- Browser console shows: `AbortError: signal is aborted without reason`
- BUT Supabase egress is fine (not at limit)
- Happens after switching git branches, reverting commits, or major rebuilds

**Root Cause:** Browser holds a Supabase session token from a previous server state. The `window.__supabase_browser_client` singleton (added 2026-02-26) prevents most cases, but edge cases exist.

**Fix:**
1. Browser DevTools → Application → Cookies → delete all `sb-*` cookies
2. Also clear Local Storage and Session Storage for the origin
3. Hard refresh (Cmd+Shift+R)

---

## POS Not Loading

### Service Worker Caching Stale Assets

**Symptoms:**
- POS shows old version or blank page
- Other pages work fine
- Hard refresh doesn't help

**Fix:**
1. Browser DevTools → Application → Service Workers → Unregister `pos-sw.js`
2. Clear site data
3. Reload

---

## Admin Panel Loads But Shows No Data

**Symptoms:**
- Admin sidebar and layout render correctly
- Dashboard cards show $0 / empty
- No errors in browser console (or empty `{}` error objects)

**Possible Causes:**
1. Supabase egress limit (see above)
2. Supabase service role key expired or rotated → check `.env.local`
3. RLS policy blocking queries → check Supabase dashboard SQL editor

---

## Build Fails After Claude Code Session

### TypeScript Compilation Succeeds But Lint Fails

**Symptoms:**
- `npm run build` shows "Compiled successfully" but then "Failed to compile"
- Error count is high (80-100+)

**Diagnosis:**
```bash
# Check if errors are in YOUR files or pre-existing
npm run build 2>&1 | grep "Error:" | grep -E "(your-file-name)" | wc -l
```

If zero errors in your modified files, the lint errors are pre-existing and not caused by the current session.

---

## Next.js Version Issues

**CRITICAL: Do NOT upgrade Next.js.** Currently pinned to 15.3.3.

Next.js 16 requires major migration (async params, proxy.ts replacing middleware.ts, caching changes). Claude Code has previously upgraded Next.js without permission, breaking the entire app. The prohibition is in CLAUDE.md.

If accidentally upgraded:
```bash
npm install next@15.3.3
rm -rf .next
npm run dev
```

---

## Quick Diagnostic Commands

```bash
# Check if .next cache exists and has content
ls .next/static/chunks/main-app* 2>/dev/null && echo "OK" || echo "STALE - run: rm -rf .next"

# Check Supabase client instances (should be 1)
# In browser console:
navigator.locks.query().then(l => console.log('held:', l.held.length, 'pending:', l.pending.length))

# Check for multiple Supabase clients in code
grep -rn "createBrowserClient\|createClient" src/lib/supabase/ --include="*.ts"

# Full nuclear reset
rm -rf .next node_modules/.cache
npm run dev
```

---

## Auth Login Loop / Infinite Spinner After Login

### Symptoms
One or more of these after entering valid credentials on `/login`:
- Page redirects back to `/login` with form cleared — infinite loop, no error message
- Page navigates to `/admin` but shows a white screen with a spinning loader forever
- Browser console shows: `AbortError: signal is aborted without reason` from `@supabase/auth-js/dist/module/lib/locks.js`
- Server terminal shows repeated `GET /admin 200` requests but page never renders

### Root Cause: Supabase Web Locks API

Supabase's auth client uses `navigator.locks.request()` (Web Locks API) to coordinate auth state across browser tabs. In Next.js dev mode, this causes `AbortError` because:

1. The lock acquisition has a timeout — if `getSession()` and `signInWithPassword()` compete for the same lock, one times out
2. HMR module re-execution can create orphaned lock holders
3. The AbortError propagates as an unhandled promise rejection, preventing `loading` from ever becoming `false`

When `loading` stays `true`, AdminContent shows a spinner forever. If error handlers call `signOut()` or delete cookies in response, it creates a login loop instead.

### Investigation Timeline

**What we tried (did NOT work):**

1. **Clearing cookies manually** — Temporarily fixed symptoms but issue returned on every server restart or rebuild
2. **Auth resilience session** — Added try/catch with `signOut()` in error handlers across `auth-provider.tsx` and `lib/supabase/middleware.ts`. This made things WORSE:
   - `signOut()` is nuclear — it invalidates the session on Supabase's servers, not just locally
   - Catch blocks in `onAuthStateChange` fired during the `SIGNED_IN` event itself, killing the session that was just created
   - Middleware catch block deleted `sb-*` cookies, so the next request had no session
   - Result: credentials accepted → session created → immediately destroyed → redirect to login → loop
3. **Removing `signOut()` from error handlers** — Stopped the loop but revealed the underlying spinner issue: `getSession()` throws → `loading` never becomes `false`
4. **Adding `setLoading(false)` to `onAuthStateChange`** — Correct idea but AbortError still prevented `getSession()` from completing, and the error itself crashed the React tree

**Files examined during investigation:**
- `src/lib/supabase/client.ts` — Browser Supabase client singleton
- `src/lib/supabase/middleware.ts` — Server-side session refresh
- `src/lib/auth/auth-provider.tsx` — Client-side auth state management
- `src/app/admin/admin-shell.tsx` — Admin layout with auth guard
- `src/app/(auth)/login/page.tsx` — Login form
- `src/app/auth/callback/route.ts` — OAuth callback handler
- `src/middleware.ts` — Root Next.js middleware
- `node_modules/@supabase/auth-js/dist/module/lib/locks.js` — Supabase lock implementation

**What actually fixed it:**

Disabled Web Locks entirely by providing a custom `lock` function in the Supabase client config:

```ts
// src/lib/supabase/client.ts
const client = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => {
        return await fn();
      },
    },
  }
);
```

This replaces `navigator.locks.request()` with a pass-through that executes the function directly. Web Locks exist to coordinate across multiple browser tabs, but in a single-tab admin/POS setup they cause more problems than they solve.

### Additional Required Fix

`onAuthStateChange` in the original code never called `setLoading(false)`, relying entirely on `getSession()` to flip it. This is fragile — if `getSession()` fails for any reason, `loading` stays `true` forever. The fix adds `setLoading(false)` as a fallback in `onAuthStateChange` and a `.catch()` on `getSession()` to silence errors:

```ts
// In getSession().then(...)
.catch((error: unknown) => {
  console.warn('[auth] getSession error:', error instanceof Error ? error.message : error);
});

// In onAuthStateChange — both branches:
if (s?.user) {
  loadEmployeeData(s.user.id).finally(() => setLoading(false));
} else {
  // ... clear state ...
  setLoading(false);
}
```

### Key Lessons

1. **Never call `signOut()` in error handlers** — it's a server-side session invalidation, not local cleanup. Only call it when the user explicitly clicks "Sign Out"
2. **Never delete `sb-*` cookies in middleware catch blocks** — the session may be valid but temporarily unreachable
3. **`loading` state must have a guaranteed path to `false`** — relying on a single async call without a fallback creates permanent spinners
4. **Supabase Web Locks are problematic in Next.js dev mode** — the custom `lock` bypass is safe for single-tab usage
5. **Supabase egress limits cause `fetch failed` errors** that masquerade as auth bugs — always check the Supabase dashboard usage page first

### Quick Diagnostic

```bash
# 1. Is Supabase reachable?
curl -s -o /dev/null -w "%{http_code}" "$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)/rest/v1/" -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)"
# Should return 200

# 2. Check browser console for AbortError
# If present → Web Locks issue → verify client.ts has the lock bypass

# 3. Check server terminal during login
# GET /admin 200 = middleware found user (client-side issue)
# GET /login 302 = middleware rejected user (server-side issue)
```

---

## Star TSP100III Receipt Logo

The Star TSP100III prints the logo from NV memory via futurePRNT. The logo is NOT embedded in the ESC/POS stream — futurePRNT intercepts the data and injects it.

### Critical Rule: 0x1D Byte Control

futurePRNT inserts the NV logo at every `0x1D` (GS) byte after `ESC @` init, EXCEPT `0x1D` at the very end of the stream (cut command). The receipt stream must contain exactly **two** `0x1D` bytes:

1. `CMD_LOGO_TRIGGER` (`[0x1D, 0x42, 0x00]`) — immediately after `ESC @` init, triggers one logo
2. `CMD_CUT` (`[0x1D, 0x56, 0x01]`) — at the very end, cuts paper without triggering logo

All other commands must use `0x1B` (ESC) prefix only. No other `0x1D` bytes anywhere.

### Cash Drawer

Use ESC p without ESC @ init: `[0x1B, 0x70, 0x00, 0x19, 0xFA]`. BEL (`0x07`) does NOT work — futurePRNT ESC/POS Routing swallows it. Never send `ESC @` before the drawer command — it triggers a logo printout.

### ESC ! Resets Bold

`ESC !` (`CMD_DOUBLE_SIZE` / `CMD_NORMAL_SIZE`) is a combined print mode command that resets ALL text attributes including bold. `CMD_DOUBLE_SIZE` must come BEFORE `CMD_BOLD_ON`, not after.

### Logo Trigger Must Not Affect Sizing

The logo trigger must be a `0x1D` command that doesn't change character sizing. `GS B 0` (`[0x1D, 0x42, 0x00]`) disables reverse printing (already off by default) — a true no-op. Do NOT use `GS !` (`[0x1D, 0x21, ...]`) as the logo trigger — it's a character size select command that can interfere with `ESC !` text sizing and cause narrower print width.

### Quick Diagnostic

```bash
# Verify only 2 definitions contain 0x1D in receipt-template.ts:
grep -n "0x1D" src/app/pos/lib/receipt-template.ts
# Expected: CMD_LOGO_TRIGGER and CMD_CUT definitions + their usages only
```

### Full Reference

Complete troubleshooting history and futurePRNT configuration checklist: `docs/hardware/STAR_PRINTER_LOGO.md`

---

*Last updated: 2026-03-05*
