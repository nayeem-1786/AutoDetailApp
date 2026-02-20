# Booking Flow Audit
Date: 2026-02-20
Method: Full source code read of all 12 booking files + component trace

## Flow Overview
- **Total steps**: 5 (without payment) or 6 (with payment)
- **Step indicator**: Horizontal stepper bar with numbered circles, connector lines, and text labels
- **URL structure**: Single URL `/book` — no URL changes between steps. State is entirely client-side via `useState` in `booking-wizard.tsx`. Query params for pre-fill only: `?service=`, `?rebook=`, `?coupon=`, `?email=`, `?name=`, `?phone=`
- **Entry points**: Direct navigation, service detail "Book This Service" link (`/book?service=slug`), rebook from customer portal (`/book?rebook=appointment_id`), campaign deep-links with pre-filled customer info

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `src/app/(public)/book/page.tsx` | 172 | Server component — fetches data, renders BookingWizard |
| `src/components/booking/booking-wizard.tsx` | 645 | Client orchestrator — manages all state, step transitions, API calls |
| `src/components/booking/step-indicator.tsx` | 79 | Step progress bar (circles + connectors + labels) |
| `src/components/booking/step-service-select.tsx` | 174 | Step 1: Service category tabs + service cards |
| `src/components/booking/step-configure.tsx` | 619 | Step 2: Pricing tiers, vehicle size, mobile toggle, addons, price summary |
| `src/components/booking/step-schedule.tsx` | 381 | Step 3: Calendar date picker + time slot grid |
| `src/components/booking/step-customer-info.tsx` | 425 | Step 4: Customer form + vehicle form (react-hook-form + Zod) |
| `src/components/booking/step-review.tsx` | 783 | Step 5: Full review, coupons, loyalty points, payment options, T&C |
| `src/components/booking/step-payment.tsx` | 220 | Step 6: Stripe PaymentElement (deposit or full payment) |
| `src/components/booking/booking-confirmation.tsx` | 109 | Post-booking success screen |
| `src/lib/data/booking.ts` | 373 | Data layer — service queries, zones, hours, config, rebook data |
| `src/app/api/book/route.ts` | 492 | POST — creates appointment, customer, vehicle, fires webhooks |
| `src/app/api/book/slots/route.ts` | 222 | GET — returns available time slots for a date |
| `src/app/api/book/payment-intent/route.ts` | 58 | POST — creates Stripe payment intent |
| `src/app/api/book/validate-coupon/route.ts` | 517 | POST — validates coupon code, calculates discount |
| `src/app/api/book/check-customer/route.ts` | 239 | POST — checks if customer exists, returns available coupons |

## Step-by-Step Breakdown

### Step 1: Service Selection
- **Component**: `step-service-select.tsx` (174 lines)
- **What the user sees**:
  - H2: "Select a Service"
  - Subtitle: descriptive text
  - **Tabbed categories**: Horizontal tab bar with service category names (e.g., "Detailing", "Ceramic Coatings"). Uses shadcn `Tabs` component. Active tab has lime styling.
  - **Service cards**: Grid of service cards in the active category tab. 1 column on mobile, 2 columns on sm+.
- **Per service card**:
  - Service name (h3, semibold)
  - Description (2-line clamp, if available)
  - Metadata row: duration badge (Clock icon + "1h 30m"), mobile eligible badge (Truck icon + "Mobile")
  - Starting price (computed from pricing model — "From $X" for tiered, exact price for flat, "per unit" for per-unit)
  - ChevronRight arrow on right side
  - **Selected state**: Lime border with ring highlight
- **Data collected**: Selected service object (full BookableService with pricing + addon suggestions)
- **Navigation**: Clicking a service card immediately advances to Step 2
- **Pre-selection**: If `?service=slug` query param, wizard starts at Step 2 with that service pre-selected. If `?rebook=id`, wizard starts at Step 3 with service+config pre-filled from past appointment.
- **Validation**: None — selecting a card IS the action

