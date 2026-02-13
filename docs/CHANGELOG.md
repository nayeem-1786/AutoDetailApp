# Changelog — Auto Detail App

Archived session history and bug fixes. Moved from CLAUDE.md to keep handoff context lean.

---

## Session 46 — 2026-02-12 (Flag Flow UX Overhaul — Issue Dropdown, SMS Rewrite, Auth Page, Badge, Checkout Permission)

### Fix: Flag flow — issue type dropdown replaces service-name picker
- Step 1 of flag flow now asks "What did you find?" with 10 predefined issue types (Scratches, Water Spots, Paint Damage, Pet Hair/Stains, Interior Stains, Odor, Headlight Haze, Wheel Damage, Tar/Sap/Overspray, Other)
- Issue types are large tappable grid buttons (2x5 grid) designed for iPad with gloves — 72px min height
- "Other" shows free-text textarea for custom issue description
- New flow: Issue Type → Zone Select → Photo → Catalog → Discount → Delay → Message → Preview (was: Zone → Photo → Catalog → ...)
- DB migration adds `issue_type` and `issue_description` columns to `job_addons` table with CHECK constraint
- New utility: `src/lib/utils/issue-types.ts` — `ISSUE_TYPES` array, `getIssueHumanReadable()`, `getIssueLabel()`, `friendlyServiceName()`
- `friendlyServiceName()` converts catalog names to conversational descriptions ("Paint Correction Stage 1" → "a paint correction service")
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`, `src/lib/utils/issue-types.ts` (new), `src/lib/supabase/types.ts`, `supabase/migrations/20260212000011_addon_issue_type.sql`

### Fix: SMS rewrite — conversational tone, no MMS attachment
- Old SMS: `${message}\n\nApprove or decline here: ${url}\n\n— ${biz.name}` (with raw service name as "issue found" + confusing MMS attachment)
- New SMS: `Hi {first_name}, while working on your {make model} we noticed {issue_human_readable}.\nWe recommend {friendly_service} for an additional ${price} — shall we go ahead?\nView pictures and approve or decline here: {url}\n{detailer_first_name}\n{biz.name}`
- Removed `mediaUrl` from `sendSms()` call — no more extra Twilio media link at bottom of SMS
- Photos now only viewable on the authorization web page (much better UX)
- Detailer's first name added for personal touch
- Vehicle description uses make/model only (no year/color for SMS brevity)
- Email template also rewritten with conversational messaging and detailer name
- Files: `src/app/api/pos/jobs/[id]/addons/route.ts`

### Fix: Authorization page redesign — mobile-first, conversational
- Header: "Additional Service Authorization Request" (most prominent, large bold text)
- Conversational message: "Hi {name}, While working on your {make model}, {detailer} noticed {issue}. We'd like to take care of it while your vehicle is already here."
- Photos section: labeled "Photos from our inspection" with scrollable gallery
- Proposed Add-On Service section: service name + description in card, clear "Additional Cost" in large font
- New Ticket Total: shows original services + approved addons + this addon in blue info box
- Approve button: full-width green, 48px height for mobile touch
- Decline button: full-width secondary outline below (stacked, not side-by-side)
- Business footer: name, address, phone (from `getBusinessInfo()`)
- Files: `src/app/authorize/[token]/page.tsx`, `src/app/authorize/[token]/authorization-client.tsx`

### Fix: Addon status badge on job queue cards
- Replaced simple bell icon with proper badge pill showing addon status
- Badge states: "⚑ Addon Pending" (amber), "✓ Addon Approved" (green), "✗ Addon Declined" (gray)
- Priority: pending > approved > declined (shows most actionable status)
- Badge positioned below customer info, above assigned staff line
- Uses existing `addons:job_addons(id, status)` from jobs list API (no additional queries)
- Files: `src/app/pos/jobs/components/job-queue.tsx`

### Fix: Cashier checkout permission — explicit check + descriptive errors
- `checkout-items` route had NO permission check — only HMAC auth. Added `pos.jobs.view` check (all POS roles have this by default)
- Frontend now distinguishes error types: 403 → "You don't have permission..." / 404 → "Job not found" / other → generic
- Audit: all job-related API routes reviewed. Routes with explicit checks: `POST /jobs` (pos.jobs.manage), `PATCH /jobs/[id]` (pos.jobs.manage for editable fields), `POST /cancel` (pos.jobs.cancel), `GET /checkout-items` (pos.jobs.view, NEW)
- Files: `src/app/api/pos/jobs/[id]/checkout-items/route.ts`, `src/app/pos/jobs/page.tsx`

---

## Session 45 — 2026-02-12 (Flag Flow — Annotated Images, Vehicle-Size Pricing, Quantity Rules)

### Fix: Annotated images not sent to customer in flag flow
- Detailer markup (circles, arrows, text labels) was NOT visible to the customer — original unmarked photo was sent via MMS, shown in email, and displayed on the authorization page
- Root cause: `annotation_data` JSONB was stored in DB and `AnnotationOverlay` component existed, but was never used in customer-facing contexts
- **Authorization page** (`/authorize/[token]`): Added `AnnotationOverlay` SVG overlay on top of photos — annotations now visible when customer views the page
- **MMS/Email**: Created `src/lib/utils/render-annotations.ts` — server-side utility using `sharp` that composites SVG annotations onto the actual image pixels, uploads to Supabase Storage, and returns a public URL. Both addon create and resend routes now send the annotated version
- **Preview step**: Flag flow preview now shows `AnnotationOverlay` on the photo so detailer sees exactly what the customer will see
- Files: `src/lib/utils/render-annotations.ts` (new), `src/app/authorize/[token]/page.tsx`, `src/app/api/pos/jobs/[id]/addons/route.ts`, `src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts`, `src/app/pos/jobs/components/flag-issue-flow.tsx`

### Fix: Flag flow service picker shows $0.00 prices and wrong UX
- Service prices showed as $0.00 because the flag flow used raw `base_price || price || 0` from `/api/pos/services` — most services use `service_pricing` table for vehicle-size-aware pricing, not `base_price`
- Replaced the flat catalog list with the existing `CatalogBrowser` component used by the quote builder
- Now has tabs (Services / Products / Custom) instead of a mixed flat list
- Services tab: full category browsing, search, `ServicePricingPicker` for multi-tier services, vehicle-size-aware pricing via `resolveServicePrice()`
- Products tab: full category browsing with proper `retail_price`
- Custom tab: retained custom line item form
- Vehicle `size_class` now flows from job detail → flag flow props → CatalogBrowser's `vehicleSizeOverride`
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`

