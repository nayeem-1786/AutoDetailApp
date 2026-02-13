# Changelog — Auto Detail App

Archived session history and bug fixes. Moved from CLAUDE.md to keep handoff context lean.

---

## Session 37 — 2026-02-12 (Job Source Badge + Editable Job Detail)

### Job Source Badge (Walk-In vs Appointment)
- Source determined from `appointment_id` (NULL = Walk-In, NOT NULL = Appointment)
- Badge pill on job queue cards: purple "Appt" with Calendar icon, amber "Walk-In" with Footprints icon
- Badge pill on job detail header: same styling, right of status badge

### Editable Job Detail Card
- All edits gated by `pos.jobs.manage` permission (client + server)
- Edits blocked on terminal statuses (completed, closed, cancelled)
- **Edit Customer**: Tappable card opens bottom sheet with `CustomerLookup` component
- **Edit Vehicle**: Tappable card opens bottom sheet with customer's vehicle list + "No vehicle" option
- **Edit Services**: Tappable card opens full modal with search, multi-select toggle, running total, "Update Services" button
- **Edit Notes**: Inline editable `intake_notes` field with textarea + save/cancel buttons
- **API**: PATCH `/api/pos/jobs/[id]` now separates `MANAGE_FIELDS` (customer_id, vehicle_id, services, intake_notes) from `WORKFLOW_FIELDS`. Manage fields require `pos.jobs.manage` permission + non-terminal status check via `checkPosPermission()`.
- New Vehicle card section added to job detail (previously only showed vehicle inline with customer)

## Session 36 — 2026-02-12 (Consolidate Job Permissions)

- Consolidated `pos.jobs.create_walkin` into `pos.jobs.manage` — walk-in creation now gated by manage permission
- Updated `pos.jobs.manage` description: "Create walk-in jobs, start intake, begin work, complete jobs, reassign detailer"
- Fixed `pos.jobs.cancel` detailer default to `false` (only super_admin and admin get cancel by default)
- Removed all orphaned `create_walkin` references from code, role-defaults, and docs
- POS Jobs now has 4 permissions: view, manage, flag_issue, cancel

## Sessions 34-35 — 2026-02-12 (POS Job Permission Enforcement + Detailer Reassignment)

### Detailer Reassignment on Job Detail
- Assigned staff card is tappable (permission-gated by `pos.jobs.manage`)
- Bottom sheet modal with all bookable staff: busy indicators, today's job count, checkmark on current assignee
- "Unassigned" option removes assignment
- New endpoint: `GET /api/pos/staff/available`

### Job Cancellation Flow
- Cancel button with reason dropdown (5 reasons + custom), permission-gated by `pos.jobs.cancel`
- Walk-in cancellation: silent cancel with toast
- Appointment-based cancellation: SendMethodDialog for Email/SMS/Both notification, cancels job + frees appointment slot
- Professional cancellation email (dark mode, red header, rebook CTA) + SMS notification
- DB columns: `cancellation_reason`, `cancelled_at`, `cancelled_by`
- New endpoint: `POST /api/pos/jobs/[id]/cancel`

### POS Permission Enforcement (4 Job Permissions)
- Shared `checkPosPermission()` utility at `src/lib/pos/check-permission.ts`
- All POS job buttons now gated client-side (`usePosPermission()`) AND server-side (`checkPosPermission()`)
- Permission matrix:
  | Permission | Client Gate | Server Gate |
  |---|---|---|
  | `pos.jobs.view` | Jobs tab visibility | — |
  | `pos.jobs.manage` | Walk-in + reassign | POST /api/pos/jobs |
  | `pos.jobs.flag_issue` | Flag Issue button | — |
  | `pos.jobs.cancel` | Cancel button | POST /api/pos/jobs/[id]/cancel |
- Defaults: cashier denied for cancel, flag_issue, manage

## Session 7 — 2026-02-07 (POS UX Polish)