### Step 2: Configure Service
- **Component**: `step-configure.tsx` (619 lines)
- **What the user sees**:
  - H2: "Configure Your Service"
  - Subtitle: Service name
  - **Pricing selector** (varies by pricing model):
    - **Flat rate**: Static price display, no selection needed
    - **Vehicle size**: 3-column grid of size cards (Sedan, Truck/SUV 2-Row, SUV 3-Row/Van) with prices
    - **Scope**: Full-width tier cards (e.g., "Interior Only", "Full Detail"). If tier is vehicle-size-aware, nested 3-column vehicle size selector appears below
    - **Specialty**: Full-width tier cards
    - **Per unit**: Price-per-unit label + quantity stepper (-, number, +) with min=1 and max=per_unit_max
  - **Mobile service section** (if service.mobile_eligible AND mobile zones enabled):
    - Toggle switch: "Mobile Service — We come to your location"
    - When ON: Address text input + Zone dropdown (shows zone name + surcharge amount)
  - **Addon suggestions** (if service has addon suggestions):
    - H3: "Enhance Your Service"
    - Subtitle
    - Toggle-style cards for each addon: name, description, price, checkbox indicator (lime highlight when selected)
  - **Price summary box** (always visible):
    - Service line item with price
    - Each selected addon with price
    - Mobile surcharge (if applicable)
    - Total (bold, border-top separator)
  - **Navigation**: Back button (outline) + Continue button (lime, disabled until all required selections made)
- **Data collected**: tier_name, price, size_class, is_mobile, mobile_zone_id, mobile_address, mobile_surcharge, addons array, per_unit_quantity
- **Validation before Continue**:
  - Tier selected (if tiered pricing model)
  - Size class selected (if tier is vehicle-size-aware)
  - Mobile address + zone filled (if mobile toggled on)
  - Price > 0

### Step 3: Schedule
- **Component**: `step-schedule.tsx` (381 lines)
- **What the user sees**:
  - H2: "Pick a Date & Time"
  - Subtitle: "Select an available date and time for your appointment."
  - **Two-column layout** (stacks on mobile):
    - **Left: Calendar**
      - Month/year header with left/right chevron navigation
      - Weekday header row (Sun–Sat)
      - Day grid (7 columns): disabled days grayed out (outside booking window or business closed), selected day in lime
    - **Right: Time slots**
      - Before date selection: "Select a date to see available times"
      - Loading: Spinner animation
      - No slots: "No available times on this date. Try another day." + optional waitlist form
      - Slots available: Grid of time buttons (3 columns mobile, 4 on larger). Selected slot gets lime background.
  - **Waitlist form** (if enabled and no slots available):
    - Preferred start/end time dropdowns
    - Notes textarea
    - "Join Waitlist for This Date" button
    - Success confirmation card after submission
  - **Navigation**: Back button + Continue button (disabled until date AND time selected)
- **Data collected**: date (YYYY-MM-DD), time (HH:MM)
- **API call**: On date selection, fetches `GET /api/book/slots?date=YYYY-MM-DD&duration={minutes}` which checks business hours, employee schedules, blocked dates, and existing appointments
- **Date constraints**: Configurable via `booking_config` — default min 1 day ahead, max 30 days ahead
- **Slot interval**: Configurable, default 30 minutes

### Step 4: Customer Info
- **Component**: `step-customer-info.tsx` (425 lines)
- **What the user sees**:
  - H2: "Your Information"
  - Subtitle: "Tell us about yourself and your vehicle."
  - **Customer form** (react-hook-form + Zod validation):
    - First Name (required, min 2 chars)
    - Last Name (required, min 1 char)
    - Phone (required, formatted as user types via `formatPhoneInput()`)
    - Email (required, valid email format)
    - SMS consent checkbox: "I agree to receive appointment updates via text message" + small print about messaging rates and STOP to unsubscribe
    - Email consent checkbox: "I'd like to receive special offers and promotions via email"
  - **Vehicle section**:
    - **If logged-in customer with saved vehicles**: Dropdown to select existing vehicle OR "Add new vehicle" option
    - **Vehicle form fields** (shown for new vehicle or selected "Add new"):
      - Vehicle Type: Radio buttons (Car, Truck, SUV, Van, Other) — styled as pill buttons
      - Size Class: Radio buttons (Sedan, Truck/SUV 2-Row, SUV 3-Row/Van) — shown if `requireSizeClass` is true
      - Year (optional number input)
      - Make (required text input)
      - Model (required text input)
      - Color (optional text input)
  - **Navigation**: Back button + Continue button
- **Data collected**: customer (first_name, last_name, phone, email, sms_consent, email_consent), vehicle (vehicle_type, size_class, year, make, model, color)
- **Pre-fill sources**: Logged-in customer data, rebook data, campaign deep-link URL params
- **Validation**: Zod schema validates all required fields before Continue enabled. Vehicle type and make/model required, size_class required only if `requireSizeClass` prop is true.