### Fix: Flag flow must follow service quantity rules
- Flag flow had zero duplicate prevention — could add services already on the job, no per-unit max enforcement
- Built `addedServiceIds` set from `job.services[]` + approved `job.addons[]` service IDs
- Passed to `CatalogBrowser`'s `addedServiceIds` prop — shows green checkmark badge on already-added services
- Added explicit duplicate guard in `handleAddService()` — shows warning toast and blocks selection
- Per-unit max enforcement handled by `ServicePricingPicker`'s built-in `PerUnitPicker`
- Files: `src/app/pos/jobs/components/flag-issue-flow.tsx`

---

## Session 44 — 2026-02-12 (Customer Data Persistence Through Checkout + Hide Paid Jobs)

### Fix: Customer data persistence through job checkout flow
- Root cause: `checkout-items` API only selected `(id, first_name, last_name)` for the customer — missing `phone`, `email`, `customer_type`, `tags`
- This caused 3 downstream bugs:
  1. **Customer type prompt always shown**: `customer_type` was undefined → prompt appeared even for customers with type already set
  2. **Receipt modal couldn't send SMS/email**: `phone` and `email` were undefined → receipt options had no pre-filled contact data
  3. **Customer data gap through checkout**: The ticket customer object was missing critical fields for the entire checkout flow
- Fix: Added `phone, email, customer_type, tags` to the customer select in `checkout-items/route.ts`
- Fix: Updated `jobs/page.tsx` type definition and customer construction to explicitly include all fields
- Files: `src/app/api/pos/jobs/[id]/checkout-items/route.ts`, `src/app/pos/jobs/page.tsx`

