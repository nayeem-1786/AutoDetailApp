# Next.js 15.3.3 → 15.5.18 Security Upgrade — Phase 1 Audit

**Date:** 2026-05-18
**Phase:** 1 of 3 (audit + restore point only — no code/package changes)
**Author:** Audit produced by Claude session, reviewed by repository owner before Phase 2 authorization
**Scope:** Read-only inventory + risk analysis. Single deliverable beyond this doc: the `pre-nextjs-15.5.18-upgrade` git tag.

---

## 1. Executive summary

**Current state.** Smart Details is pinned to `next@^15.3.3` in `package.json`; the installed version on disk and in production is `15.3.3` (confirmed via `node_modules/next/package.json`). The `npm audit` against this snapshot reports **11 distinct vulnerabilities** in the dep tree, of which `next` itself accounts for **23 individual GHSA advisories** that are all open against `15.3.3`. Severity rollup: **1 critical, 5 high, 4 moderate, 1 low.** The critical finding is `next` itself bundling the December 2025 RCE (CVE-2025-66478 / GHSA-9qr9-h5gf-34mp).

The app is publicly accessible (`smartdetailsautospa.com` and `app.smartdetailsautospa.com`) and self-hosted on Hostinger PM2 — every one of the **23 active advisories** is potentially exploitable in production. Of particular relevance to this deployment shape:

- **GHSA-9g9p-9gw9-jx7f** (self-hosted DoS via `images.remotePatterns`) — Smart Details has a bare `{ protocol: 'https', hostname: '**' }` wildcard in `next.config.ts:328`. Patched in 15.5.10. **This single advisory is the most impactful for our specific deployment shape.**
- **GHSA-9qr9-h5gf-34mp** (RCE in React flight protocol, CVSS 10.0) — affected range covers 15.3.0–15.3.5; we are on 15.3.3, so we are exposed. Patched in 15.3.6.
- **GHSA-26hh-7cqf-hhc6** — App Router segment-prefetch middleware bypass, incomplete-fix follow-up. Patched in 15.5.18 (the target). **Our middleware enforces IP whitelisting + subdomain routing for `app.smartdetailsautospa.com`** — this advisory's bypass vector materially overlaps our security model.

**Target state.** Next.js `15.5.18` (the latest 15.x line, with all May 2026 coordinated-disclosure patches plus all prior 15.x security backports). 15.5.18 patches all 23 currently-open `next` advisories per the empirical `npm audit` output. No CVE cited in the brief has a patched range that excludes 15.5.18.

**Risk rating: MEDIUM.**

Justification (one sentence): The codebase uses no Server Actions and no `<Image>` SVG handling — two surfaces where 15.5 carries the heaviest breaking changes — so the upgrade payload reduces to a build/runtime version bump with one experimental flag (`skipTrailingSlashRedirect`, currently dead config at the top level) to relocate, plus an essential `images.remotePatterns` hardening that should land in Phase 2 alongside the version bump.

**Estimated time:** Phase 2 (branch + dev test) ≈ 2.5–3.5 h. Phase 3 (deploy + UAT) ≈ 1.5–2 h. Total ≈ 4–5.5 h focused work, plus a 30-min post-deploy monitoring window.

---

## 2. Restore point details

| Item | Value |
|------|-------|
| Tag name | `pre-nextjs-15.5.18-upgrade` |
| Annotated tag SHA | `d3d3f6d630f507fdac426909a1f934737760730a` |
| Tag points to commit | `82cbcffee587ddd56c51abd540b2f984269827d2` |
| Tag message | "Restore point before Next.js 15.3.3 → 15.5.18 security upgrade. Current commit: 82cbcffe… Includes Phase 1 Layer 8f (Phase 1 COMPLETE) and Google Places hardening (commit 82cbcffe)." |
| Pushed to origin | Yes — `git ls-remote origin refs/tags/pre-nextjs-15.5.18-upgrade` returns `d3d3f6d630f507fdac426909a1f934737760730a refs/tags/pre-nextjs-15.5.18-upgrade` |
| Local main HEAD at tag creation | `82cbcffee587ddd56c51abd540b2f984269827d2` |
| Production VPS SHA | **NOT VERIFIED THIS SESSION** — see gap below |

**Gap — production VPS SHA not verified.** The brief specified `ssh root@31.220.60.157 'cd /home/media/repositories/smart-details && git rev-parse HEAD'`. SSH succeeds, but the path `/home/media/repositories/smart-details` does not exist on the VPS (returned `bash: line 1: cd: ... No such file or directory`). Filesystem enumeration to discover the actual path was permission-denied per the user's pre-set Bash policy (only `git rev-parse HEAD` was authorized). **Owner action before Phase 2:** supply the correct repo path on the VPS (or temporarily approve a discovery command), confirm the SHA matches `82cbcffee587ddd56c51abd540b2f984269827d2`, and append the result to this section.

**Rollback procedure** (copy-paste ready):

```bash
# Local
git fetch origin --tags
git checkout pre-nextjs-15.5.18-upgrade
git checkout -b rollback/from-15.5.18-attempt
git push origin rollback/from-15.5.18-attempt

# VPS (substitute correct path for $REPO_PATH)
ssh root@31.220.60.157 "cd $REPO_PATH && git fetch && git reset --hard pre-nextjs-15.5.18-upgrade && deploy-smartdetails"
```

---