### Step 5: Review & Confirm
- **Component**: `step-review.tsx` (783 lines — largest step)
- **What the user sees**:
  - H2: "Review Your Booking"
  - Subtitle: "Please confirm everything looks correct before booking."
  - **Service section**: Service name + tier name (if applicable)
  - **Schedule section**: Date (CalendarDays icon), time + duration (Clock icon), mobile address (Truck icon, if applicable)
  - **Customer info section** (if not portal booking): Name, phone, email
  - **Vehicle section**: Year make model color, vehicle type, size class
  - **Coupons & Discounts section**:
    - Applied coupon display (green card with discount amount, remove button)
    - Available coupons list (fetched in step 4→5 transition): Each shows code, name, eligibility status, reward descriptions, min purchase, expiry countdown. Apply/ineligible buttons.
    - Manual coupon code input field with Apply button
    - Validates via `POST /api/book/validate-coupon`
  - **Loyalty Points section** (portal customers with 100+ points):
    - Points balance display with dollar value
    - Range slider to select points to redeem (increments of 100, each 100 = $5)
    - Discount preview
  - **Payment options** (if `require_payment` is true):
    - **Under $100 total**: Full payment required (no choice)
    - **$100+ total**: Radio buttons for Deposit ($50) vs Pay on Site
    - Pay on Site only available to existing customers (not first-time)
    - Cancellation policy disclaimer (amber card with warning icon)
  - **Price summary**:
    - Service price
    - Addon line items
    - Mobile surcharge
    - Coupon discount (green, negative)
    - Loyalty points discount (amber, negative)
    - **Total** (bold)
    - Payment breakdown (deposit now + due at service)
  - **Terms & Conditions**: Checkbox (required to proceed)
  - **Error display**: Red card if submission fails
  - **Navigation**: Back button + Confirm Booking button (disabled until T&C agreed + not submitting)
- **Data collected**: coupon selection, loyalty points amount, payment option (deposit/pay_on_site), T&C agreement
- **Behavior on Confirm**:
  - If `pay_on_site` selected → skips payment step, calls `POST /api/book` directly
  - If payment required → advances to Step 6
  - If discounts cover full amount (total < $0.50) → skips payment, confirms directly

### Step 6: Payment (Conditional)
- **Component**: `step-payment.tsx` (220 lines)
- **Only shown when**: `require_payment` is true AND payment option is not `pay_on_site` AND grand total >= $0.50
- **What the user sees**:
  - **Loading state**: Centered spinner while Stripe payment intent is created
  - **Error state**: Error message card with Back button
  - **Payment form**:
    - Header: "Deposit Payment" or "Payment Details"
    - **Deposit breakdown** (if deposit): Service total, deposit amount (lime), due at service
    - ZIP code notice: "ZIP code refers to your billing address ZIP code."
    - **Stripe PaymentElement**: Full card form (number, expiry, CVC, ZIP). Dark theme with lime accent. Supports Apple Pay / Google Pay.
    - **Trust badges**: "256-bit SSL Encrypted" + "PCI DSS Compliant" + Powered by Stripe logo
    - **Navigation**: Back button + Pay button ("Pay $50.00 Deposit" or "Pay $X.XX")
- **Payment flow**:
  1. On mount: `POST /api/book/payment-intent` creates Stripe PaymentIntent
  2. On submit: `stripe.confirmPayment()` processes the card
  3. On success: Calls `onPaymentSuccess(paymentIntentId)` → wizard calls `POST /api/book` to finalize
- **Deposit logic**: Services $100+ get $50 deposit; under $100 requires full payment

### Confirmation Screen
- **Component**: `booking-confirmation.tsx` (109 lines)
- **What the user sees**:
  - Large green CheckCircle icon
  - H2: "Booking Confirmed!"
  - Subtitle: "Your appointment has been scheduled. We'll see you soon!"
  - **Appointment details card**:
    - Service name
    - Date (CalendarDays icon + formatted)
    - Time range (Clock icon + start–end)
    - Mobile address (MapPin icon, if applicable)
  - **Total**: Shows $0.00 if fully covered by discounts, otherwise the amount
  - **Coupon reminder** (if coupon applied): "Mention this code — your discount will be applied at time of service."
  - **Navigation**: "Back to Home" button (link to `/`)