### Fix: Hide paid/closed jobs from POS jobs queue
- Paid jobs (status `closed`) remained visible in the Jobs queue with a "Paid" badge
- Fix: Added `.neq('status', 'closed')` filter to the jobs list API query, matching existing `.neq('status', 'cancelled')` pattern
- Closed jobs are still accessible via POS Transactions list and Customer History tab
- File: `src/app/api/pos/jobs/route.ts`

---

## Session 43 — 2026-02-12 (Checkout Items Response Parsing Fix)

### Fix: Checkout items response parsing for job-to-register flow
- "Failed to load checkout items" toast was shown even when API returned 200
- Root cause: single overly-broad try/catch caught all errors (fetch, JSON parse, and processing) under one generic message, masking the actual failure point
- Fix: separated error handling into distinct phases — fetch, JSON parse, response shape validation, and processing — each with specific error messages and `console.error` logging
- Added explicit null/shape checks: validates `data` exists and `data.items` is an array before processing
- Fixed TypeScript errors: `Customer` and `Vehicle` types now properly cast from partial API join results
- Fixed `id` property duplication: spread `data.customer` first, then override `id` (was reversed, causing TS2783)

### Feature: Auto-apply coupon from linked quote at checkout
- When a job is linked to a quote that has a `coupon_code`, the coupon is now automatically validated and applied to the POS register ticket
- Uses existing `/api/pos/coupons/validate` endpoint to verify coupon is still valid
- Fails silently if coupon is expired/invalid — checkout still proceeds without discount
- Files: `src/app/pos/jobs/page.tsx`

---

## Session 42 — 2026-02-12 (Duplicate Toast Fix + Service Quantity Enforcement)

### Fix: Duplicate toast on add service
- Toast fired twice when adding a service from the catalog in the quote builder
- Root cause: `catalog-browser.tsx` and `service-detail-dialog.tsx` fired their own toasts AND the callback (`handleAddService` in `quote-builder.tsx`) also fired a toast
- Fix: When `onAddService`/`onAdd` callbacks are provided (callback mode), skip the local toast — let the caller own the notification
- Files: `catalog-browser.tsx` (5 toast sites), `service-detail-dialog.tsx` (2 toast sites)

### Feature: Service quantity enforcement in quote builder
- **Single-per-vehicle rule**: Most detailing services (28 of 30) are one-per-vehicle. Adding a duplicate now shows warning toast "Already added — remove it first to swap" instead of creating a duplicate line item
- **Per-unit services** (Scratch Repair): Tapping again increments `perUnitQty` up to `per_unit_max` (4 panels). At max, shows warning toast with max count
- **Visual indicator**: Already-added services show green highlight with checkmark badge in the catalog grid (both search results and category browse)
- **Stepper enforcement in item rows**:
  - Regular services: quantity stepper hidden (always qty 1, use X to remove)
  - Per-unit services: stepper controls `perUnitQty` with min 1 / max `per_unit_max`
  - Products: stepper unchanged (unrestricted)
- New reducer action: `UPDATE_PER_UNIT_QTY` — updates per-unit quantity and recalculates pricing
- New `TicketItem` field: `perUnitMax` — stores service's max units for stepper enforcement
- Applied to both quote builder (quote-reducer) and POS register (ticket-reducer)
- Files: `types.ts`, `quote-reducer.ts`, `ticket-reducer.ts`, `quote-builder.tsx`, `catalog-browser.tsx`, `catalog-grid.tsx`, `catalog-card.tsx`, `quote-item-row.tsx`, `ticket-item-row.tsx`, `jobs/page.tsx`

---

## Session 41 — 2026-02-12 (Toast Stacking Fix)

### Fix: Toast notifications stack vertically instead of overlapping
- Added `expand` prop to `<Toaster>` — toasts now always display in a fully expanded vertical stack instead of collapsing on top of each other
- Added `visibleToasts={5}` to allow up to 5 simultaneous toasts (sonner default was 3)
- File: `src/app/layout.tsx`

---

## Session 40 — 2026-02-12 (Completion SMS, Job-to-Checkout, Gallery Addons + Timestamp)

### Fix: Completion SMS — Business Info + Vehicle Name
- Removed MMS `mediaUrl` from `sendSms()` call — no more raw image link in SMS
- Vehicle display now uses make + model only (no year), fallback to "your vehicle"
- SMS template includes: gallery link, business name, address, phone, today's closing time
- Closing time derived from `business_hours` in `business_settings` (PST timezone)
- If business is closed today, shows "See our hours online"
- Email updated with same vehicle display and enhanced business info footer with hours
- Imported `getBusinessHours()` from `@/lib/data/business-hours`

