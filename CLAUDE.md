# Auto Detail App — Session Context

## Project
Smart Details Auto Spa — custom POS, booking, portal, and admin system replacing Square.
Full project spec: `docs/PROJECT.md` | Companion docs: `docs/CONVENTIONS.md`, `docs/COUPONS.md`, `docs/DASHBOARD_RULES.md`, `docs/DATA_MIGRATION_RULES.md`, `docs/SERVICE_CATALOG.md`, `docs/iPAD.md`, `docs/POS_SECURITY.md`

---

## 🔴 ACTIVE WORK — Phase 3 Testing & Bug Fixes

**Strategy:** Test each module thoroughly, fix bugs before moving to next phase.

### Testing Queue (Admin Tabs)
| Tab | Status | Notes |
|-----|--------|-------|
| Online Booking | 🔄 Next | **TEST PAYMENT FLOW** - verify feature flag, Stripe payment step, auto-confirm |
| Appointments | ⏳ Pending | Calendar, scheduling, status changes, cancel flow |
| Quotes | ⏳ Pending | CRUD, send email/SMS, PDF, public view, accept, convert |
| Waitlist | ⏳ Pending | Join, auto-notify, admin management |
| Staff Scheduling | ⏳ Pending | Weekly schedules, blocked dates |
| 11 Labs API | ⏳ Pending | All 6 endpoints |

### 🧪 NEXT SESSION: Complete Online Booking Testing
**Migrations:** Run `npx supabase db push` if not already done

**Completed Tests:**
- [x] Portal booking hides "Your Info" card for signed-in users
- [x] Loyalty points slider works, reaches max value
- [x] Coupon eligibility shows for service-restricted coupons
- [x] Ineligible coupons display with reason and disabled Apply button
- [x] Payment step simplified (security badges + Powered by Stripe only)

**Still Need to Test:**
1. **End-to-end payment flow:** Complete a booking with Stripe payment
2. **Payment thresholds:** Under $100 = full payment, $100+ = deposit option
3. **Pay on Site:** Existing customers can skip payment step
4. **Coupon + loyalty combined:** Apply both discounts together
5. **Database verification:** Check `payment_type`, `deposit_amount`, `coupon_code`, `coupon_discount` columns populated
6. **Guest booking flow:** New customer path with mandatory deposit

### Bugs Found (Pending)
| # | Module | Description | Status |
|---|--------|-------------|--------|
| — | — | — | — |