## Step Indicator Details
- **Component**: `step-indicator.tsx` (79 lines)
- **Type**: Horizontal stepper bar with numbered circles, connector lines, and text labels
- **Steps shown**:
  - Without payment: Service → Configure → Schedule → Info → Review (5 steps)
  - With payment: Service → Configure → Schedule → Info → Review → Payment (6 steps)
- **Dynamic**: `requirePayment` prop toggles between 5-step and 6-step arrays
- **Visual states**:
  - **Completed step**: Lime circle with white checkmark icon, lime connector line, bold text
  - **Current step**: Lime circle with ring offset highlight (2px ring, 2px offset), bold text
  - **Upcoming step**: Gray circle with step number, muted text, gray connector line
- **Circle size**: h-8 w-8 (32px)
- **Connector**: h-0.5 (2px) horizontal line between circles, flex-1 width
- **Clickable**: No — steps are NOT clickable. Navigation only via Back/Continue buttons
- **Mobile behavior**: Flex layout, circles and labels shrink naturally. Connector lines shrink. No explicit mobile-only logic. Labels are `text-xs` so they fit. On very narrow screens (5+ steps), could potentially get cramped.

## Current Service Selection UI
- **Layout**: Tabbed category navigation + grid of service cards per category
- **Grouping**: Services grouped by their `service_categories` (e.g., "Detailing", "Ceramic Coatings", "Paint Correction")
- **Visual treatment**: Rounded border cards with hover effect. Selected card gets lime border + ring. Category tabs use shadcn Tabs with custom styling.
- **Selected state**: Lime border with `ring-1 ring-lime` on the card
- **Per service card**:
  - Name (h3, semibold)
  - Description (2-line clamp, muted text)
  - Duration badge (Clock icon)
  - Mobile eligible badge (Truck icon + "Mobile")
  - Starting price (varies by pricing model)
  - ChevronRight arrow
- **Mobile behavior**: Single column grid. Tabs wrap if many categories.

## API Routes Summary

| Route | Method | Purpose | Key Operations |
|-------|--------|---------|----------------|
| `/api/book` | POST | Submit booking | Validate price, find/create customer+vehicle, create appointment, assign detailer, fire webhooks |
| `/api/book/slots` | GET | Available time slots | Check business hours, employee schedules, blocked dates, existing appointments |
| `/api/book/payment-intent` | POST | Create Stripe payment | Validates amount >= $0.50, creates PaymentIntent |
| `/api/book/validate-coupon` | POST | Validate coupon code | 10+ eligibility checks, reward calculation, service matching |
| `/api/book/check-customer` | POST | Check existing customer | Phone/email lookup, fetch assigned coupons with eligibility |

## Data Flow

```
book/page.tsx (server)
  ├── Fetches: services, zones, hours, config, CMS toggles
  ├── Pre-selects service from ?service= param
  ├── Fetches rebook data from ?rebook= param
  ├── Checks logged-in customer + vehicles
  ├── Falls back to campaign URL params for customer pre-fill
  └── Passes all data to BookingWizard (client)

BookingWizard (client) — central state manager
  ├── Step 1 → handleServiceSelect() → saves service
  ├── Step 2 → handleConfigureContinue() → saves config (tier, price, addons, mobile)
  ├── Step 3 → handleScheduleContinue() → saves date + time
  ├── Step 4 → handleCustomerContinue() → saves customer/vehicle
  │     ├── Guest: POST /api/book/check-customer → available coupons
  │     └── Portal: GET /api/customer/coupons + /api/customer/loyalty
  ├── Step 5 → handleReviewContinue()
  │     ├── pay_on_site → handleConfirm() → POST /api/book
  │     ├── requirePayment → Step 6
  │     └── discounts cover total → handleConfirm() → POST /api/book
  ├── Step 6 → handlePaymentSuccess() → handleConfirm() → POST /api/book
  └── Confirmation screen shown on success
```

## Server-Side Price Validation

The booking API (`/api/book/route.ts`) performs independent price validation:
- Fetches service + pricing tiers from DB
- Computes expected price based on pricing_model, tier_name, and vehicle size_class
- Compares against submitted price
- Rejects if mismatch (prevents client-side price manipulation)

## Issues Found

1. **[Info] Step indicator not clickable** — ~~Users cannot click completed steps to go back. Must use Back button repeatedly.~~ **FIXED 2026-02-20**: Completed steps are now clickable. Mobile uses compact "Step X of Y" format with dot indicators.

2. **[Info] No URL state** — ~~All booking state is in React useState. If the user refreshes the page at Step 4, they lose all progress and restart at Step 1.~~ **FIXED 2026-02-20**: Key selections (step, service, vehicle, date, time, addons) stored in URL params. Refresh restores progress up to step 4 (customer info must be re-entered).