## 3. Release notes diff — 15.3.3 → 15.5.18

### 3.1 Sourcing notes

- 15.4 release notes: `nextjs.org/blog/next-15-4` — loaded.
- 15.5 release notes: `nextjs.org/blog/next-15-5` — loaded.
- December 3, 2025 advisory (CVE-2025-66478): `nextjs.org/blog/CVE-2025-66478` — loaded.
- December 11, 2025 follow-up advisory: `nextjs.org/blog/security-update-2025-12-11` — loaded.
- **May 2026 coordinated security release: `nextjs.org/blog/may-2026-security-release` returned 404.** The canonical source is `vercel.com/changelog/next-js-may-2026-security-release` — loaded successfully. Brief had the wrong URL.
- `github.com/vercel/next.js/releases` — the unfiltered releases page paginates and only surfaced 16.x at fetch time; 15.5.x release notes were inferred from advisory cross-references, not pulled from a `15.5.18` tag page directly.

### 3.2 Breaking changes (15.3 → 15.5)

**None that break Smart Details' current code shape.** All items below are deprecation warnings that fire in 15.5 and are scheduled for removal in 16:

| Item | 15.5 status | Action needed in Smart Details |
|------|-------------|-------------------------------|
| `next lint` CLI command | Deprecated, removed in 16 | None — our `package.json:11` already uses `eslint --no-config-lookup --config ./eslint.config.mjs`; we don't invoke `next lint` |
| `<Link legacyBehavior>` prop | Deprecated, removed in 16 | None — no `legacyBehavior` usage in src |
| AMP support (`useAmp`, `config.amp`) | Deprecated, removed in 16 | None — no AMP usage |
| `<Image quality>` other than 75 | Requires `images.qualities` config in 16 | None — `grep "quality=" src/` returns zero hits |
| `<Image>` query strings on local `src` | Requires `images.localPatterns` in 16 | None — all local `src` paths are bare in our codebase |

### 3.3 Promotions to stable (15.5)

| Feature | New status |
|---------|------------|
| Node.js runtime for middleware (`export const config = { runtime: 'nodejs' }`) | Stable. Default remains Edge — we use the default. No action. |
| `typedRoutes` config | Promoted to top-level stable. We don't use it. |
| `PageProps` / `LayoutProps` / `RouteContext` global types | Available. We don't use them. |

### 3.4 Behavior changes that touch our surfaces

