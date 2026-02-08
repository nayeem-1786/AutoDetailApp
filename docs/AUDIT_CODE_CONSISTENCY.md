# Code Consistency Audit Report

> Generated: 2026-02-07
> Scanned: `src/` directory against `ARCHITECTURE.md` and `CONVENTIONS.md`

---

## Critical (Security / Data Integrity)

| # | File | Violation | Recommended Fix |
|---|------|-----------|-----------------|
| C1 | `src/app/api/quotes/route.ts:8-10` | **Missing auth check.** GET handler uses `createAdminClient()` directly without `createClient()` -> `getUser()` -> employee role check. Any unauthenticated request can list all quotes. | Add `createClient()` -> `getUser()` -> employee role check before `createAdminClient()`. |
| C2 | `src/app/api/quotes/route.ts:97` | **Missing auth check.** POST handler uses `createAdminClient()` directly without any authentication. Any unauthenticated request can create quotes. | Add `createClient()` -> `getUser()` -> employee role check before `createAdminClient()`. |
| C3 | `src/app/api/quotes/[id]/route.ts:12` | **Missing auth check.** GET handler uses `createAdminClient()` directly with no auth. Exposes any quote by ID. | Add auth check pattern. |
| C4 | `src/app/api/quotes/[id]/route.ts:56` | **Missing auth check.** PATCH handler uses `createAdminClient()` directly with no auth. Anyone can update any quote. | Add auth check pattern. |
| C5 | `src/app/api/quotes/[id]/route.ts:168` | **Missing auth check.** DELETE handler uses `createAdminClient()` directly with no auth. Anyone can soft-delete any quote. | Add auth check pattern. |
| C6 | `src/app/api/quotes/[id]/convert/route.ts:32` | **Missing auth check.** POST handler uses `createAdminClient()` directly with no auth. Anyone can convert a quote to an appointment. | Add auth check pattern. |
| C7 | `src/app/api/appointments/[id]/route.ts:8-25` | **Missing auth check.** PATCH handler uses `createAdminClient()` directly with no auth. Anyone can update any appointment. | Add auth check pattern. |
| C8 | `src/app/api/appointments/[id]/notify/route.ts:8-17` | **Missing auth check.** POST handler uses `createAdminClient()` directly with no auth. Anyone can trigger notification emails/SMS for any appointment. | Add auth check pattern. |
| C9 | `src/app/api/appointments/[id]/cancel/route.ts:9-26` | **Missing auth check.** POST handler uses `createAdminClient()` directly with no auth. Anyone can cancel any appointment. | Add auth check pattern. |
| C10 | `src/app/api/staff/create/route.ts:5-19` | **Missing auth check.** POST handler uses `createAdminClient()` directly with no auth. Anyone can create employee accounts (includes Supabase auth user creation). | Add auth check pattern (super_admin only). |
| C11 | `src/app/api/staff/schedules/route.ts:4-6` | **Missing auth check.** GET handler uses `createAdminClient()` directly with no auth. Exposes all employee schedules. | Add auth check pattern. |
| C12 | `src/app/api/staff/schedules/[employeeId]/route.ts:5-23` | **Missing auth check.** PUT handler uses `createAdminClient()` directly with no auth. Anyone can overwrite any employee's schedule. | Add auth check pattern. |
| C13 | `src/app/api/staff/blocked-dates/route.ts:5-12` | **Missing auth check.** GET and POST handlers use `createAdminClient()` directly with no auth. Anyone can view/create blocked dates. | Add auth check pattern. |
| C14 | `src/app/api/staff/blocked-dates/[id]/route.ts:4-10` | **Missing auth check.** DELETE handler uses `createAdminClient()` directly with no auth. Anyone can delete blocked dates. | Add auth check pattern. |
| C15 | `src/app/api/waitlist/route.ts:9-18` | **Missing auth check.** GET and POST handlers use `createAdminClient()` directly with no auth. Anyone can view/create waitlist entries. | Add auth check pattern. |
| C16 | `src/app/api/waitlist/[id]/route.ts:16-32` | **Missing auth check.** PATCH and DELETE handlers use `createAdminClient()` directly with no auth. Anyone can update/delete waitlist entries. | Add auth check pattern. |
| C17 | `src/app/api/quotes/stats/route.ts:5-11` | **Missing role check.** Has `getUser()` check but no employee role verification. Any authenticated user (including customers) can access quote stats. | Add employee role check after `getUser()`. |
| C18 | `src/app/api/quotes/[id]/activities/route.ts:9-14` | **Missing role check.** GET handler has `getUser()` check but no employee role verification. Any authenticated user can view quote activities. | Add employee role check after `getUser()`. |
| C19 | `src/app/api/quotes/[id]/activities/route.ts:42-45` | **Missing role check.** POST handler has `getUser()` check but no employee role verification. Any authenticated user can log activities on any quote. | Add employee role check after `getUser()`. |
| C20 | `src/app/api/quotes/[id]/pdf/route.ts:377-387` | **Weak auth on PDF endpoint.** Auth relies on referer header check (`isInternal`) which is trivially spoofable. Without a valid `token` query param, any request with a forged `Referer` header matching the app URL can download any quote PDF. | Use `createClient()` -> `getUser()` for internal access, or token-only for public access. |
| C21 | `src/lib/auth/auth-provider.tsx:68` | **Uses `getSession()` for initial session load.** While this is client-side initialization (not server-side auth verification), the convention explicitly states to use `getUser()` instead of `getSession()`. `getSession()` reads from cache and may return stale data. | Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` for the initial load, or document this as an accepted client-side exception. |
| C22 | `src/lib/auth/customer-auth-provider.tsx:54` | **Uses `getSession()` for initial session load.** Same issue as C21 in the customer auth provider. | Same fix as C21. |

---

## High (Duplication / Wrong Pattern)

| # | File | Violation | Recommended Fix |
|---|------|-----------|-----------------|
| H1 | `src/app/pos/components/quotes/quote-helpers.ts:33` | **Duplicate `formatCurrency()`.** Local implementation `$${amount.toFixed(2)}` differs from shared `format.ts` which uses `Intl.NumberFormat`. The local version won't handle large numbers with commas. | Delete local function; import `formatCurrency` from `@/lib/utils/format`. |
| H2 | `src/app/pos/components/quotes/quote-helpers.ts:12-19` | **Duplicate `formatQuoteDate()`.** Local date formatter using `toLocaleDateString()` duplicates `formatDate()` from `@/lib/utils/format`. | Delete local function; import `formatDate` from `@/lib/utils/format`. |
| H3 | `src/app/pos/components/quotes/quote-helpers.ts:21-31` | **Duplicate `formatQuoteDateTime()`.** Local datetime formatter using `toLocaleString()` duplicates `formatDateTime()` from `@/lib/utils/format`. | Delete local function; import `formatDateTime` from `@/lib/utils/format`. |
| H4 | `src/app/pos/components/quotes/quote-helpers.ts:3-10` | **Duplicate `STATUS_BADGE_CONFIG`.** Local quote status label/color map duplicates `QUOTE_STATUS_LABELS` from `constants.ts`. The POS uses custom bg/text class pairs instead of the shared `Badge` variant system. | Migrate to use `QUOTE_STATUS_LABELS` from constants and `Badge` component variants. |
| H5 | `src/components/account/account-shell.tsx:22-29` | **Duplicate `formatPhone()`.** Local phone formatter duplicates `formatPhone()` from `@/lib/utils/format`. | Delete local function; import `formatPhone` from `@/lib/utils/format`. |
| H6 | `src/components/account/appointment-edit-dialog.tsx:120-127` | **Duplicate `formatPhone()`.** Second local copy of the same phone formatter. | Delete local function; import `formatPhone` from `@/lib/utils/format`. |
| H7 | `src/app/api/quotes/[id]/pdf/route.ts:44-50` | **Duplicate `formatDate()`.** Local `formatDate(iso)` function using `Intl.DateTimeFormat` duplicates shared `formatDate()` from `format.ts` (uses slightly different format: "long" month vs "short"). | Import `formatDate` from `@/lib/utils/format`, or create a `formatDateLong()` variant if long month format is intentional. |
| H8 | `src/app/api/quotes/[id]/convert/route.ts:8-13` | **Duplicate inline Zod schema.** `convertSchema` is defined locally and identically in both admin and POS convert routes. | Move `convertSchema` to `src/lib/utils/validation.ts` and import from both routes. |
| H9 | `src/app/api/pos/quotes/[id]/convert/route.ts:9-14` | **Duplicate inline Zod schema.** Identical `convertSchema` as H8. | Same fix as H8. |
| H10 | `src/app/api/unsubscribe/[customerId]/route.ts:5-10` | **Inline Zod schema.** `prefsSchema` defined locally instead of in `validation.ts`. | Move to `validation.ts` as `unsubscribePrefsSchema`. |
| H11 | `src/app/admin/appointments/waitlist/page.tsx:53-59` | **Duplicate status label map.** Local `STATUS_LABELS` for waitlist statuses is not in `constants.ts`. | Add `WAITLIST_STATUS_LABELS` to `constants.ts` and import. |
| H12 | `src/app/admin/transactions/page.tsx:55-61` | **Duplicate `STATUS_BADGE_CLASSES`.** Transaction status badge color map duplicated across 3 files (admin transactions, POS transaction-detail, POS transaction-list). | Move `TRANSACTION_STATUS_BADGE_CLASSES` to `constants.ts` and import. |
| H13 | `src/app/pos/components/transactions/transaction-detail.tsx:36-42` | **Duplicate `STATUS_BADGE_CLASSES`.** Same map as H12. | Same fix as H12. |
| H14 | `src/app/pos/components/transactions/transaction-list.tsx:23-29` | **Duplicate `STATUS_BADGE_CLASSES`.** Same map as H12. | Same fix as H12. |
| H15 | `src/app/admin/page.tsx:40-48` | **Duplicate `STATUS_BADGE_VARIANT` for AppointmentStatus.** Appointment badge variant map defined in 3 separate files. | Move to `constants.ts` as `APPOINTMENT_STATUS_BADGE_VARIANT` and import. |
| H16 | `src/app/admin/appointments/components/day-appointments-list.tsx:10-18` | **Duplicate `STATUS_BADGE_VARIANT` for AppointmentStatus.** Same map as H15. | Same fix as H15. |
| H17 | `src/app/admin/appointments/components/appointment-detail-dialog.tsx:27-35` | **Duplicate `STATUS_BADGE_VARIANT` for AppointmentStatus.** Same map as H15. | Same fix as H15. |
| H18 | `src/app/admin/quotes/page.tsx:61-68` | **Duplicate `STATUS_BADGE_VARIANT` for QuoteStatus.** Quote badge variant map defined in 2 files. | Move to `constants.ts` as `QUOTE_STATUS_BADGE_VARIANT` and import. |
| H19 | `src/app/admin/quotes/[id]/page.tsx:54-61` | **Duplicate `STATUS_BADGE_VARIANT` for QuoteStatus.** Same map as H18. | Same fix as H18. |
| H20 | `src/app/api/quotes/[id]/send/route.ts` vs `src/app/api/pos/quotes/[id]/send/route.ts` | **Duplicate quote send logic.** Both admin and POS send routes contain nearly identical email template HTML, SMS text generation, and communication recording logic (~200 lines each). | Extract shared logic to `src/lib/quotes/send-service.ts`. |
| H21 | `src/app/api/quotes/[id]/convert/route.ts` vs `src/app/api/pos/quotes/[id]/convert/route.ts` | **Duplicate quote convert logic.** Both routes contain identical appointment creation from quote logic, including the same `convertSchema`, item mapping, and status transition code. | Extract shared logic to `src/lib/quotes/convert-service.ts`. |
| H22 | `src/app/api/quotes/[id]/route.ts` vs `src/app/api/pos/quotes/[id]/route.ts` | **Duplicate quote CRUD logic.** GET, PATCH, and DELETE handlers contain largely identical query and update logic between admin and POS routes. | Extract shared logic to `src/lib/quotes/quote-service.ts`. |

---

## Medium (Cleanup / Improvement)

| # | File | Violation | Recommended Fix |
|---|------|-----------|-----------------|
| M1 | `src/app/pos/lib/receipt-template.ts:101` | **Uses `toLocaleDateString()` instead of `formatDate()`.** Direct `new Date().toLocaleDateString()` call for receipt date formatting. | Import and use `formatDate()` or `formatDateTime()` from `@/lib/utils/format`. |
| M2 | `src/app/pos/lib/receipt-template.ts:303` | **Uses `toLocaleDateString()` instead of `formatDateTime()`.** HTML receipt date formatting with inline options. | Import and use `formatDateTime()` from `@/lib/utils/format`. |
| M3 | `src/app/admin/staff/[id]/page.tsx:789` | **Uses `toLocaleDateString()` instead of `formatDate()`.** Blocked date display with custom format options. | Import `formatDate()` from `@/lib/utils/format`. If weekday is needed, add a `formatDateWithWeekday()` variant. |
| M4 | `src/app/admin/marketing/coupons/new/page.tsx:1106` | **Uses `toLocaleDateString()` and `toLocaleTimeString()` instead of shared formatters.** Expiration date display in coupon wizard summary. | Import `formatDateTime()` from `@/lib/utils/format`. |
| M5 | `src/app/admin/customers/page.tsx:544` | **Uses `toLocaleDateString()` in title attribute.** `title={new Date(d).toLocaleDateString()}` for Last Visit column tooltip. | Import `formatDate()` from `@/lib/utils/format`. |
| M6 | `src/app/admin/appointments/scheduling/page.tsx:337` | **Uses `toLocaleDateString()` instead of `formatDate()`.** Blocked date display with custom format options. | Same fix as M3. |
| M7 | `src/app/api/quotes/[id]/send/route.ts:135` | **Uses `toLocaleDateString()` in email text template.** `Date: ${new Date(quote.created_at).toLocaleDateString()}` in plain-text email. | Import `formatDate()` from `@/lib/utils/format`. |
| M8 | `src/app/api/quotes/[id]/send/route.ts:210` | **Uses `toLocaleDateString()` in HTML email template.** Same issue in HTML email body. | Import `formatDate()` from `@/lib/utils/format`. |
| M9 | `src/app/api/pos/quotes/[id]/send/route.ts:128` | **Uses `toLocaleDateString()` in email text template.** Duplicate of M7 in POS send route. | Import `formatDate()` from `@/lib/utils/format`. |
| M10 | `src/app/api/pos/quotes/[id]/send/route.ts:200` | **Uses `toLocaleDateString()` in HTML email template.** Duplicate of M8 in POS send route. | Import `formatDate()` from `@/lib/utils/format`. |
| M11 | `src/app/api/appointments/[id]/notify/route.ts:64` | **Uses `toLocaleDateString()` instead of `formatDate()`.** Appointment notification date formatting. | Import `formatDate()` from `@/lib/utils/format`. |
| M12 | `src/app/api/pos/appointments/[id]/notify/route.ts:70` | **Uses `toLocaleDateString()` instead of `formatDate()`.** Duplicate of M11 in POS notify route. | Import `formatDate()` from `@/lib/utils/format`. |
| M13 | `src/app/api/pos/coupons/validate/route.ts:148` | **Uses `toLocaleDateString()` inline.** `new Date(existingUse[0].created_at).toLocaleDateString()` for coupon already-used error message. | Import `formatDate()` from `@/lib/utils/format`. |
| M14 | `src/app/api/pos/receipts/email/route.ts:101` | **Uses `toLocaleDateString()` in receipt email.** Date in email receipt text. | Import `formatDate()` from `@/lib/utils/format`. |
| M15 | `src/app/pos/pos-shell.tsx:372` | **Hardcoded business name.** `Smart Detail POS` is hardcoded in the POS header. | Fetch business name from `getBusinessInfo()` or the POS context and display `${name} POS`. |
| M16 | `src/app/api/pos/stripe/payment-intent/route.ts:31` | **Hardcoded business name.** `description: description \|\| 'Smart Detail POS'` uses hardcoded fallback in Stripe payment intent. | Use `getBusinessInfo()` for the fallback business name. |
| M17 | `src/components/public/hero-section.tsx:10` | **Hardcoded location text.** `Professional Auto Detailing in Lomita, CA` is hardcoded. While this is SEO content and may be intentionally static, it violates the "never hardcode business info" rule. | Fetch from `getBusinessInfo()` if dynamic is desired, or document as accepted SEO exception. |
| M18 | `src/lib/data/business.ts:53` | **Hardcoded fallback address.** `{ line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' }` as fallback. While this is a last-resort default when DB is empty, it means the code has hardcoded business data. | Acceptable as bootstrap fallback, but consider logging a warning when fallback is used. |
| M19 | `src/lib/data/business.ts:56-57` | **Hardcoded fallback name and phone.** `'Smart Detail Auto Spa & Supplies'` and `'+13109990000'` as DB-empty fallbacks. | Same consideration as M18 -- acceptable bootstrap default, but should be noted. |
| M20 | `src/lib/data/receipt-config.ts:94` | **Hardcoded fallback address (duplicate of business.ts).** Identical fallback address duplicated in receipt config parsing. | Refactor to call `getBusinessInfo()` for fallbacks instead of duplicating address constants. |
| M21 | `src/lib/data/receipt-config.ts:98` | **Hardcoded fallback phone.** `'+13109990000'` duplicated from `business.ts`. | Same fix as M20. |
| M22 | `src/lib/data/receipt-config.ts:103` | **Hardcoded fallback name.** `'Smart Detail Auto Spa & Supplies'` duplicated from `business.ts`. | Same fix as M20. |
| M23 | `src/app/api/public/business-info/route.ts:28-32` | **Hardcoded fallback address/name/phone (triplicate).** Same fallback values as `business.ts` and `receipt-config.ts`. Three separate places define the same fallback business info. | Extract fallback constants to a single location (e.g., `BUSINESS_DEFAULTS` in `constants.ts`) or have `business-info/route.ts` call `getBusinessInfo()` directly. |
| M24 | `src/app/admin/customers/[id]/page.tsx:1763` | **Stale `/admin/quotes/new` link.** Links to a deleted page. Admin quotes are read-only; creation should go through POS deep-link. | Change to POS deep-link: `/pos/quotes?mode=builder&customer=${id}`. |
| M25 | `src/app/admin/appointments/waitlist/page.tsx:45-51` | **Local `STATUS_BADGE_VARIANT` for WaitlistStatus.** Waitlist badge variant map not centralized in constants. | Add `WAITLIST_STATUS_BADGE_VARIANT` to `constants.ts`. |
| M26 | `src/app/api/quotes/[id]/activities/route.ts:50-53` | **Inline validation.** `activity_type` and `outcome` validated with raw `if (!activity_type \|\| !outcome)` instead of a Zod schema. | Create `logActivitySchema` in `validation.ts` and use `safeParse()`. |

---

## Summary

- **Total Critical: 22** (20 missing auth/role checks, 1 weak auth, 1 getSession client-side)
- **Total High: 22** (7 duplicate formatters, 3 inline Zod schemas, 9 duplicate status label/color maps, 3 duplicate business logic between admin/POS)
- **Total Medium: 26** (14 inline `toLocaleDateString()` calls, 8 hardcoded business info fallbacks, 1 stale link, 2 missing centralized constants, 1 inline validation)

### Priority Matrix

| Priority | Action | Count |
|----------|--------|-------|
| **Fix immediately** | Auth checks on all admin API routes (C1-C16) | 16 |
| **Fix immediately** | Role checks on authenticated routes (C17-C19) | 3 |
| **Fix soon** | Harden PDF auth (C20) | 1 |
| **Fix soon** | Evaluate getSession client-side usage (C21-C22) | 2 |
| **Batch fix** | Remove all duplicate formatters (H1-H7) | 7 |
| **Batch fix** | Move inline Zod schemas to validation.ts (H8-H10) | 3 |
| **Batch fix** | Centralize all status label/badge maps (H11-H19) | 9 |
| **Architectural** | Extract shared quote services (H20-H22) | 3 |
| **Cleanup sprint** | Replace toLocaleDateString with shared formatters (M1-M14) | 14 |
| **Cleanup sprint** | Consolidate hardcoded fallbacks (M15-M23) | 9 |
| **Quick fix** | Fix stale link (M24) | 1 |
| **Cleanup** | Centralize remaining constants (M25-M26) | 2 |

### Routes Missing Auth (Summary)

The following admin-facing API routes use `createAdminClient()` (service role, bypasses RLS) with **zero authentication**:

| Route File | HTTP Methods |
|------------|-------------|
| `src/app/api/quotes/route.ts` | GET, POST |
| `src/app/api/quotes/[id]/route.ts` | GET, PATCH, DELETE |
| `src/app/api/quotes/[id]/convert/route.ts` | POST |
| `src/app/api/appointments/[id]/route.ts` | PATCH |
| `src/app/api/appointments/[id]/notify/route.ts` | POST |
| `src/app/api/appointments/[id]/cancel/route.ts` | POST |
| `src/app/api/staff/create/route.ts` | POST |
| `src/app/api/staff/schedules/route.ts` | GET |
| `src/app/api/staff/schedules/[employeeId]/route.ts` | PUT |
| `src/app/api/staff/blocked-dates/route.ts` | GET, POST |
| `src/app/api/staff/blocked-dates/[id]/route.ts` | DELETE |
| `src/app/api/waitlist/route.ts` | GET, POST |
| `src/app/api/waitlist/[id]/route.ts` | PATCH, DELETE |

**Note:** `src/app/api/quotes/[id]/accept/route.ts` and `src/app/api/quotes/[id]/pdf/route.ts` are intentionally public-facing (accept uses `access_token`, PDF uses token or referer), but the PDF referer check is weak.

**Note:** The `src/app/api/unsubscribe/` route is intentionally public (no auth required for opt-out).

**Note:** The `src/app/api/quotes/[id]/send/route.ts` correctly has auth (`createClient()` -> `getUser()`).