### Bugs Fixed (2026-02-05)
| # | Module | Description | Fix Summary |
|---|--------|-------------|-------------|
| 18 | Portal | Customer dashboard coupons not displaying | `/api/customer/coupons` was filtering `.eq('customer_id', customer.id)` which only matched coupons assigned to specific customers. Fixed to use `.or('customer_id.eq.X,customer_id.is.null')` to include global coupons (NULL = anyone). Also added tag-based filtering for coupons with `customer_tags` requirements. |
| 1 | POS | Stripe Terminal WisePOS E "No established connection" | Added `collectInProgress` flag + `isProcessingRef` guard for React 18 Strict Mode |
| 2 | Booking | No fallback when no bookable detailers exist | Added fallback to super_admin (Nayeem) if no detailers found |
| 3 | Booking | Paid online bookings start as "pending" | Auto-confirm paid bookings (payment_intent_id exists → status = 'confirmed') |
| 4 | Booking | Payment step never integrated into wizard | Integrated StepPayment into BookingWizard as step 6, controlled by `online_booking_payment` feature flag |
| 5 | Marketing | Coupons and Campaigns pages show empty (data exists in DB) | Admin pages used `createClient()` (anon key) which respects RLS. Fixed API routes to use `createAdminClient()` (service role) to bypass RLS. Updated: `api/marketing/coupons/route.ts`, `api/marketing/coupons/[id]/route.ts`, `api/marketing/campaigns/route.ts`, `api/marketing/campaigns/[id]/route.ts`, and admin list pages to fetch via API |
| 6 | Booking | Flexible payment options (deposit vs pay on site) | Implemented deposit ($50 or service total if less) and pay on site options. New customers must pay deposit; existing customers (visit_count > 0) can choose. Added coupon validation in Review step. New DB columns: payment_type, deposit_amount, coupon_code, coupon_discount |
| 7 | Booking | Phone field shows E.164 format on prefill | Added `formatInitialPhone()` to convert E.164 (`+14243637450`) to display format `(424) 363-7450` on form load |
| 8 | Booking | Duplicate vehicles created on repeat bookings | Added duplicate check in `/api/book` - reuses existing vehicle if same make/model/year/color for customer |
| 9 | Booking | Coupon section unclear | Improved UX with explanatory text, tooltips, detailed coupon info (discount, requirements, expiry) |
| 10 | Booking | Missing loyalty points redemption | Added loyalty points section for portal users with 100+ points, slider to select points, live discount calculation |
| 11 | Booking | Payment rules not enforced | Under $100: full payment required. $100+: $50 deposit. Added cancellation/no-show $50 fee disclaimer |
| 12 | Booking | "Your Info" shown for signed-in users | Hidden for portal bookings since customer already known |
| 13 | Booking | coupon_rewards table missing RLS policies | Added RLS policies for coupon_rewards + anon select policies for public booking flow |
| 14 | Booking | Coupons not validated against service requirements | Added service-based validation in `/api/book/validate-coupon` - checks `requires_service_ids`, `requires_service_category_ids`, and reward target services. Shows clear error when coupon doesn't apply to selected services |
| 15 | Booking | Available coupons show without eligibility info | Updated `/api/book/check-customer` to return `is_eligible` and `ineligibility_reason` for each coupon. UI shows disabled coupons with warning badge and reason |
| 16 | Booking | Loyalty slider can't reach max value | Fixed by rounding `maxLoyaltyPointsUsable` down to nearest 100 (REDEEM_MINIMUM) |
| 17 | Booking | Payment step UI inconsistent | Simplified to show only security badges + "Powered by Stripe". Removed all card/wallet logos. Changed "Pay now" to "Amount Due" |

### Known Issues (Low Priority)
| # | Module | Description | Workaround |
|---|--------|-------------|------------|
| 1 | Admin | Other admin pages (39 total) use direct `createClient()` queries which could fail if RLS `is_employee()` check doesn't evaluate correctly | RLS policies use `is_employee()` which SHOULD work for logged-in staff. If any admin page shows empty data, fix by: 1) Create/update API route to use `createAdminClient()` after auth check, 2) Update page to fetch via API. Already fixed: coupons, campaigns. Monitor other pages. |

### Test Checklist Template
When testing each module, verify:
- [ ] List view loads correctly
- [ ] Create new item works
- [ ] Edit existing item works
- [ ] Delete/cancel works with confirmation
- [ ] Status changes work
- [ ] Related data updates (e.g., customer, vehicle)
- [ ] Email/SMS sends correctly (where applicable)
- [ ] Error states handled gracefully
- [ ] Mobile/responsive layout works

---

## Current Status
- **Phases 1–4:** Complete (Foundation, POS, Booking/Quotes/11Labs, Customer Portal)
- **Phase 5 (Marketing, Coupons & Campaigns):** In progress — partially built
- **Phase 12 (iPad POS Optimization):** Planned — see `docs/iPAD.md`
- **POS Auth Decoupling:** Complete — POS uses independent HMAC token auth, fully separated from admin Supabase sessions