3. **[Info] Step indicator mobile cramping** — ~~With 6 steps (payment flow), the stepper bar may get cramped on very narrow screens.~~ **FIXED 2026-02-20**: Mobile uses compact format "Step X of Y: Label" with small dot indicators instead of full stepper.

4. **[Info] No edit capability in Review step** — ~~The Review step shows all booking details but individual sections are not clickable/editable. To change the service, user must click Back 4 times.~~ **FIXED 2026-02-20**: Edit links (pencil icon) on Service, Schedule, and Your Information sections. Clicking Edit navigates to that step with all data preserved. Continue returns to Review (returnToReview flow). Same-service re-selection skips reconfiguration.

5. **[Info] Waitlist feature partially wired** — ~~`step-schedule.tsx` accepts `waitlistEnabled` and `onJoinWaitlist` props, but `booking-wizard.tsx` does not pass these props.~~ **FIXED 2026-02-20**: All waitlist code removed from booking flow. Business accepts all requests — staff confirms by calling. Info note added instead.

6. **[Info] Confirmation page has no portal link** — ~~For logged-in customers, the confirmation only shows "Back to Home". No link to customer portal to view the appointment.~~ **FIXED 2026-02-20**: Portal customers see "View My Appointments" button. All customers see "Book Another Service" button. Confirmation email address shown.

7. **[Info] Confirmation shows "Payment collected at time of service"** — ~~Even when a deposit was already charged via Stripe, the footnote says "Payment collected at time of service." This may confuse customers who just paid a deposit.~~ **FIXED 2026-02-20**: Footnote is now conditional — shows deposit charged + remaining balance, full payment processed, pay on site, or fully covered by discounts based on actual payment state.

8. **[Low] No image shown for services** — ~~Service cards in Step 1 show name, description, duration, price, and mobile badge, but no service image.~~ **FIXED 2026-02-20**: Service cards now show thumbnails (from `image_url` field) with category-based fallback icons when no image exists.

9. **[Info] Coupon auto-apply from URL** — ~~The `couponCode` prop is passed from the URL `?coupon=CODE` through to the wizard, but it's only passed to `StepReview` as `couponCode` prop. The auto-apply logic would need the user to reach Step 5 for the coupon to be visible. It is not auto-validated or auto-applied on entry.~~ **FIXED 2026-02-20**: URL coupon auto-applies when reaching Step 5. Uses `autoApplyCouponOnMount` flag tracked in wizard to prevent re-application. Invalid coupons show error but don't block booking.

10. **[Info] Email consent defaults** — `sms_consent` checkbox is checked by default in the customer info form. `email_consent` defaults to false. This matches TCPA compliance requirements (SMS consent is upgrade-only for existing customers). *(No action needed — correct behavior)*

## Component Relationships

```
book/page.tsx
  └── BookingWizard
        ├── StepIndicator
        ├── StepServiceSelect        (Step 1)
        ├── StepConfigure            (Step 2)
        ├── StepSchedule             (Step 3)
        ├── StepCustomerInfo         (Step 4)
        ├── StepReview               (Step 5)
        ├── StepPayment              (Step 6, conditional)
        └── BookingConfirmation      (post-booking)
```

## Booking Config (business_settings)

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Business hours | `business_hours` | Mon-Sat 8-6, Sun closed | Calendar disabled days, slot generation |
| Booking config | `booking_config` | min=1, max=30, interval=30 | Date range limits, slot spacing |
| Payment required | `online_booking_payment` (feature_flag) | true | Shows/hides payment step |
| Mobile service | `mobile_service` (feature_flag) | — | Shows/hides mobile toggle in Step 2 |
| Cancellation fee | `cancellation_fee` (feature_flag) | — | Policy text in Review step |

## Payment Logic Summary

| Condition | What happens |
|-----------|-------------|
| `require_payment = false` | No payment step, "Confirm Booking" goes straight to API |
| `pay_on_site` selected (existing customers only) | No payment step, confirms directly |
| Grand total < $0.50 (discounts cover it) | Payment step skipped, confirms directly |
| Grand total < $100 | Full payment required (no deposit option) |
| Grand total >= $100 | $50 deposit option (recommended) or full payment |
| New customer | Must pay deposit (no Pay on Site option) |
| Existing customer | Deposit or Pay on Site |