### Fix: Job → POS Checkout Flow
- **Checkout button on job detail**: Prominent blue "Checkout" button for completed jobs, replaces "Customer Pickup" as primary action
- **Checkout pill on job queue**: Completed jobs show a "Checkout" pill button, tapping loads items directly into POS register
- **"Paid" indicator**: Closed jobs show green "Paid" badge instead of checkout button (both detail and queue)
- **Double-checkout prevention**: `GET /api/pos/jobs/[id]/checkout-items` returns 400 if job is already closed
- **Checkout-items enrichment**: Response now includes `is_taxable` and `category_id` per item (services, addons, products) for proper tax calculation and coupon eligibility
- **RESTORE_TICKET flow**: Checkout handler builds a full TicketState from checkout-items and dispatches RESTORE_TICKET, then navigates to `/pos` register
- **Auto-linking preserved**: Transaction creation route already auto-links most recent completed job → closed. No changes needed.
- Shared checkout handler in `src/app/pos/jobs/page.tsx` — used by both queue and detail views

### Fix: Gallery Page — Approved Addons in Services Performed
- Gallery page (`/jobs/[token]/photos`) now queries `job_addons` where `status = 'approved'`
- Addon service names resolved from `services` table (not just `custom_description`)
- Listed below original services with price (after discount)
- Gallery API route (`/api/jobs/[token]/photos`) also returns `addons` array

### Fix: Gallery Page — Completion Time
- Completion date now includes time: "Thursday, February 12, 2026 at 5:23 PM"
- Uses `Intl.DateTimeFormat` with `hour`, `minute`, `hour12` options in PST timezone

---

## Session 39 — 2026-02-12 (Walk-In Job Fix + Product & Coupon Checkout Bridge)

### Walk-In Job Creation Fix
- Added defensive `serviceId` null check in service item filter — `i.itemType === 'service' && i.serviceId` — prevents items with null service IDs from reaching the job creation API
- Validation message clarified: "At least one service is required to create a job"

### Product Carryover to Checkout (Quote → Job → Checkout Bridge)
- `GET /api/pos/jobs/[id]/checkout-items` now checks `job.quote_id`
- If linked quote exists, queries `quote_items` for product items (`product_id IS NOT NULL`)
- Product items returned alongside service items and addons with `item_type: 'product'`
- Services from JSONB now include `quantity` and `tier_name` when present
- Non-walk-in jobs (no `quote_id`) continue working as before — no product lookup

### Coupon Carryover to Checkout
- Migration `20260212000010_add_coupon_code_to_quotes.sql`: adds `coupon_code TEXT` column to `quotes` table
- `createQuoteSchema` and `updateQuoteSchema` accept optional `coupon_code` field
- `createQuote()` and `updateQuote()` service functions save `coupon_code` to DB
- All quote save paths (Save Draft, Send Quote, Create Job) now persist `coupon_code` from client state
- `checkout-items` route reads `coupon_code` from linked quote and returns it in the response
- POS register can auto-apply the coupon at checkout

### Checkout Bridge Summary
```
Quote (services + products + coupon) → Create Job (services only, quote_id saved)
→ Checkout Items (services from job JSONB + products from quote_items + coupon from quotes.coupon_code)
→ Register ticket (everything)
```