- **Service detail dialog:** Replaced full-page service detail with dialog popup (matching product flow)
- **Quote stale state fix:** New quotes always clear previous unsaved items on mount
- **Two-line item rows:** POS ticket and quote item rows show full title on line 1, sub-text + controls on line 2
- **Sub-text formatting:** Skip "default" tier, deduplicate vehicle size vs tier label, title-case raw DB names, store `tier_label || tier_name` in reducers
- **Quote "Valid Until" default:** Auto-populates to 10 days from today
- **Vehicle size tier enforcement:** Auto-select matching tier in service dialog, disable non-matching tiers (shaded out)

## Session 6 — 2026-02-07

### Admin Quotes Read-Only Refactor
- Deleted `admin/quotes/new/page.tsx` (790 lines) and `admin/quotes/_components/service-picker-dialog.tsx` (436 lines)
- Admin list/detail pages rewritten to read-only. "Edit in POS" opens POS builder via deep-link.
- POS deep-link support: `?mode=builder`, `?mode=builder&quoteId=<id>`, `?mode=detail&quoteId=<id>`
- Net result: ~1,700 lines removed

### Employee PIN Collision Safeguards
- Partial unique index on `pin_code WHERE pin_code IS NOT NULL`
- Duplicate PIN check in create + update APIs (returns 409)

### Dashboard & Appointments UI
- Dashboard open quotes excludes drafts (separate card for drafts)
- Week at a Glance: 7-day grid below calendar
- Calendar condensed: `h-14` → `h-10`

## Session 5 — 2026-02-06

### Password Reset Flows
- Auth callback route for Supabase recovery links (`/auth/callback`)
- Inline forgot-password on admin (`/login`) and customer (`/signin`) pages
- Reset password pages for both admin and customer
- Admin "Change Password" in account dropdown

### Other Fixes
- Accept quote confirmation dialog on public page
- Staff email updates sync to Supabase Auth via API route

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 44 | Auth | No "Forgot Password?" on login pages |
| 43 | Auth | Password reset redirectTo pointed to nonexistent path |
| 42 | Quotes | Accept quote has no confirmation dialog |
| 41 | Admin | Staff can't change their own password |
| 40b | Admin | Staff email updates don't sync to Auth |

## Session 4 — 2026-02-06

### Post-Conversion Confirmation Flow
- Quote-to-appointment creates as `confirmed` (was `pending`), fires webhook
- NotifyCustomerDialog: send appointment confirmation via email/SMS/both
- Notification API endpoints for admin and POS
- Detailer dropdown fixed, auto-assign logic added

### Dark Mode (All Public Pages)
- 19 customer-facing pages + 4 email templates + 8 shared UI components
- Pattern: `dark:` Tailwind v4 class variants

### Unified SendMethodDialog
- Single reusable send dialog replacing 5 separate implementations (-276 lines)
- Inline success states (green checkmark, auto-close)
- All `alert()` calls replaced with toast notifications

## Session 3 — 2026-02-06

### Dashboard & Admin Enhancements
- Quote conversion works for any open status (not just accepted)
- Dashboard: Week at a Glance, Quotes & Customers quick-stat cards
- Quotes list: Services column, clickable customer links, relative dates
- Customers list: type badges, relative dates, email truncation
- Transactions list: Services column, relative dates, CSV export includes services
- New utility: `formatRelativeDate()`

### Customer Search & Filters
- Unified search pattern across 5 implementations (2-char min, phone detection, debounce)
- Admin Transactions search fix (PostgREST `.or()` workaround)
- Admin Customers page: 4 filter dropdowns (Type, Visit Status, Activity, Tags)
- Quote validity changed from 30 days to 10 days

### POS Quotes Tab
- Full quote management at `/pos/quotes` (20 new files, 5 modified)
- QuoteProvider + useQuote() with useReducer pattern
- Quote builder, list, detail, send/convert/delete dialogs
- Bottom nav "Quotes" tab, F3 shortcut