## Phase 5 — What's Done
- Coupon engine: CRUD, code validation at POS, types (flat/$/%/free item/free product), expiry, single-use, min purchase, max discount cap
- Coupon list UI: filters (active/draft/disabled/expired), search, delete with confirmation
- Campaign system: CRUD, audience filters, message composer (SMS/email), coupon attachment, scheduling
- Campaign list UI: status badges, delete with confirmation
- Campaign deep-link: "Book Now" links with customer auto-fill
- Mailgun webhook endpoint for email delivery tracking
- Customer type/tags system (enthusiast, detailer) with POS badges
- POS Promotions tab for applying coupons
- Consent validation warnings on campaigns
- Settings grouped into sections
- CONVENTIONS.md shared foundation doc created and referenced from all module docs
- **Dynamic Receipt Config:** Receipts pull branding from DB settings instead of hardcoded constants. Business Profile has website/email fields. Receipt Printer settings page with header overrides, logo upload (Supabase Storage `receipt-assets` bucket), logo width/position/alignment, custom text with placement options. All receipt API routes (print/email/sms) and client-side generators use `fetchReceiptConfig()` merge helper. Cashier first name shown on receipts. Preview button on settings page. Receipt buttons unified across admin and POS (Print, Email, SMS, Receipt) with consistent styling.
- **Customer Detail Page:** Combined Customer Type + Customer Journey card with vertical divider. Journey shows Since/Visits/Lifetime/Last Visit as pill-shaped stats. Receipt popup with 4 unified action buttons.
- **Receipt Discount Display:** Loyalty points now show as "Loyalty (X pts)" with amber color, separate from coupon discounts. Coupon discounts show as "Coupon (CODE)" with coupon code displayed. Print popup window doubled to 900px width.
- **Notification Preferences:** Customer portal profile page has 4-toggle notification preferences (Appointments/Service Updates required, Promotions/Loyalty optional). Public unsubscribe page at `/unsubscribe/[customerId]` allows preference management without login. New columns: `notify_promotions`, `notify_loyalty` on customers table.
- **Customer Portal Access Section:** Admin customer detail page (`/admin/customers/[id]`) now has an "Account" section showing portal access status (Active/Deactivated toggle). Admin can activate/deactivate portal access with click. Deactivation preserves auth_user_id in backup column for reactivation. If customer has portal access and email on file, admin can send password reset email. API endpoints at `/api/admin/customers/[id]/portal-access` (POST/DELETE) and `/api/admin/customers/[id]/reset-password`.
- **Customer Sign-in Auto-Link:** When customers sign in via phone OTP, system automatically links to existing customer record by phone number. API at `/api/customer/link-by-phone` bypasses RLS to search across phone formats (E.164, 10-digit, formatted). Shows "Account Deactivated" message if customer exists but portal access is disabled.
- **Delete Customer:** Admin customer detail page has red "Delete Customer" button with double confirmation (first warning, then type customer's first name). Cascading deletion removes vehicles, loyalty ledger, consent log, appointments, quotes; transactions are preserved but unlinked. API at `/api/admin/customers/[id]` (DELETE).

## Phase 5 — What's Remaining
- Lifecycle automation rules (service-based triggers, configurable timing, vehicle-aware reminders)
- Two-way SMS (inbound routed to Telegram, reply via Telegram)
- Google review request automation (post-service with direct link)
- Campaign analytics (delivery, opens, redemptions, revenue attribution, ROI)
- A/B testing for campaigns
- Full TCPA compliance audit (consent capture, opt-out handling complete audit log)

## Known Gaps (from Phase 1)
- Product and service edit pages partially implemented — list views exist but individual edit forms need completion
- Some settings sections are placeholder/incomplete (integrations, notifications)
- Business Profile now has website/email fields; Receipt Printer settings page is complete

## Key Architecture Notes
- Supabase project: `zwvahzymzardmxixyfim`
- Super-Admin: nayeem@smartdetailautospa.com
- Staff: Segundo Cadena (detailer), Joselyn Reyes (cashier), Joana Lira (cashier), Su Khan (admin)
- Email: Mailgun | SMS: Twilio | Payments: Stripe | Workflows: N8N
- All admin pages use `'use client'` behind auth; public pages use Server Components for SEO
- **POS Auth:** HMAC-SHA256 token in `sessionStorage` (`pos_session` key), validated via `X-POS-Session` header. Token utilities in `src/lib/pos/session.ts`, API helper in `src/lib/pos/api-auth.ts`, React context in `src/app/pos/context/pos-auth-context.tsx`, fetch wrapper in `src/app/pos/lib/pos-fetch.ts`
- **POS API routes** use `authenticatePosRequest()` + `createAdminClient()` (service role). Admin routes still use cookie-based `createClient()` + `supabase.auth.getUser()`
- **POS components** use `usePosAuth()` from `pos-auth-context` and `posFetch()` for all API calls. Admin components use `useAuth()` from `auth-provider` unchanged

## Task List
- [x] Fix loyalty points showing as "Discount" on receipt — now shows "Loyalty (X pts)"
- [x] Store coupon code on transactions — receipts show "Coupon (CODE)"
- [x] Notification preferences — 4-toggle system with public unsubscribe page
- [x] Add Account section to customer detail page (portal access status + password reset)
- [x] Portal access toggle (Active/Deactivated) with reactivation support
- [x] Customer sign-in auto-links existing customer records by phone
- [x] Delete customer with double confirmation
- [ ] Test Dashboard sections marked as completed — verify all widgets and data are working correctly
- [ ] Merge duplicate customers feature (detect and consolidate)
- [ ] POS session caching bug — multiple browser tabs cause stale session state; expired session still shows POS screen after hard refresh; investigate sessionStorage sync across tabs

## Next Priority Tasks
- [x] **FIXED: Stripe Terminal WisePOS E connection** — Race condition in `collectPaymentMethod` caused by React 18 Strict Mode double-mounting. Fixed by adding `collectInProgress` state tracking in `stripe-terminal.ts` and `isProcessingRef` guard in `card-payment.tsx`.
- [ ] Setup receipt printer integration for POS

## Customer Portal Redesign

### Design Principles
- Human-friendly language — no jargon, explain what things do
- Grouped cards — related items together with clear headers
- Confirmation dialogs — when turning things off, explain what they'll lose
- Mirror admin patterns — consistent UI language across the app

### Phase 1: Profile Page Redesign ✓
- [x] Card 1: Personal Information (First Name, Last Name, Phone, Email locked)
- [x] Card 2: Communication Channels (SMS/Email toggles with confirmation dialogs)
- [x] Card 3: Notification Preferences (Required items locked, optional with confirmations)
- [x] Card 4: Account Security (Change Password, Sign Out All Devices)
- [x] Human-friendly explanations and tooltips throughout

### Phase 2: Transactions Page ✓
- [x] Summary stat cards at top (Member Since, Total Visits, Lifetime Spend, Loyalty Balance)
- [x] DataTable with columns: Date, Receipt #, Vehicle, Status, Total
- [x] Receipt popup dialog (Print to browser, Email only — no SMS/thermal)
- [x] Reuse `generateReceiptHtml` from POS

### Phase 3: Loyalty Page ✓
- [x] Balance card matching admin design (big number + dollar value + progress bar)
- [x] "How it works" info card with earn/redeem rates in plain language
- [x] DataTable for Points History: Date, Action, Points, Balance, Description

### Phase 4: Vehicles Page ✓
- [x] Group vehicles by type with icons (Car, Bike, Truck, Ship, Plane)
- [x] Cleaner card layout showing Year Make Model, Color, Size, License Plate
- [x] Human explanation: "Add all your vehicles here so we can track their service history"

### Phase 5: Appointments Edit Flow ✓
- [x] "Edit Appointment" button on upcoming appointments
- [x] Change date/time (calendar picker, respects cancellation window)
- [x] Change vehicle (dropdown of customer's vehicles)
- [x] Add/remove services (with live price update)
- [x] Show price difference: "This change will cost $X more" or "You'll save $X"
- [x] Save button with validation (no confirmation needed - explicit user action)

### Phase 6: Dashboard Polish ✓
- [x] Coupons section with explanation: "These discounts are ready to use on your next booking"
- [x] Loyalty points with human explanation: "That's $Y off your next visit"
- [x] Keep coupons on dashboard (inline during booking not yet implemented)
- [x] Moved "Book New Appointment" button to header, right-aligned

## Recent Updates

### Phone → Mobile Labeling (Global)
- All "Phone" field labels changed to "Mobile" across admin, customer portal, auth pages
- Removed "(XXX) XXX-XXXX" description hints; placeholders used instead
- Validation error messages updated to "Enter valid mobile number"
- Phone numbers stored as E.164 (+1XXXXXXXXXX) for Twilio, displayed as (310) 555-1234
- Phone inputs auto-format E.164 pasted values (e.g., +14243637450 → (424) 363-7450)

### Booking Flow Improvements
- **Auto-assign detailer:** Online bookings auto-assign first available detailer (checks for scheduling conflicts if multiple detailers)
- **Customer type auto-set:** Online bookings automatically mark customers as "enthusiast" (removed selector)
- **Vehicle selection UX:** Logged-in customers see saved vehicles as selectable buttons + "Add New Vehicle" toggle
- **Vehicle required:** Booking cannot proceed without selecting or creating a vehicle (customer portal + POS checkout)

### Customer Management Improvements
- **Portal Access Toggle:** Active/Deactivated toggle in customer detail page. Clicking toggles state. Deactivation backs up auth_user_id for easy reactivation. Reactivation can auto-recover by matching email/phone.
- **Sign-in Auto-Link:** Phone OTP sign-in automatically links to existing customer record. Searches multiple phone formats. Handles duplicates by picking oldest record.
- **Delete Customer:** Double confirmation with type-to-confirm. Cascading cleanup of related records. Transactions preserved but unlinked for accounting.
- **Phone Display Fix:** Customer detail page now displays phone in formatted style on load (was showing E.164).

### POS IP Whitelist Security
- **Settings page:** `/admin/settings/pos-security/` with enable/disable toggle (auto-saves)
- **Location names:** Each IP has optional friendly name (e.g., "Office", "Home", "Shop")
- **IPv4 + IPv6:** Supports both address formats
- **How it works:** Middleware checks `pos_ip_whitelist_enabled` and `pos_allowed_ips` from `business_settings` table
- **When enabled:** Only whitelisted IPs can access `/pos/*` routes; others get 403
- **When disabled:** POS accessible from any IP
- **Cache:** 10-second TTL for fast updates during testing
- **Fallback:** Falls back to `ALLOWED_POS_IPS` env var if database unavailable
- **Testing:** Use ngrok (`~/bin/ngrok http 3000`) to test from external locations
- See `docs/POS_SECURITY.md` for full documentation

### Dynamic Business Info
- Business phone/email/address now fetched from database instead of hardcoded constants
- API at `/api/public/business-info` for client components
- Server components use `getBusinessInfo()` from `src/lib/data/business.ts`
- Customer-facing pages (account shell, appointment dialogs) pull from Settings > Business Profile

### Twilio SMS Configuration
- Supabase Phone Auth configured with Twilio
- Use phone number directly in Supabase Auth settings (not Messaging Service SID) to avoid A2P registration issues
- Phone number: +14244010094

## Session Instructions
- Update this file at end of session or when asked
- Reference `docs/PROJECT.md` for full specs, `docs/DASHBOARD_RULES.md` for admin UI structure
- Follow patterns in `docs/CONVENTIONS.md` for component APIs and auth
- POS files: use `usePosAuth()` (not `useAuth`), `posFetch()` (not `fetch`), `authenticatePosRequest()` in API routes