### Files Changed
- `supabase/migrations/20260212000010_add_coupon_code_to_quotes.sql` (new)
- `src/lib/supabase/types.ts` (Quote.coupon_code field)
- `src/lib/utils/validation.ts` (coupon_code in quote schemas)
- `src/lib/quotes/quote-service.ts` (save coupon_code in create/update)
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` (defensive filter, coupon_code in all save paths, updated toast)
- `src/app/api/pos/jobs/[id]/checkout-items/route.ts` (product + coupon bridge from linked quote)

---

## Session 38 — 2026-02-12 (Walk-In Mode on Quote Builder + Quote-to-Job Conversion)

### Walk-In Mode on Quote Builder
- "New Walk-In" button on Jobs tab now navigates to `/pos/quotes?mode=builder&walkIn=true`
- Quote Builder accepts `walkInMode` prop: changes header to "New Walk-In", hides "Valid Until" date picker and "Send Quote" button, replaces "Save Draft" with "Create Job"
- On "Create Job": saves quote as `status='converted'` for audit trail, maps service items to job services, creates job via `POST /api/pos/jobs`, navigates to Jobs tab
- Customer required (validation enforced), at least one service required
- Products on quotes notify user via toast "Products will be added at checkout"
- Coupon code stored in job notes as "Coupon: {code}" for cashier reference

### Quote-to-Job Conversion (Quote Detail)
- "Create Job" button added to quote detail view for `draft`, `sent`, `viewed`, `accepted` statuses
- Permission-gated: requires `pos.jobs.manage` and quote must have a customer
- Maps service items to job services, creates job, updates quote status to `converted`
- "Converted" status section now shows "Converted to job" vs "Converted to appointment"

### Database Changes
- Migration `20260212000009_jobs_add_quote_id.sql`: adds `quote_id` UUID FK column + partial index to `jobs` table
- `POST /api/pos/jobs` now accepts `quote_id` and `notes` fields, includes server-side duplicate check (409 if job already exists for same quote)
- `createQuote()` service function now respects optional `status` field (supports 'draft' | 'converted')

### Old Walk-In Flow Removed
- Deleted `src/app/pos/jobs/components/walk-in-flow.tsx` (612 lines)
- Removed `WalkInFlow` import and `walkin` view mode from jobs page
- Zero orphaned references

### Files Changed
- `src/app/pos/quotes/page.tsx` — reads `walkIn` query param, passes to builder
- `src/app/pos/components/quotes/quote-builder.tsx` — accepts `walkInMode` prop, passes to ticket panel, updates header
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — walk-in mode UI changes, `handleCreateJob()` handler
- `src/app/pos/components/quotes/quote-detail.tsx` — "Create Job" button, `handleCreateJobFromQuote()` handler
- `src/app/pos/jobs/page.tsx` — routes walk-in to quote builder, removed WalkInFlow
- `src/app/api/pos/jobs/route.ts` — accepts `quote_id`/`notes`, duplicate check
- `src/lib/quotes/quote-service.ts` — respects `status` field on create
- `src/lib/utils/validation.ts` — added `status` to `createQuoteSchema`
- `supabase/migrations/20260212000009_jobs_add_quote_id.sql` — new migration

---

## Session 37 — 2026-02-12 (Job Source Badge + Editable Job Detail + Phone Format Fix)

### Notes Card Tap-to-Edit
- Notes card now follows same full-tap pattern as Customer, Detailer, Services cards — tap anywhere to open edit modal
- Removed standalone pencil icon — card itself is the button with hover/active feedback
- Empty notes show "Tap to add notes" placeholder; read-only when no `pos.jobs.manage` permission

### Duplicate Job Population Fix
- **Root cause**: React strict mode double-fired mount `useEffect`, calling `POST /api/pos/jobs/populate` twice concurrently. Both calls read DB before either inserted, creating duplicates.
- **DB fix**: Added partial unique index `idx_jobs_unique_appointment_id` on `jobs(appointment_id) WHERE appointment_id IS NOT NULL`
- **API fix**: Changed `.insert()` to `.upsert()` with `ignoreDuplicates: true` — safe for concurrent calls
- **Client fix**: Added `useRef` guard to prevent mount effect double-fire
- Migration: `20260212000008_jobs_unique_appointment_id.sql` (includes commented cleanup SQL for existing dupes)

### Notes Editing Modal (iPad UX)
- Replaced inline textarea editing with bottom sheet modal matching other edit modals (customer, vehicle, services)
- Full-width textarea (5 rows), auto-focus for immediate keyboard, Save/Cancel buttons
- Pencil icon button meets 44x44px iPad touch target minimum
- Notes card always read-only on the main view; pencil icon opens modal when `pos.jobs.manage` granted

### Phone Number Display Fix
- Fixed raw E.164 format (+14243637450) displaying on job detail — now shows (424) 363-7450
- Applied existing `formatPhone()` from `@/lib/utils/format` to both editable and read-only customer sections

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