### Other
- Quote service picker dialog (category → service → tier browsing)
- Quotes Last Contacted column + resend functionality
- Admin link styling unified (`text-blue-600 hover:text-blue-800 hover:underline`)
- Staff scheduling moved to individual profiles, "Who's Working Today" dashboard
- Booking payment: coupon + loyalty auto-cap, Stripe $0.50 minimum handling
- Phone → Mobile labeling (global)
- Booking: auto-assign detailer, vehicle selection UX, vehicle required
- Customer: portal access toggle, sign-in auto-link, delete with double confirmation
- POS IP whitelist security
- Dynamic business info (zero hardcoded values, `getBusinessInfo()` everywhere)
- Twilio SMS: use phone number directly (not Messaging Service SID)

## Session 2 — 2026-02-06

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 38 | Portal | Zero session expiry protection |
| 37 | Admin | Session check uses cached `getSession()` |
| 39 | Auth | Customer signin doesn't show session expired message |
| 40 | All | Business name/phone/address hardcoded across 26 files |

## Session 1 — 2026-02-06

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 36 | Appointments | Calendar doesn't show today's appointments |
| 35 | Appointments | Cancellation fee "expected number" error |
| 34 | Appointments | "Cancelled" status shows time format error |
| 33 | Appointments | No times available for same-day booking |
| 32 | Admin | Session expiry shows empty pages |
| 31 | Portal | Header shows "My Account" instead of greeting |
| 30 | Booking | Confirmation shows $0.01 with full discount |
| 29 | Booking | Booking fails when discounts cover amount |
| 28 | Booking | Payment fails for amounts under $0.50 |
| 27 | Booking | Loyalty points can exceed remaining balance |
| 26 | Booking | Pre-existing TypeScript errors |

## Session 0 — 2026-02-05

### Bugs Fixed
| # | Module | Description |
|---|--------|-------------|
| 25 | Booking | Payment fails when coupon covers full amount |
| 24 | Coupons | Delete only disables instead of deleting |
| 23 | Coupons | Single-use error message unclear |
| 21 | Coupons | Customer search uses wrong auth endpoint |
| 22 | Coupons | Duplicate coupon code not validated |
| 20 | Coupons | Editing used coupon doesn't warn |
| 19 | Admin | Session expiry shows empty pages |
| 18 | Portal | Customer dashboard coupons not displaying |
| 1 | POS | Stripe Terminal "No established connection" |
| 2 | Booking | No fallback when no bookable detailers |
| 3 | Booking | Paid bookings start as "pending" |
| 4 | Booking | Payment step not in wizard |
| 5 | Marketing | Coupons/Campaigns pages show empty |
| 6 | Booking | No flexible payment options |
| 7 | Booking | Phone shows E.164 on prefill |
| 8 | Booking | Duplicate vehicles on repeat bookings |
| 9 | Booking | Coupon section unclear |
| 10 | Booking | Missing loyalty points redemption |
| 11 | Booking | Payment rules not enforced |
| 12 | Booking | "Your Info" shown for signed-in users |
| 13 | Booking | coupon_rewards missing RLS policies |
| 14 | Booking | Coupons not validated against services |
| 15 | Booking | Available coupons missing eligibility info |
| 16 | Booking | Loyalty slider can't reach max value |
| 17 | Booking | Payment step UI inconsistent |

## Customer Portal Redesign (All Complete)

- Phase 1: Profile page (4 cards: Personal Info, Communication, Notifications, Security)
- Phase 2: Transactions page (stat cards, DataTable, receipt popup)
- Phase 3: Loyalty page (balance card, "How it works", points history)
- Phase 4: Vehicles page (grouped by type, cleaner card layout)
- Phase 5: Appointments edit flow (change date/time/vehicle/services with price diff)
- Phase 6: Dashboard polish (coupons section, loyalty explanation, Book button in header)
