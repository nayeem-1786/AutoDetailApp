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

*Last updated: 2026-02-26*