| Change | Where it touches us | Impact |
|--------|---------------------|--------|
| Server Actions return 404 for unknown action IDs (#77012, 15.4) | We don't use Server Actions | None |
| Server Actions `bodySizeLimit` non-multipart fix (#77746, 15.4) | We don't use Server Actions | None |
| RSC cache-busting param checks (#80669, 15.4) | We use 16 `revalidateTag` call sites + 6 `unstable_cache` consumers | Worth post-upgrade smoke test on cache busting |
| `Vary` header reinstatement (#79939, 15.4) | Our middleware writes responses via `NextResponse.redirect/next` | Worth checking for any cached-redirect regressions |
| FlightRouterState `searchParam` omission (#80734, 15.4) | We use `useSearchParams()` in client components | Low — affects flight transport, not API |
| Turbopack production builds beta (15.5) | We use webpack | Not opted in |

### 3.5 May 2026 release contents (cross-referenced with `npm audit`)

All 13 May 2026 GHSAs **plus** all prior 15.x advisories that haven't been patched since 15.3.3 are present in our `npm audit` output. Below is the empirical list of `next`-rooted advisories currently open against `15.3.3`, ordered by patch milestone:

| GHSA | Severity | Title | Affected range | Patched in |
|------|----------|-------|---------------|------------|
| GHSA-9qr9-h5gf-34mp | Critical (CVSS 10.0) | RCE in React flight protocol (CVE-2025-66478) | `<15.3.6` | 15.3.6 |
| GHSA-w37m-7fhw-fmv9 | Medium | Server Actions source code exposure | `<15.3.7` | 15.3.7 |
| GHSA-mwv6-3258-q52c | High | DoS with Server Components | `<15.3.7` | 15.3.7 |
| GHSA-h25m-26qc-wcjf | High | HTTP-request-deserialization DoS in RSC | `<15.3.9` | 15.3.9 |
| GHSA-g5qg-72qw-gw5v | High | Cache-key confusion in image optimization | `<=15.4.4` | 15.4.5 |
| GHSA-xv57-4mr9-wg8v | High | Content injection in image optimization | `<=15.4.4` | 15.4.5 |
| GHSA-4342-x723-ch2f | High | Middleware redirect SSRF | `<15.4.7` | 15.4.7 |
| GHSA-9g9p-9gw9-jx7f | High | **Self-hosted DoS via remotePatterns** | `<15.5.10` | 15.5.10 |
| GHSA-ggv3-7p47-pfv8 | High | HTTP request smuggling in rewrites | `<15.5.13` | 15.5.13 |
| GHSA-3x4c-7xq6-9pq8 | High | Unbounded `next/image` disk cache growth | `<15.5.14` | 15.5.14 |
| GHSA-q4gf-8mx6-v5v3 | High | DoS with Server Components | `<15.5.15` | 15.5.15 |
| GHSA-8h8q-6873-q5fj | High | DoS in Server Components (variant) | `<15.5.16` | 15.5.16 |
| GHSA-267c-6grr-h53f | High | App Router segment-prefetch middleware bypass | `<15.5.16` | 15.5.16 |
| GHSA-36qx-fr4f-26g5 | High | Pages Router i18n authz bypass | `<15.5.16` | 15.5.16 |
| GHSA-492v-c6pp-mqqv | High | Dynamic-route param injection bypass | `<15.5.16` (per agent) | 15.5.16 (verify) |
| GHSA-3g8h-86w9-wvmq | Low | Middleware redirect cache poisoning | `<15.5.16` | 15.5.16 |
| GHSA-mg66-mrh9-m8jx | High | Cache-Components connection-exhaustion DoS | `<15.5.16` | 15.5.16 |
| GHSA-h64f-5h5j-jqjh | Moderate | DoS in image optimization API | `<15.5.16` | 15.5.16 |
| GHSA-c4j6-fc7j-m34r | High | SSRF via WebSocket upgrade | `<15.5.16` | 15.5.16 |
| GHSA-wfc6-r584-vfw7 | Moderate | Cache poisoning in RSC responses | `<15.5.16` | 15.5.16 |
| GHSA-vfv6-92ff-j949 | Low | RSC cache-busting collision poisoning | `<15.5.16` | 15.5.16 |
| GHSA-ffhc-5mcf-pf4q | Moderate | App Router XSS with CSP nonces | `<15.5.16` | 15.5.16 |
| GHSA-gx5p-jg67-6x7h | Moderate | `beforeInteractive` script XSS | `<15.5.16` | 15.5.16 |
| GHSA-26hh-7cqf-hhc6 | High | App Router segment-prefetch bypass (incomplete-fix follow-up) | `<15.5.18` | **15.5.18** |

**Conclusion:** 15.5.18 closes every advisory currently open against 15.3.3 in the dep tree. **No CVE has a patched range that excludes 15.5.18.** Brief's red-flag check passes.

### 3.6 Discovered during audit (not in original brief)

- **15.4.x is no longer receiving security backports.** The May 2026 advisory lists fixed-in versions as `15.5.18` and `16.2.6` only — no 15.4.x patch. Don't pin to 15.4.x even as an intermediate.
- **CVE-2025-67779 (GHSA-5j59-xgg2-r9c4)** — incomplete-fix follow-up to CVE-2025-55184 (Dec 11 advisory). Patched in 15.5.9. We are exposed today; 15.5.18 fixes it. Brief did not mention this CVE by ID; flagging for completeness.

---

## 4. Smart Details surface inventory

### 4.1 Middleware (HIGH RISK pre-upgrade, MEDIUM post-upgrade)

**What we use.** Single `src/middleware.ts` (127 lines) plus three transitive imports:
- `src/lib/supabase/middleware.ts` (37 lines) — `@supabase/ssr` `createServerClient` + `auth.getUser()` per request, cookie passthrough.
- `src/lib/security/ip-whitelist.ts` (107 lines) — 10s in-memory cache, queries `business_settings` for `pos_allowed_ips` + `pos_ip_whitelist_enabled`, falls back to `ALLOWED_POS_IPS` env var.
- `src/lib/security/host-routing.ts` (33 lines) — `getHostType()` resolves request host to `'app' | 'staging' | 'dev' | 'main'`; declares `STAFF_PATHS` and `APP_ALLOWED_PATHS`.

**Behavior branches** (verbatim from `src/middleware.ts`):

| Branch | Lines | Behavior |
|--------|-------|----------|
| Main domain + STAFF_PATHS hit | 17–24 | `NextResponse.redirect(appUrl, 302)` to `app.<NEXT_PUBLIC_MAIN_DOMAIN>` |
| App domain + IP not in whitelist | 31–42 | `NextResponse(403)` plain text |
| App domain + path `/` | 44–47 | `NextResponse.redirect(/admin, 302)` |
| App domain + path not in `APP_ALLOWED_PATHS` | 49–56 | `NextResponse.redirect(mainUrl, 302)` |
| Staging + `/pos` + IP not in whitelist | 64–74 | `NextResponse(403)` plain text |
| Public route + no auth cookie | 87–91 | `NextResponse.next({ request })` — skip Supabase session refresh |
| Public route + auth cookie present | 92–93 | `updateSession()` → return `supabaseResponse` |
| Protected `/admin` + no user | 99–104 | Redirect to `/login?redirect=<path>` |
| Protected `/account` + no user | 107–112 | Redirect to `/signin?redirect=<path>` |
| Authenticated default | 118 | Return `supabaseResponse` |

**Matcher config** (line 121–126):
```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
```
Middleware skips `/_next/static`, `/_next/image`, `/favicon.ico`, `/api/*`, and any image-extension URL.

**Mapped to May 2026 CVEs:**

| GHSA | Our exposure |
|------|--------------|
| GHSA-26hh-7cqf-hhc6 + GHSA-267c-6grr-h53f (segment-prefetch bypass) | **High** — our middleware is the primary auth boundary for `app.smartdetailsautospa.com` (IP whitelist + staff-path enforcement). If segment-prefetch URLs can route around `middleware()`, an attacker on a non-whitelisted IP could reach `/admin` content. Both advisories' patched range is closed at 15.5.18. |
| GHSA-3g8h-86w9-wvmq (middleware redirect cache poisoning) | **Medium** — our middleware issues many 302 redirects (host redirects, root-to-/admin, non-staff to main). If responses are cache-poisonable, an attacker could pin a victim to an attacker-chosen `Location`. Patched 15.5.16. |
| GHSA-4342-x723-ch2f (middleware redirect SSRF) | **Low** — our redirects construct destination URLs from `request.url` + a deterministic hostname swap, never from user input. Still worth post-upgrade smoke test. Patched 15.4.7. |
| GHSA-36qx-fr4f-26g5 (Pages Router i18n bypass) | **None** — we are App Router only. |
| GHSA-492v-c6pp-mqqv (dynamic-route param injection bypass) | **Medium** — we have dynamic route segments at `[id]`, `[citySlug]`, `[productSlug]`, etc. on the public side; admin pages use UUIDs. Patched 15.5.16. |

**Post-upgrade behavior to verify:**
1. Subdomain redirects still 302 to `app.` for `/admin/*`, `/pos/*`, `/login/*` when host is main domain.
2. IP whitelist blocks 403 when `pos_ip_whitelist_enabled = true` and client IP not in `pos_allowed_ips`.
3. `app.` domain root redirects to `/admin` (no infinite loop).
4. Supabase session cookie passthrough preserved (Set-Cookie on the response from `updateSession`).
5. Public routes skip auth without `sb-*` cookie present.

### 4.2 Image optimization (HIGH RISK — config-shaped)

**What we use.**

- `<Image>` from `next/image` imported in **17 source files**, mostly public-site components: `(public)/page.tsx`, product/service/team/checkout/cart pages, `service-card.tsx`, `product-card.tsx`, `header-client.tsx`, `footer-client.tsx`, `hero-carousel.tsx`, `ad-zone.tsx`, `before-after-slider.tsx`, `cart-drawer.tsx`, etc.
- `sharp@0.34.5` installed (image optimization runtime).
- No `dangerouslyAllowSVG` set. No `images.qualities` set. No `images.localPatterns` set. No custom loaders. No `<Image quality={…}>` overrides.
- **`next.config.ts:319–331`:**
  ```ts
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'zwvahzymzardmxixyfim.supabase.co',
        pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: '**' },   // ← unrestricted wildcard
    ],
  }
  ```

**CRITICAL FINDING.** The wildcard pattern `{ protocol: 'https', hostname: '**' }` is exactly the attack surface that GHSA-9g9p-9gw9-jx7f (CVE-2025-59471) was issued against. Patched in 15.5.10 — so 15.5.18 closes the *vulnerability mechanism*, but the Next.js `images.remotePatterns` docs themselves call out bare `**` as **"not recommended because it may allow malicious actors to optimize urls you did not intend."** **Defense-in-depth recommendation: tighten the wildcard to `**.supabase.co` in Phase 2 alongside the version bump.**

The codebase appears to need exactly one off-Supabase image domain: there is no other documented source. If a future need arises, add an explicit `remotePatterns` entry rather than reverting the wildcard.

**Other image-optimization CVEs in our exposure window** (all patched ≤ 15.5.16):

| GHSA | Patched in |
|------|------------|
| GHSA-g5qg-72qw-gw5v — cache key confusion | 15.4.5 |
| GHSA-xv57-4mr9-wg8v — content injection | 15.4.5 |
| GHSA-3x4c-7xq6-9pq8 — unbounded disk cache growth | 15.5.14 |
| GHSA-h64f-5h5j-jqjh — image-opt API DoS | 15.5.16 |
| GHSA-9g9p-9gw9-jx7f — remotePatterns self-hosted DoS | 15.5.10 |

**Post-upgrade test:** load 3+ public pages that render `<Image src={<supabase-url>}>`, confirm 200 + correct Content-Type, confirm `.next/cache/images` populates with size cap honored (deferred — disk-cap behavior isn't easy to assert in a smoke test; flag for follow-up).

### 4.3 Server Actions + RSC (LOW RISK — we don't use Server Actions)

**Grep results:**
- `grep -rln '"use server"' src/` → **0 results**
- `grep -rn 'useActionState\|useFormState' src/` → **0 results**
- No `<form action={serverAction}>` patterns found

**This is significant.** All Server Action-specific advisories (GHSA-w37m-7fhw-fmv9 source-code exposure, etc.) have **zero exploit surface** in our codebase because we route all mutations through `/api/*` routes with explicit Bearer/HMAC/cookie auth.

**RSC advisories that still apply** (regardless of Server Actions usage) — patched in 15.5.18:

| GHSA | Our exposure |
|------|--------------|
| GHSA-9qr9-h5gf-34mp — React flight RCE (CVE-2025-66478) | **Critical pre-upgrade** — every RSC page (787 prerendered + many dynamic) is exposed. Patched 15.3.6; we're on 15.3.3. |
| GHSA-vfv6-92ff-j949 + GHSA-wfc6-r584-vfw7 — RSC cache poisoning | Medium — we have public RSC pages with `revalidate = 60` (homepage) and `revalidate = 300` (most others). Patched 15.5.16. |
| GHSA-mwv6-3258-q52c + GHSA-q4gf-8mx6-v5v3 + GHSA-8h8q-6873-q5fj + GHSA-h25m-26qc-wcjf — RSC DoS variants | Medium — public site is high-traffic-shaped. Patched 15.3.7 / 15.5.15 / 15.5.16 / 15.3.9 respectively. |
| GHSA-mg66-mrh9-m8jx — Cache Components DoS | **N/A** — we don't use Cache Components (`unstable_cache` is a different API and is not affected). Patched 15.5.16. |
| GHSA-c4j6-fc7j-m34r — WebSocket SSRF | Low — we don't use Next.js-managed WebSockets (Supabase Realtime is a separate connection). Patched 15.5.16. |
| GHSA-gx5p-jg67-6x7h — `beforeInteractive` XSS | Low — no `<Script strategy="beforeInteractive">` usage found. Patched 15.5.16. |
| GHSA-ffhc-5mcf-pf4q — CSP-nonce XSS | Low — we don't set CSP nonces. Patched 15.5.16. |

### 4.4 Cache + revalidation (MEDIUM RISK)

**ISR / static pages with `revalidate`:**

| Path | Revalidate |
|------|------------|
| `src/app/(public)/page.tsx` | 60s |
| `src/app/(public)/terms/page.tsx` | 3600s |
| All other public routes (services, products, team, gallery, areas, p/[…slug], etc.) | 300s |
| Admin / account / POS layouts | `force-dynamic` (no static gen) |
| `src/app/api/pos/version/route.ts` | `force-dynamic` |

**`unstable_cache` consumers (6 files):**
- `src/lib/data/business.ts:48` — `getBusinessInfo` (tag: `business-info`, 60s)
- `src/lib/data/business.ts:104` — `getSeoSettings` (separate tag)
- `src/lib/data/page-content.ts:13` — `getPageContentBlocks`
- `src/lib/seo/page-seo.ts:14` — `getPageSeo`
- `src/lib/data/website-pages.ts:1` — (imports `unstable_cache`)
- `src/lib/supabase/anon.ts` — (imports `unstable_cache` — used for `generateStaticParams` caching)

**`revalidateTag` call sites (60 files):** All wrapped through `src/lib/utils/revalidate.ts` (a thin re-export). Tags include `business-info`, `cms-toggles`, `cms-tickers`, `footer-data`, `cms-navigation`, `team-members`, and many feature-specific tags. One direct `revalidateTag('business-info')` + `revalidatePath('/api/public/business-info')` call at `src/app/api/admin/settings/revalidate-business/route.ts:20-23`.

**Build output:** the most recent successful build emitted 787 prerendered pages (cited in the brief). `generateStaticParams` is used in 10+ public files (products, services, areas, team, etc.).

**Cross-references to May 2026 advisories:** GHSA-vfv6-92ff-j949 (cache-busting collisions in RSC) and GHSA-wfc6-r584-vfw7 (RSC cache poisoning) — both touch the cache layer we lean on. Patched 15.5.16, included in 15.5.18.

**Post-upgrade test:** trigger `revalidateTag('business-info')` via the existing admin endpoint, verify the change appears within 2 polling cycles on a public page; trigger `revalidatePath` on a static product page, verify the new content propagates.

### 4.5 Configuration + build (MEDIUM RISK — one finding)

**`next.config.ts` audit:**

| Setting | Line | Status in 15.5 | Action |
|---------|------|----------------|--------|
| `experimental.webpackBuildWorker: true` | 11 | Still experimental, no rename | Keep as-is |
| `experimental.parallelServerCompiles: true` | 12 | Still experimental, no rename | Keep as-is |
| `experimental.parallelServerBuildTraces: true` | 13 | Still experimental, no rename | Keep as-is |
| `experimental.cpus: 12` | 14 | Still experimental, no rename | Keep as-is |
| `serverExternalPackages: ['pdfkit', 'sharp']` | 18 | **Top-level stable since 15.0** — current shape correct | Keep as-is |
| `generateBuildId: async () => Date.now().toString()` | 21 | Top-level stable, unchanged | Keep as-is |
| `env: { BUILD_ID: Date.now().toString() }` | 23 | Top-level stable, unchanged | Keep as-is |
| `skipTrailingSlashRedirect: false` | 28 | **EXPERIMENTAL in 15.5** — currently sitting at top-level where it's likely a no-op | **Action (low priority):** move under `experimental.skipTrailingSlashRedirect: false` or delete if relying on default behavior. Since the value is `false` (the default), deleting it is the cleanest fix. **Not blocking Phase 2.** |
| `eslint.ignoreDuringBuilds: true` | 333 | Top-level stable, unchanged | Keep as-is |
| `images.remotePatterns` wildcard | 327–329 | Permitted but documented as "not recommended" | **Action (HIGH priority):** tighten to `**.supabase.co` in Phase 2. See §4.2. |
| `async redirects()` with 200+ rules | 30–317 | Top-level stable, unchanged | Keep as-is |

**`package.json` notes:**
- `"next": "^15.3.3"` — caret will allow `npm install next@15.5.18` to write `"^15.5.18"` cleanly.
- `eslint-config-next: ^16.1.6` — already at v16, ahead of next core. This is fine; the config package is independently versioned and 16.x works against 15.x runtime.
- `react: 19.2.3`, `react-dom: 19.2.3` — pinned exact, compatible with 15.5.18 (15.5.x supports React 19.x). **Note:** the upstream React DoS advisory (CVE-2026-23870) patched in React 19.0.6 / 19.1.7 / 19.2.6 → 19.2.3 is below 19.2.6. **Phase 2 should bump react+react-dom to 19.2.6 (or whatever the latest 19.2.x is at upgrade time) alongside Next.**

### 4.6 Other dependencies (transitive — npm audit findings)

| Package | Severity | Source of vulnerable copy | Resolution |
|---------|----------|---------------------------|------------|
| `postcss` (`<8.5.10`) | Moderate (XSS via unescaped `</style>` in stringify) | `node_modules/next/node_modules/postcss` — pulled by `next` | **Auto-fixes when next upgrades.** 15.5.18 bundles a non-vulnerable postcss. |
| `qs` (`>=6.7.0 <=6.14.1`) | Low (arrayLimit bypass / DoS) | `@stripe/terminal-js@0.26.0 → stripe@8.222.0 → qs@6.14.1` | **Does NOT auto-fix** from Next upgrade. Requires `@stripe/terminal-js` bump (and stripe bundles a fixed `qs`). Out of scope for Phase 2 — file as follow-up. |
| `ws` (`>=8.0.0 <8.20.1`) | Moderate (uninitialized memory disclosure) | `@supabase/realtime-js@2.95.3 → ws@8.19.0` (vulnerable); also `@stripe/terminal-js → ws@6.2.3` (not in advisory range — old enough to be unaffected) | **Does NOT auto-fix** from Next upgrade. Requires `@supabase/supabase-js` bump. Out of scope for Phase 2 — file as follow-up. |
| `ajv`, `brace-expansion`, `flatted`, `minimatch`, `picomatch`, `tar` | Moderate to high | Transitive of eslint/typescript-eslint/supabase CLI tooling | `npm audit fix` after Next bump will resolve most. Non-runtime, dev-tooling only. Low priority. |
| `supabase` (direct dep) | High | Dev CLI | Update separately; not runtime. |

### 4.7 POS-specific behaviors (LOW RISK — none Next.js-coupled)

| Surface | Touched by Next.js upgrade? |
|---------|-----------------------------|
| Bluetooth scanner integration (`useBarcodeScanner`) | No — uses Web Bluetooth API directly |
| Stripe Terminal pairing flow + pfSense DNS exception | No — runs over HTTPS to `stripe-terminal-local-reader.net`, not via Next.js |
| Offline transaction sync (`/api/pos/sync-offline-transaction`) | API route — same `app/api/*` handler shape, no breaking changes in 15.5 |
| Service Worker (`public/pos-sw.js` + `src/app/pos/components/pos-service-worker.tsx`) + `generateBuildId` cache bust | Indirect — `generateBuildId` API unchanged in 15.5; verify SW still resolves a new build ID on update |
| `force-dynamic` POS layout | Unchanged — `dynamic = 'force-dynamic'` is stable API |
| Cron scheduler (`src/lib/cron/scheduler.ts`, 16 jobs registered via `src/instrumentation.ts`) | No — node-cron, no Next.js coupling |

---

## 5. Test plan for Phase 2 (upgrade in branch + dev test)

### 5.1 Pre-upgrade baseline

```bash
# Confirm clean state on main, on the restore-point commit
git status
git rev-parse HEAD                                  # expect 82cbcffe…

npm run typecheck 2>&1 | tail -5                    # expect: pre-existing errors in quote-service.modifiers.test.ts ONLY (no new errors)
npm run lint 2>&1 | tail -3                         # expect: "0 errors, 99 warnings" (none from changes)
npx vitest run 2>&1 | tail -3                       # expect: "Test Files 98 passed (98) / Tests 1536 passed (1536)"
npm run build 2>&1 | tail -5                        # expect: clean build, 787 prerendered pages
```

Snapshot the baseline numbers above into the Phase 2 PR description before any package change so regressions are obvious.

### 5.2 Upgrade commands (exact sequence)

```bash
# In branch
git checkout -b chore/nextjs-15.5.18-security-upgrade

# Upgrade Next + matching React point release
npm install next@15.5.18 react@^19.2.6 react-dom@^19.2.6

# Optional but recommended: bring transitive dev-tooling current
npm audit fix

# Do NOT auto-fix runtime dep chains for qs and ws — those require parent bumps and are out of scope for Phase 2.
# If npm audit fix tries to bump @stripe/terminal-js or @supabase/supabase-js, REVERT and file as follow-up.

# Verify Next now resolves to 15.5.18
node -e "console.log(require('next/package.json').version)"     # expect: 15.5.18
```

### 5.3 Config hardening in same PR

Apply two edits to `next.config.ts` as part of Phase 2 (these don't introduce upgrade risk and close a real defense-in-depth gap):

1. **Tighten `images.remotePatterns`** — replace the bare `{ protocol: 'https', hostname: '**' }` (line 327–329) with `{ protocol: 'https', hostname: '**.supabase.co' }`. If the broader wildcard is genuinely needed for off-Supabase image sources, document each domain in a new `remotePatterns` entry instead.
2. **Remove dead `skipTrailingSlashRedirect: false`** (line 28). The value matches the default; the option is `experimental.*` in 15.5. Cleanest fix: delete the line.

### 5.4 Post-upgrade verification

```bash
rm -rf .next                                        # force clean rebuild

npm run typecheck 2>&1 | tail -10                   # diff against baseline; only new errors allowed are those flagged by 15.5 deprecation warnings (if any)
npm run lint 2>&1 | tail -5                         # diff against baseline; 99-warning count should remain or DECREASE
npx vitest run 2>&1 | tail -5                       # MUST be 1536/1536 — any regression blocks
npm run build 2>&1 | tee /tmp/build-15.5.18.log     # MUST succeed; capture full log for diff against pre-upgrade build
npm audit --json 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print('total:', d['metadata']['vulnerabilities'])"
# expect: critical=0, high < 5 (qs, ws, dev tooling), moderate/low residual
```

### 5.5 Manual dev-server smoke test

`npm run dev` and walk through these flows in a browser:

| # | Flow | Acceptance |
|---|------|-----------|
| 1 | Visit `/` on `localhost:3000` | Homepage renders, hero image loads (Supabase-hosted) |
| 2 | Navigate to a service detail (`/services/<cat>/<slug>`) | Static page renders, `<Image>` loads, no 5xx |
| 3 | Navigate to a product page | Same |
| 4 | Trigger a hard reload mid-navigation | No flight protocol errors in console |
| 5 | Sign in at `/login` | Supabase session establishes; redirect lands at `/admin` |
| 6 | Open admin `/admin/messaging` | Middleware allows; SSR + client hydration both succeed |
| 7 | Submit a CMS PUT (Homepage Settings → save Place ID) | Server route returns 200; no flight protocol regression |
| 8 | Open POS at `/pos` | PIN gate renders; service worker registers (check Application → Service Workers in DevTools) |
| 9 | Visit `/pos/version` API endpoint | Returns current BUILD_ID, `force-dynamic` honored |
| 10 | Toggle `revalidateTag` via Admin → Settings → "Revalidate business info" | 200 response; subsequent public-page render reflects change |
| 11 | Visit a `(public)` page that uses `revalidate=300` | Renders correctly; `Cache-Control` header sane |
| 12 | Curl `/_next/image?url=<supabase-url>&w=640&q=75` | 200, correct Content-Type, served from `.next/cache/images` on second request |
| 13 | Curl `/_next/image?url=https://attacker.example.com/huge.png&w=640&q=75` | **403** (after tightening remotePatterns to `**.supabase.co`) — was 200 before tightening |

Block Phase 3 promotion if any of #1–#12 fails. #13 is the proof-point for the defense-in-depth tightening.

### 5.6 Acceptance criteria summary

| Criterion | Pass condition |
|-----------|----------------|
| Type-check | No new errors vs baseline |
| Lint | Warning count unchanged or lower |
| Test suite | 1536/1536 green |
| Build | Clean, 787 prerendered pages (±5) |
| `npm audit` | Critical = 0; `next`-rooted advisories = 0 |
| Smoke flow 1–12 | All pass |
| Smoke flow 13 | Confirms remotePatterns tightening |

---

## 6. Test plan for Phase 3 (deploy + UAT)

### 6.1 Deploy procedure

1. Confirm `.env.local` does **NOT** contain `NODE_ENV=production` (preserve the prior lesson — `next start` infers from `NODE_ENV` env at process start; an `.env.local` override breaks the dev/prod split).
2. Merge `chore/nextjs-15.5.18-security-upgrade` to `main` after Phase 2 sign-off.
3. On VPS, `git fetch && git checkout main && git pull` (or whatever the actual repo path resolves to — see §2 gap).
4. `deploy-smartdetails` (the canonical deploy script — should clean `.next`, run `npm ci --omit=dev`, run `npm run build`, restart PM2).
5. Verify PM2 pickup: `pm2 list` shows the `smart-details` process restarted with new build timestamp.

### 6.2 Post-deploy smoke (production)

| # | Test | Expectation |
|---|------|------------|
| 1 | `curl -I https://smartdetailsautospa.com/` | 200; Content-Type `text/html` |
| 2 | `curl -I https://smartdetailsautospa.com/services/ceramic-coatings` | 200 (ceramic coatings is #1 SEO priority) |
| 3 | `curl -I https://app.smartdetailsautospa.com/admin` from whitelisted IP | 200 or 302→/login |
| 4 | `curl -I https://app.smartdetailsautospa.com/admin` from non-whitelisted IP | 403 with body "Access denied" |
| 5 | `curl -I https://smartdetailsautospa.com/admin` (main domain → app redirect) | 302 to `https://app.smartdetailsautospa.com/admin` |
| 6 | `curl -I https://app.smartdetailsautospa.com/non-staff-path` | 302 to `https://smartdetailsautospa.com/non-staff-path` |
| 7 | Public sitemap: `curl https://smartdetailsautospa.com/sitemap.xml | head` | Valid XML, contains all 787 routes |
| 8 | Public image: `curl -I https://smartdetailsautospa.com/_next/image?url=<supabase-url>&w=640&q=75` | 200, Cache-Control sane |
| 9 | Image from non-supabase host: same URL but `url=https://example.com/foo.png` | 403 — proves remotePatterns tightening live |
| 10 | Sign in at `https://app.smartdetailsautospa.com/login` with a known admin account | Session establishes |
| 11 | Submit an admin change (e.g., update a service price) | Persists; revalidation propagates to public site |
| 12 | POS PWA on staff iPad — open `https://app.smartdetailsautospa.com/pos` | PIN gate renders; existing PIN unlocks (no session invalidation) |
| 13 | Stripe Terminal connection from POS | Connects (pfSense DNS exception still in effect) |
| 14 | Cron tick — wait for next 6 AM PST google-reviews tick or check PM2 logs for hourly quote-reminders | Cron fires; no `[CRON]` errors in logs |

### 6.3 Monitoring window (first 30 min)

`pm2 logs smart-details --lines 200 --raw` continuously. Watch for:

- **5xx spike** — anything above baseline (10–30 per hour expected for normal scraper traffic on the public site).
- **`Error: Invariant`** lines — Next.js internal invariant violations are a common signal of an incompatible cached `.next` or a corrupt build.
- **`React error #`** lines — flight protocol regressions surface here.
- **`middleware`-named errors** — segment-prefetch bypass detection or auth refresh failures.
- **`/_next/image`** 503/500 responses — image optimization breakage.
- **Cron `[CRON]` failures** — should match the pre-upgrade frequency (which is zero except for unrelated issues already tracked).

### 6.4 Rollback trigger criteria

Trigger rollback immediately if any of:
- ≥10 5xx responses per minute against any path within 5 minutes of deploy.
- Any 5xx on POS endpoints (`/pos/*`, `/api/pos/*`).
- Login flow returning 5xx (Supabase session refresh broken).
- Stripe payment flow returning 5xx (`/api/webhooks/stripe/*`, `/checkout`).
- `next/image` returning 5xx for Supabase-hosted images.
- Public homepage returning 5xx (SEO impact).
- Any `Error: Invariant` lines correlating in time with deploy.

### 6.5 Rollback execution

```bash
# On VPS
ssh root@31.220.60.157 "cd <REPO_PATH> && git fetch && git reset --hard pre-nextjs-15.5.18-upgrade && deploy-smartdetails"
pm2 logs smart-details --lines 50 --raw    # confirm restart on old code
curl -I https://smartdetailsautospa.com/    # confirm 200
```

If rollback is needed, also re-apply the gap-fix correction to `.env.local` if it was modified during deploy debugging.

---

## 7. Known unknowns

1. **Production VPS SHA not verified** — the path in the brief (`/home/media/repositories/smart-details`) doesn't exist on VPS. Need owner to supply correct path or temporarily authorize discovery. Owner action before Phase 2.
2. **Build-time behavior of `experimental.cpus: 12`** on the upgraded codebase — no docs page, so unable to verify the flag still consumes 12 cores in 15.5. If build time materially regresses or PM2 OOMs during build, drop `cpus: 12` and bump down to `cpus: 8`.
3. **Service-worker version handshake** — `pos-sw.js` reads `BUILD_ID`; if 15.5 changes how `generateBuildId` value flows to client bundles (no docs change found, but not formally verified), staff iPads may need a hard refresh. Mitigation already in code: `pos-service-worker.tsx:32-37` posts `CHECK_VERSION` on load.
4. **`npm audit fix` side effects** — running it after the Next bump may pull in updates to `eslint-config-next` or other dev tooling. If `audit fix` proposes touching `@stripe/terminal-js` or `@supabase/supabase-js`, **DO NOT accept** in Phase 2; those need separate scoped PRs.
5. **Cache invalidation across 60+ `revalidateTag` call sites** — we have no automated test that proves a tag invalidation actually busts the public render. Phase 2 smoke flow #10 is a manual proof point; full regression coverage would require integration tests we don't currently have.
6. **`generateStaticParams` build time** — 787 prerendered pages today; 15.5.x may shift the build-trace parallelism behavior. Watch build time in CI logs.
7. **`output: 'standalone'` is commented out** at `next.config.ts:4`. We're staying on `next start` for PM2. Not changing in Phase 2, but worth noting that the May 2026 advisories also affect standalone builds — if a future deploy migrates to standalone, re-audit.

---

## 8. Out of scope (file as follow-ups)

1. **`qs` low-severity bypass** — patched at root of `@stripe/terminal-js → stripe@8.222.0`. Requires bumping `@stripe/terminal-js`. Separate PR.
2. **`ws@8.19.0` moderate uninitialized-memory disclosure** — fixed at `@supabase/realtime-js@2.95.4+`. Requires bumping `@supabase/supabase-js`. Separate PR. Also: `@stripe/terminal-js` pulls in an old `ws@6.2.3` that isn't in the advisory range; can leave alone.
3. **Dev-tooling transitive vulns** (`ajv`, `brace-expansion`, `flatted`, `minimatch`, `picomatch`, `tar`) — runtime-untouched. `npm audit fix` after the Next bump handles most. Don't sweat.
4. **`supabase` CLI direct dev dep at high** — refresh separately. Not runtime.
5. **Next.js 16 migration** — Node.js 18 deprecation, async params, `next lint` removal, AMP removal, `<Link legacyBehavior>` removal, `<Image quality>` config requirement, `<Image>` local src query strings requiring `localPatterns`. Not on this PR. Recommend scheduling for Q3 2026 when the 15.x line approaches EOL signals.
6. **Tighten `next.config.ts` `images.remotePatterns`** beyond `**.supabase.co` — if a future need surfaces for an off-Supabase image domain, add an explicit entry rather than reverting to wildcard.
7. **Consider moving cron schedule to a more resilient host** (Hostinger PM2 will lose crons during PM2 restart cycles — verified separately, not part of this audit).
8. **Confirm 15.4.x is not used anywhere** in dev environments or staging — it is no longer receiving security backports per the May 2026 advisory's fixed-in list.

---

**End of audit.** Phase 2 prompt should reference this document and quote section 5 (test plan) verbatim. Phase 3 prompt should quote section 6.
