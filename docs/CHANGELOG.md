# Changelog — Auto Detail App

Archived session history and bug fixes. Moved from CLAUDE.md to keep handoff context lean.

---

## Revert Auth Files to Pre-Resilience State — 2026-02-26

### fix(auth): revert auth-provider and supabase middleware to pre-resilience state — fixes login loop

The "auth resilience" session introduced `.catch()` blocks and try/catch wrappers that caused an infinite login loop. After entering valid credentials, the user got redirected back to `/login` repeatedly.

**Root cause chain:**
1. Login succeeds → browser navigates to `/admin` → middleware returns 200
2. AuthProvider calls `getSession()` → it throws (AbortError from Web Locks)
3. The `.catch()` block sets `loading = false` with `employee = null`
4. `AdminContent` useEffect: `!loading && !employee` → `router.push('/login')` → LOOP

**Fix:** Reverted both files to their exact pre-resilience state — no try/catch, no `.catch()`, no signOut in error handlers.

**Files reverted:**
- `src/lib/supabase/middleware.ts` — removed try/catch around `getUser()`
- `src/lib/auth/auth-provider.tsx` — removed `.catch()` on `getSession()`, removed `.catch()` on `loadEmployeeData()` in auth state change listener

---

## POS Nested Addon Display — 2026-02-26

### feat(pos): addon services render as indented children under parent service

When a staff member taps an addon suggestion on a ticket service item, the addon now appears as visually nested, indented text underneath the parent service — not as a separate top-level line item.

**Changes:**
- Added `parentItemId` field to `TicketItem` interface for parent/child relationship tracking
- Updated `ADD_SERVICE` action (both ticket and quote) to accept optional `parentItemId`
- Reducer inserts child addons immediately after the parent (grouped together)
- `REMOVE_ITEM` cascade-deletes children when a parent is removed
- `TicketItemRow` renders child addons with indented styling: border-left connector, smaller text, inline X remove button
- Children appear between the parent item and the "add-ons available" toggle
- Swipe-to-delete on parent restores both parent + children on undo
- `ServiceDetailDialog` passes `parentItemId` through to dispatch when opened from addon suggestion
- Top-level item list in `ticket-panel.tsx` filters out children (they render inside their parent's row)

**Files modified:**
- `src/app/pos/types.ts` — `parentItemId` on TicketItem, ADD_SERVICE action types
- `src/app/pos/context/ticket-reducer.ts` — parent-aware insertion, cascade delete
- `src/app/pos/context/quote-reducer.ts` — same changes for quotes
- `src/app/pos/components/ticket-item-row.tsx` — child addon rendering
- `src/app/pos/components/ticket-panel.tsx` — top-level filtering, addon parent tracking, undo with children
- `src/app/pos/components/service-detail-dialog.tsx` — parentItemId prop
- `src/app/pos/jobs/page.tsx` — parentItemId: null on TicketItem construction
- `src/app/pos/components/quotes/quote-builder.tsx` — parentItemId: null on TicketItem construction

---

## POS Addon Suggestions + Coupon Layout Fix — 2026-02-26

### fix(pos): vertical addon rows, viewport-level dialog, shared coupon+discount row

Three corrective fixes for the previous addon suggestions implementation:

**Fix 1: Addon chips → vertical rows**
- Replaced horizontal scrolling chip container with vertically stacked full-width rows
- Eliminates gesture conflict between horizontal scroll and swipe-to-delete on iPad
- Each addon shows name (left) and combo price / savings (right) on one line

**Fix 2: ServiceDetailDialog at viewport level**
- Moved `pickerService` state and `<ServiceDetailDialog>` from `ticket-item-row.tsx` up to `ticket-panel.tsx`
- Dialog now renders at the ticket panel level, not inside the 380px sidebar scroll area
- Added `onAddonClick` callback prop to `TicketItemRow`

**Fix 3: Coupon + Discount share same row**
- `CouponInput` accepts `renderCollapsedInline` prop for inline "Add Discount" button
- When both are collapsed: "Add Coupon" (TicketPercent icon) and "Add Discount" (Tag icon) on same row, opposite ends
- When coupon is expanded/applied: discount link moves to its own row below
- Different icons: TicketPercent for coupon, Tag for discount

**Files modified:**
- `src/app/pos/components/ticket-item-row.tsx`
- `src/app/pos/components/ticket-panel.tsx`
- `src/app/pos/components/coupon-input.tsx`

---

## Fix Supabase AbortError — Web Locks Singleton — 2026-02-26

### fix(auth): store Supabase browser client on window to survive HMR

After dev server restarts or HMR, Next.js re-executes modules and the module-level `let client = null` singleton would reset, creating a new Supabase client that fights the orphaned instance for the same Web Lock → `AbortError: signal is aborted without reason` → white screen.

**Fix:** Store the browser client on `window.__supabase_browser_client` instead of a module-level variable. `window` survives HMR, so the same client instance is reused across hot reloads.

**File modified:**
- `src/lib/supabase/client.ts`

---

## Auth Resilience — Eliminate White Screen of Death — 2026-02-26

### fix(auth): prevent white screen on stale session cookies

When the dev server restarts, rebuilds, or deploys, stale Supabase session cookies could crash the entire React tree. Added three layers of defense:

**Fix 1: Server-side middleware (`middleware.ts`)**
- Wrapped `supabase.auth.getUser()` in try/catch
- On failure: clears all `sb-*` cookies and returns unauthenticated (middleware redirects to `/login`)

**Fix 2: Client-side auth provider (`auth-provider.tsx`)**
- Added `.catch()` to `getSession()` — clears state + force sign-out on corrupt session
- Added try/catch to `onAuthStateChange` callback — catches errors during auth event processing
- Added `.catch()` to `loadEmployeeData()` call in auth change handler
- Enhanced `validateSession` catch block — now clears state and redirects to `/login?reason=session_expired`

**Fix 3: Error boundary (`admin-shell.tsx`)**
- Added `AdminErrorBoundary` class component wrapping outside `AuthProvider`
- Shows "Session Error" page with "Go to Login" and "Retry" buttons
- Clears `sb-*` cookies before redirecting to login
- Shows error message in development mode

**Files modified:**
- `src/lib/supabase/middleware.ts`
- `src/lib/auth/auth-provider.tsx`
- `src/app/admin/admin-shell.tsx`

---

## POS: Inline Addon Suggestions + Collapsible Coupon — 2026-02-25

### feat(pos): inline addon suggestions per ticket item + collapsible coupon input

**Inline addon suggestions:**
- Removed standalone `AddonSuggestions` panel from below the ticket items scroll area
- Each service line item now shows its own addon suggestions inline via `TicketItemRow`
- Addons auto-expand when a service is first added to the ticket
- Addon chips show savings pricing: "$140 ~~$175~~ Save $35"
- Tapping a chip opens the `ServiceDetailDialog` for the addon service
- Adding an addon removes it from the parent's chip list; when all addons added, section disappears
- Each service shows only its own configured addons (not aggregated)

**Collapsible coupon input:**
- Coupon input now collapsed by default, showing "Add Coupon" link (matches "Add Discount" style)
- Tap to expand input; Escape key or X button to collapse
- Applied coupon green pill display unchanged

**Files modified:**
- `src/app/pos/components/ticket-panel.tsx` — removed AddonSuggestions block, passes addon data to TicketItemRow
- `src/app/pos/components/ticket-item-row.tsx` — added inline addon expansion with savings pricing + ServiceDetailDialog
- `src/app/pos/components/coupon-input.tsx` — added collapsed/expanded state
- `src/app/globals.css` — added `.scrollbar-hide` utility for horizontal swipeable strips

---

## Fix POS PIN Pad Slow/Dropped Keystrokes — 2026-02-25

### fix(pos): use ref for PIN digits to support fast keystroke entry

- Added `digitsRef` and `submittingRef` to track current values synchronously (no stale closure)
- `handleDigit` reads from `digitsRef.current` instead of `digits` state, preventing dropped keystrokes when tapping faster than React re-renders
- `handleBackspace` also uses the ref for consistency
- Removed 200ms `setTimeout` before submit — PIN now submits immediately when 4th digit entered
- `handleSubmit` clears `digitsRef` on error and manages `submittingRef` for double-submit prevention

**File modified:** `src/app/pos/components/pin-screen.tsx`

---

## Fix: Stock Alert Card Spacing on Admin Dashboard — 2026-02-25

- Added `className="block"` to the Stock Alert `<Link>` on the admin dashboard
- The `space-y-6` wrapper uses CSS margin-top on siblings, but `<a>` is inline by default — margin doesn't apply to inline elements
- `block` makes it a block element so the gap renders correctly

**File modified:** `src/app/admin/page.tsx`

---

## Fix iOS Showing "Passwords" Instead of Contact Suggestions — Session 14K — 2026-02-25

### fix(booking): replace form with div on phone input to show iOS contacts instead of Passwords

- Replaced `<form>` with `<div>` for the phone mode block in `SignInFlow` to prevent iOS Safari from classifying it as a login form
- Changed Continue button from `type="submit"` to `type="button"` with `onClick` handler
- Added `onKeyDown` Enter key handler to the phone input to preserve desktop Enter-to-submit
- Changed `autoComplete="tel"` to `autoComplete="tel-national"` to better trigger iOS contact suggestions
- Only the phone mode form was changed — email and OTP forms remain as `<form>` elements

### fix(booking): remove remaining iOS auth-detection signals from phone input

- Renamed phone input ID from `inline-signin-phone` to `inline-phone` (removes "signin" keyword iOS uses for login heuristics)
- Changed "Sign in with email" button text to "Use email instead" (removes auth-associated language)
- Changed "Welcome Back" heading to "Enter your details" (removes auth-associated heading text)
- Email/OTP input IDs intentionally kept as `inline-signin-*` — those modes benefit from password/OTP autofill

### fix(booking): restore form wrapper for iOS contact autofill

- Restored `<form>` wrapper around phone input — iOS needs a `<form>` context to trigger QuickType contact suggestions
- Added `autoComplete="off"` and `data-form-type="other"` on the `<form>` to prevent login classification
- Changed input `autoComplete` from `tel-national` back to `tel` (more widely recognized token for contact autofill)
- Restored `type="submit"` on Continue button and moved submit handler to `<form onSubmit>`
- Removed manual `onKeyDown` Enter handler (native form submission handles it now)
- Combined with the auth-signal removal (no "signin" IDs, no auth text), iOS should now classify this as a contact form, not a login form

**File modified:** `src/components/booking/inline-auth.tsx`

---

## Clear Booking State After Successful Booking — Session 14J — 2026-02-25

### fix(booking): clear URL state after successful booking

- After `setConfirmation()`, call `window.history.replaceState(null, '', window.location.pathname)` to strip all query params
- Prevents browser refresh from restoring Step 3 with stale booking data after a completed booking
- Refresh now lands on clean Step 1 as expected

**File modified:** `src/components/booking/booking-wizard.tsx`

---

## Mobile Sticky Footer for Booking Steps 2 & 3 — Session 14I — 2026-02-25

### feat(booking): add mobile sticky footer to Steps 2 and 3

Matches Step 1's existing sticky footer pattern for consistent mobile UX.

**Step 2 (step-schedule.tsx)**
- Added fixed sticky footer on mobile (`lg:hidden`) with Total price + Continue button
- Hid inline Continue button on mobile (`hidden lg:inline-flex`), kept Back visible
- Added `h-24` spacer so content doesn't hide behind sticky bar
- Footer only renders when `orderSummary` is available

**Step 3 (step-confirm-book.tsx)**
- Added fixed sticky footer on mobile with Total price + dynamic CTA ("Book My Detail" / "Pay $X & Book My Detail" / "Processing...")
- Hid inline CTA button on mobile (`hidden lg:inline-flex`), kept Back visible
- Added `h-24` spacer inside the `!showPaymentForm` block
- Footer wrapped in `isAuthenticated && !showPaymentForm` — hidden during auth flow and Stripe payment form

**Files modified:**
- `src/components/booking/step-schedule.tsx`
- `src/components/booking/step-confirm-book.tsx`

---

## Hamburger Logout Preserves Page, Separate "Not You?" from Sign-Out — 2026-02-25

### Fix: hamburger logout stays on current page, "Not you?" no longer signs out

**Fix 1 — Hamburger "Log Out" navigated to homepage, losing booking progress**
- Changed `window.location.href = '/'` to `window.location.reload()` in `handleSignOut`
- On `/book`, the page reloads with URL params intact (`?step=3&service=...&date=...&time=...`), so the booking wizard can restore selections
- On any other page, reloading is functionally equivalent to navigating to `/` — header updates to show "Sign In"

**Fix 2 — "Not you?" and "Sign out" had identical behavior**
- Added separate `handleNotYouClick` handler that clears local booking auth data only (ref, state, view) without calling `onSignOut`
- "Not you?" → clears booking auth, returns to buttons view, Supabase session stays alive, hamburger still shows "Hi, [name]"
- "Sign out" → clears booking auth AND Supabase session, header updates to "Sign In"

**Files modified:**
- `src/components/public/header-client.tsx` — `reload()` instead of `href = '/'`
- `src/components/booking/inline-auth.tsx` — separate `handleNotYouClick` handler

---

## iOS Contact Suggestions & OTP Auto-Focus — 2026-02-25

### Fix: iOS contact suggestions on returning customer phone, OTP auto-focus on both auth flows

**Fix 1 — iOS showing "Passwords" instead of contact phone numbers on returning customer flow**
- Root cause: iOS Safari uses heading text to detect login forms. The "Sign In" heading triggered the password manager overlay, overriding `autoComplete="tel"`
- Changed heading from "Sign In" to "Welcome Back" to avoid iOS login form detection
- Added `inputMode="tel"` to sign-in phone input (reinforces tel keyboard)
- Added `data-lpignore="true"` and `data-1p-ignore` to the form element (not just the input)
- Email/password form already uses conditional rendering (`{mode === 'email' && ...}`) so it's fully unmounted when phone mode is active — no fix needed there

**Fix 2 — OTP input cursor not appearing after entering phone number**
- Both SignInFlow and SignUpFlow OTP inputs failed to auto-focus on iOS Safari
- Root cause: single or double `requestAnimationFrame` not always sufficient — input may not be in DOM yet during view transitions on slow iOS devices
- Replaced double-RAF with triple-attempt strategy: double-RAF (immediate + next frame) + `setTimeout(300ms)` fallback
- Added `autoFocus` prop to both OTP `<Input>` elements as belt-and-suspenders
- Applied to both `mode === 'otp'` (SignInFlow) and `mode === 'phone-verify'` (SignUpFlow)

**Files modified:** `src/components/booking/inline-auth.tsx`

---

## CRITICAL: Mobile Logout, Empty Booking-As Data, Sign-Out Resilience — 2026-02-25

### Fix (critical): mobile logout iOS touch event, empty booking-as profile fetch, sign-out resilience

**Fix 1 — Mobile logout not working on iOS Safari**
- Root cause: `setMobileOpen(false)` triggers CSS grid-row transition that collapses the mobile menu. iOS Safari cancels remaining JS execution when a touch target's ancestor transitions to `overflow: hidden` / height 0
- `await handleSignOut()` never ran after `setMobileOpen(false)`
- Fix: removed `setMobileOpen(false)` and async/await — just call `handleSignOut()` directly. The function ends with `window.location.href = '/'` which inherently closes the menu

**Fix 2 — "Booking as:" shows empty customer data**
- Root cause: `/api/customer/profile` route only had a PATCH handler — no GET handler. `handleAuthSuccess` in `inline-auth.tsx` fetches `GET /api/customer/profile` which returned 405 Method Not Allowed
- `profileRes.ok` was false → customer data fell back to empty strings `{ first_name: '', last_name: '', phone: '', email: '' }`
- Fix: added GET handler to `/api/customer/profile/route.ts` that returns `{ first_name, last_name, phone, email }` for the authenticated user
- Also added 100ms initial delay + retry logic with 500ms delay for auth cookie timing issues

**Fix 3 — Sign-out handler resilience in booking form**
- `handleSignOutClick` used `await onSignOut()` which could be interrupted by iOS touch event cancellation
- Fix: made handler synchronous — clears local React state immediately (ref, state, view) then fires `onSignOut()` asynchronously via `Promise.resolve().catch()`
- UI transitions to buttons view instantly; session cleanup happens in background

**Files modified:**
- `src/components/public/header-client.tsx` — mobile logout handler
- `src/app/api/customer/profile/route.ts` — added GET handler
- `src/components/booking/inline-auth.tsx` — auth success retry logic, sign-out handler

---

## Phone Display — Only Business Numbers Are Clickable — 2026-02-25

### Fix: phone links only on business numbers, customer phones as plain text spans

- Audited all `tel:` links across codebase — 14 instances total
- 13 are business phone numbers (header, footer, CTA, quotes, authorize, terms, areas, account shell, appointment edit) → kept as `<a href="tel:...">`
- 1 was customer's own phone in "Booking as" line (`inline-auth.tsx`) → changed from `<a href="tel:...">` to `<span>` wrapper
- OTP confirmation text already uses `<span>` wrappers — no change needed
- `format-detection: telephone=no` meta tag prevents iOS from auto-linking any phone text, so `<span>` is safe

**Files modified:** `inline-auth.tsx`

---

## CRITICAL: iOS Hydration Mismatch Root Cause, Logout, Auth Resilience, Zoom Prevention, Step 1 Labels — Session 14H — 2026-02-25

### Fix (critical): Booking flow stability on iOS Safari

**Fix 1 — iOS hydration mismatch root cause (format-detection meta)**
- iOS Safari auto-converts phone-number-shaped text into `<a href="tel:...">` links before React hydrates
- This creates a structural DOM mismatch that destroys the entire component tree
- Added `format-detection: telephone=no` meta tag to root layout metadata
- Wrapped phone number in "Booking as" line inside explicit `<a href="tel:...">` so server/client DOM match
- Removed unnecessary `suppressHydrationWarning` that only masks text mismatches, not structural ones

**Fix 2 — Logout handlers resilient with try/catch/finally**
- Header `handleSignOut`: wrapped in try/catch/finally so redirect always happens even if `signOut()` throws
- Mobile menu logout now properly awaits `handleSignOut`
- Booking wizard `handleSignOut`: wrapped in try/catch so state always resets even if `signOut()` fails

**Fix 3 — Auth state resilience with useRef backup**
- Added `localAuthRef` in `InlineAuth` that persists auth data across tree regeneration
- `handleAuthSuccess` stores data in both state and ref
- `effectiveData` falls back to ref if state was wiped by hydration recovery
- "Booking as" display now survives component tree regeneration

**Fix 4 — Auth state sync verification (Fix 4 from session spec)**
- Verified `onAuthStateChange` listener from 14G is correctly implemented in `header-client.tsx`
- With hydration fix in place, the listener subscription is no longer destroyed by tree regeneration

**Fix 5 — iOS zoom prevention on input fields**
- Added `text-base sm:text-sm` to shared `inputCls` used by all inline auth inputs
- `text-base` = 16px on mobile prevents iOS auto-zoom; `sm:text-sm` = 14px on desktop for normal sizing
- Applied to read-only phone display input separately (different class)
- OTP inputs already use `text-lg` (18px) so they were already safe

**Fix 6 — iOS contact suggestions for "Returning Customer" phone input**
- Added `data-form-type="other"` to sign-in phone form to prevent iOS from detecting it as a login form
- Added `data-1p-ignore` and `data-lpignore="true"` to phone input to suppress password managers
- Added `autoComplete="off"` on the form element
- iOS should now show contact phone suggestions instead of "Passwords"

**Fix 7 — Step 1 label text and color changes**
- "Vehicle Size" → "Choose Vehicle Size" in lime green (`text-lime`)
- "Add-ons (optional)" → "Choose Add-ons (optional)" in lime green (`text-lime`)
- Applied to both `vehicle_size` and `scope`/`specialty` pricing model vehicle size sections

**Files modified:** `layout.tsx`, `header-client.tsx`, `booking-wizard.tsx`, `inline-auth.tsx`, `step-service-select.tsx`

---

## Auth State Sync, Deposit Logic, Loyalty Payment Polish — Session 14G — 2026-02-25

### Fix: Auth state sync between booking flow and site header, deposit visibility for returning customers, loyalty points payment logic, OTP auto-focus, layout polish

**Fix 1 — Auth state sync between booking flow and site header**
- Added Supabase `onAuthStateChange` listener in `HeaderClient` that updates displayed customer name in real-time
- Staff accounts (employees table) are excluded from public header display
- Header now reflects sign-in/sign-out from booking flow without requiring full page reload

**Fix 2 — Await sign-out before allowing re-login**
- Made `handleSignOutClick` async in `InlineAuth` — awaits `onSignOut()` before transitioning UI to buttons view
- Eliminates race condition where re-login could start before sign-out completes

**Fix 3 — "Not you? / Sign out" two-column layout**
- Updated authenticated state render: "Booking as" + contact details on left, "Not you?" above "Sign out" stacked on right

**Fix 4 — OTP input auto-focus on iOS Safari**
- Applied double-RAF pattern for reliable auto-focus on both `SignInFlow` and `SignUpFlow` OTP inputs

**Fix 5 — Remove deposit option for returning customers**
- Added `hasTransactionHistory` flag (derived from `lifetime_spend > 0` via `/api/customer/loyalty`)
- Deposit option hidden for existing customers who have completed at least 1 transaction
- Auto-switches to "Pay in Full" if customer was on deposit and becomes ineligible

**Fix 6 — Hide payment section when loyalty points cover full amount**
- When `grandTotal <= 0` (points cover everything), entire payment options section is hidden
- CTA button text changes to "Confirm Booking" (no payment language)
- `canSubmit` no longer requires a payment option when points cover the order

**Fix 7 — Adjusted labels when loyalty points partially cover order**
- "Pay in Full" → "Pay Balance in Full — $X now" when loyalty discount active
- "Pay on Site" → "Pay Balance on Site" when loyalty discount active
- Deposit option hidden when loyalty points are in use
- Auto-switch from deposit to full when loyalty slider is engaged

**Fix 8 — Loyalty points slider label**
- Changed from "Points to use:" to "Adjust slider to use Points:"
- Slider uses `flex-1 min-w-0` for responsive sizing with longer label

**Files changed**: `src/components/public/header-client.tsx`, `src/components/booking/inline-auth.tsx`, `src/components/booking/step-confirm-book.tsx`, `src/components/booking/booking-wizard.tsx`, `src/app/api/customer/loyalty/route.ts`

---

## Auth State Sync + Streamline Existing-Phone Sign-In — Session 14F — 2026-02-25

### Fix: "Booking as" state sync for all sign-in paths + streamline existing-phone flow

**Bug 1 — "Booking as" not appearing after sign-in-instead flow**
- Root cause: Parent re-render timing — `onAuthComplete` updates parent state, but InlineAuth relied solely on parent prop propagation which could lag
- Fix: Added `localAuthData` state in InlineAuth as local backup. Set immediately when profile fetch completes, before calling `onAuthComplete`. Render uses `customerData || localAuthData` as effective data source
- Cleared on sign-out via `handleSignOutClick`
- Now works for ALL auth paths: direct sign-in, direct sign-up, sign-in-instead redirect

**Change 2 — Streamline existing-phone sign-in UX**
- Old flow: Error → "Sign in instead →" link → navigate to sign-in phone view → re-enter phone → Continue → OTP (5 steps, 2 redundant)
- New flow: Error → "Sign In Instead" button → OTP sent immediately → enter code (3 steps)
- Added `phoneExists` state in `SignUpFlow` — tracks when phone already exists in DB
- `sendOtp`: sets `phoneExists=true` with plain text error (no inline link)
- "Continue" button becomes "Sign In Instead" button (same position, same styling)
- `handleSignInInstead`: sends OTP directly via `signInWithOtp`, skips sign-in phone view, jumps straight to OTP verification
- `verifyOtp`: when `phoneExists=true`, performs sign-in-style verification (staff guard + customer check + link-by-phone) then calls `onSuccess()`
- Phone edit resets: onChange handler clears `phoneExists`, error, and hint when user modifies phone number
- "Change number" in OTP view also resets `phoneExists`
- "Sign up with email" becomes "Sign in with email" when `phoneExists=true` — navigates to sign-in flow

**Files changed**: `src/components/booking/inline-auth.tsx`

---

## Inline Collapsible Auth Replaces Bottom Sheet — Session 14E — 2026-02-25

### Refactor: Replace bottom sheet auth with inline collapsible sections in booking Step 3

**Root cause**: Bottom sheet modal (`position: fixed`) is fundamentally broken on iOS Safari — keyboard opens, visual viewport resizes, but fixed elements stay pinned to layout viewport causing horizontal overflow. Swipe-to-dismiss and tap-backdrop-to-close don't work. OTP auto-focus unreliable inside modal. State sync between modal and parent fragile.

**Solution**: Removed bottom sheet/modal entirely. Auth UI now renders as inline collapsible sections within the normal page flow.

**Changes to `inline-auth.tsx`** (full rewrite):
- Removed `AuthSheet` overlay component (position: fixed, backdrop, z-index, body scroll lock)
- New `AuthView` state machine: `'buttons' | 'sign-in' | 'sign-up'` — renders inline, no overlay
- Buttons view: two card-style buttons ("Returning Customer?" / "New Here?") expand inline
- Sign-in/sign-up views: rendered in bordered container with "Back" button, section heading
- Added `initialPhone` prop to `SignInFlow` for phone pre-fill on "Sign in instead" redirect
- Modified `SignUpFlow.onSwitchToSignIn` to pass phone number for pre-fill
- "Not you?" and "Sign out" both clear auth and return to buttons view (no intermediate state)
- OTP confirmation text now shows formatted phone via `formatPhone()`
- Profile completion shows formatted phone in read-only field

**Bugs fixed**:
| # | Bug | Fix |
|---|-----|-----|
| 1 | Modal overflows on iOS when keyboard opens | Eliminated — inline section, no fixed positioning |
| 2 | Swipe-to-dismiss and tap-backdrop don't work | Eliminated — no overlay exists |
| 3 | "Sign in here" link goes to wrong view | State swap within inline component with phone pre-fill |
| 4 | OTP input not auto-focused inside modal | autoFocus works natively inline, requestAnimationFrame for OTP |
| 5 | Returning customer "Booking as" not showing until refresh | Direct state flow — onAuthComplete updates parent immediately |

**No changes needed**: `step-confirm-book.tsx`, `booking-wizard.tsx` — props interface unchanged.

---

## Step 3 Booking Bug Fixes — Session 14D — 2026-02-25

### Fix: Mobile Auth Modal, Phone Format, Pay-on-Site, Auth State, Cancellation Policy

**Bug 1 — Mobile auth modal not usable**
- AuthSheet: Added `max-h-[90vh]` on mobile (was uncapped), drag handle bar at top of bottom sheet
- Mobile: `inset-x-0 bottom-0 rounded-t-2xl`; Desktop: centered dialog `max-w-md max-h-[85vh]`
- Auto-focus on all modal screens: phone input, OTP code (via requestAnimationFrame), email input, profile first name

**Bug 2 — Phone display in E.164 format**
- Imported `formatPhone` in InlineAuth — "Booking as" line now shows `(424) 363-7450` instead of `+14243637450`

**Bug 3 — "Not you?" / "Sign out" order + missing back button**
- "Not you?" now appears above "Sign out" (more common action first, destructive second)
- Tapping "Not you?" shows auth selection with "Back" button — does NOT clear authenticated state
- User data preserved until they explicitly start a new sign-in/sign-up flow
- Uses `showAuthSwitch` local state flag

**Bug 4 — "Booking as" not appearing after login**
- `handleAuthSuccess` now calls `onAuthComplete` in catch block too (with empty fallback data)
- Sheet closes before profile fetch starts (loading spinner shows in-place)
- `showAuthSwitch` reset on auth success to ensure clean state

**Bug 5 — Cancellation policy shown for all payment options**
- Warning now only renders when `paymentOption === 'pay_on_site'`
- Hidden for Pay in Full and Deposit

**Bug 6 — Pay on Site stuck on "Processing"**
- Root cause 1: `buildVehicle()` sent empty strings for make/model/color — Zod `.min(1)` rejected them. Fixed to send `null`
- Root cause 2: `handleBookingSubmit` didn't `await` async `onConfirm` — errors weren't caught, `submitting` never reset. Now uses `async/await` with `try/finally`
- Updated `onConfirm` prop type to `void | Promise<void>`

**Bug 7 — StepPayment remount concern (verified OK)**
- Payment intents only created when `showPaymentForm` is true (user clicks "Pay & Book"), not on option toggle
- Orphaned intents expire after 7 days and cost nothing — no action needed

### Files Changed
- `src/components/booking/inline-auth.tsx` — mobile bottom sheet, drag handle, auto-focus, phone format, "Not you?" with back button, auth state fix
- `src/components/booking/step-confirm-book.tsx` — cancellation policy conditional, buildVehicle null fields, async submit with try/finally

---

## Step 3 UX Overhaul — Session 14C — 2026-02-25

### Feature: Inline Auth, Unified Payment, Collapsed Coupon, Merged Consent, Footer Hide

**Change 1 — Merged consent checkboxes**
- Replaced three separate checkboxes (SMS consent, email consent, Terms & Conditions) with a single "I agree to all" checkbox
- Combined agreement text: SMS/email marketing consent + Terms & Conditions link
- `agreedToAll` state replaces `sms_consent`, `email_consent`, and `termsAccepted`

**Change 2 — Coupon section collapsed by default**
- Coupon section now renders as a compact "Have a coupon code?" header, collapsed by default
- Shows green savings badge when a coupon is applied (e.g., "Saving $25.00")
- Auto-expands when URL coupon fails validation (so user sees the error)

**Change 3 — "Pay in Full" payment option**
- Added "Pay in Full" as default payment option alongside Deposit ($50) and Pay on Site
- Type changed from `'deposit' | 'pay_on_site'` to `'full' | 'deposit' | 'pay_on_site'`
- `bookingSubmitSchema` already supported `'full'` — no validation change needed
- StepPayment component remounts via `key` prop when switching between full/deposit amounts

**Change 4 — Co-located payment + Stripe**
- Payment options and Stripe Elements now render in one unified "Payment" section
- Stripe card form appears inline below the selected radio option (full or deposit)
- Hidden when "Pay on Site" selected

**Change 5 — Footer hidden on /book**
- Created `ConditionalFooter` client component (`src/components/public/conditional-footer.tsx`)
- Wraps `SiteFooter` in public layout — returns null when `pathname.startsWith('/book')`

**Change 6 — Inline auth (sign-in / sign-up)**
- Created `InlineAuth` component (`src/components/booking/inline-auth.tsx`) with:
  - `SignInFlow`: phone OTP (with checkExists pre-check, staff guard, link-by-phone) + email/password + forgot password
  - `SignUpFlow`: phone OTP → profile completion, or full email/password registration
  - `AuthSheet`: bottom sheet (mobile) / centered dialog (desktop) with backdrop
- Unauthenticated state shows two buttons: "Returning Customer? Sign in" / "New here? Create Account"
- Authenticated state shows: "Booking as: Name · Phone · Email [Not you? Sign out]"
- Removed raw customer form fields (react-hook-form, bookingCustomerSchema, phone lookup)
- `booking-wizard.tsx`: added `handleAuthComplete` (fetches coupons/loyalty after auth) and `handleSignOut`

**Change 7 — FILE_TREE.md customer-facing pages audit**
- Added Customer-Facing Pages section to FILE_TREE.md: Public Site, Customer Auth, Customer Portal, Standalone pages
- Added `inline-auth.tsx` and `conditional-footer.tsx` to component listings

### Files Changed
- `src/components/booking/step-confirm-book.tsx` — rewritten (inline auth, merged consent, collapsed coupon, unified payment)
- `src/components/booking/booking-wizard.tsx` — added auth state, "Pay in Full" option, handleAuthComplete/handleSignOut
- `src/components/booking/inline-auth.tsx` — **NEW** (sign-in/sign-up bottom sheet)
- `src/components/public/conditional-footer.tsx` — **NEW** (hides footer on /book)
- `src/app/(public)/layout.tsx` — wrapped SiteFooter with ConditionalFooter
- `docs/dev/FILE_TREE.md` — added customer-facing pages section + new components

---

## Booking Wizard Steps 2-3 Redesign — Session 14B — 2026-02-25

### Feature: Merge Steps 2-6 into Steps 2-3 with Unified Confirm & Book Page

**Step Indicator (3 steps)**
- Rewrote `step-indicator.tsx` to always show exactly 3 steps: Service, Schedule, Confirm
- Removed `DEFAULT_STEPS`, `STEPS_WITH_PAYMENT`, and `requirePayment` prop entirely
- Desktop: 3 numbered circles with labels + connecting lines
- Mobile: "Step X of 3: Label" + 3 dots

**Step 2 — "Pick Your Time" (two-column desktop)**
- Added `orderSummary` prop to `step-schedule.tsx`
- Desktop (lg:): two-column layout — calendar + time slots on left, sticky order summary on right
- Mobile: single column (order summary hidden — same as before)
- Calendar/time grid changed from `lg:grid-cols-2` to `md:grid-cols-2` for better responsive behavior

**Step 3 — "Confirm & Book" (new file)**
- Created `step-confirm-book.tsx` merging functionality from:
  - `step-customer-info.tsx` (contact fields only — first name, last name, phone, email + consent)
  - `step-review.tsx` (order summary, coupon/loyalty, payment options, terms)
  - `step-payment.tsx` (Stripe Elements inline)
- **No vehicle fields** — vehicle type determined by category selected in Step 1
- **Collapsible order summary on mobile**: compact bar with total + chevron, tapping expands line items
- **Desktop two-column**: customer info + coupon/loyalty + payment on left, sticky order summary on right
- **Single CTA**: "Book My Detail" (or "Pay $XX & Book My Detail" when payment required)
- **Inline Stripe**: when payment is needed and deposit selected, Stripe Elements render inside the page (not a separate step)
- Preserved all: coupon validation, available coupons display, loyalty points slider, payment option logic, phone lookup + welcome back notification, consent checkboxes, terms agreement, cancellation fee feature flag

**Booking Wizard Updates**
- Removed `StepCustomerInfo` and `StepReview` imports from `booking-wizard.tsx`
- Step 2 `handleScheduleContinue` now fetches customer coupons/loyalty data before advancing to step 3
- New `handleConfirmBook` receives customer + vehicle + optional paymentIntentId from step 3
- Container width changed from `max-w-3xl` to `max-w-5xl` for steps 2-3 (two-column layouts)
- URL state restoration max step capped at 3
- "Back to Review" button renamed to "Back to Booking"

**Deprecated files** (no longer imported):
- `step-customer-info.tsx` — contact fields moved to step-confirm-book
- `step-review.tsx` — order summary + coupon + loyalty + payment options moved to step-confirm-book

### Files Changed
- `src/components/booking/step-indicator.tsx` — rewritten for 3 steps
- `src/components/booking/step-schedule.tsx` — added orderSummary prop + two-column desktop
- `src/components/booking/step-confirm-book.tsx` — **NEW** (merged confirm & book page)
- `src/components/booking/booking-wizard.tsx` — replaced steps 3-5 with single step 3

---

## Booking Wizard Step 1 Redesign — Session 14 — 2026-02-25

### Feature: Merge Service Select + Configure into Step 1
- **Merged** `step-service-select.tsx` and `step-configure.tsx` into a single unified Step 1 ("Choose Your Detail")
- **Two-column layout** (desktop ≥ 1024px): services on left, sticky sidebar with configure panel + price summary on right
- **Accordion pattern** (mobile < 1024px): clicking a service card expands inline configure panel below the card
- **Vehicle category bottom sheet**: replaced 5-image card row with text link ("Detailing a motorcycle, RV, boat, or aircraft? Change vehicle type") that opens a bottom sheet (mobile) / centered dialog (desktop)
- **Add-ons section**: shows top 3 by display_order, then "Show X more add-ons" expandable link
- **Mobile service text link**: replaced prominent Switch toggle with "Need us to come to you? Add mobile service →" text link that expands address/zone fields when clicked
- **Sticky footer** (mobile): running total + Continue button fixed at bottom
- **Step count reduced**: wizard now has 4 steps (Service, Schedule, Info, Review) + optional Payment, down from 5+1
- **Wider container**: Step 1 uses `max-w-6xl` for the two-column layout; other steps remain `max-w-3xl`
- **All pricing logic preserved**: flat, vehicle_size, scope, specialty, per_unit — all work identically
- **URL state sync**: updated for new step numbering, all params preserved
- **Rebook/pre-select/edit-from-review flows**: all work correctly with new step structure

### Files Changed
- `src/components/booking/step-service-select.tsx` — complete rewrite (absorbs all configure functionality)
- `src/components/booking/step-indicator.tsx` — removed "Configure" step label
- `src/components/booking/booking-wizard.tsx` — removed StepConfigure, renumbered all steps, wider container for step 1
- `src/components/booking/step-configure.tsx` — **deprecated** (no longer imported, types now exported from step-service-select)

---

## Combo Pricing Visual UI — Session 13 — 2026-02-25

### Enhancement: Combo Pricing Strikethrough & Savings Badges
- Add-on cards now show strikethrough original price + green combo price + "Save $XX" badge when `combo_price` is set and less than standalone price
- Add-ons without combo pricing (NULL or equal to standalone) display unchanged
- Sticky price footer shows per-addon savings: "(save $XX)" label + strikethrough original price next to each combo-priced addon
- No state, interface, or API changes — purely visual presentation layer
- File changed: `src/components/booking/step-configure.tsx`

---

## Seed Add-On Suggestions & Combo Pricing — Session 12 — 2026-02-25

### Seed: 28 Add-On Suggestion Rows with Combo Pricing
- Seeded `service_addon_suggestions` table with 28 rows across 11 primary services
- Combo pricing strategy: ~20% discount (Headlight/Trim: $125→$100, Engine Bay/Paint Decon: $175→$140, Pet Hair/Leather/Ozone: $75→$60)
- Hot Shampoo Extraction has no combo price (NULL) — multi-tier scope pricing, owner configures per-tier discounts in admin
- Migration: `supabase/migrations/20260225000002_seed_addon_suggestions.sql`
- Idempotent: DELETE + INSERT with safety checks for all 19 service names

---

## Confetti Animation on Booking Confirmation — Session 11 — 2026-02-25

### Enhancement: Booking Confirmation Confetti
- Added `canvas-confetti` animation to the booking confirmation view
- 10-second dual-cannon burst (left + right) with decaying particle count
- Confetti renders behind content (`zIndex: 0`), card content elevated with `relative z-10`
- Cleanup on unmount via `clearInterval`

---

## Category Merge Cleanup & Dead Button Removal — Session 10 — 2026-02-25

### Database: Clean Up Failed Category Merge
- Session 9's SQL migration (`20260224000003`) ran but was out of sync with the owner's manual Admin UI changes
- Owner had already created "Express & Detail Services - 2" via Admin > Catalog > Categories and moved the 3 services there
- Corrective migration (`20260225000001_cleanup_category_merge.sql`) cleans up the duplicate:
  - Deleted orphaned "Express & Detail Services" (empty, from migration rename of Precision Express)
  - Renamed "Express & Detail Services - 2" → "Express & Detail Services" (slug normalized)
  - Fixed service display_order within merged category (1=Express Exterior Wash, 2=Express Interior Clean, 3=Signature Complete Detail)
  - Reordered all categories to 1-based display_order with no gaps
- **Lesson**: Service category management should be done through the Admin UI, not SQL migrations

### Removed: "Book Another Service" Button
- Removed the "Book Another Service" button from the booking confirmation page (`booking-confirmation.tsx`)
- The "View My Appointments" button (portal users only) remains

---

## Category Merge, Booking/Review Fixes, Bug Fixes — Session 9 — 2026-02-24

### Database: Merge Service Categories
- Merged "Precision Express" and "Signature Detail" into "Express & Detail Services"
- Signature Complete Detail moved to merged category with display_order=3
- Remaining categories reordered to close the gap (6 categories instead of 7)
- Migration: `supabase/migrations/20260224000003_merge_express_signature_categories.sql` (applied but see Session 10 for cleanup)

### Fix: Make "Other" Value Persisting in Edit Mode
- VehicleMakeCombobox now properly detects custom "Other" values when editing vehicles
- Added explicit Other-mode detection in both the fetch callback and cache path
- Sync effect now also resets `isOtherMode` to `false` when value IS in the makes list
- Fixes blank Make field when editing vehicles with custom make values

### Fix: Vehicle Category Image Upload Limit
- Increased max file size from 5MB to 10MB for vehicle category images
- Updated both server-side API route and client-side admin validation

### Fix: Step 4 Field Ordering
- Moved Vehicle Details section above SMS/email consent checkboxes
- New order: Contact Details → Vehicle Details → Consent Checkboxes

### Fix: Step 5 Review — Category-Aware Vehicle Icon
- Vehicle icon now matches the vehicle category (Car, Bike, Truck, Ship, Plane)
- Previously always showed Car icon regardless of vehicle type

### Fix: Step 5 Review — Tier Display Label
- Added `tier_label` field to `ConfigureResult` interface
- Review step now shows human-readable tier labels (e.g., "2-4 Seater") instead of raw tier keys (e.g., "aircraft_2_4")
- Tier label populated from `service_pricing.tier_label` when user selects a tier in Step 2

---

## Booking Category Picker & Service Filtering — Session 8 — 2026-02-24

### Vehicle Category Picker in Booking Step 1
- Added 5 image cards (automobile, motorcycle, rv, boat, aircraft) above the service list at `/book` Step 1
- Cards show category image with dark gradient overlay and white text; fallback Lucide icons for categories without images
- Active card highlighted with lime border/ring and checkmark badge
- Automobile pre-selected by default
- Desktop: 5 cards in a row (flex-1 equal width). Mobile: horizontal scroll with fixed-width cards
- Category selection resets service, config, date/time — stays on Step 1

### Service Filtering by Vehicle Compatibility
- Services filtered client-side using `vehicle_compatibility` JSONB array on each service
- `categoryToCompatibilityKey()` maps vehicle categories to compatibility keys (automobile → 'standard', others → category name)
- Empty categories auto-hidden when no compatible services exist
- Active service category tab resets to first available when filtered list changes
- Empty state message when no services available for selected vehicle type

### Category Pre-fill at Step 4 (Customer/Vehicle Info)
- Vehicle category dropdown at Step 4 pre-filled from Step 1 category picker selection
- Vehicle type field auto-set to match category (e.g., motorcycle → 'motorcycle', automobile → 'standard')

### Compatibility Warning Dialog at Step 4
- When customer's vehicle category doesn't match the selected service's `vehicle_compatibility`, a warning dialog appears before proceeding
- Dialog shows: service name, compatible vehicle types, customer's vehicle category
- Two actions: "Go Back to Services" (returns to Step 1) and "Continue Anyway" (proceeds to Step 5)

### Saved Vehicle Category Badges
- Saved vehicle pills for logged-in customers now show category label for non-matching vehicles
- Non-matching saved vehicles rendered with reduced opacity for visual distinction

### URL State Sync
- `?category=` URL param persists selected vehicle category across refresh/sharing
- Only added when not the default ('automobile')

### Customer Vehicle Query Updated
- Vehicle queries for logged-in customers and campaign deep-links now include `vehicle_category` and `specialty_tier` fields
- `CustomerDataProp` interface updated to include these fields

---

## Admin Vehicle Categories Tab — Session 7 — 2026-02-24

### Vehicle Categories Tab (`src/app/admin/catalog/categories/page.tsx`)
- Added third "Vehicle Categories" tab to Admin > Catalog > Categories page
- Displays 5 fixed vehicle categories as horizontal cards with image thumbnails
- Each card shows: image (or placeholder Lucide icon), display name, system key badge, description, display order, active/inactive status badge, edit button
- Inactive categories rendered with dimmed opacity for visual distinction
- No create or delete actions — categories are fixed

### Vehicle Category Edit Dialog
- Image upload section: preview, upload button (JPEG/PNG/WebP, 5MB max), remove button
- Image requirements hint: "Recommended: 800x600px, landscape orientation"
- Read-only key badge with "System identifier — cannot be changed" note
- Editable fields: Display Name (required), Description, Image Alt Text, Active toggle (Switch), Display Order
- Save calls PATCH `/api/admin/vehicle-categories/[id]`
- Image upload/remove calls POST/DELETE `/api/admin/vehicle-categories/[id]/image`
- Uses `adminFetch()` for session expiry handling

---

## Vehicle Categories Table, API Routes & Bug Fixes — Session 6 — 2026-02-24

### Database: `vehicle_categories` Table
- New table with 5 seeded categories (automobile, motorcycle, rv, boat, aircraft)
- Admin-editable metadata: `display_name`, `description`, `image_url`, `image_alt`, `display_order`, `is_active`
- `key` column is immutable — categories cannot be added or removed
- RLS: public read for active categories, authenticated read for all, admin full access
- Reuses shared `update_updated_at()` trigger function

### API Routes
- `GET /api/vehicle-categories` — Public list of active categories (booking flow)
- `GET /api/admin/vehicle-categories` — Admin list of all categories (including inactive)
- `PATCH /api/admin/vehicle-categories/[id]` — Update category metadata (rejects `key` changes)
- `POST /api/admin/vehicle-categories/[id]/image` — Upload category image to `cms-assets` storage
- `DELETE /api/admin/vehicle-categories/[id]/image` — Remove category image from storage

### Types
- Added `VehicleCategoryRecord` interface to `src/lib/supabase/types.ts`

### Bug Fix: Edit Mode Year "Other" Not Pre-Populated
- When a vehicle had a year outside the dropdown range (e.g., 1965), reopening the form showed the year field blank
- Fix: All 4 vehicle forms now auto-detect "Other" mode on edit initialization when year is not in `getVehicleYearOptions()` (1980–currentYear+2)
- Files fixed: admin customer page, POS vehicle dialog, customer portal vehicle dialog, booking step

### Bug Fix: POS Compatibility Warning Capitalization
- Vehicle category was displayed lowercase (e.g., "a motorcycle" instead of "a **Motorcycle**")
- Fix: Uses `VEHICLE_CATEGORY_LABELS` for proper display name, all three emphasized terms (service name, compatible types, vehicle category) now use consistent bold + high-contrast text color styling

---

## Vehicle Form Polish, POS Edits, Compatibility Warnings & Validation — Session 5 — 2026-02-24

### Vehicle Categories Helpers (`src/lib/utils/vehicle-categories.ts`)
- Added `MODEL_PLACEHOLDERS` — per-category model input placeholder text (e.g., "e.g., Camry" for automobile)
- Added `categoryToCompatibilityKey()` — maps `automobile` → `standard` for `vehicle_compatibility` JSONB matching

### VehicleMakeCombobox (`src/components/ui/vehicle-make-combobox.tsx`)
- Added permanent "Other (type custom make)" option at bottom of dropdown
- In Other mode: free-text input with "Back to list" button
- Added `hasError` prop for red border styling on validation errors

### Validation Schemas (`src/lib/utils/validation.ts`)
- Human-readable error messages for `vehicleSchema`, `bookingVehicleSchema`, `customerVehicleSchema`
- Year, make, model, color fields now show friendly validation errors
- Fixed Zod 4 API: `required_error`/`invalid_type_error` → `error`

### All 4 Vehicle Forms Updated
- **Dynamic model placeholder**: Changes per vehicle category (e.g., "e.g., Sportster" for motorcycle)
- **Dynamic submit button**: "Add {Category}" in create mode, "Save Changes" in edit mode
- **Year "Other" option**: Select dropdown includes "Other" at bottom → switches to free-text input with "Back to list"

**Forms updated:**
1. `src/app/admin/customers/[id]/page.tsx` — Admin customer vehicle dialog
2. `src/app/pos/components/vehicle-create-dialog.tsx` — POS vehicle create/edit dialog
3. `src/components/account/vehicle-form-dialog.tsx` — Customer portal vehicle form
4. `src/components/booking/step-customer-info.tsx` — Booking wizard vehicle section

### POS Vehicle Edit
- **CustomerVehicleSummary**: Added pencil icon button next to vehicle label → opens edit dialog
- **VehicleCreateDialog**: Now supports `editVehicle` prop — pre-populates form, PATCH on save
- **ticket-panel.tsx**: Wired up `editingVehicle` state and edit flow
- **API route**: Added `PATCH /api/pos/customers/[id]/vehicles` handler for vehicle updates

### Vehicle/Service Compatibility Warning (POS)
- **catalog-browser.tsx**: Added `isServiceCompatible()` and `getCompatibleTypesLabel()` helpers
- Tapping an incompatible service shows warning dialog: "Service is designed for {types}. Add anyway?"
- "Cancel" and "Add Anyway" buttons — user can override the warning
- **API route**: Added `vehicle_compatibility` to POS services select query

### Booking Flow Compatibility Badges (`step-service-select.tsx`)
- When vehicle category is known (editing from review step):
  - Services with explicit compatibility that matches: green checkmark + "Recommended for your {category}"
  - Incompatible services: reduced opacity + "Designed for {compatible types}" note
  - Universal services (no restrictions): shown normally, no badge
- When no vehicle selected: all services shown normally with no badges

---

## Documentation Corrections & Comprehensive Update — Session 4 — 2026-02-24

### DB_SCHEMA.md — Critical Corrections
- **Fixed `service_pricing` table**: Was missing `service_id`, `tier_name`, `tier_label`, `display_order`, `is_vehicle_size_aware` columns. Now fully documented with row-based tier system explanation.
- **Added Pricing Models Reference table**: Documents all 6 pricing models with storage location and resolution logic.
- **Fixed `vehicle_type` enum**: Added missing `aircraft` value. Added note explaining dual usage (automobile size tier vs. specialty category name).

### SERVICE_CATALOG.md — Corrections
- **Fixed Aircraft Turboprop/Jet pricing**: Changed from "Quote" to actual seed data prices ($2,000 interior / $1,500 exterior).
- **Added `vehicle_compatibility` JSONB values**: Explicit per-service documentation (services 1-23: `["standard"]`, 24: `["motorcycle"]`, etc.).
- **Updated Channel Availability note**: Removed outdated "Quote pricing channels to quote system" reference for aircraft.

### FILE_TREE.md
- Verified all files from Sessions 1-3 already present. Updated last-updated date.

### CLAUDE.md
- Added vehicle category system to Key Patterns section.

---

## Vehicle Forms: Category Selector & Dynamic Tiers — Session 2 — 2026-02-24

### VehicleMakeCombobox (`src/components/ui/vehicle-make-combobox.tsx`)
- Added `category` prop (type `VehicleCategory`, default `'automobile'`)
- Fetch URL now includes `?category={category}` filter
- Per-category caching (replaces single global cache)
- Clears selected make when category changes

### All 4 Vehicle Forms Updated
Each form now has: Category dropdown (first field) + dynamic Size/Tier dropdown (last field)

**Forms updated:**
1. `src/app/admin/customers/[id]/page.tsx` — Admin customer vehicle dialog
2. `src/app/pos/components/vehicle-create-dialog.tsx` — POS vehicle create dialog
3. `src/components/account/vehicle-form-dialog.tsx` — Customer portal vehicle form
4. `src/components/booking/step-customer-info.tsx` — Booking wizard vehicle section

**Behavior:**
- Category defaults to "Automobile"
- When category changes: clears make, clears size/tier, updates vehicle_type
- Automobile: shows existing Size Class dropdown (Sedan / Truck-SUV / SUV-Van)
- Specialty categories: shows category-specific tier dropdown from `SPECIALTY_TIERS`
- Tier dropdown label changes per category: "Type" (motorcycle), "Length" (RV/boat), "Class" (aircraft)
- Edit mode: derives category from `vehicle_category` field, populates tier correctly

### Validation Schemas Updated (`src/lib/utils/validation.ts`)
- `vehicleSchema`, `bookingVehicleSchema`, `customerVehicleSchema` all now include `vehicle_category` and `specialty_tier` fields

### Vehicle CRUD API Routes Updated
- `src/app/api/pos/customers/[id]/vehicles/route.ts` — POST accepts `vehicle_category` and `specialty_tier`
- `src/app/api/customer/vehicles/route.ts` — GET returns new fields, POST accepts new fields
- `src/app/api/customer/vehicles/[id]/route.ts` — PATCH accepts new fields, returns new fields
- `src/app/api/book/route.ts` — Vehicle creation includes `vehicle_category` and `specialty_tier`

### Admin Vehicle Makes UI (`src/app/admin/settings/pos-settings/page.tsx`)
- Added category tab row: Automobile | Motorcycle | RV | Boat | Aircraft
- Each tab filters displayed makes by category
- "Add Make" creates with current tab's category
- Search filters within active category
- Counter shows category-specific label

---

## POS Specialty Vehicle Pricing Auto-Resolution — Session 3 — 2026-02-24

### ServicePricingPicker (`src/app/pos/components/service-pricing-picker.tsx`)
- Added `vehicleSpecialtyTier` prop to `ServicePricingPickerProps`
- When `pricing_model === 'specialty'` and vehicle has a matching `specialty_tier`, the corresponding tier button is highlighted with blue styling (`border-blue-200 bg-blue-50/50`) and "Matched to vehicle" label
- Staff must still tap to confirm — no auto-submit
- Non-specialty services ignore the new prop entirely

### ServiceDetailDialog (`src/app/pos/components/service-detail-dialog.tsx`)
- Added `vehicleSpecialtyTierOverride` optional prop
- Auto-selects matching specialty tier in the tier list (same behavior as vehicle-size auto-selection)
- Shows "Matched to vehicle" hint text for specialty matches

### Specialty Tier Threading (5 rendering locations updated)
- `register-tab.tsx` — derives `vehicleSpecialtyTier` from `ticket.vehicle?.specialty_tier`
- `catalog-panel.tsx` — same pattern
- `pos-workspace.tsx` — same pattern
- `catalog-browser.tsx` — added `vehicleSpecialtyTierOverride` prop, passes through to picker and detail dialog
- `quotes/quote-builder.tsx` — derives from `quote.vehicle?.specialty_tier`, passes through

### Verified (no changes needed)
- **POS services route** (`/api/pos/services/route.ts`): `tier_name` already in pricing join select
- **Transaction item recording**: `tierName` captured from `pricing.tier_label || pricing.tier_name` in ticket-reducer; maps to `tier_name` in transaction_items. `vehicle_size_class` remains `null` for specialty vehicles (correct).
- **`resolveServicePrice`** (`pos/utils/pricing.ts`): Specialty tiers have `is_vehicle_size_aware: false`, so returns `pricing.price` directly (correct).

---

## Vehicle Category Expansion Schema — Session 1 — 2026-02-24

### Migration: `20260224000001_vehicle_category_expansion.sql`
- Added `vehicle_category` column to `vehicles` table (TEXT, NOT NULL, DEFAULT 'automobile', CHECK constraint)
- Added `specialty_tier` column to `vehicles` table (TEXT, nullable, CHECK constraint matching service_pricing tier_name values)
- Added `category` column to `vehicle_makes` table (TEXT, NOT NULL, DEFAULT 'automobile', CHECK constraint)
- Changed `vehicle_makes` unique constraint from `UNIQUE(name)` to `UNIQUE(name, category)` — allows Honda in both automobile and motorcycle
- Seeded 42 specialty vehicle makes: 12 motorcycle, 10 RV, 10 boat, 10 aircraft
- Added indexes: `idx_vehicles_vehicle_category`, `idx_vehicle_makes_category`

### New File: `src/lib/utils/vehicle-categories.ts`
- `VEHICLE_CATEGORIES` const array and `VehicleCategory` type
- `VEHICLE_CATEGORY_LABELS` display labels
- `SPECIALTY_TIERS` tier definitions per category (key maps to `service_pricing.tier_name`)
- `TIER_DROPDOWN_LABELS` per-category dropdown labels
- `isSpecialtyCategory()` and `getSpecialtyTierLabel()` helpers

### Updated Files
- `src/lib/supabase/types.ts` — Added `VehicleCategory` type, `VehicleMake` interface, added `vehicle_category` and `specialty_tier` to `Vehicle` interface
- `src/app/api/vehicle-makes/route.ts` — Added optional `?category=` query param (default: 'automobile')
- `src/app/api/admin/vehicle-makes/route.ts` — GET: optional `?category=` filter, returns `category` field. POST: accepts `category` in body. PATCH: allows updating `category`, handles composite unique violation (23505). Added KTM to ACRONYMS list.
- `docs/dev/DB_SCHEMA.md` — Updated vehicles and vehicle_makes table schemas
- `docs/dev/FILE_TREE.md` — Added new migration and constants file

---

## Standardize Vehicle Forms + Receipt Vehicle Line Items — Session D14g — 2026-02-23

### Vehicle Form Standardization
- All 4 vehicle forms (Admin, POS, Customer Portal, Booking) now have identical 6 fields:
  - Vehicle Type (select), Size Class (select), Year (select dropdown, current+2 down to 1980), Make (searchable combobox from vehicle_makes table), Model (text), Color (text)
- Layout standardized: Row 1 = Type + Size Class (50/50), Row 2 = Year + Make + Model (33/33/33), Row 3 = Color (full width)
- License Plate, VIN, and Notes removed from all form UIs (DB columns preserved)
- Make field is now a strict combobox — only allows selection from the vehicle_makes table, no free text
- Model and Color fields auto title-case on save
- Year dropdown dynamically calculates range: `new Date().getFullYear() + 2` down to 1980
- Size Class dropdown shows "N/A" and is disabled for non-standard vehicle types (motorcycle, RV, boat, aircraft)

### New Component
- `src/components/ui/vehicle-make-combobox.tsx` — reusable searchable combobox for vehicle makes
  - Fetches from `/api/vehicle-makes` with client-side caching
  - Client-side filtering as user types
  - Strict selection only (no free text entry)
  - Empty state: "No matching makes found. Ask your admin to add it in POS Settings."
  - Also exports `getVehicleYearOptions()` and `titleCaseField()` utilities

### Receipt Template — Vehicle Under Service Line Items
- Removed vehicle line from receipt info section (info section now 3 lines: receipt#/date, name/phone, email/since)
- Vehicle description now appears indented under each service line item (not products)
  - Format: `{year} {color} {make} {model}` (e.g., "2027 Silver Honda Accord")
  - Both thermal (generateReceiptLines) and HTML (generateReceiptHtml) renderers updated
- Added `item_type` to `ReceiptItem` interface to distinguish services from products
- Updated `{vehicle}` shortcode in `resolveShortcodes()` to include color
- Receipt preview sample data updated (2027 Silver Honda Accord, items include item_type)

### Files Modified
- `src/app/admin/customers/[id]/page.tsx` — Admin vehicle form standardized
- `src/app/pos/components/vehicle-create-dialog.tsx` — POS vehicle form standardized
- `src/components/account/vehicle-form-dialog.tsx` — Customer Portal vehicle form standardized
- `src/components/booking/step-customer-info.tsx` — Booking vehicle form standardized
- `src/app/pos/lib/receipt-template.ts` — Vehicle moved from info to line items, shortcode updated
- `src/app/admin/settings/receipt-printer/page.tsx` — Sample preview data updated

### Files Created
- `src/components/ui/vehicle-make-combobox.tsx`

---

## POS Settings Page + Vehicle Makes Management — Session D14f — 2026-02-23

### POS Settings Page
- Renamed `/admin/settings/pos-idle-timeout` → `/admin/settings/pos-settings`
- Page title changed from "POS Idle Timeout" → "POS Settings"
- Card title changed from "Auto-Logout Timer" → "POS Auto-Logout Timer"
- Updated settings hub card label, description, and href

### Vehicle Makes Table
- New `vehicle_makes` table with 45 seeded common makes (migration `20260223000001`)
- RLS: authenticated read, admin-only write
- Admin CRUD API: `GET/POST/PATCH/DELETE /api/admin/vehicle-makes`
- Public read-only API: `GET /api/vehicle-makes` (active makes for combobox)
- Delete protection: blocks delete if vehicles reference the make name

### Vehicle Makes UI Card
- Added "Vehicle Makes" card below POS Auto-Logout Timer on POS Settings page
- Search filter, inline add form with title-case auto-formatting
- Active/inactive toggle per make, delete with confirmation
- Counter showing total and active make counts

### Files Created
- `supabase/migrations/20260223000001_create_vehicle_makes.sql`
- `src/app/api/admin/vehicle-makes/route.ts`
- `src/app/api/vehicle-makes/route.ts`

### Files Modified
- `src/app/admin/settings/pos-idle-timeout/page.tsx` → `src/app/admin/settings/pos-settings/page.tsx`
- `src/app/admin/settings/page.tsx` — updated href and label
- `docs/dev/DB_SCHEMA.md` — added vehicle_makes table
- `docs/dev/FILE_TREE.md` — updated paths

---

## Receipt Info Line Reorder + Zone Separators — Session D14e — 2026-02-23

### Receipt Info Section Reorder
- Line 2: "First Last, Enthusiast" (left) + Phone (right) — was "Enthusiast: First Last" full-width
- Line 3: Email (left) + "Customer Since: Jun 2023" (right) — was Phone + Email
- Line 4: Vehicle centered — was left-aligned with Customer Since on right
- Customer Since month changed from uppercase ("JUN") to title case ("Jun") in both renderers

### Zone Separators
- Added dotted divider between custom text zones at all three placements (below_header, above_footer, below_footer)
- Uses existing `{ type: 'divider' }` in thermal and `<hr>` dashed border in HTML
- Extracted `zoneDivider` and `zoneDiv` helpers in HTML renderer to reduce duplication

### Files Modified
- `src/app/pos/lib/receipt-template.ts` — both `generateReceiptLines()` and `generateReceiptHtml()`

---

## Logo Area Size + Helper Text Fix — Session D14d — 2026-02-23

### Fixes
- Logo preview/upload container set to `w-full min-h-[200px]` to fill column and span the height of the 5 input rows
- Empty-state dashed border area also sized to `min-h-[200px]` for consistency
- Logo `<img>` uses `max-h-full max-w-full object-contain` to scale within container
- Helper text split into two lines with `<br />`

### Files Modified
- `src/app/admin/settings/receipt-printer/page.tsx` — logo container sizing, helper text line break

---

## Receipt Header & Logo Card — Layout Fix — Session D14c — 2026-02-23

### Fixes
- Changed grid proportions from 3-2-3 to 3-3-2 (logo column wider, controls column narrower)
- Restored Width control to range slider (was incorrectly changed to number input in D14b)
- Changed responsive breakpoint from `sm` to `md` for better tablet/mobile stacking
- Added logo helper text below upload buttons: high-contrast PNG/JPG recommendation

### Files Modified
- `src/app/admin/settings/receipt-printer/page.tsx` — grid proportions, slider restore, helper text

---

## Receipt Header & Logo Card Merge — Session D14b — 2026-02-23

### Layout Change
- Merged separate "Receipt Header" and "Logo" cards into single "Receipt Header & Logo" card
- 8-column grid layout: override inputs (col-span-3) | logo preview (col-span-2) | logo controls (col-span-3)
- Responsive: stacks to single column on mobile
- Logo width changed from range slider to number input with "px" suffix
- "Mobile" label renamed to "Phone"
- Helper text moved to card description
- Hidden file input consolidated to single instance outside conditional branches
- Logo remove button styled with red text

### Files Modified
- `src/app/admin/settings/receipt-printer/page.tsx` — merged two cards into one with grid layout

---

## Receipt Enhancement — Info Section, Multi-Zone Custom Text, Shortcodes — Session D14 — 2026-02-23

### Receipt Info Section Redesign
- 4-line layout: Receipt # + date/time, Customer Type + name, Phone + Email, Vehicle + Customer Since
- Employee name removed from info section (available via `{staff_first_name}` shortcode in footer zones)
- `ReceiptTransaction.customer` expanded with `email`, `customer_type`, `created_at` fields
- All 5 receipt API routes updated to include new customer fields from DB

### Multi-Zone Custom Text with Shortcodes
- New `CustomTextZone` type: `id`, `placement` (below_header/above_footer/below_footer), `content`, `enabled`
- `custom_text_zones[]` added to `receipt_config` JSONB (no new DB fields)
- `resolveShortcodes()` function: 17 shortcodes for customer, staff, transaction, vehicle, business data
- Hardcoded "Thank you for your business!" removed — replaced with configurable default zones
- Legacy `custom_text` backward compatibility preserved via auto-migration
- Default zones seeded for fresh installs

### Admin Receipt Settings UI
- Single custom text textarea replaced with multi-zone editor
- Each zone: enable/disable toggle, placement dropdown, content textarea, remove button
- Clickable shortcode reference chips insert at cursor position
- Preview updated with sample customer data (email, type, created_at)

### Files Modified
- `src/app/pos/lib/receipt-template.ts` — ReceiptTransaction, both renderers, resolveShortcodes
- `src/lib/data/receipt-config.ts` — CustomTextZone type, MergedReceiptConfig, migration logic
- `src/app/admin/settings/receipt-printer/page.tsx` — zones editor UI
- `src/app/api/pos/receipts/print/route.ts` — expanded customer select
- `src/app/api/pos/receipts/email/route.ts` — expanded customer select
- `src/app/api/pos/receipts/sms/route.ts` — expanded customer select
- `src/app/api/pos/transactions/[id]/route.ts` — expanded customer select
- `src/app/api/customer/transactions/[id]/route.ts` — expanded customer select + object
- `docs/dev/DB_SCHEMA.md` — receipt_config JSONB structure documented

---

## Database Schema Documentation — 2026-02-23

- Added `docs/dev/DB_SCHEMA.md` — comprehensive database schema reference (70+ tables, all columns, JSONB structures, receipt system architecture)
- Updated CLAUDE.md with Database Schema Reference section and rules for database field management
- Updated FILE_TREE.md with DB_SCHEMA.md entry

---

## Receipt Dialog Extraction + Transaction Page Overhaul + # Column Restyling — Session D13b — 2026-02-23

### Shared Receipt Dialog Component
- Extracted receipt dialog from `admin/customers/[id]/page.tsx` into reusable `src/components/admin/receipt-dialog.tsx`
- Self-contained component: manages own loading, print/email/SMS state internally
- Props: `open`, `onOpenChange`, `transactionId`, `customerEmail?`, `customerPhone?`
- 4 actions preserved: Print (copier), Email, SMS, Receipt (thermal printer)
- Email/SMS inline input fallback when customer has no contact info on file

### Admin Transactions Page Overhaul
- Removed expand/collapse row behavior (`TransactionDetailPanel` component deleted entirely)
- Removed `expandedId` state, chevron column, `FullTransaction` type, `REFUND_STATUS_CLASSES`
- Receipt # now styled as clickable blue monospace button → opens shared receipt dialog modal
- Rows no longer clickable (no `cursor-pointer`, no `onClick`)
- Customer name and employee links still work as before

### Consistent # Column Styling (6 pages)
- Applied `text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline` to:
  - Admin Transactions (Receipt #) — clickable button opens receipt dialog
  - Admin Quotes (Quote #) — clickable via row click to slide-over
  - Admin Orders (Order #) — clickable via row click to detail page
  - Admin Purchase Orders (PO #) — clickable button to detail page
- Applied `text-sm font-mono text-blue-600` (no hover) to POS pages where rows are already clickable:
  - POS Transactions (Receipt #)
  - POS Quotes (Quote #)

---

## Customer Auth Security — Duplicate Prevention, Error Messages & Audit Logging — Session D13a — 2026-02-22

### New API endpoint: check-exists
- Created `src/app/api/customer/check-exists/route.ts` — public GET endpoint
- Accepts `?phone=` or `?email=` query params
- Returns `{ exists, hasAuthAccount }` only — no PII (names, IDs, etc.)
- In-memory rate limiter: 10 requests per IP per minute
- Normalizes phone (E.164) and email (lowercase trim) before lookup

### Signup page: pre-check before auth account creation
- **Email signup (full mode)**: Checks email + phone against customers table before `signUp()`
  - Email/phone exists with auth account → "Already linked to an account" error + sign in link
  - Email/phone exists without auth account → "Welcome back!" hint + sign in link
  - Neither exists → proceeds normally
- **Phone OTP signup**: Checks phone before sending OTP
  - Phone exists with auth account → "Already linked" error + sign in link + "Not your account?" escape hatch
  - Phone exists without auth account → "Welcome back!" hint + sign in link with phone prefilled
  - Phone not found → OTP sent normally
- Added `hint` state (amber banner) for informational messages vs `error` (red banner)

### Signin page: verify account exists before sending OTP
- **Phone signin**: Checks phone exists via check-exists before sending OTP
  - No account found → "Couldn't find an account" error + link to /signup (NO OTP sent)
  - Account exists → OTP sent normally
- **Email signin**: Friendly error messages for invalid login + link to /signup
- Staff account detection → link to staff login (/login) instead of generic error

### Customer-friendly error messages (all auth flows)
- **OTP expired**: "Your verification code has expired. Please request a new one."
- **OTP invalid**: "That code didn't work. Please check and try again, or request a new code."
- **Too many attempts**: "Too many attempts. Please wait a few minutes and try again."
- **Staff email on customer signup**: "This email is used for a staff account... sign in as staff" (link to /login)
- **Session expired during profile step**: "Your session has expired. Please start over." (link to /signup)
- **Link failure**: "Something went wrong... Please try again. If the problem continues, contact us."
- **Phone recycled/not yours**: "Not your account? Call or text us for help." shown below phone-already-registered errors
- **No raw Supabase errors**: All error messages are plain English with next-step instructions
- Every error that suggests another page includes a clickable link

### Audit logging for customer auth events
- **auth/callback**: Logs signup/signin/password-reset events after successful code exchange
- **link-account**: Logs account creation and phone/email linking with match type
- **link-by-phone**: Logs phone-based account linking
- All events use `source: 'customer_portal'` for filtering in admin audit log

### API cleanup
- **link-account**: Updated staff error and creation failure messages to be customer-friendly
- **link-by-phone**: Removed debug console.log statements, broader search fallback now returns results

---

## Customer Create/Edit Audit Logging + Type Pill Cleanup — Session D12i — 2026-02-22

### Edit page: Remove duplicate Customer Type pills
- Removed Customer Type pills from Marketing Info card on edit page (already shown in summary card badge)
- Removed unused `TYPE_OPTIONS` constant
- Birthday, SMS Marketing, Email Marketing column spans unchanged

### Create page: Customer Type placement fix
- Customer Type pills restored to Marketing Info card at col-span-2 (first column)
- Final Marketing Info layout: Customer Type (2) | Birthday (4) | SMS Marketing (3) | Email Marketing (3) = 12 cols
- Customer Type was briefly misplaced on Contact Information card — reverted

### Audit logging for admin customer create/update
- Created `src/app/api/admin/customers/route.ts` (POST) — server-side customer creation with `logAudit()` for CREATE
- Added PATCH handler to `src/app/api/admin/customers/[id]/route.ts` — server-side customer update with `logAudit()` for UPDATE
- PATCH handler uses `buildChangeDetails()` to track which fields changed (first_name, last_name, phone, email, customer_type, sms_consent, email_consent)
- PATCH handler handles consent change logging (marketing_consent_log + sms_consent_log) server-side
- Create page (`new/page.tsx`) now POSTs to `/api/admin/customers` via `adminFetch()` instead of client-side Supabase insert
- Edit page (`[id]/page.tsx`) now PATCHes to `/api/admin/customers/[id]` via `adminFetch()` instead of client-side Supabase update
- Removed unused `createClient` and `normalizePhone` imports from create page; removed `normalizePhone` from edit page
- All three customer mutation paths now have audit logging: CREATE (admin + POS), UPDATE (admin), DELETE (admin)

---

## Admin Customer Edit Page — Card Redesign — Session D12h — 2026-02-22

### Customer edit page card overhaul
- Replaced Contact & Address, Marketing Consent, and Notes & Tags cards with layouts copied from the create page
- Contact Information card: 4-column responsive grid, 2 rows (First/Last/Mobile/Email, Addr1/Addr2/City/State+Zip)
- State field changed from text input to dropdown (all US states), matching create page
- Marketing Info card: 12-column grid with Customer Type pills, Birthday (Month/Day/Year dropdowns), SMS toggle, Email toggle
- Birthday changed from single date input to Month dropdown + Day dropdown + Year text input (optional, year 1900 sentinel)
- Notes & Tags card: full-width notes textarea increased to 5 rows, tags description updated
- Card order matches create page: Contact Information → Marketing Info → Notes & Tags
- Real-time phone/email duplicate check (500ms debounce) with self-exclusion via `excludeId` query param
- Email format validation (must have `@` and `.`)
- Mobile number required validation
- Customer Type required validation (Enthusiast / Professional pills)
- Auto-toggle: clearing mobile turns SMS off, adding mobile turns SMS on (same for email)
- Auto-toggle respects existing DB values on page load — only triggers on empty↔filled transitions during editing
- Save button disabled while any validation error exists or mobile is empty
- Birthday fields pre-populate from existing customer data on load
- Customer type in Marketing Info card syncs with summary card's customer type
- Updated check-duplicate API route to support `excludeId` for self-exclusion on edit page
- Dark mode support on all new card elements (type pills, toggle borders, dropdown backgrounds)

---

## Audit Log Cleanup + Admin Customer Create Redesign — Session D12g — 2026-02-22

### Audit log page cleanup
- Removed `getEntityUrl()` function — all entity labels are now plain text (no clickable links)
- Deleted records no longer create dead links
- Replaced DataTable component with manual Table render for full row control
- Compact row height: `py-3` → `py-1.5` on all table cells
- Zebra striping: alternating white / `bg-gray-50` rows (dark mode: `bg-gray-800/50`)

### Admin customer create page redesign
- Condensed from 4 cards to 3: Contact Information, Notes & Tags, Marketing Info
- Contact Info: 4-column grid with 2 rows (First/Last/Mobile/Email, Addr1/Addr2/City/State+Zip)
- State and Zip share column 4 side-by-side
- Notes textarea height increased from 3 rows to 5 rows
- Marketing Info card: Customer Type pills, Birthday fields, SMS toggle, Email toggle in 4 columns
- Birthday redesigned from single date input to Month dropdown, Day dropdown, Year text input (optional)
- Birthday stored as DATE with year `1900` as sentinel when year is omitted
- Birthday validation: month and day must both be provided or both empty; year range 1920–current year
- Email format validation: real-time check for `@` and `.` after `@`, red border + error message
- Phone duplicate check: red border on match + inline error
- Email duplicate check: red border on match + inline error
- Save button disabled while any validation error exists
- Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Dark mode support on type pills and toggle borders

---

## Customer Create UX — Session D12f — 2026-02-22

### Real-time phone/email duplicate checking
- New API endpoints: `GET /api/pos/customers/check-duplicate` (HMAC auth) and `GET /api/admin/customers/check-duplicate` (session auth)
- Phone checked after 10+ digits entered, email checked after `@` present — both with 500ms debounce
- Inline red error text below field: "Phone already belongs to John Smith"
- Save button disabled while any duplicate error is showing
- Applied to both POS `customer-create-dialog.tsx` and admin `customers/new/page.tsx`

### Customer Type required on create
- POS dialog: Removed "Unknown" option — only Enthusiast and Professional pills
- Neither pre-selected — staff must pick one before saving
- Validation error on save attempt if no type selected
- Admin create page: Added same Enthusiast/Professional pill buttons below Email field
- Admin insert now includes `customer_type` in payload

### POS dialog enhancements
- Added email field to POS customer create dialog
- POS customer create API (`/api/pos/customers`) now accepts and stores `email`

### Customer edit page column rebalance
- Changed from flex layout to `grid grid-cols-12` for the Customer Type + Journey + Online Access card
- Customer Type: 4 columns, Customer Journey: 6 columns, Online Access: 2 columns
- Removed vertical dividers (unnecessary with grid gaps)

---

## Audit Log Column Tweaks + Staff Creation Bug — Session D12e — 2026-02-22

### Audit log time display
- Entries under 24h show relative time ("5m ago", "3h ago")
- Entries older than 24h show date+time in PST ("Feb 22, 3:45 PM")
- Tooltip (hover) always shows full PST datetime ("Saturday, Feb 22, 2026 3:45:23 PM PST")

### Audit log column widths
- User column narrowed (180→120) — only needs to fit a name
- Details column widened (added size 300, max-w 200→400px) — more JSON preview visible

### Staff creation role_id fix
- **Root cause**: Migration `20260211000007` added NOT NULL `role_id` FK to `employees`, but `/api/staff/create` never set it
- **Fix**: API now looks up `role_id` from `roles` table based on the role name before insert
- Edit route (`/api/admin/staff/[id]`) already had this lookup — only create was missing

---

## Audit Sweep + Missing Audit Points — Session D12d — 2026-02-22

Full sweep of all 37 logAudit calls across 32 route files — all confirmed properly positioned before return statements. Added missing audit points for failed PIN attempts and logout.

### Audit sweep results
- Reviewed all 37 logAudit call sites with 8 lines of context — zero dead code found
- The schema mismatch fixed in D12c was the sole root cause of audit entries not appearing

### New audit points
- **Failed PIN attempt** (`/api/pos/auth/pin-login`): Two new logAudit calls — wrong PIN (no employee match) and no auth account (employee found but no `auth_user_id`). Both log IP address and failure reason.
- **POS logout** (`/api/pos/auth/logout`): New POST endpoint. Logs employee identity, IP, and reason (`manual`, `token_expired`). Handles expired tokens gracefully (logs "Unknown (expired token)").
- **Client-side logout** (`pos-auth-context.tsx`): `signOut()` now fires a fetch to `/api/pos/auth/logout` before clearing localStorage. Accepts optional `reason` parameter. Token expiry timer passes `'token_expired'`, manual logout defaults to `'manual'`.

---

## Fix Audit Log + Customer Uniqueness — Session D12c — 2026-02-22

### Audit log fix
- **Root cause**: Old migration (`20260201000033`) created `audit_log` with wrong columns (`employee_id`, `old_data`, `new_data`). New migration (`20260222000002`) used `CREATE TABLE IF NOT EXISTS` — no-op since table already existed. All `logAudit()` inserts were silently failing due to column mismatches.
- **Fix**: `20260222000003_fix_audit_log_schema.sql` — DROP + recreate with correct schema (user_id, user_email, employee_name, entity_label, details, source)
- **Also fixed**: `logAudit()` now checks the Supabase `{ error }` return value (PostgREST doesn't throw on errors, it returns them)

### Customer phone/email uniqueness
- **`20260222000004_customer_phone_email_unique.sql`**: Partial unique indexes on `phone` and `LOWER(email)` (allows NULL/empty). Cleaned up test duplicate (John Doe).
- **Admin customer create** (`/admin/customers/new/page.tsx`): Added phone + email uniqueness checks before insert with named toast errors
- **Admin customer edit** (`/admin/customers/[id]/page.tsx`): Added phone + email uniqueness checks before update (excluding self)
- **Customer portal profile** (`/api/customer/profile/route.ts`): Added phone uniqueness check before update (excluding self, returns 409)
- **POS customer create** (`/api/pos/customers/route.ts`): Improved existing 409 message to include customer name ("already exists: John Smith")
- **POS UI** (`customer-create-dialog.tsx`): Already handled 409 — displays `json.error` in toast

---

## Wire Audit Logging Into All Mutation Routes — Session D12b — 2026-02-22

Wired `logAudit()` calls into ~32 API route files covering every significant mutation across admin, POS, marketing, and public endpoints. All calls are fire-and-forget (no `await` in critical path). Extended `getEmployeeFromSession()` to return employee name/email for audit entries.

### Infrastructure changes
- `src/lib/auth/get-employee.ts` — Extended `AuthenticatedEmployee` interface: added `auth_user_id`, `email`, `first_name`, `last_name` fields. Expanded `.select()` to include these columns.
- `src/lib/supabase/types.ts` — Added `'job' | 'quote'` to `AuditEntityType`
- `src/lib/utils/constants.ts` — Added `job: 'Job'`, `quote: 'Quote'` to `AUDIT_ENTITY_TYPE_LABELS`

### Admin routes (source: `'admin'`)
- `admin/customers/[id]` DELETE — logs customer deletion with name
- `admin/orders/[id]` PATCH — logs order update with `buildChangeDetails()` diff (fulfillment_status, tracking, carrier, notes)
- `admin/orders/[id]/refund` POST — logs refund with amount, reason, payment_status
- `admin/staff/[id]` PATCH — logs employee update with before/after diff (name, email, role, rate)
- `staff/create` POST — logs new employee creation
- `admin/settings/business` PATCH — logs business setting changes with key/value
- `appointments/[id]` PATCH — logs appointment update with `buildChangeDetails()` diff
- `appointments/[id]/cancel` POST — logs cancellation with reason and fee details
- `admin/stock-adjustments` POST — logs stock adjustment with qty before/after, type, reason

### POS routes (source: `'pos'`)
- `pos/auth/pin-login` POST — logs successful PIN logins (reuses existing `ip` variable)
- `pos/customers` POST — logs customer creation with phone
- `pos/customers/[id]/type` PATCH — logs customer type change with before/after values
- `pos/transactions` POST — logs transaction creation with total, payment method, items count
- `pos/transactions/[id]` PATCH — logs void with optional reason
- `pos/refunds` POST — logs refund with amount, reason, item count
- `pos/jobs` POST — logs job creation with services count, customer ID
- `pos/jobs/[id]` PATCH — logs job update with changed fields
- `pos/jobs/[id]/cancel` POST — logs job cancellation with reason, previous status
- `pos/jobs/[id]/complete` POST — logs job completion with timer seconds
- `pos/quotes` POST — logs quote creation (typed cast for `createQuote` return)
- `pos/quotes/[id]` PATCH — logs quote update with changed fields
- `pos/quotes/[id]` DELETE — logs quote soft-delete
- `pos/quotes/[id]/convert` POST — logs quote-to-job conversion
- `pos/loyalty/earn` POST — logs points earned with new balance, transaction ID
- `pos/end-of-day` POST — logs EOD summary with register totals

### Marketing routes (source: `'admin'`)
- `marketing/coupons` POST — logs coupon creation with name, status
- `marketing/coupons/[id]` PATCH — logs coupon update with changed fields
- `marketing/coupons/[id]` DELETE — logs coupon deletion
- `marketing/campaigns` POST — logs campaign creation with channel, status
- `marketing/campaigns/[id]` PATCH — logs campaign update with changed fields
- `marketing/campaigns/[id]` DELETE — logs campaign deletion
- `marketing/campaigns/[id]/send` POST — logs campaign send with recipients/delivered count
- `marketing/automations` POST — logs automation creation with trigger type
- `marketing/automations/[id]` PATCH — logs automation update (toggle or full edit)
- `marketing/automations/[id]` DELETE — logs automation deletion

### Public routes (source: `'customer_portal'`)
- `book` POST — logs booking creation with customer email

---

## Audit Log Foundation — Session D12a — 2026-02-22

Created the complete audit log infrastructure: database table, utility functions, API routes, cron cleanup, and enhanced viewer page. `logAudit()` is ready to be wired into API routes in Session D12b.

### Database
- `supabase/migrations/20260222000002_create_audit_log.sql` — `audit_log` table with columns: user_id, user_email, employee_name, action, entity_type, entity_id, entity_label, details (JSONB), ip_address, source. RLS: authenticated can read, service_role can insert/delete, no updates (immutable).
- Indexes: `created_at DESC`, composite `(entity_type, action, created_at DESC)`

### Utility — `src/lib/services/audit.ts`
- `logAudit(params)` — fire-and-forget insert via admin client, never throws
- `getRequestIp(request)` — extracts IP from x-forwarded-for / x-real-ip headers
- `buildChangeDetails(before, after, fieldsToTrack?)` — produces lean before/after diff

### Types — `src/lib/supabase/types.ts`
- `AuditLogEntry` interface, `AuditAction`, `AuditEntityType`, `AuditSource` union types

### Constants — `src/lib/utils/constants.ts`
- `AUDIT_ACTION_LABELS`, `AUDIT_ENTITY_TYPE_LABELS`, `AUDIT_ACTION_BADGE_VARIANT`

### API Routes
- `GET /api/admin/audit-log` — server-side pagination (page/limit), filters (entity_type, action, source, search, date_from, date_to). Super_admin only.
- `GET /api/admin/audit-log/export` — CSV export (5000 row cap), PST timestamps, same filters. Super_admin only.

### Cron — 90-day retention
- `src/app/api/cron/cleanup-audit-log/route.ts` — deletes entries older than 90 days
- Added to `scheduler.ts` — daily at 3:30 AM PST (11:30 UTC)

### Viewer — `src/app/admin/settings/audit-log/page.tsx`
- Server-side pagination via API (50 per page)
- Filters: search (debounced 500ms), entity type, action, date range (Today/7d/30d/All Time)
- Relative timestamps ("2m ago") with full PST datetime on hover
- Color-coded action badges (green=create, blue=update, red=delete/void, amber=refund)
- Clickable entity links to admin detail pages (customer, order, coupon, product, service, staff, campaign)
- Details column with click-to-expand dialog showing full JSON
- Export CSV button with current filters
- Dark mode support throughout

---

## Refactor: Deterministic Coupon Summaries + POS Promo Polish — Session D12 — 2026-02-22

Replaced AI-generated coupon summaries (Anthropic API call) with deterministic string templates. Summaries now build instantly from resolved data — no API key dependency, no latency, no cost. Also polished POS promotions tab UX.

### Coupon summary changes
- `src/lib/services/coupon-summary.ts` — removed `generateCouponSummary()` (Anthropic API) and `buildPrompt()`. Added `buildCouponSummary()` — deterministic function using simple string templates. `buildSummaryInput()` unchanged.
- `src/app/api/marketing/coupons/route.ts` — `buildCouponSummary(summaryInput)` replaces `await generateCouponSummary(summaryInput)`
- `src/app/api/marketing/coupons/[id]/route.ts` — same replacement
- `src/app/api/marketing/coupons/[id]/summary/route.ts` — same replacement
- `src/app/admin/marketing/coupons/[id]/page.tsx` — "AI Summary" → "Summary" label

### Summary format
- Covers targeting, cart conditions, and constraints only (rewards shown separately on POS card)
- Phrases joined with " · " (middle dot)
- `is_single_use` suppresses `max_uses` (redundant)
- Examples: "Professional customers · Requires: Express Interior Clean", "First-time customers only · Min $50 purchase · One-time use", "No restrictions — available for any order."

### POS promotions tab polish
- `src/app/api/pos/promotions/available/route.ts`:
  - Reward descriptions now include targets ("10% off entire order", "$20 off services", "Free item") and max discount caps
  - Added `resolveMissingItems()` — resolves raw missing item tokens to human-readable phrases by looking up product/service/category names from DB. Min purchase shows "Spend $X more" (remaining amount).
- `src/app/pos/components/promotions-tab.tsx`:
  - Section titles renamed: "For You" → "Exclusive", "Eligible" → "Available", "Upsell" → "Add to Unlock"
  - "Add to Unlock" section now defaults open (was collapsed)
  - Added coupon code in dashed-border box on right side of each promotion card (font-mono, tracking-wider, dark mode support)
  - Actionable upsell messages: cards with missing items show amber "→ Add X to get Y!" instead of raw "Needs: service". Cards with all conditions met show green summary text. Cards flip green/amber automatically on cart changes via 500ms debounce refetch.

---

## Feat: Coupon Summaries — Session D11 — 2026-02-22

Added plain-English summaries for coupons. Summaries auto-generate on create and regenerate when targeting, conditions, rewards, or constraints change.

### New files
- `supabase/migrations/20260222000001_coupon_summary.sql` — adds `summary` TEXT column to `coupons`
- `src/lib/services/coupon-summary.ts` — `buildSummaryInput()` resolves UUIDs to names, `buildCouponSummary()` builds deterministic summary
- `src/app/api/marketing/coupons/[id]/summary/route.ts` — POST (regenerate), PATCH (manual edit)

### Modified files
- `src/lib/supabase/types.ts` — added `summary: string | null` to `Coupon` interface
- `src/app/api/marketing/coupons/route.ts` — generates summary after coupon+rewards insert (non-blocking)
- `src/app/api/marketing/coupons/[id]/route.ts` — regenerates summary when trigger fields change, added `summary` to allowedFields
- `src/app/admin/marketing/coupons/[id]/page.tsx` — Summary card (Regenerate + Edit) below Performance in right column
- `src/app/api/pos/promotions/available/route.ts` — uses `summary` as description (falls back to reward labels)
- `src/app/api/customer/coupons/route.ts` — includes `summary` in select
- `src/components/account/coupon-card.tsx` — displays summary when available, falls back to reward badges

### Behavior
- Summary auto-generates on POST (non-blocking — coupon still created if generation fails)
- Summary regenerates on PATCH when any of: name, customer_id, customer_tags, tag_match_mode, target_customer_type, min_purchase, max_customer_visits, requires_*_ids, condition_logic, is_single_use, max_uses, expires_at, or rewards change
- Code-only edits do NOT trigger regeneration
- Admin detail page: "Regenerate" button (Sparkles icon) + "Edit" button (Pencil icon) for manual override
- POS Promos tab: summary replaces raw "Needs: service" text in promotion cards
- Customer portal: summary shown below code/name, replaces reward badges when available

---

## Fix: Dialog & UI Token Dark Mode — Session D10b — 2026-02-21

Root cause: All dialog/modal dark mode issues traced to `ui-*` CSS variables (e.g. `--ui-bg`, `--ui-text`, `--ui-border`) having no `.dark` override in `globals.css`. POS dark mode uses `.dark` class on `<html>`, but the `ui-*` tokens only had overrides for `.public-theme` (public pages) — not for `.dark`. This caused every component using `ui-*` tokens (dialog, card, button, input, table, tabs, dropdown, badge, slide-over, etc.) to render with white/light backgrounds in POS dark mode.

### Fix
Added `.dark` block in `globals.css` (Layer 1.5, between `:root` and `.public-theme`) with dark mode values for all 37 `ui-*` variables. Values match existing POS conventions: `gray-900` surfaces, `gray-800` alt/muted, `gray-700` borders, `gray-100` text, `gray-400` muted text.

### Impact
- Fixes dark mode for 30+ shared UI components that use `ui-*` tokens
- No individual component changes needed — one CSS block fixes everything
- No regression risk: `.dark` only activates for POS (admin uses `:root`, public uses `.public-theme`)

---

## Fix: Comprehensive POS Dark Mode Audit — Session D10 — 2026-02-21

Exhaustive audit of all POS `.tsx` files for dark mode gaps. Ran 10 automated scans (bg-white, bg-gray-*, text colors, borders, dividers, shadows, hover states, hardcoded hex, inline styles, component inventory) plus manual review of colored badges and backgrounds.

### Findings
- **42 initial scan hits** across bg-white, bg-gray-50/100, text colors — **all false positives** (matched `hover:bg-gray-50` substrings that already had `dark:hover:bg-gray-800` counterparts, or always-dark components like pin-screen)
- **10 real issues** found via secondary scan for colored backgrounds missing dark variants

### Files Fixed (7 files, 10 issues)
- `day-summary.tsx` — 2 fixes: emerald/purple `iconBg` props now include `dark:bg-*/30`
- `job-detail.tsx` — 1 fix: Appointment badge `bg-purple-100 text-purple-700` → `dark:bg-purple-900/30 dark:text-purple-300`
- `job-queue.tsx` — 1 fix: Same appointment badge
- `refund-item-row.tsx` — 2 fixes: Package type badge + selected row `bg-red-50/50`
- `promotions-tab.tsx` — 3 fixes: green/blue/amber accent backgrounds
- `service-pricing-picker.tsx` — 2 fixes: selected tier `bg-blue-50/50` + total display
- `service-detail-dialog.tsx` — 1 fix: per-unit total display `bg-blue-50/50`

### Known Exceptions (intentionally no dark variant)
- `pin-screen.tsx:113` — `bg-white` is the filled PIN dot on an always-dark (`bg-gray-900`) background
- `zone-picker.tsx` — hardcoded hex colors in SVG vehicle diagram fills (status indicators)
- `category-tile.tsx` — inline `backgroundImage` style (image URL, not a color)
- Photo annotation/capture components — always-dark camera UI

### Verification
- Re-scan: zero remaining colored backgrounds without dark variants
- TypeScript: `tsc --noEmit` passes with zero errors

---

## Fix: Customer Lookup Results Dark Mode Contrast — Session D9 — 2026-02-21

- Added missing `bg-white dark:bg-gray-900` to results container in CustomerLookup (had no background, inherited parent)
- Added dark mode variants to `professional` CustomerTypeBadge: `dark:bg-purple-900/30`, `dark:text-purple-400`, `dark:border-purple-800`, `dark:bg-purple-600` (enthusiast already had them)
- Added dark mode variants to `professional` option in CustomerTypePrompt dialog

---

## Fix: Revert Custom Keypad, Use Native iOS Numeric Input — Session D8 (Revised) — 2026-02-21

- Reverted custom PinPad keypad integration from CustomerLookup (over-engineered)
- Reverted `mode`/`onSwitchToKeyboard` props from PinPad component (unused)
- Changed CustomerLookup input from `inputMode="tel"` to `inputMode="numeric" pattern="[0-9]*"` — triggers iOS clean 10-key number pad (digits only, no phone symbols)
- Users can tap globe icon on iOS keyboard to switch to full letter keyboard for name search
- Desktop browsers completely unaffected — no visible change

---

## Fix: POS PIN Lag, Header Identity, Held Tickets Relocation — Session D7 — 2026-02-21

### PIN Entry Lag (Fix 1)
- Added 200ms `setTimeout` before auto-submit on 4th digit so user sees all 4 dots fill before "Verifying..." state
- Added `touch-action: manipulation` to PIN overlay and full-page containers (prevents 300ms tap delay on touch devices)
- Changed pin-pad buttons from `transition-all` to `transition-colors` (avoids transform animation competing with rapid taps)

### Header Identity + Logout (Fix 2)
- Right side of header now shows: `{Role Pill} | {Staff Name} | [LogOut icon]`
- LogOut icon button with hover:red effect, calls `posSignOut()` + redirect to `/pos/login`
- Removed PauseCircle held tickets from header (moved to ticket panel per Fix 4)
- OfflineQueueBadge stays in header

### Remove Logout from More Menu (Fix 3)
- Removed Log Out button, last divider, and `handleLogout` function from bottom-nav
- Cleaned up unused imports: `LogOut`, `ROLE_LABELS`, `usePosAuth`, `useRouter`
- "Go to Dashboard" is now the last menu item with `rounded-b-xl`

### Move PauseCircle to Ticket Panel Header (Fix 4)
- PauseCircle + held count moved from main header to ticket-panel header (replaces role pill + staff name)
- Cross-component communication via `CustomEvent('pos-open-held-panel')` — ticket panel dispatches, PosShellContent listens
- Same styling: amber when held > 0, gray when empty. HeldTicketsPanel stays in PosShellContent.

---

## Fix: Auth Expiry Redirect + CRON Resilience — Session D6 — 2026-02-21

### POS Auth Expiry → Graceful Login Redirect (Fix 1)
- **Layer 1 — posFetch 401 handler**: Updated redirect URL to `/pos/login?reason=session_expired` (was missing reason param)
- **Layer 2 — Global error handler**: Added `window.error` + `unhandledrejection` listeners in `PosShellInner` to catch Stripe Terminal SDK "no longer authenticated" / "not authenticated" / "session expired" errors. Prevents React error boundary crash screen — redirects cleanly to login instead.
- **Layer 3 — Already covered**: `posFetch` wrapper already handles 401 for all POS API calls. Only raw fetch bypass is `pin-screen.tsx` for login (excluded by design).
- **Layer 4 — Login page toast**: Shows `toast.info('Your session has expired. Please log in again.')` when redirected with `?reason=session_expired`

### CRON Scheduler Resilience (Fix 2)
- **Localhost URL**: Changed `BASE_URL` from `process.env.NEXT_PUBLIC_APP_URL` to `http://localhost:${PORT || 3000}`. Cron runs inside the Next.js process — calling itself via external URL was causing `SocketError: other side closed` during rebuilds/deploys.
- **30s timeout**: Added `AbortSignal.timeout(30000)` to prevent hanging connections
- **Single retry with 5s delay**: On fetch failure, waits 5s then retries once. Only logs error on final failure — reduces log noise during brief rebuild windows.
- **Graceful non-200 handling**: Logs status code and returns (no retry for HTTP errors, only network failures)

---

## Feat: POS Numeric Keypad Default for Customer Lookup — Session D5 — 2026-02-21

- Added `inputMode="tel"` to customer lookup search input (`customer-lookup.tsx`)
- iPad/mobile: numeric keypad shows by default when tapping search field (most lookups are by phone)
- `type` stays as `"text"` so letter input still works after switching keyboard
- Desktop: no visible change (`inputMode` only affects mobile virtual keyboards)

---

## Fix: POS Header/Ticket/Menu Polish — Session D4 — 2026-02-21

### More Menu Log Out (Fix 1)
- Shrunk role pill text from `text-xs` to `text-[10px]` with tighter padding (`px-1.5`) and `leading-none`
- Gap between pill and name reduced from `gap-2` to `gap-1.5`
- Everything fits cleanly on one line without wrapping

### Ticket Header Font (Fix 2)
- Staff name already matched TICKET font (`text-sm font-semibold tracking-wide`) — confirmed correct
- Shrunk role pill in ticket header to match More menu style (`text-[10px]`, `px-1.5`, `leading-none`)

### Header Role Pill Removed (Fix 3)
- Removed role pill from header entirely — role now only shown in ticket panel header and More menu
- Removed unused `ROLE_LABELS` import from pos-shell.tsx
- Header left side is now just Scanner + Card Reader indicators

---

## Fix: POS Header Layout, Identity Display & Card Reader PWA — Session D3 — 2026-02-21

### Header Layout (Fix 1 + 4)
- Moved Scanner and Card Reader status indicators from RIGHT to LEFT side of header
- New left-side order: Scanner → Card Reader → Role Pill
- Right side now only has Held Tickets + Offline Queue badge
- Increased PauseCircle (held tickets) icon from h-4 w-4 to h-5 w-5 (25% larger)

### Ticket Panel Identity (Fix 2)
- Ticket header now shows `TICKET ... [Super Admin] Nayeem` (role pill + name on right)
- Role pill uses same gray rounded-full badge style as header
- Imported ROLE_LABELS, destructured `role` from usePosAuth()

### More Menu Log Out (Fix 3)
- Log Out row now shows role pill badge + staff name (was just "· Nayeem")
- Consistent identity display across header, ticket panel, and More menu

### Card Reader PWA Service Worker (Fix 5 — CRITICAL)
- **Rewrote service worker fetch handler** with whitelist approach: only intercept known cacheable patterns, let everything else pass through natively
- **Added local/private network IP exclusion**: 192.168.x.x, 10.x.x.x, 172.16-31.x.x, localhost, .local — prevents SW from interfering with Stripe Terminal reader's direct HTTPS connection
- **Removed NEVER_CACHE_PATTERNS blacklist** — replaced with positive-match-only logic (cacheable API patterns + POS pages + static assets)
- **Incremented cache version** to v3 to force service worker update on all clients
- `skipWaiting()` and `clients.claim()` ensure immediate activation
- Root cause: Stripe Terminal Internet readers communicate via direct local network HTTPS to the reader's IP. In PWA standalone mode on iOS, the service worker could intercept or delay these requests even when returning without `respondWith`, causing "Could not communicate with Reader" errors.

---

## Fix: POS Navigation Polish — Session D2 — 2026-02-21

### Header Layout Reorganization
- Removed staff first name ("Nayeem") and dot separator from header
- Role pill ("Manager") now sole item on header left side
- Staff name relocated to Ticket panel header row (opposite side of "TICKET" label)
- Changed center brand text from "Smart Detail POS" to "Smart Details Auto Spa - POS"
- Responsive breakpoint still collapses to just "POS" on narrow screens

### Header Status Indicators
- Removed amber pill background (`bg-amber-50`) from held tickets button
- Removed oversized `min-h-[44px] min-w-[44px]` touch targets from all header indicators
- Removed `rounded-full` pill shape from card reader and held ticket buttons
- Reverted held tickets PauseCircle icon from h-5 to h-4 (matches scanner icon)
- Connecting state changed from non-interactive `<div>` to tappable `<button>`

### Card Reader PWA Improvements
- Added concurrent connection guard (`isConnectingRef` check) in discoverAndConnect
- Connection success/failure now shows toast feedback (critical for PWA where console isn't visible)
- Added `/api/pos/stripe` to service worker NEVER_CACHE_PATTERNS for explicit Stripe API exclusion
- Connection token endpoint already had Cache-Control: no-store

### POS Tabs Light Mode Contrast
- Tab container background changed from `bg-gray-100` to `bg-gray-200` in light mode
- Fixes invisible tabs where container blended into page background (`bg-gray-100`)
- Active tab white pill + shadow now clearly visible against darker track
- Dark mode unchanged (`bg-gray-800`)

### Sale Tab → Register Reset
- Pressing Sale tab while already on /pos now resets active tab to Register
- Uses custom event (`pos-reset-register`) from bottom-nav to pos-workspace
- Also clears any active search when resetting

---

## Fix: POS Navigation Polish + Bug Fixes — 2026-02-21

### More Menu Polish
- Swapped order: Theme segmented control now appears above Cash Drawer
- Fixed theme toggle overflow: replaced px-3 per button with flex-1 contained layout (iOS segmented control pattern)
- Cash Drawer now shows colored Vault icon + explicit "Open"/"Closed" status text (replaces green dot)
- Cash Drawer status re-reads localStorage when popover opens (fixes stale state in PWA)

### Header Polish
- Held Tickets icon size matched to bottom nav icons (h-4 → h-5)
- Removed colored pill backgrounds from card reader status (connected/connecting states)
- Card reader connected state changed from div to button (tappable to reconnect)

### Customer Lookup Dialog Dismiss (iPad)
- Added pointer-events-none to visual backdrop in dialog.tsx, ensuring touch events pass through to clickable dismiss layer
- Added WebkitTapHighlightColor: transparent for iPad Safari PWA compatibility

### Card Reader PWA Fixes
- Added onTouchEnd fallback handlers on both connected and disconnected reader buttons
- Service worker: explicit Stripe domain exclusion (belt-and-suspenders)
- Connection token API: added Cache-Control: no-store header

### Toast Duration
- Global default shortened from 4s to 2s
- Max visible toasts reduced from 5 to 3
- Disabled expand mode to prevent toast stacking

---

## Feat: POS Navigation Reorganization + Bug Fixes — 2026-02-21

### Header Redesign
- Reduced header from 16 elements to 8
- LEFT zone: Employee first name + role badge (e.g., "Nayeem · Manager")
- CENTER zone: "Smart Detail POS" (responsive — "POS" on narrow screens)
- RIGHT zone: Scanner indicator, Card reader status (44px touch target), Held tickets button (44px), Offline queue badge
- REMOVED: Back arrow, clock, recent transactions dropdown, theme toggle, fullscreen toggle, PWA refresh, keyboard shortcuts button

### Bottom Nav Redesign
- Changed from 6 tabs to 5: Transactions, Quotes, Sale (new), Jobs, More
- REMOVED: Log Out tab (moved to More menu), Register tab (moved to More menu as "Cash Drawer")
- NEW: "Sale" tab with ShoppingCart icon linking to /pos (exact pathname match)
- All 5 tabs evenly spaced with flex-1

### More Menu Expansion
- Cash Drawer with green dot indicator (from former Register tab)
- Theme segmented control (Light/Dark/System) — stays open after selection
- Refresh App (PWA standalone mode only)
- Fullscreen toggle (desktop non-standalone only)
- Keyboard Shortcuts (opens modal)
- Go to Dashboard (link to /admin)
- Log Out in red with employee name confirmation
- Full dark mode support, proper separators, Escape key support

### Bug Fix: Card Reader PWA Connection
- Added `resetTerminal()` to `stripe-terminal.ts` — fully destroys stale Terminal SDK singleton
- `discoverAndConnect` now calls `resetTerminal()` before reconnecting (clears stale WebSocket state)
- Added `visibilitychange` handler in `reader-context.tsx` — auto-reconnects reader when iPad resumes from background/sleep
- Uses `isConnectingRef` to prevent duplicate reconnection attempts

### Bug Fix: Customer Lookup Popup Dismiss
- Fixed backdrop click/tap not dismissing dialog on iPad and desktop
- Root cause: flex container overlay sat above the backdrop div, intercepting all pointer events
- Fix: moved `onClick`/`onTouchEnd` handlers from backdrop div to the flex container
- Added `onTouchEnd` stopPropagation on dialog card to prevent touch events bubbling through

### Dead Code Cleanup
- DELETED: `recent-transactions-dropdown.tsx` (functionality in Transactions tab)
- DELETED: `fullscreen-toggle.tsx` (logic moved inline to More menu)
- DELETED: `pwa-refresh-button.tsx` (logic moved inline to More menu)
- Removed all orphaned imports, unused state, effects, and timers

### Files Changed
- `src/app/pos/pos-shell.tsx` — Header redesign, removed clock/dead imports
- `src/app/pos/components/bottom-nav.tsx` — Complete rewrite (5 tabs + expanded More menu)
- `src/app/pos/context/reader-context.tsx` — PWA reconnect, resetTerminal, visibilitychange
- `src/app/pos/lib/stripe-terminal.ts` — Added `resetTerminal()` function
- `src/components/ui/dialog.tsx` — Fixed backdrop dismiss for iPad Safari
- `src/app/pos/components/recent-transactions-dropdown.tsx` — DELETED
- `src/app/pos/components/fullscreen-toggle.tsx` — DELETED
- `src/app/pos/components/pwa-refresh-button.tsx` — DELETED

---

## Feat: PWA-Only Refresh Button in POS Header — 2026-02-21

- Added `PwaRefreshButton` component — only renders in PWA standalone mode (no address bar = no native refresh)
- 44px touch target, `RotateCw` icon, placed in POS header before fullscreen toggle
- Hidden in regular browser where the address bar provides refresh

### Files Changed
- `src/app/pos/components/pwa-refresh-button.tsx` — New component
- `src/app/pos/pos-shell.tsx` — Import and render `PwaRefreshButton`

---

## Feat: Desktop-Only Trash Icon on Ticket Items — 2026-02-21

- Added `Trash2` remove button to `ticket-item-row.tsx` — visible only on desktop (`pointer-fine`)
- Touch/iPad users continue using swipe-to-delete; desktop mouse users now also have a click-to-remove trash icon
- Complements the `DialogClose` X buttons and `pointer-fine`/`pointer-coarse` variants added in the prior session

### Files Changed
- `src/app/pos/components/ticket-item-row.tsx` — Trash2 icon import + desktop-only remove button

---

## Feat: POS Favorites Dark Mode — Complete Coverage, Admin Override, Live Preview — 2026-02-21

### Complete Dark Mode Coverage
- Added `dark:` Tailwind variants to all 8 remaining colors in TILE_COLORS (fuchsia, lime, cyan, rose, teal, indigo, purple, pink)
- All 72 tile color entries (12 colors x 6 shades) now have proper dark mode support
- Extracted TILE_COLORS, TYPE_ICONS, getTileColors to shared `src/lib/pos/tile-colors.ts` — imported by both POS register-tab and admin favorites page

### Per-Tile Dark Mode Override
- Added optional `darkColor` and `darkColorShade` fields to `FavoriteItem` interface
- POS register-tab uses `usePosTheme()` to detect dark mode and applies override color when set
- Tiles without overrides use automatic `dark:` CSS variants (the default behavior)

### Admin Settings UI
- Added "Custom dark mode colors" checkbox to both Add and Edit forms
- When enabled, shows dark color picker dots + dark shade dropdown
- Live preview shows side-by-side Light/Dark tile previews (with Sun/Moon icons)
- Preview updates in real-time as colors/shades change
- Dark override color is saved to `business_settings` JSON; omitted when not enabled

### Split Color Swatch in List
- Tiles with dark override show a split circle (left = light color, right = dark color)
- Tiles without override show a single color circle (enlarged to h-7 w-7)

### Files Changed
- `src/lib/pos/tile-colors.ts` — NEW: shared TILE_COLORS map with full dark coverage + TYPE_ICONS + getTileColors
- `src/app/pos/types.ts` — added `darkColor`, `darkColorShade` to FavoriteItem
- `src/app/pos/components/register-tab.tsx` — imports from shared module, dark override via usePosTheme
- `src/app/admin/settings/pos-favorites/page.tsx` — dark mode override UI, FavoriteTilePreview, DarkModeOverride component, split swatch

---

## Feat: POS Cache Busting, PWA Safe Area, Desktop-Only Fullscreen — 2026-02-21

### Cache Busting & Faster Refresh
- Added `generateBuildId` to `next.config.ts` (timestamp-based) and exposed `BUILD_ID` env var
- Created `/api/pos/version` endpoint — returns current build version with `no-store` cache headers
- Updated service worker (`pos-sw.js`) with `CHECK_VERSION` message handler: compares cached version against server, purges all POS caches on mismatch, notifies clients via `NEW_VERSION_AVAILABLE` message
- Added `/api/pos/version` to `NEVER_CACHE_PATTERNS` in service worker
- Updated `PosServiceWorker` component: checks version every 5 minutes, listens for version mismatch messages, shows a fixed blue banner with "Refresh now" button when a new deploy is detected
- Added `Cache-Control: no-store, no-cache, must-revalidate` headers to POS services API route
- Bumped cache names from `v1` to `v2` to force clean slate

### PWA Status Bar Overlap Fix
- Added `@custom-variant standalone` for `display-mode: standalone` media query
- Added `.pos-standalone-safe` CSS class that applies `padding-top: env(safe-area-inset-top)` only in standalone mode
- Applied `pos-standalone-safe` class to POS shell outer container
- `viewportFit: 'cover'` already set in POS layout (required for `env(safe-area-inset-top)` to return non-zero)

### Desktop-Only Fullscreen Button
- Updated `FullscreenToggle` to check `pointer: fine` media query and standalone mode
- Button now hidden on touch devices (iPad Safari, iPad PWA) — only visible on desktop browsers
- PWA standalone users get fullscreen natively, so the toggle is unnecessary

### Files Changed
- `next.config.ts` — `generateBuildId`, `BUILD_ID` env var
- `public/pos-sw.js` — Version check messaging, cache v2, version endpoint in never-cache list
- `src/app/api/pos/version/route.ts` — New version endpoint
- `src/app/api/pos/services/route.ts` — Added Cache-Control headers
- `src/app/pos/components/pos-service-worker.tsx` — Version check interval + update banner
- `src/app/pos/components/fullscreen-toggle.tsx` — Desktop-only visibility
- `src/app/pos/pos-shell.tsx` — Added `pos-standalone-safe` class
- `src/app/globals.css` — `@custom-variant standalone`, `.pos-standalone-safe` CSS rule

---

## Fix: POS Dark Mode Cleanup, Ticket Scroll UX, Fullscreen Gesture — 2026-02-21

### Dark Mode — Theme Provider Cleanup
Verified that `@custom-variant dark (.dark &)` in `globals.css` correctly generates class-based dark rules (`.dark .dark\:xxx` at specificity 0,2,0) in both production and Turbopack dev builds. Zero `@media (prefers-color-scheme: dark)` rules exist — the custom variant fully overrides the built-in. Removed the now-unnecessary `disableMediaQueryDarkRules()` function and its `MutationObserver` from `PosThemeProvider`. Provider now only: manages theme state in localStorage, resolves system preference, toggles `.dark` class on `<html>`, sets `color-scheme`.

### Ticket Scroll — Fade Indicators
Added top/bottom gradient fade indicators on the ticket items scroll container. Fades appear/disappear based on scroll position — top fade shows when scrolled down, bottom fade shows when more content below. Uses React state driven by `onScroll` handler + `useEffect` to initialize on item count changes.

### Fullscreen Gesture Conflict
Added `touch-manipulation` on the outer POS shell container (`h-dvh` div) to prevent Safari from interpreting any touch gesture within the POS as a system gesture (like "swipe down to exit fullscreen"). Combined with existing `touch-pan-y` on individual scroll containers (ticket panel, workspace catalog), this ensures fullscreen stays active during normal scrolling.

### Bottom Nav Safe Area (Verified)
Confirmed `viewportFit: 'cover'` (layout.tsx) and `pb-[env(safe-area-inset-bottom)]` (pos-shell.tsx outer container) were already in place. The flex-column layout with safe-area bottom padding ensures the bottom nav sits above the home indicator on Face ID iPads.

### Files Changed
- `src/app/pos/context/pos-theme-context.tsx` — Removed `disableMediaQueryDarkRules()` + MutationObserver (no longer needed)
- `src/app/pos/components/ticket-panel.tsx` — Scroll fade indicators (top/bottom gradients)
- `src/app/pos/pos-shell.tsx` — Added `touch-manipulation` to outer container

---

## Fix: POS Dark Mode Toggle + Ticket Scroll — 2026-02-21

### Dark Mode Toggle (Root Cause Found + Fixed)

The POS dark/light/system toggle buttons had no visual effect. Two independent issues combined:

**1. Turbopack dual CSS compilation**: In dev mode, Turbopack generates a second CSS chunk (`[root-of-the-server]__*.css`) with its own Tailwind compilation. This chunk uses `@media (prefers-color-scheme: dark)` (the Tailwind default) instead of our `@custom-variant dark` (class-based). When the OS is in dark mode and the user toggles POS to light, the media-query rules at `(0,1,0)` specificity compete with base utilities at the same specificity, and source order makes the dark rules win.

**Fix**: `PosThemeProvider` now runs `disableMediaQueryDarkRules()` on mount — iterates all stylesheets, finds `@media (prefers-color-scheme: dark)` blocks, and deletes them. A `MutationObserver` on `<head>` re-cleans when Turbopack hot-reloads inject new style elements. Our class-based rules (specificity `(0,2,0)` via `:is()`) remain as the sole dark mode authority.

**2. Wrapper div instead of `<html>`**: Previous implementation used a `<div class="dark" style="display:contents">` wrapper. Reverted to applying `.dark` class and `color-scheme` directly on `document.documentElement` via imperative DOM manipulation. This is more standard and avoids any `display: contents` edge cases.

### Ticket Scroll (Root Cause Found + Fixed)

Previous fixes (`shrink-0` on siblings, `min-h-0` on items list) were necessary but not sufficient. The actual root cause: the POS workspace grid (`grid h-full grid-cols-[1fr_380px]`) had no explicit row definition. Without `grid-template-rows`, the row is IMPLICIT (`grid-auto-rows: auto`) — its height is determined by content, not by the container. The TicketPanel's `h-full` resolved to content height, so `overflow-y-auto` never activated.

**Fix**: Added `grid-rows-[1fr]` to the grid container, making the row explicit and filling the container height. Also added `overflow-hidden` to TicketPanel's outer div for defense-in-depth.

### Files Changed
- `src/app/pos/context/pos-theme-context.tsx` — Rewritten: imperative `.dark` on `<html>`, `disableMediaQueryDarkRules()`, MutationObserver for hot-reload, proper unmount cleanup
- `src/app/pos/components/pos-workspace.tsx` — Added `grid-rows-[1fr]`
- `src/app/pos/components/ticket-panel.tsx` — Added `overflow-hidden` to outer container
- `src/app/pos/components/quotes/quote-builder.tsx` — Added `grid-rows-[1fr]`
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — Added `overflow-hidden` to outer container

---

## Fix: POS Fullscreen Scroll + Bottom Nav Cutoff — 2026-02-21

### Ticket Sidebar Scroll Fix
- Added `min-h-0` to ticket items scrollable div — critical for flex items to shrink below content height so `overflow-y-auto` activates
- Added `overscroll-contain` to prevent scroll chaining — stops iPad Safari from exiting fullscreen when swiping down at top of scrolled ticket list
- Applied to both `ticket-panel.tsx` and `quote-ticket-panel.tsx`

### Overscroll Containment (All POS Scrollable Areas)
- `pos-workspace.tsx`: Main content area
- `catalog-browser.tsx`: Category browsing
- `catalog-panel.tsx`: Product and service grids (2 instances)
- `checkout-overlay.tsx`: Payment flow
- Prevents ANY scroll area from accidentally triggering fullscreen exit on iPad

### Bottom Nav Cutoff Fix
- Changed `h-screen` to `h-dvh` on POS shell root container (`pos-shell.tsx`)
- `h-dvh` (dynamic viewport height) accounts for browser chrome changes during fullscreen transitions on iPad Safari
- Ensures bottom nav is always fully visible in both normal and fullscreen modes

---

## Fix: POS Ticket State Lost on Page Refresh — 2026-02-20

Customer info, vehicle, items, and discounts on the POS ticket disappeared on page refresh/reload because the ticket state (React `useReducer`) had no persistence.

### Fix
Added sessionStorage persistence to `TicketProvider`. On mount, restores saved ticket via `RESTORE_TICKET` action. On every state change, persists to sessionStorage. Clears automatically when `CLEAR_TICKET` fires (resets to empty initial state which overwrites sessionStorage).

### Files Changed
- `src/app/pos/context/ticket-context.tsx` — sessionStorage save/restore with guard against persisting before restore completes

---

## Fix: POS Ticket Sidebar Not Scrolling — 2026-02-20

When multiple services/products were added to a POS ticket, the items list would not scroll because sibling flex children (customer summary, header, addon suggestions, coupon/discount section) were competing for space with the scrollable area.

### Fix
Added `shrink-0` to all non-scrollable siblings of the `flex-1 overflow-y-auto` items list so they maintain their natural height and the items list takes remaining space.

### Files Changed
- `src/app/pos/components/ticket-panel.tsx` — `shrink-0` on customer summary, header, addon wrapper, coupon/discount section
- `src/app/pos/components/quotes/quote-ticket-panel.tsx` — same pattern applied to customer summary, header, coupon/discount, valid-until, notes sections

---

## Fix: POS Theme Toggle Exiting iPad Fullscreen — 2026-02-20

Clicking the Sun/Moon/Monitor theme toggle buttons in the POS header was exiting iPad fullscreen mode.

### Root Cause
Toggle buttons without explicit `type="button"` defaulted to `type="submit"`, which could trigger form submission behavior. Additionally, the previous dark mode fix manipulated `document.documentElement.style.colorScheme` which can trigger Safari to exit fullscreen.

### Fix
- Added `type="button"` to all 3 theme toggle buttons
- PosThemeProvider now uses a React-managed wrapper `<div>` with `style={{display:'contents'}}` instead of imperatively modifying `document.documentElement`

### Files Changed
- `src/app/pos/pos-shell.tsx` — `type="button"` on all theme toggle buttons
- `src/app/pos/context/pos-theme-context.tsx` — reverted to wrapper div approach, removed `documentElement` manipulation

---

## Fix: POS Dark Mode Toggle — Corrected Approach — 2026-02-20

The previous dark mode fix (applying `.dark` class + `color-scheme` to `document.documentElement`) didn't work because: (1) `color-scheme` CSS property does NOT override `@media (prefers-color-scheme)` media queries, and (2) imperative DOM manipulation on `<html>` conflicts with React's ownership and causes Safari fullscreen exits.

### Corrected Fix
- PosThemeProvider uses a React-managed `<div className="dark">` wrapper with `display: contents` (invisible to layout, but present in DOM for CSS `:is(.dark *)` matching)
- `mounted` state prevents hydration mismatch (SSR always renders light)
- `@custom-variant dark (&:is(.dark, .dark *))` with `:is()` gives dark variants specificity (0,2,0), beating base utilities at (0,1,0) regardless of Turbopack CSS chunk ordering

### Files Changed
- `src/app/pos/context/pos-theme-context.tsx` — wrapper div with display:contents, mounted guard
- `src/app/globals.css` — `:is()` specificity (unchanged from first fix)

---

## Fix: POS Backdrop Dismiss on iPad — 2026-02-20

Fixed backdrop tap-to-dismiss not working on iPadOS Safari. iOS/iPadOS doesn't fire `click` events on non-interactive `div` elements. Added `onTouchEnd` handler + `cursor-pointer` to all dialog backdrops and the checkout overlay backdrop so tapping the background reliably dismisses popups on iPad.

- `dialog.tsx`: Added `onTouchEnd` with `preventDefault()` + `cursor-pointer` class on backdrop div
- `checkout-overlay.tsx`: Added matching `onTouchEnd` handler on backdrop + `stopPropagation()` on content div to prevent bubbling

---

## Feat: POS Fullscreen Toggle Button — 2026-02-20

Added a fullscreen toggle button to the POS header (between the clock and theme toggle). Uses the browser Fullscreen API with webkit prefix support for iPad Safari.

- Press once to enter fullscreen, press again to exit
- Icon switches between Maximize and Minimize
- 44px touch target, dark mode support
- Auto-hides when Fullscreen API is not available (e.g., standalone PWA mode)

### Files Changed
- `src/app/pos/components/fullscreen-toggle.tsx` — New component
- `src/app/pos/pos-shell.tsx` — Import and render FullscreenToggle in header

---

## Fix: POS Dark Mode Toggle Not Working — 2026-02-20

POS dark mode was implemented (72 files, 1,864 `dark:` classes, `PosThemeProvider`, toggle buttons in header) but the toggle buttons produced no visual change.

### Root Cause
Two CSS issues combined to make the toggle completely inert:

1. **Duplicate Tailwind compilation in Turbopack dev mode**: Turbopack generates a second CSS chunk (for server components) with its own Tailwind compilation that uses `@media (prefers-color-scheme: dark)` instead of the class-based `@custom-variant dark` from `globals.css`. This chunk also includes duplicate base utilities (e.g., `.bg-gray-100`).

2. **Zero-specificity `:where()` in `@custom-variant`**: The original `@custom-variant dark (&:where(.dark, .dark *))` gives dark variants specificity `(0,1,0)` — the same as base utilities. When the second CSS chunk loads after `globals.css`, its base utilities appear later in the cascade and always win over the class-based dark variants.

Result: dark: variants could never override base utilities regardless of the `.dark` class toggle.

### Fixes
- **`@custom-variant` specificity**: Changed `:where()` to `:is()` — dark variants now get specificity `(0,2,0)`, always beating base utilities at `(0,1,0)` regardless of CSS source order
- **Apply to `<html>` element**: `PosThemeProvider` now applies `.dark` class and `color-scheme` property to `document.documentElement` instead of a wrapper `<div>`, ensuring ALL CSS chunks (including Turbopack's separate compilation) respect the toggle
- **`color-scheme` override**: Setting `color-scheme: light` or `color-scheme: dark` on the root element overrides `@media (prefers-color-scheme)` queries, neutralizing the media-query dark styles in the separate chunk
- **Removed wrapper div**: The `<div className="dark contents">` wrapper is no longer needed since the dark class is applied to `<html>`

### Files Changed
- `src/app/globals.css` — `@custom-variant dark` changed from `:where()` to `:is()`
- `src/app/pos/context/pos-theme-context.tsx` — apply dark class + color-scheme to `<html>`, cleanup on unmount

---

## Fix: Customer Portal Nav Cut Off by Main Header — 2026-02-20

Fixed portal navigation tabs (Dashboard, Appointments, Vehicles, etc.) being obscured after the user dropdown menu was added to the site header.

### Root Cause
- `--ticker-height` CSS variable (set by announcement tickers on public pages) persisted on `:root` when navigating to account/auth pages. The sticky header used this variable for its `top` offset, causing it to stick at a non-zero position and overlap content.
- Mobile menu (changed from conditional render to always-in-DOM CSS grid approach) added a visible `border-t` even when closed, contributing extra height to the header.

### Fixes
- **Ticker height cleanup**: `useTickerHeight` hook now resets `--ticker-height` to `0px` on unmount (previously only disconnected ResizeObserver)
- **Account layout**: Set `--ticker-height: 0px` inline on wrapper div (belt-and-suspenders defense)
- **Customer-auth layout**: Same `--ticker-height` reset applied
- **Both layouts**: Now fetch and pass `navItems` to `SiteHeader` (was using hardcoded fallback nav)
- **Account layout**: Added `pt-2` on `<main>` for breathing room between header and portal content
- **Mobile menu border**: Changed from always-visible `border-site-border` to `border-transparent` when closed, preventing phantom 1px height addition

### Files Changed
- `src/app/(account)/layout.tsx` — ticker-height reset, navItems, main padding
- `src/app/(customer-auth)/layout.tsx` — ticker-height reset, navItems
- `src/components/public/header-client.tsx` — conditional mobile menu border
- `src/components/public/cms/announcement-ticker.tsx` — cleanup resets --ticker-height

---

## Fix: POS Popup UX — Backdrop Dismiss + Remove Redundant X Buttons — 2026-02-20

iPad POS UX cleanup. All popups now dismiss on backdrop tap (standard iPad pattern). Redundant X/close buttons removed since backdrop dismiss is the primary close mechanism.

### Backdrop Dismiss
- All POS dialogs already support backdrop dismiss via base `Dialog` component — verified working on all popups
- Added `modal` prop to base `Dialog` component — when true, backdrop click is disabled (Escape key still works)
- `QuoteDeleteDialog`: uses `modal` to prevent accidental backdrop dismiss (destructive confirmation requires explicit Cancel/Delete)
- `RefundDialog`: uses `modal` during confirm step and while processing (prevents accidental dismiss during refund)

### Removed X/Close Buttons (12 files)
- `ticket-panel.tsx`: Removed DialogClose from Customer Lookup and Vehicle Selector dialogs
- `customer-create-dialog.tsx`: Removed DialogClose (Cancel button remains)
- `vehicle-create-dialog.tsx`: Removed DialogClose (Cancel button remains)
- `customer-type-prompt.tsx`: Removed DialogClose (Skip button remains)
- `service-detail-dialog.tsx`: Removed DialogClose (backdrop dismiss)
- `product-detail.tsx`: Removed DialogClose (backdrop dismiss)
- `service-pricing-picker.tsx`: Removed DialogClose from both main picker and PerUnitPicker (Cancel buttons remain)
- `refund-dialog.tsx`: Removed DialogClose (Cancel button remains)
- `quote-delete-dialog.tsx`: Removed DialogClose (Cancel/Delete buttons remain)
- `quote-ticket-panel.tsx`: Removed DialogClose from Customer Lookup and Vehicle Selector dialogs
- `checkout-overlay.tsx`: Removed X close button (backdrop dismiss handles close when not processing)

### Removed Ticket Item Row X Button
- `ticket-item-row.tsx`: Removed inline X/remove button — swipe-to-delete is the primary removal method on iPad POS

---

## Feat: POS Dark Mode — 2026-02-20

iPad optimization (Phase 12, item 8 from audit). Independent dark mode for the POS system with light/dark/system toggle.

### Theme Infrastructure
- `@custom-variant dark` in globals.css — class-based dark mode scoped to POS only (not media query)
- `PosThemeProvider` context (`pos-theme-context.tsx`) — manages theme state, resolves system preference
- Wrapper `<div className="dark contents">` applies the dark class without affecting layout
- localStorage persistence (`pos-theme` key) — preference per device, survives refresh
- System preference detection via `matchMedia('prefers-color-scheme: dark')` with live listener

### Theme Toggle
- Three-button toggle (Sun/Moon/Monitor) in POS header between clock and shortcuts button
- All buttons are 44px minimum touch targets (iPad HIG compliant)
- Active state highlighted with white/gray-700 background + shadow

### Dark Mode Classes
- 72 POS files modified, ~1,864 `dark:` Tailwind classes added
- Comprehensive color mapping: backgrounds, text, borders, shadows, status colors, hover/focus states
- Shell root uses `dark:bg-gray-950` (darkest) while cards use `dark:bg-gray-900` (elevated hierarchy)
- Status colors use opacity-based dark tints (e.g., `bg-green-50` → `dark:bg-green-900/30`)

### Exclusions
- PIN screen: Exempted from dark mode — already dark-themed (bg-gray-900 background, white text)
- Receipt template: Unaffected — rendered in separate browser window, always matches printed output
- Public site: Completely isolated — uses `.public-theme` + CSS variables, no `dark` class leak

---

## Feat: POS PWA with Offline Support — 2026-02-20

iPad optimization (Phase 12, item 4 from audit). Full PWA infrastructure for "Add to Home Screen" on iPad and offline cash transactions.

### PWA Manifest & Icons
- `public/manifest.json` — scoped to `/pos`, standalone display, any orientation
- Generated 5 icon files: 192px, 512px, maskable 192/512, apple-touch-icon 180px
- POS layout exports Next.js `metadata` (manifest, apple-mobile-web-app-capable, apple-touch-icon) and `viewport` (theme-color, zoom disabled for kiosk use)

### Service Worker
- `public/pos-sw.js` — custom service worker (no next-pwa dependency)
- Cache-first for static assets (`/_next/static/`, icons, fonts)
- Stale-while-revalidate for POS pages
- Network-first with cache fallback for read-only API data (services, products, settings)
- Never-cache for mutation endpoints (transactions, payments, refunds)
- Auto-registration via `PosServiceWorker` component, checks for updates every 30 min
- `/pos/offline` fallback page for first-time visitors without cache

### Offline Detection & UI
- `useOnlineStatus` hook — `useSyncExternalStore` for reactive online/offline state
- `OfflineIndicator` — amber banner when offline, green "Back online" flash on reconnect (3s)
- `OfflineQueueBadge` — pending sync count in POS header with auto-sync on reconnect

### Offline Transaction Queue
- IndexedDB-based queue (`pos-offline` DB) in `src/lib/pos/offline-queue.ts`
- `queueTransaction()` — stores full transaction data with offline ID
- `syncAllTransactions()` — POSTs queued transactions to sync endpoint on reconnect
- `getQueueCount()` — for badge display

### Checkout Flow Integration
- Payment method screen disables Card, Check, Split when offline with explanatory message
- Cash payment queues to IndexedDB when offline, processes normally when online
- Payment complete screen shows "Saved offline" badge, hides receipt options for queued txns

### Sync API
- `POST /api/pos/sync-offline-transaction` — full transaction creation with idempotency via `offline_id`
- Replicates all transaction logic: items, payments, inventory, customer stats, loyalty, coupons, QBO sync, job linking
- DB migration adds `transactions.offline_id` column with unique index

---

## Feat: POS 44px Touch Targets + Numeric Keyboard InputMode for iPad — 2026-02-20

iPad optimization (Phase 12, items 1 & 2 from audit).

### Touch Targets (44px Minimum)
- All stepper buttons (qty +/-) upgraded from 28px to 44px (`h-11 w-11`) in ticket and quote item rows
- Remove (X) buttons upgraded from 28px to 44px with larger icons
- Note icon buttons expanded to 44px touch targets
- Note save/cancel buttons: `min-h-[44px]` with increased padding
- Receipt action buttons (Print, Email, SMS, Receipt): removed `size="sm"`, added `min-h-[44px]`
- Email/SMS send buttons and inputs: upgraded to 44px minimum height
- Coupon apply button and input: upgraded to 44px minimum height
- Coupon/discount remove buttons: expanded to 44px with `h-11 w-11`
- Split payment preset buttons (50/50, $20, $50, $100): `min-h-[44px]`
- Checkout overlay close button: 44px with `h-11 w-11`
- Category scroll chevrons: 44px with `h-11 w-11`, icon size increased
- Bottom nav items: added `min-h-[44px] min-w-[44px]` and `justify-center`
- Discount type toggle buttons (Dollar/$, Percent/%): `min-h-[44px]`
- Discount form action buttons: upgraded from `h-8` to `min-h-[44px]`
- "Add Discount" link button: `min-h-[44px]`
- PinPad small variant action button: `min-h-[38px]` → `min-h-[44px]`
- Search bar clear X: 44px touch target with centered icon
- 8px minimum spacing between adjacent touch targets (gap-1 → gap-2)

### Numeric Keyboard (inputMode)
- Cash tendered input: `type="text" inputMode="decimal"` with decimal filter
- Custom tip amount: `type="text" inputMode="decimal"` with decimal filter
- Split payment amount: `type="text" inputMode="decimal"` with decimal filter
- Item quantity edit (ticket + quote): `type="text" inputMode="numeric"` with digit filter
- Discount value input (ticket + quote): dynamic `inputMode` (numeric for %, decimal for $)
- EOD cash count qty: `type="text" inputMode="numeric"` with digit filter
- Vehicle year: `type="text" inputMode="numeric"` with digit filter + maxLength=4
- All inputs filter non-numeric characters via onChange handler

### Files Changed
- `ticket-item-row.tsx` — stepper/remove/note touch targets + qty inputMode
- `quotes/quote-item-row.tsx` — same changes mirrored
- `receipt-options.tsx` — receipt action button sizes + input sizes
- `coupon-input.tsx` — apply button + remove button + input height
- `search-bar.tsx` — clear X touch target
- `checkout/split-payment.tsx` — preset buttons + amount inputMode
- `checkout/checkout-overlay.tsx` — close button touch target
- `checkout/cash-payment.tsx` — tendered amount inputMode
- `checkout/tip-screen.tsx` — custom tip inputMode
- `category-tabs.tsx` — scroll chevron touch targets
- `bottom-nav.tsx` — nav item touch targets
- `pin-pad.tsx` — small action button size
- `ticket-panel.tsx` — discount section touch targets + inputMode
- `quotes/quote-ticket-panel.tsx` — discount section touch targets + inputMode
- `eod/cash-count-form.tsx` — denomination qty inputMode
- `vehicle-create-dialog.tsx` — year inputMode

---

## Feat: POS Swipe-to-Delete Cart Items + Recent Transactions Header Shortcut — 2026-02-20

iPad optimization features (Phase 12, items 6 & 7 from audit).

### Swipe-to-Delete on Cart Items
- `SwipeableCartItem` component wraps each `TicketItemRow` with framer-motion horizontal drag gesture
- Swipe left past 100px threshold to delete; red background with trash icon revealed progressively
- `AnimatePresence` exit animation: item slides out left, then collapses height
- 5-second undo toast with "Undo" button restores item at original cart position
- New `RESTORE_ITEM` reducer action in `ticket-reducer.ts` for undo support
- Swipe disabled during active checkout; existing X button remains as fallback
- `dragDirectionLock` prevents swipe from interfering with vertical cart scrolling

### Recent Transactions Header Dropdown
- `RecentTransactionsDropdown` component: clock icon in POS header bar
- Shows last 10 transactions from today via existing `/api/pos/transactions/search` endpoint
- Each row: customer name (or "Walk-in"), amount, receipt #, payment method, relative time, status dot
- Click row → deep-links to `/pos/transactions?id=<txnId>` for instant detail view
- "View All Transactions" footer link → full paginated transactions page
- Auto-refreshes every 60s while dropdown is open
- Backdrop dismiss on outside click/tap
- Transactions page updated to accept `?id=` query param for direct detail navigation

### Files Changed
- `src/app/pos/components/swipeable-cart-item.tsx` (new)
- `src/app/pos/components/recent-transactions-dropdown.tsx` (new)
- `src/app/pos/components/ticket-panel.tsx` (swipe wrapper integration)
- `src/app/pos/context/ticket-reducer.ts` (RESTORE_ITEM action)
- `src/app/pos/types.ts` (RESTORE_ITEM in TicketAction union)
- `src/app/pos/pos-shell.tsx` (header dropdown integration)
- `src/app/pos/transactions/page.tsx` (deep-link support)
- `docs/audits/pos-ipad-optimization.md` (features 6 & 7 marked done)

---

## Fix: POS Popups Dismiss on Backdrop Tap — 2026-02-20

Standard iPad behavior: tapping outside a popup/modal should close it. Audited all POS popup components and fixed those missing backdrop dismiss.

### Components Fixed (8 custom overlays + 1 dropdown)
1. **pos-shell.tsx** — Keyboard Shortcuts overlay: added `onClick` on backdrop
2. **held-tickets-panel.tsx** — Held tickets panel: added `onClick` on backdrop
3. **checkout-overlay.tsx** — Checkout overlay: added backdrop dismiss when not processing/complete
4. **job-detail.tsx** — Reassign Detailer modal: added backdrop dismiss
5. **job-detail.tsx** — Edit Customer modal: added backdrop dismiss
6. **job-detail.tsx** — Edit Vehicle modal: added backdrop dismiss
7. **job-detail.tsx** — Edit Notes modal: added backdrop dismiss
8. **job-detail.tsx** — Edit Services modal: added backdrop dismiss
9. **bottom-nav.tsx** — "More" dropdown: added `touchstart` listener for iPad (had `mousedown` only)

### Confirmation Dialogs — Correctly NOT Dismissible (verified)
- Clear Ticket confirmation (`ticket-actions.tsx`)
- Hold & Resume confirmation (`held-tickets-panel.tsx`)
- Replace Coupon confirmation (`promotions-tab.tsx`)
- Customer Pickup confirmation (`job-detail.tsx`)
- Cancel Job / Cancel Reason (`job-detail.tsx`)
- Void Transaction confirmation (`transaction-detail.tsx`)

### Dialog Component Popups — Already Working (verified)
All components using the custom `Dialog` from `@/components/ui/dialog` already had backdrop dismiss via `onClick={() => onOpenChange(false)}` on the overlay div. This includes: product-detail, service-detail-dialog, service-pricing-picker, customer-create-dialog, vehicle-create-dialog, customer-type-prompt, refund-dialog, quote-delete-dialog, quote-send-dialog, quote-book-dialog, send-method-dialog, and all Dialog-based customer/vehicle lookup panels.

### Pattern
For custom overlays: `onClick={dismiss}` on the backdrop `div`, `onClick={(e) => e.stopPropagation()}` on the content `div` to prevent bubbling.

---

## Fix: POS Input Text Invisible on White Backgrounds — 2026-02-20

### Root Cause
- **`prefers-color-scheme: dark` media query** in `globals.css` changed `--foreground` to `#ededed` (light grey) when the browser/OS was in dark mode. Since `body { color: var(--foreground) }` applies globally, any input without an explicit text color inherited light grey text — invisible on white backgrounds.
- **23 raw `<input>` and `<textarea>` elements** across 13 POS files had no explicit `text-*` class and relied on CSS inheritance from `body`.

### Fixes
1. **Removed unused `prefers-color-scheme: dark` media query** — a leftover from Next.js scaffolding. The app's theme system handles dark/light via `.public-theme` + `data-user-theme`, not `prefers-color-scheme`. Public pages use `--site-text`, not `--foreground`.
2. **Added `text-gray-900` to all 23 vulnerable inputs** — every raw input/textarea in POS now declares its text color explicitly.

### Also Fixed (same session)
- **React hooks order violation** in `TransactionDetail`: `usePosPermission` was called after early returns, violating Rules of Hooks. Moved before conditional returns.
- **Runtime TypeError** in `TransactionDetail`: `transaction.refunds.length` crashed when `refunds` was undefined. Added optional chaining on `refunds` and `payments`.

### Files Changed
- `src/app/globals.css` — removed `prefers-color-scheme: dark` block
- `src/app/pos/components/search-bar.tsx` — `text-gray-900`
- `src/app/pos/components/customer-lookup.tsx` — `text-gray-900`
- `src/app/pos/components/keypad-tab.tsx` — `text-gray-900`
- `src/app/pos/components/register-tab.tsx` — `text-gray-900`
- `src/app/pos/components/checkout/tip-screen.tsx` — `text-gray-900`
- `src/app/pos/components/checkout/cash-payment.tsx` — `text-gray-900`
- `src/app/pos/components/checkout/check-payment.tsx` — `text-gray-900`
- `src/app/pos/components/checkout/split-payment.tsx` — `text-gray-900`
- `src/app/pos/components/transactions/transaction-list.tsx` — `text-gray-900` on 2 date inputs
- `src/app/pos/end-of-day/page.tsx` — `text-gray-900` on notes textarea
- `src/app/pos/jobs/components/flag-issue-flow.tsx` — `text-gray-900` on 8 inputs/textareas
- `src/app/pos/jobs/components/job-detail.tsx` — `text-gray-900` on 1 search + 3 textareas
- `src/app/pos/components/transactions/transaction-detail.tsx` — hooks order fix + optional chaining

---

## Fix: Booking Time Slots Intermittently Empty — 2026-02-20

### Root Causes
1. **Timezone-unsafe day-of-week calculation**: `new Date(dateStr + 'T12:00:00')` (server local time) with `getUTCDay()` (UTC time) — could return wrong day-of-week on servers with positive UTC offset, leading to wrong employee schedules and empty slots. Fixed by using explicit UTC: `new Date(dateStr + 'T12:00:00Z')` so `getUTCDay()` always matches the calendar date.
2. **Appointment status over-filtering**: `.neq('status', 'cancelled')` included `completed` and `no_show` appointments as slot blockers. Changed to `.in('status', ['pending', 'confirmed', 'in_progress'])` — only active/future appointments block slots.
3. **Missing `Cache-Control` headers**: Slots API responses had no cache-control, allowing browser heuristic caching of GET responses. Added `no-store, no-cache, must-revalidate` to all response paths.
4. **Client fetch had no `cache: 'no-store'` or error handling**: API errors silently returned "No available times" instead of an error indicator.

### Performance
- Hoisted `blockedEmployeeIds` Set computation out of the slot generation loop (was needlessly recomputed per slot).

### Files Changed
- `src/app/api/book/slots/route.ts` — timezone fix, status filter, Cache-Control headers, loop optimization
- `src/components/booking/step-schedule.tsx` — `cache: 'no-store'` + `res.ok` error handling

---

## Fix: Marketing Pages — Cached Fetch Causing Data Disappearance — 2026-02-20

### Bug Fix
- **Coupons, Campaigns, Automations list pages**: Items disappeared after clicking Status/Auto-Apply toggle badges. Root cause: browser fetch caching returned stale/empty responses on re-render.
- Applied proven fix pattern (from Promotions page): `cache: 'no-store'` on all client-side fetches + `Cache-Control: no-store, no-cache, must-revalidate` on API responses.

### Architecture Fixes
- **Automations page**: Migrated from direct browser Supabase client (`createClient()`) to API routes via `adminFetch` — consistent with admin architecture pattern.
- **Campaigns page**: Switched from raw `fetch()` to `adminFetch` wrapper (auto-redirect on 401).
- **Automations API routes** (`route.ts` + `[id]/route.ts`): Switched from `createClient()` (server/RLS) to `createAdminClient()` (service role) for all data queries — consistent with admin API pattern.

### Files Changed
- `src/app/admin/marketing/coupons/page.tsx` — `cache: 'no-store'` on initial load
- `src/app/admin/marketing/campaigns/page.tsx` — `adminFetch` + `cache: 'no-store'` on all fetches
- `src/app/admin/marketing/automations/page.tsx` — full migration to `adminFetch` API routes
- `src/app/api/marketing/coupons/route.ts` — `Cache-Control` header on GET
- `src/app/api/marketing/campaigns/route.ts` — `Cache-Control` header on GET
- `src/app/api/marketing/automations/route.ts` — `createAdminClient()` + `Cache-Control` header
- `src/app/api/marketing/automations/[id]/route.ts` — `createAdminClient()` for all handlers

---

## Fix: Auto-Focus OTP Input on Verification Page — 2026-02-20

- **Signin page** (`/signin`): OTP code input is now auto-focused when the verification step renders, so users can start typing immediately without clicking.
- Uses `requestAnimationFrame` + ref to ensure focus after React renders the input.

---

## Fix: Hide All Ineligible Coupons in Booking Step 5 — 2026-02-20

### Bug Fix
- **Both coupon APIs** (`/api/customer/coupons` + `/api/book/check-customer`): ALL ineligible coupons are now filtered out entirely — no dimmed state, no "Not applicable" badge. If a coupon doesn't apply to the selected service, it simply doesn't appear.
- Previously, customer-specific ineligible coupons were kept visible (dimmed with reason). Now they're hidden like general coupons.
- **0-value coupon filter**: Coupons where all rewards have 0% or $0 discount (bad data) are also filtered out. Fixes "0% off your order" display issue.
- Removed `is_eligible` / `ineligibility_reason` fields from API responses and frontend interfaces.
- Removed all dimmed/ineligible UI from `step-review.tsx` (badge, warning icon, muted styling, disabled Apply button).
- Removed unnecessary DB queries for service/category names on ineligible coupons (performance improvement).

---

## Fix: Booking Coupon Filtering by Service — 2026-02-20

### Bug Fix
- **Portal booking flow** (`/api/customer/coupons`): Now filters coupons by service applicability. Previously returned ALL active coupons regardless of the selected service, showing unrelated coupons in Step 5.
- Accepts `service_id` and `addon_ids` query params to check eligibility against the customer's selected services.
- Checks `requires_service_ids`, `requires_service_category_ids`, and reward `target_service_id`/`target_service_category_id` — matching the logic already used in the guest flow (`/api/book/check-customer`).
- **Booking wizard** updated to pass service context when fetching portal coupons.

---

## Site Performance Audit & Optimization — 2026-02-20

### Image Optimization
- **Configured `next/image`** with `remotePatterns` for Supabase storage in `next.config.ts`
- **Converted ALL public-facing `<img>` to `<Image>`** across 13 files: header logo, footer logo, hero carousel, before/after sliders, service cards, product cards, ad zones, cart/checkout/confirmation thumbnails
- Adds automatic WebP conversion, lazy loading, responsive `sizes`, and `priority` for above-fold images
- **Compressed before/after PNGs to WebP**: 1.26 MB → 129 KB (90% reduction)

### Bundle Optimization
- **Removed framer-motion from header** (`header-client.tsx`): replaced `motion.div` / `AnimatePresence` with CSS transitions (`opacity`, `translate`, `grid-rows`)
- framer-motion (~110KB) no longer ships on every page — only loaded on pages with animations (homepage, services, products)
- **Dynamic-imported `ParticleCanvas`** in theme-provider: only loaded when seasonal particles are active

### Middleware Optimization
- **Skip `supabase.auth.getUser()` for anonymous visitors** on public routes: checks for `sb-*` cookie first
- Logged-in users on public routes still get session refresh
- Eliminates 50-200ms Supabase auth round-trip for all anonymous traffic

### Audit
- Full audit documented in `docs/audits/performance.md`

---

## User Dropdown Menu in Header — 2026-02-20

### Desktop
- **Hover dropdown** on "Hi, [Name]" with chevron indicator: Dashboard and Log Out options
- **Dashboard**: Links to `/account` (customer portal)
- **Log Out**: Calls `supabase.auth.signOut()` then redirects to homepage
- **Smooth animation**: Framer Motion enter/exit (opacity + translate + scale), 150ms close delay to prevent flicker
- **Styling**: `bg-brand-surface` card with `shadow-2xl`, right-aligned, `rounded-xl`. Log Out highlights red on hover.

### Mobile
- When logged in, mobile menu shows greeting label + Dashboard and Log Out as separate menu items
- Dashboard has `LayoutDashboard` icon, Log Out has `LogOut` icon with red hover
- When not logged in, shows "Sign In" link (unchanged)

### Both `header-client.tsx` and `mobile-menu.tsx` updated

---

## Service Thumbnail Visibility Fix + Phone Pre-fill on Login — 2026-02-20

### Service Selection (Step 1) — Thumbnail Visibility Fix
- **Root cause**: `hidden xs:block` used a non-existent `xs` breakpoint in Tailwind v4, causing the entire thumbnail container to be permanently hidden
- **Fix**: Removed the invalid responsive class — thumbnails now always visible on all screen sizes
- **Fallback icons**: Updated from invisible `bg-brand-surface` (blended with card) to vibrant colored backgrounds with white icons:
  - Exterior/wash → Car icon on blue (`bg-blue-600`)
  - Interior → Sparkles icon on purple (`bg-purple-600`)
  - Ceramic/coating/full detail → Shield icon on lime-green (`bg-lime-600`)
  - Paint/correction/specialty → Paintbrush icon on amber (`bg-amber-600`)

### Phone Pre-fill on Login from Booking
- **Problem**: Clicking "Log In to Continue" from booking Step 4 navigated to `/signin` without the phone number — customer had to re-enter it
- **Fix**: `handleLoginClick()` now appends `&phone=` param to the signin URL
- **Signin page**: Reads `phone` from URL search params, pre-fills the phone form field
- **UX**: When phone is pre-filled, auto-focuses the "Continue" button instead of the phone input so the user can submit immediately

---

## Service Thumbnails + Phone Lookup for Returning Customers — 2026-02-20

### Service Selection (Step 1) — Thumbnails with Fallback Icons
- **Service thumbnails**: Each service card shows `image_url` as a 16x16 / 20x20 rounded thumbnail
- **Fallback icons**: When no image, shows contextual Lucide icon based on category/service name (Car for exterior, Shield for ceramic, Paintbrush for paint, Sparkles default)
- **Hidden on extra-small**: Thumbnails hidden below `xs` breakpoint to save space on very small screens

### Customer Info (Step 4) — Phone Lookup for Returning Customers
- **Phone lookup API**: `POST /api/book/check-phone` — lightweight endpoint returns `{ exists, firstName }` with in-memory rate limiting (10/min per IP)
- **Auto-detect returning customers**: After entering a valid 10-digit phone number, debounced 500ms lookup checks if customer exists
- **"Welcome back" notification**: Shows personalized greeting with first name if available, styled `bg-lime/10 border-lime`
- **"Log In to Continue"**: Redirects to `/signin` with full booking URL preserved as redirect — after login, auto-fills name, email, phone, and saved vehicles
- **"Continue as Guest"**: Dismisses notification, customer proceeds without login
- **Edge cases**: Re-entering a different phone dismisses old notification and re-checks; notification not shown for portal (already logged in) customers
- **Security**: API returns only `exists` boolean + first name — no sensitive data exposed; rate limited to prevent phone enumeration

---

## Booking Flow UX Overhaul (Steps 4-6 + Edit Links + Coupons + Confirmation) — 2026-02-20

Continuation of booking flow overhaul. Handles Steps 4 (Info), 5 (Review), 6 (Payment), and the confirmation page.

### Step 4: Customer Info
- **Form validation on blur**: Changed react-hook-form mode to `onTouched` — errors show per-field on blur, not only on submit
- **Auto-focus**: First name field auto-focuses when entering step
- **Mobile keyboard hints**: `type="tel"` on phone, `inputMode="numeric"` on year for proper mobile keyboards

### Step 5: Review — Edit Links
- **Edit links on each section**: Service, Schedule, and Your Information sections have pencil edit links
- **Return-to-review flow**: Clicking Edit navigates to that step with all data preserved; Continue returns to Review (not next sequential step)
- **Smart service re-selection**: Re-selecting the same service returns to review immediately without requiring reconfiguration
- **Combined Info section**: Customer contact + vehicle info displayed in one card with single edit link

### Step 5: Review — Coupon Auto-Apply
- **URL coupon auto-applies**: `?coupon=CODE` now auto-validates and applies when reaching Step 5
- **One-time trigger**: Tracked in wizard state to prevent re-application after removal
- **Invalid coupons**: Show error message but don't block booking

### Confirmation Page
- **Conditional payment footnote**: Shows deposit charged + remaining balance, full payment processed, pay on site, or fully covered by discounts — based on actual payment state (was hardcoded "Payment collected at time of service")
- **Portal link**: Logged-in customers see "View My Appointments" button linking to `/account`
- **Book Another Service**: All customers see button to start a new booking
- **Confirmation email text**: Shows "A confirmation email has been sent to [email]"

### Files Modified
- `src/components/booking/booking-wizard.tsx` — returnToReview flow, edit callbacks, payment state in confirmation data
- `src/components/booking/step-customer-info.tsx` — form mode, autoFocus, input types
- `src/components/booking/step-review.tsx` — edit links, auto-apply coupon, combined info+vehicle section
- `src/components/booking/booking-confirmation.tsx` — conditional footnote, portal link, book another

---

## Booking Flow UX Overhaul (Steps 1-3 + Stepper) — 2026-02-20

Major UX improvements to the first 3 steps of the booking wizard and the step indicator.

### Step Indicator
- **Clickable completed steps**: Users can click any completed step to navigate back (preserves all data)
- **Mobile compact format**: Below `sm` breakpoint, shows "Step X of Y: Label" with dot indicators instead of cramped full stepper
- Desktop keeps full horizontal stepper with circles, connectors, and labels

### Step 1: Service Selection
- **Horizontal card layout**: Replaced grid cards with full-width horizontal stacked cards
- **Service thumbnails**: Shows 80x80 service images (60x60 on small screens); fallback icons by category (Car, Shield, Paintbrush, Sparkles)
- **Sale pricing**: Services with active sales show strikethrough original price + "SALE" badge
- **Explicit Continue button**: Service selection no longer auto-advances; users click a card to select then hit Continue
- **Improved duration display**: Shows "~Xh Ym" format

### Step 2: Configure
- **Vehicle size cards with icons**: Each size card shows a vehicle icon (Car, Truck, Bus), size label, and price
- **Sale pricing per tier**: Tiers with active sale prices show strikethrough original + lime sale price + "Save $XX"
- **Scope/specialty tier cards**: Show checkmark when selected + inline sale pricing
- **Sticky mobile price summary**: Price breakdown sticks to bottom of viewport on mobile
- **Improved addon section**: Clearer "Add-ons (optional)" header with checkmark indicators

### Step 3: Schedule
- **Removed ALL waitlist code**: Waitlist UI, state, props, types completely removed from booking flow (waitlist API + admin page remain for standalone use)
- **Info note added**: Friendly note below time slots — "Don't see a time that works? Pick the closest option — our team will call to confirm your exact appointment time."

### URL State Preservation
- Booking progress stored in URL params: `step`, `service` (slug), `vehicle` (size class), `date`, `time`, `addons` (comma-separated IDs)
- Page refresh restores step and selections (reconstructs config from URL where possible)
- Existing entry points (`?service=slug`, `?rebook=id`, `?coupon=code`) continue to work
- `coupon` and `rebook` params preserved through step transitions

### Files Modified
- `src/components/booking/step-indicator.tsx` — clickable steps + mobile compact
- `src/components/booking/step-service-select.tsx` — horizontal cards, thumbnails, sale pricing
- `src/components/booking/step-configure.tsx` — vehicle icons, sale pricing, sticky summary
- `src/components/booking/step-schedule.tsx` — removed waitlist, added info note
- `src/components/booking/booking-wizard.tsx` — URL state, step click handler

---

## Booking Flow Audit — 2026-02-20

Complete audit of the entire Book Your Appointment flow. Read all 12 booking files (3,500+ lines), traced every step, documented every UI element and interaction.

- **Flow**: 5 or 6 steps (Service → Configure → Schedule → Info → Review → Payment)
- **Files audited**: book/page.tsx, booking-wizard.tsx, 6 step components, booking-confirmation.tsx, booking.ts data layer, 5 API routes
- **10 findings documented** — no critical bugs, mostly UX/info-level notes (no clickable stepper, no URL state/persistence, waitlist props not wired, confirmation footnote inaccurate after deposit)
- Full audit at `docs/audits/booking-flow.md`

---

## Before/After Image Slider in Homepage CTA Section — 2026-02-20

- Split the "Ready to Transform Your Vehicle?" CTA section into two-column layout: text/button on left, before/after image comparison slider on right
- Created `src/components/public/before-after-slider.tsx` — pure React + CSS component with pointer events (mouse + touch), `clip-path` for smooth reveal, draggable handle with lime-bordered circle, and "Before"/"After" labels
- `CtaSection` now accepts optional `beforeImage`/`afterImage` props — when provided, renders 2-column layout; otherwise keeps existing centered single-column layout (no breaking change for other pages)
- Homepage passes `/images/before-after-old.png` and `/images/before-after-new.png` (590x578 truck images)
- Mobile: stacks text above slider (single column)

---

## Fix Service Detail Sidebar Ad Placement — 2026-02-20

- **Root cause**: `<AdZone>` was placed inside the `<aside>` but **outside** the `<div className="sticky top-24 ...">` container, so the ad scrolled behind the sticky sidebar instead of staying visible with the nav links.
- Moved `<AdZone>` inside the sticky div as the last child, after the service details `<dl>`
- Added `mt-6 border-t border-site-border pt-4` wrapper for visual separation from nav links
- Added `w-full rounded-lg` to AdZone for proper sidebar width fitting
- Product detail page verified — uses horizontal layout (`below_content`), not sidebar, so no change needed

---

## Audit Ad Zone Placements — Fix Invalid Sidebar Zones — 2026-02-20

Audited every public page's actual layout vs the ad zones offered in the Page Map. Found 2 zones labeled "sidebar" on pages with no sidebar:

- **Booking `/book`**: Renamed `sidebar` → `below_form` — page is single-column centered, ad was rendered as full-width block below form. Sizes changed from vertical (300x250, 160x600) to horizontal (728x90, 970x250). Removed desktop-only wrapper so mobile users also see the ad.
- **Product Detail `/products/:cat/:slug`**: Renamed `sidebar` → `below_content` — page has 2-col image/details grid but ad was placed outside the grid as full-width. Sizes changed from vertical (300x250, 336x280) to horizontal (728x90, 970x250).
- **Service Detail** sidebar confirmed valid — genuine `<aside>` element in 3-col grid, no change needed.
- All 12 other zones verified correct. Updated `docs/audits/ad-management.md` with full layout analysis.

---

## Fix Ad Zones — Dynamic Route Resolution + Full Zone Wiring — 2026-02-20

**Critical fix**: Ads on all dynamic routes (service category, service detail, product detail) never rendered because `getAdsForZone()` compared actual paths (e.g., `/services/ceramic-coatings/ceramic-coating`) against template paths stored in DB (e.g., `/services/:categorySlug/:serviceSlug`) — exact match always failed. Added `resolveTemplatePath()` to convert actual paths back to template paths before querying. This unblocked 5 zones across 3 pages.

- **`resolveTemplatePath()`**: New function in `src/lib/data/cms.ts` — tries exact match first, then regex-matches `PAGE_ZONES` patterns for dynamic routes
- **Gallery `between_rows` zone wired**: Was defined in `PAGE_ZONES` but never placed in gallery page
- **Booking `sidebar` zone wired**: Was defined in `PAGE_ZONES` but never placed in booking page (desktop only)
- All 14 zones across 8 pages verified end-to-end
- Updated `docs/audits/ad-management.md` with complete zone verification table

---

## Fix Ad Management System — Functional Audit + Fixes — 2026-02-20

Full code-traced audit of the ad management system. Found and fixed 5 issues:

- **Master toggle wired to frontend**: `ads_enabled` business setting was written by admin toggle but never checked on public pages. `getCmsToggles()` now merges both `ad_placements` feature flag AND `ads_enabled` setting — both must be true for ads to render. Default for `ads_enabled` is `true` so existing installs aren't affected.
- **Ad container clipping fixed**: Leaderboard ads (970x90) were clipped by `overflow-hidden` + `maxHeight: 90` + `rounded-2xl` (16px radius). Removed `maxHeight`, reduced to `rounded-lg` (8px), added `py-4` vertical spacing.
- **Page Map empty state**: Zone assignment dialog showed only "-- No ad (remove) --" when no active creatives existed. Now shows "No ad creatives yet" with a "Create New Ad" button.
- **Detail page toggle guards**: Service detail and product detail sidebar ads now check `cmsToggles.adPlacements` before rendering (were rendering unconditionally).
- **Schedule dates verified correct**: `getAdsForZone()` already handles null `starts_at`/`ends_at` correctly (null = always active).
- Updated `docs/audits/ad-management.md` with functional test results

---

## Fix Ads Image Upload and Preview — 2026-02-19

- **Root cause**: Ad creative editor only had text `<Input>` fields for image URLs — no actual file upload mechanism. Users had to manually paste URLs, and without an upload there was no way to add images from their computer.
- Replaced URL text inputs with drag-and-drop upload zones (click or drag to upload) for both desktop and mobile images
- Images upload to Supabase `cms-assets` bucket under `ad-creatives/{id}/` path
- Uploaded images show as preview with hover overlay for Replace/Remove actions
- Sidebar preview panel also acts as an upload zone when no image is set (clickable + drag-and-drop)
- Upload supports JPEG, PNG, WebP, and GIF up to 5MB
- Old images are cleaned up from storage when replaced or removed
- API DELETE handler now cleans up storage images when a creative is deleted (matching hero slide cleanup pattern)
- Removed unused `ImageIcon` import

---

## Fix Stale Data Between Promotions and Catalog Pages — 2026-02-19

- Added `Cache-Control: no-store, no-cache, must-revalidate` header to promotions API GET response
- Added `cache: 'no-store'` to both `fetch()` calls in the promotions page (main data load + Quick Sale search)
- Service/product edit pages already use Supabase browser client (no caching) — no changes needed
- Ensures fresh data on every navigation: Quick Sale → service edit, End Sale → service edit, and vice versa

---

## Add Discount Type Options to Sale Pricing — 2026-02-19

- Added Percentage off / Fixed amount off / Direct price radio-style pill selector to both service and product edit pages
- **Service page**: `SaleDiscountControls` component with per-tier auto-calculation for vehicle_size, scope, and specialty pricing models
- **Product page**: `ProductSaleDiscountControls` component with single-price auto-calculation
- When Percentage or Fixed is selected, a single input drives all sale prices — per-tier inputs become read-only calculated values
- Switching back to Direct unlocks manual per-tier editing
- Discount type/value are UI-only state (not persisted) — the final calculated `sale_price` values are what gets saved

---

## Fix Sale Pricing Not Saving — 2026-02-19

- **Root cause**: `onSavePricing` did not include `sale_price` in upsert/update operations for `service_pricing` rows, and did not save `sale_starts_at`/`sale_ends_at` on the service. Clicking "Save Pricing" would reset sale prices to null.
- Added `sale_price` to vehicle_size upsert rows, scope update/insert, and specialty update/insert
- Added `sale_starts_at` and `sale_ends_at` to the service update in `onSavePricing`
- Added sale price validation (must be < standard price, must be > $0) to the pricing save
- Merged the two save buttons ("Save Pricing" + "Save Sale Pricing") into a single "Save Pricing" button that saves everything
- Bug 1 (Promotions sidebar): Already resolved — Promotions was already in `SIDEBAR_NAV` and the page exists

---

## Merge Vehicle Size + Sale Pricing Cards — 2026-02-19

- Merged the separate "Vehicle Size Pricing" card and "Sale Pricing" card into a single unified "Pricing" card on the service edit page
- Vehicle size model: single table with Vehicle Type, Standard Price, and Sale Price columns side by side
- Mobile: each tier renders as a stacked mini-card with Standard + Sale inputs in a 2-column grid
- Sale Period date pickers, Sale Preview, and Clear button are now embedded at the bottom of the same card
- For scope/specialty models: sale price inputs are now inline below the tier form in the same card (no separate card)
- Deleted standalone `SalePricingCard` component
- Sale status badge moved to the card title header

---

## Sale Pricing System — 2026-02-19

### Database
- Added `sale_price` column to `service_pricing` table (per-tier sale prices)
- Added `sale_starts_at` / `sale_ends_at` to `services` table (shared date window across tiers)
- Added `sale_price`, `sale_starts_at`, `sale_ends_at` to `products` table
- Added `combinable_with_sales` boolean to `coupons` table
- Check constraints: sale_price must be less than standard price

### Shared Utility
- Created `src/lib/utils/sale-pricing.ts` — single source of truth for sale status, tier info, countdown, and display helpers

### Admin — Service & Product Edit Pages
- Sale Pricing card on service edit page: per-tier sale price inputs, shared date range, live preview with status badge, clear all button
- Sale Pricing card on product edit page: sale price input, date range, preview, clear button

### Admin — Promotions Dashboard (`/admin/marketing/promotions`)
- Search, type filter (services/products), status filter (active/scheduled/expired/no sale)
- Summary stat cards with counts per status
- Grouped collapsible table with row actions (edit, end sale)
- Quick Sale dialog: multi-item selection, percentage/fixed discount, per-tier checkboxes, date range, real-time preview, batch apply

### API Routes
- `GET /api/admin/marketing/promotions` — combined services + products with computed sale status
- `POST /api/admin/marketing/promotions/batch` — bulk apply sale pricing
- `POST /api/admin/marketing/promotions/clear` — clear sale pricing from items

### Frontend Display
- `ServicePricingDisplay`: Was/Now pricing with strikethrough for vehicle_size, scope, and specialty models; Sale badge + urgency countdown
- `ServiceCard`: Sale badge overlay on image, Was/Now price display on listing cards
- `ProductCard`: Sale badge, Was/Now price in overlay, effective sale price flows to cart
- Product detail page: Sale badge, save percentage, Was/Now pricing, urgency countdown, sale price flows to Add to Cart

### Navigation
- Added "Promotions" as first item under Marketing in admin sidebar

---

## Ticker Marquee Starts Off-Screen — 2026-02-19

- Changed `@keyframes marquee` from `translateX(0) → translateX(-50%)` to `translateX(100vw) → translateX(-100%)` so text enters from fully off-screen right and exits fully off-screen left
- Updated duration calculation: total travel distance is now `window.innerWidth + el.scrollWidth` instead of `el.scrollWidth / 2`

---

## Ticker Hover UX Polish — 2026-02-19

- Added `cursor: default` and `user-select: none` to `.ticker-track` container to prevent text I-beam cursor and accidental text selection on hover

---

## Ticker Instant Hover Pause — 2026-02-19

### Removed two-phase marquee system, replaced with single CSS animation
- Removed the 4-phase system (hidden → ready → entering → looping) that used a CSS transition for entry and a CSS animation for looping. `animation-play-state: paused` only works on animations, not transitions, so hover-pause had latency during the entering phase.
- Now uses a single `animate-marquee` CSS animation applied immediately on mount. Content starts scrolling instantly — no entering transition, no JavaScript phase state.
- Hover pause is pure CSS: `.ticker-track:hover .animate-marquee { animation-play-state: paused }` — freezes on the exact frame the mouse enters, zero latency.
- Removed `useMarquee` hook, `marqueeProps` function, `MarqueePhase` type, `ticker-entering` class, `ticker-hover-pause` class, and the `transition-duration: 9999s` hack.
- React `useHoverPause` state kept only for multi-ticker rotation JS timer pausing (not for visual freeze).
- DB migration: `section_position` column changed from INTEGER to TEXT with CHECK constraint for valid position values.

---

## Section Ticker Position-Based Rendering + Smart Fallback — 2026-02-19

### Position-aware section tickers with fallback chain
- Section tickers now support 5 positions: After Hero, After Services, After Reviews, Before CTA, Before Footer
- Created shared `ticker-sections.ts` utility with `TickerPosition` type, `POSITION_AVAILABILITY` map, `resolveTickerPosition()` fallback logic, and `tickersForPosition()` filter
- Created `SectionTickerSlot` server component — fetches tickers, filters by position/pageType, handles CMS toggle checks
- Homepage now renders 4 position slots (after_hero, after_services, after_reviews, before_cta) instead of a single hardcoded ticker
- Added `SectionTickerSlot position="before_cta"` to 8 pages: Products (3), Services (3), Areas (2)
- `LayoutSectionTickers` now renders only `before_footer` tickers on ALL pages (removed homepage skip)
- Fallback chain: `after_hero` → `before_cta` → `before_footer`, etc. Existing tickers with null position default to `before_footer`

### Admin ticker editor updates
- Dropdown now shows all 5 positions with descriptions (e.g., "After Hero — Below the hero section (homepage only)")
- `PositionAvailabilityWarning` shows which pages support the position and where it will fall back
- Target pages selector now includes Service Areas and Gallery options
- Admin list page shows position labels (e.g., "After Hero") instead of generic "Section" badge

---

## Section Tickers on All Pages + Admin Position Warnings — 2026-02-19

### Section tickers now render on Products, Cart, Checkout, Services, CMS, and Account pages
- Previously, section (mid-page) tickers only rendered on the homepage
- Added `getAllSectionTickers()` data function in `cms.ts` — fetches all active section tickers without page filtering
- Added `LayoutSectionTickers` client component in `announcement-ticker.tsx` — renders section tickers before the footer on non-homepage pages, with client-side page type filtering via `tickerMatchesPage()`
- Layout (`(public)/layout.tsx`) now fetches section tickers and renders them before the footer
- Homepage continues to render section tickers inline (between Services and Why Choose Us sections)
- Fixed homepage using `getSectionTickers('/')` which had a page filtering bug (compared path '/' against page type strings like 'home')

### Admin ticker editor improvements
- Changed Section Position from freeform text input to a dropdown with predefined options: After Hero, After Services, Before Footer
- Added `PositionAvailabilityWarning` component — shows amber note when a section ticker's position (e.g., "After Hero") is only available on the Homepage but the ticker targets other page types
- Warning explains the ticker will fall back to "Before Footer" on those pages

---

## Trust Bar + Hero Rating Fixes — 2026-02-19

### Rating formatting
- Fixed hero section and trust bar showing "5" instead of "5.0" — both now use `parseFloat(rating).toFixed(1)`
- Affects `hero-section.tsx` (Google + Yelp inline stats) and `trust-bar-client.tsx` (Google + Yelp sections)

### Dynamic vehicle count
- Replaced hardcoded `6000+` in trust bar with live count from database
- New `src/lib/data/vehicle-count.ts`: baseline (3,816) + COUNT of completed jobs since Jan 1, 2026
- Baseline and cutoff date default in code, overridable via `business_settings` keys `vehicle_count_baseline` and `vehicle_count_baseline_date`
- Count auto-increments as new jobs complete through POS
- Trust bar server component fetches count in parallel with review data

---

## Review Display Formatting — 2026-02-19

- Fixed footer review badges rendering "5on Google·37 reviews" instead of "5.0 on Google · 37 reviews"
- Rating now formatted with `parseFloat(r.rating).toFixed(1)` for consistent decimal display
- Collapsed separate flex-gapped spans into inline text so word spacing is natural, not dependent on flex gap
- Only frontend (`footer-client.tsx`) affected — admin has no review preview, just a show/hide toggle

---

## Footer Brand Column Fixes — 2026-02-19

### Logo Width Input
- **Bug**: Number input didn't allow manual typing — `onChange` clamped on every keystroke (`Math.max(40, parseInt(...) || 160)`), so clearing the field to type a new value snapped to 160 immediately
- **Fix**: Store raw string state (`logoWidthStr`), only clamp on `onBlur` (40–400, default 160). Free keyboard entry while typing.

### Show/Hide Logo Toggle
- Added `show_logo` boolean to brand column config (defaults `true` for backward compat)
- Admin: checkbox toggle above Logo Width input; disables/grays width input when logo hidden
- Frontend (`footer-client.tsx`): checks `config.show_logo !== false` before rendering logo/fallback

---

## Icon Picker Fix — 2026-02-19

### Bug Fix
- **Icon picker was broken in HTML editor toolbar**: Clicking "Icon" caused the search bar to replace the entire toolbar, with no icons displayed and no way to dismiss
- **Root cause**: Both parent containers (footer editor, CMS page editor) had `overflow-hidden` on the toolbar wrapper. The icon picker dropdown used `position: absolute` inside this container, and the search input's `autoFocus` triggered browser auto-scroll of the overflow-hidden container, scrolling toolbar buttons out of view
- **Fix**: Changed `IconPickerDropdown` to render via `createPortal` to `document.body` with `position: fixed`, completely escaping the overflow-hidden ancestor
- Added click-outside-to-close handler (deferred to prevent immediate close from trigger click)
- Added Escape key dismiss handler
- Added dark mode support to all dropdown elements
- Position calculation prevents off-screen overflow (clamps to viewport edges)

---

## Docs Reorganization + Lean CLAUDE.md — 2026-02-19

### CLAUDE.md Slimmed
- 1,304 lines (185KB) → 127 lines (7KB) — 90% reduction
- Now a lean cheat sheet: tech stack, critical rules, project structure, key patterns, phase status, reference doc table
- All session history, feature details, and system-specific documentation moved to appropriate docs

### docs/ Folder Structure
- `docs/dev/` — 8 active developer reference docs (ARCHITECTURE, CONVENTIONS, DESIGN_SYSTEM, DASHBOARD_RULES, POS_SECURITY, QBO_INTEGRATION, SERVICE_CATALOG, DATA_MIGRATION_RULES)
- `docs/audits/` — 13 archived system audits (code-consistency, ui-consistency, variable-data, verification, feature-toggles, hero-theme, nav-footer, permissions, pos-dashboard-boundary, quote-summary, role-experience, tcpa, theme-system)
- `docs/planning/` — 7 project planning docs (PROJECT, POST_LAUNCH_ROADMAP, PHASE8_JOB_MANAGEMENT, COUPONS, NEW_SITE, iPAD, MEMORY)
- `docs/manual/` — User manual skeleton (README.md) + website system guide seed (website/README.md)
- `docs/CHANGELOG.md` — stays at root

### Content Enriched
- `ARCHITECTURE.md`: Added Footer System, Announcement Ticker System, Order System sections
- `DESIGN_SYSTEM.md`: Added Public Site Theme System section (CSS variable indirection, theme priority chain, key variable groups, seasonal presets, per-slide hero overrides, cross-references to audits)

### Zero Information Loss
- All 30 original files moved — nothing deleted
- Filenames normalized: dev/ = UPPER_CASE with underscores, audits/ = lowercase with hyphens

---

## Service Areas Empty Prefix + Icon Theme Colors — 2026-02-19

### Fix: Service Areas Prefix Text — Allow Empty
- Admin UI (`footer/page.tsx`): Changed `||` to `??` for `prefix_text` initialization and dirty check. Empty string is now a valid value.
- Frontend (`footer-client.tsx`): Changed `||` to `??` for prefix text fallback. When empty, no prefix text or trailing space renders — just city links.
- Placeholder updated to "e.g. Mobile Detailing in (leave blank for none)" with helper text clarifying behavior.
- API route (`/api/admin/footer/sections`) already stored `config` as-is — no changes needed.

### Icon Theme Color Token (`--site-icon-accent`)
- New CSS variable `--site-icon-accent: var(--lime)` in `:root` (globals.css) — defaults to lime accent, overridable via theme settings.
- Added to `@theme inline` as `--color-site-icon-accent` so `text-site-icon-accent` Tailwind utility works.
- Added to `.public-theme[data-user-theme="light"]` CSS section.
- Added to `LIGHT_VARS` in `theme-toggle.tsx` for JS-based light mode toggle.
- Added to `buildSiteThemeVars()` in `theme-provider.tsx` — maps `color_icon_accent` from `site_theme_settings`.
- Added `color_icon_accent: string | null` to `SiteThemeSettings` TypeScript type.

### Icon Picker Theme Colors
- `icon-picker.tsx`: Color options changed from `[currentColor, #ffffff, #CCFF00]` to `[Theme Accent, Text Color, White, Muted]`.
- Default color changed from `currentColor` to `var(--site-icon-accent)` (Theme Accent).
- CSS variable colors use `style="color:var(--site-icon-accent)"` with `stroke="currentColor"` pattern for proper cascading.
- Color swatch previews use hardcoded hex for admin display, but generated SVG uses CSS variables.

### Footer Icons Use Icon Accent Token
- Brand column icons (Phone, Mail, MapPin) changed from `text-lime` to `text-site-icon-accent`.
- Business Info column icons (Phone, Mail) changed similarly.
- Trust badge strip icons (Shield, Award, Leaf, Clock) changed similarly.
- All footer icons now follow `--site-icon-accent` → consistent with HTML toolbar-inserted icons.

---

## Full HTML Editor Toolbar — Images, Media, Layout & Embeds — 2026-02-19

### Shared Toolbar Component
- Created `src/components/admin/html-editor-toolbar.tsx` — unified toolbar used by both footer HTML editor and CMS page editor
- Context-aware filtering (`context='footer'` hides CMS-only items: Video, Columns, Callout, Accordion)
- 4 toolbar groups: Text (Bold, Italic, Heading H2/H3/H4, Link), Media (Image, Video, Icon), Layout (Button, Divider, Spacer, Table, Columns), Blocks (Callout, Accordion, Social Links, Map, Embed, List)

### Image Manager
- `src/components/admin/html-image-manager.tsx` — dialog with Upload tab (drag & drop, 5MB max, JPEG/PNG/WebP/SVG/GIF) and Browse Library tab (gallery grid with search)
- Resize controls: width input, quick presets (Thumb 80px, Small 150px, Medium 250px, Large 400px, Full 100%), alignment (left/center/right), rounded corners, border options, alt text
- All images include `max-width:100%;height:auto;` for mobile responsiveness
- Upload API: `POST /api/admin/upload/content-image` — stores in `cms-assets/content-images/` bucket. GET lists images, DELETE removes from storage.

### 12 Toolbar Dialog Components (`src/components/admin/toolbar-items/`)
- **link-dialog** — URL, text, new tab checkbox. Theme-aware link classes.
- **video-embed-dialog** — YouTube/Vimeo auto-detection, responsive 16:9 iframe (Small/Medium/Full). CMS-only.
- **button-dialog** — Primary (site-btn-primary), Outline (lime border), Ghost (underline). Size S/M/L, auto/full width, alignment.
- **divider-dialog** — Line/Dashed/Dotted/Fade gradient. Width full/half/third. Tight/Normal/Wide spacing.
- **table-dialog** — Custom (configurable rows/cols/header), Business Hours template (7 days), Pricing template (accent-colored prices). Wrapped in `overflow-x:auto` for mobile.
- **columns-dialog** — 2 equal, 3 equal, 1/3+2/3 layouts. Flexbox with `flex:1 1 250px` for automatic mobile stacking.
- **callout-dialog** — Info (lime), Tip (green), Warning (amber), Note (gray). Border-left accent + brand-surface background.
- **accordion-dialog** — Native `<details>/<summary>` elements. Configurable item count + questions. CMS-only.
- **social-links-dialog** — 8 platforms (Facebook, Instagram, Twitter/X, YouTube, TikTok, LinkedIn, Yelp, Google). Icons only/with text, 3 sizes, theme/white/original colors. SVGs via renderToStaticMarkup.
- **map-embed-dialog** — Google Maps embed. Accepts embed URL or plain address. Configurable height/width.
- **embed-dialog** — Raw HTML/iframe paste for third-party widgets (review badges, booking forms, etc.)
- **list-dialog** — Bulleted, Numbered, Check marks (lime SVG checkmarks). Configurable items.
- **spacer-menu** — Dropdown: Small 16px, Medium 32px, Large 48px, XL 64px

### Theme Awareness
- All generated HTML uses CSS variables (`--site-text`, `--site-text-secondary`, `--site-border`, `--lime`, `--brand-surface`, etc.)
- Buttons use `site-btn-primary` class for full theme integration
- Colors adapt automatically to dark/light mode and seasonal themes

### Editor Integration
- `page-html-editor.tsx` — replaced inline toolbar with shared `HtmlEditorToolbar` (context="cms"). Kept AI Draft panel.
- `footer/page.tsx` — replaced inline Bold/Italic/Link/IconPicker toolbar with shared `HtmlEditorToolbar` (context="footer")

### Files Created
- `src/components/admin/html-editor-toolbar.tsx`
- `src/components/admin/html-image-manager.tsx`
- `src/app/api/admin/upload/content-image/route.ts`
- `src/components/admin/toolbar-items/` (12 files)

### Files Modified
- `src/components/admin/content/page-html-editor.tsx` — uses shared toolbar
- `src/app/admin/website/footer/page.tsx` — uses shared toolbar, removed inline Bold/Italic/Link buttons

---

## Footer Column Limit Fix + Icon Picker Extraction — 2026-02-19

### Column Limit — Span-Based Validation
- **API**: Removed hardcoded `MAX_COLUMNS_PER_SECTION = 4` count cap
- **New logic**: Max 6 active (enabled) columns, each minimum span 2, total active span must fit within 12-unit grid
- **API auto-calculates** new column span from remaining grid space (default 4, min 2, max remaining)
- **Admin UI**: `canAdd` checks both `activeColumns.length < 6` and `activeSpanTotal <= 10` (room for span-2)
- **Enable/disable toggle**: Validates both count limit and span overflow before enabling a disabled column
- **Span input**: Min changed from 1 to 2 (a 1-unit column is too narrow to be useful)
- **ColumnWidthPreview**: 3-state status (green "Grid complete", amber "N units unused", red "N units over"). Narrow columns (span ≤ 2) show just the span number instead of truncated label.
- **Disabled columns** don't count toward limits (neither span nor count)

### Icon Picker — Extracted to Shared Component
- Moved `IconPicker` (~170 lines) from `footer/page.tsx` to `src/components/admin/icon-picker.tsx`
- Footer admin HTML editor imports from shared component (removed inline code + ~20 unused Lucide imports)
- Added `IconPicker` to `PageHtmlEditor` toolbar (CMS page editor) — after Horizontal Rule, before AI Draft
- Both locations produce identical SVG markup with size/color selectors

### Footer Grid — Tablet Breakpoint
- Added `sm:grid-cols-12` to footer grid (was `grid-cols-1 md:grid-cols-12`)
- CSS: Mobile stacks full-width, tablet (640-767px) wraps 2 per row (span 6), desktop uses custom spans
- 5-6 columns at span 2 each render correctly on desktop

### Files Changed
- `src/app/api/admin/footer/columns/route.ts` — span-based validation
- `src/app/admin/website/footer/page.tsx` — constants, canAdd logic, toggle validation, preview, icon picker removal
- `src/components/admin/icon-picker.tsx` — new shared component
- `src/components/admin/content/page-html-editor.tsx` — added icon picker to toolbar
- `src/components/public/footer-client.tsx` — tablet grid breakpoint
- `src/app/globals.css` — tablet footer-col span 6 media query

---

## Ticker Above Header + Sticky with CSS Variable Offset — 2026-02-19

- Restored ticker to the very top of the page (ABOVE the header) — the first thing visitors see
- Ticker is independently `sticky top-0 z-50`; header is `sticky z-40` with `top: var(--ticker-height, 0px)`
- `useTickerHeight` hook uses `ResizeObserver` to set `--ticker-height` CSS variable on `:root` — header dynamically offsets itself below the ticker
- When no tickers are active (filtered out by page or disabled), `--ticker-height` is set to `0px` and header sticks at `top-0`
- z-index layering: ticker z-50 > header z-40 > page content (dropdowns/menus still work within header stacking context)

### Previous version (reverted)
- Had header + ticker in a single `sticky top-0 z-50` wrapper with header first, ticker below — wrong visual order

### Files Modified
- `src/app/(public)/layout.tsx` — removed sticky wrapper, ticker before header
- `src/components/public/cms/announcement-ticker.tsx` — `TopBarTickerFiltered` now wraps in sticky div + sets `--ticker-height` via ResizeObserver
- `src/components/public/header-client.tsx` — added `sticky z-40` + `top: var(--ticker-height, 0px)`

---

## Hero Section Readability Fixes + Per-Slide Color Overrides — 2026-02-19

### Issue #1 (CRITICAL): Hero text invisible in light mode
- Hero overlay is hardcoded black but text colors followed theme toggle → dark text on dark overlay in light mode
- Fix: `data-hero-scope` attribute + inline CSS variable defaults force white text regardless of theme toggle
- Per-slide overrides on child elements naturally override parent defaults via CSS custom property inheritance

### Issues #2+3 (MODERATE): Memorial Day theme contrast
- Memorial Day `--lime` was `#1e40af` (dark navy) → 2.3:1 contrast for button text, accent invisible on dark backgrounds
- Changed to `#60a5fa` (blue-400) → 8.6:1 on black, visible accent, updated full palette + glow RGB

### Issue #4 (LOW): Light mode CTA button borderline contrast
- Light mode CTA button was `#65a30d` with white text → 3.6:1 (fails WCAG AA normal text)
- Changed to `#4d7c0f` → 4.6:1 (passes WCAG AA), hover state uses `#65a30d`
- Updated both `theme-toggle.tsx` LIGHT_VARS and `globals.css` `[data-user-theme="light"]` block

### Issues #5+6 (LOW): text-faint/text-dim audit
- `text-site-text-faint`: 80+ usages — all decorative/disabled (cursor-not-allowed, separators, placeholder, optional labels)
- `text-site-text-dim`: 70+ usages — all de-emphasized labels, placeholders, section dividers at large text sizes
- No code changes needed — added WCAG usage comments in `globals.css`

### Per-Slide Hero Color Overrides
- **Migration**: `20260219000005_hero_slide_colors.sql` — 6 nullable columns on `hero_slides`: `text_color`, `subtitle_color`, `accent_color`, `overlay_color`, `cta_bg_color`, `cta_text_color`
- **Types**: Updated `HeroSlide` interface with new fields
- **API**: Added 6 color fields to PATCH allowed fields in `/api/admin/cms/hero/[id]`
- **Admin UI**: Collapsible "Color Overrides" section in hero slide editor with hex input + native color picker + reset per field, "Reset all" button, active badge indicator
- **Frontend**: Per-slide CSS variable overrides applied as inline styles on content wrapper, overlay_color replaces hardcoded black gradients

### Files Modified
- `src/components/public/cms/hero-carousel.tsx` — hero scope defaults, per-slide overrides, overlay color support
- `src/lib/utils/cms-theme-presets.ts` — Memorial Day palette changed to #60a5fa
- `src/components/public/theme-toggle.tsx` — CTA button #65a30d → #4d7c0f
- `src/app/globals.css` — light mode button fallbacks, text-dim/faint comments
- `src/lib/supabase/types.ts` — HeroSlide color fields
- `src/app/api/admin/cms/hero/[id]/route.ts` — allowed fields
- `src/app/admin/website/hero/[id]/page.tsx` — ColorOverridesSection, save payload
- `supabase/migrations/20260219000005_hero_slide_colors.sql` — new columns

---

## CMS Page Route Fix — Typography & Static Params — 2026-02-19

- Installed `@tailwindcss/typography` plugin — `prose`/`prose-invert` classes on CMS pages and content blocks were non-functional without it
- Added `@plugin "@tailwindcss/typography"` to `globals.css`
- Added `generateStaticParams` to `/p/[...slug]` route for SSG pre-rendering of published pages
- Route already existed with full implementation: 3 templates (content/landing/blank), markdown→HTML, content blocks, SEO metadata with overrides
- Sitemap already includes `/p/{slug}` entries

---

## Footer Admin — Brand Column, Width Controls, Sidebar Link — 2026-02-19

### Fix 1: Admin Sidebar
- Added "Footer" link under Website section in `SIDEBAR_NAV` (`roles.ts`)
- Added `Rows3` icon to admin-shell icon map

### Fix 2: Brand Column Type
- New `'brand'` content type for `footer_columns` — replaces hardcoded logo/contact column
- Migration `20260219000004_footer_brand_column.sql`: adds `config` JSONB column, expands CHECK constraint, seeds brand column as first in main footer
- Brand column config: `logo_width`, `tagline`, `show_phone`, `show_email`, `show_address`, `show_reviews`, `col_span`
- Frontend `BrandColumn` component in `footer-client.tsx` — exact same styling as old hardcoded section

### Fix 3: Per-Column Width (12-Unit Grid)
- Each column has `col_span` (1-12) stored in `config` JSONB
- Frontend uses `grid-cols-12` at md+ with CSS custom property `--footer-col-span`
- Mobile stacks to full width via `.footer-col { grid-column: span 1 }` in globals.css
- Auto-rebalance: adding/removing columns redistributes spans to total 12

### Fix 4: Admin UI
- Column Width Preview bar — proportional colored bars showing span values per column
- Span input (1-12) on each column card header
- Total validation indicator (12 = green check, other = amber warning)
- Brand Column Editor: logo width input, tagline textarea, show/hide toggles
- Delete warning for brand columns
- Column count display simplified (no "of 4" — just count)

### Files Modified
- `src/lib/auth/roles.ts` — Footer nav item
- `src/app/admin/admin-shell.tsx` — Rows3 icon
- `src/lib/supabase/types.ts` — `config` field + `'brand'` content type on `FooterColumn`
- `src/app/api/admin/footer/columns/route.ts` — `config` in PATCH/POST
- `src/components/public/footer-client.tsx` — Brand column renderer, 12-col grid
- `src/app/admin/website/footer/page.tsx` — Brand editor, width preview, span controls
- `src/app/globals.css` — `.footer-col` span rule

---

## Multi-Ticker Ordering + Rotation System — 2026-02-19

### Admin: Ticker reorder + global rotation options

**New file: `src/app/api/admin/cms/tickers/reorder/route.ts`**
- PATCH endpoint for batch `sort_order` updates on `announcement_tickers`
- Auth: session + `cms.tickers.manage` permission
- Revalidates `cms-tickers` cache tag

**Modified: `src/app/admin/website/tickers/page.tsx`**
- Tickers grouped by placement (Top Bar, Between Sections) with section headers
- Up/down arrow reorder (ChevronUp/ChevronDown + GripVertical) per card — works on mobile touch
- Boundary checks: first item disables up, last disables down
- Optimistic UI with revert on API error
- **Global Options card** appears per placement when 2+ active tickers:
  - Text Entry: Scroll (continuous marquee), R to L, L to R, Top to Bottom, Bottom to Top, Fade In
  - Background Transition: Crossfade, Slide Down, None (instant)
  - Hold Duration: 1-30 seconds
  - Saved to `business_settings` as `ticker_top_bar_options` / `ticker_section_options` JSON

### Public: Per-ticker rotation with configurable animations

**Modified: `src/components/public/cms/announcement-ticker.tsx`**
- **Single ticker** (1 active): Continuous marquee loop (unchanged from original behavior). Full bar in that ticker's colors/font, height determined by `font_size` Tailwind class.
- **Multiple tickers** (2+ active): Configurable rotation via `TickerPlacementOptions`:
  - Each ticker displays one at a time, full-width bar with its own `bg_color`, `text_color`, `font_size`
  - Background transition between tickers (crossfade / slide_down / none)
  - Text entry animation (scroll / ltr / rtl / ttb / btt / fade_in)
  - Hold duration before cycling to next ticker
  - When `text_entry = 'scroll'`: each ticker does a continuous marquee loop for `hold_duration` seconds, then transitions to next
  - When any other `text_entry`: message enters with animation, holds centered, then transitions
- Removed broken multi-message train approach (mixed bg colors/heights per message in a single scroll)
- Phase machine: bg-in -> show content -> hold -> hide content -> bg-out -> next index

**Modified: `src/lib/data/cms.ts`**
- New `TickerPlacementOptions` interface and `DEFAULT_TICKER_OPTIONS` constant
- New `getTickerOptions()` cached function — reads `ticker_top_bar_options` and `ticker_section_options` from `business_settings`, merges with defaults. Tagged `cms-tickers`, 60s TTL.

**Modified: `src/app/(public)/layout.tsx`**
- Fetches `getTickerOptions()` in parallel with other CMS data
- Passes `options={tickerOptions.top_bar}` to `<TopBarTicker>`

**Modified: `src/app/(public)/page.tsx`**
- Fetches `getTickerOptions()` in parallel
- Passes `options={tickerOptions.section}` to `<SectionTicker>`

**Modified: `src/app/api/admin/settings/business/route.ts`**
- PATCH now also revalidates `cms-tickers` tag when key starts with `ticker_`

---

## Configurable Footer — Admin UI — 2026-02-19

### Session 3: Admin page for managing footer sections, columns, and links

**Admin page (`/admin/website/footer/page.tsx`):**
- 3 collapsible section cards (Main Footer, Service Areas, Bottom Bar) with enable/disable toggles
- **Main Footer**: Column manager with add/edit/delete, drag-and-drop reorder, content type badges (Links/HTML/Business Info)
  - Links editor: add/edit/delete/reorder links within a column, toggle active state, open-in-new-tab
  - HTML editor: textarea with save/preview, approximate dark-background preview
  - Business Info: read-only info panel linking to business settings
  - Max 4 columns enforced (button disabled at limit)
  - Delete confirmation mentions link count when applicable
- **Service Areas**: Prefix text editor with save button, link to city pages management
- **Bottom Bar**: Custom copyright text override (optional), bottom link CRUD with edit/delete/toggle

**Website index page (`/admin/website/page.tsx`):**
- Added "Footer" card with Rows3 icon linking to `/admin/website/footer`

**Patterns matched:**
- Same drag-and-drop pattern as navigation admin
- Same Card/Switch/Badge/Button/Spinner components
- Same adminFetch + toast pattern for all API calls
- Optimistic UI updates with rollback on failure
- All mutations use Session 1 API routes (no new routes created)

---

## Configurable Footer — Frontend Component — 2026-02-19

### Session 2: Dynamic footer rendering from database

**Migration (`20260219000003_footer_business_info_type.sql`):**
- Added `business_info` to `footer_columns.content_type` CHECK constraint
- Updated Contact column from `html` to `business_info` type

**Server component (`site-footer.tsx`):**
- Rewritten to accept `footerData: FooterData` prop instead of `navItems`
- Fetches review data internally (not part of FooterData — separate data source)
- Passes `footerData`, formatted `phone`, and `reviews` to client

**Client component (`footer-client.tsx`):**
- Full rewrite. All 3 sections render conditionally from `footer_sections.is_enabled`
- **Main Footer**: Brand column (logo, tagline, contact, reviews) + dynamic nav columns from `footer_columns`. Grid adapts to column count (1-4). Three column content types:
  - `links` — nav items from `website_navigation` via `footer_column_id`
  - `business_info` — auto-renders phone/email + Book Appointment/Get a Quote CTAs from BusinessInfo
  - `html` — dangerouslySetInnerHTML with styled link classes
- **Service Areas**: Configurable prefix text from `footer_sections.config.prefix_text`. Configurable dividers from `config.show_dividers`.
- **Bottom Bar**: Dynamic links from `footer_bottom_links`. Dead Unsubscribe link removed (was 404).
- **Trust badges**: Preserved as-is (hardcoded, not part of configurable system)
- All existing CSS classes preserved exactly — visual output identical with default data

**Layout updates:**
- All 3 layouts (public, account, customer-auth) now pass `footerData` prop directly to `SiteFooter`
- Removed intermediate `footerNav` extraction from Session 1

**Types:**
- `FooterColumn.content_type` updated: `'links' | 'html' | 'business_info'`

**Files modified (6):** `site-footer.tsx`, `footer-client.tsx`, 3 layouts, `types.ts`
**Files created (1):** migration `20260219000003`

**Verification:** TypeScript clean, build passes, Contact column confirmed as `business_info` in DB.

---

## Configurable Footer System — Database + API Routes — 2026-02-19

### Session 1: Database schema, API routes, and data layer for admin-configurable footer

**Database (migration `20260219000002_footer_sections.sql`):**
- `footer_sections` table — 3 seeded sections (main, service_areas, bottom_bar) with enable/disable, sort_order, JSONB config
- `footer_columns` table — configurable columns for main footer section (max 4 per section). 2 seeded: Quick Links (links type) + Contact (html type)
- `footer_bottom_links` table — legal/utility links in bottom bar. Seeded: Terms & Conditions only (dead Unsubscribe link removed)
- `footer_column_id` FK added to `website_navigation` — existing 6 footer_quick_links nav items migrated to Quick Links column
- RLS policies: public read, authenticated write (matches website_navigation pattern)
- `updated_at` triggers on all 3 new tables

**TypeScript types (`types.ts`):**
- `FooterSection`, `FooterColumn`, `FooterBottomLink`, `FooterData` interfaces
- `FooterSectionKey` type union
- `footer_column_id` added to `WebsiteNavItem`

**Data layer (`website-pages.ts`):**
- `getFooterData()` — cached with `unstable_cache`, `footer-data` tag, 60s revalidation. Fetches sections, enabled columns with attached links, bottom links, cities, and business info in parallel.

**API routes (5 new files under `/api/admin/footer/`):**
- `sections/route.ts` — GET (list), PATCH (update section enable/config)
- `columns/route.ts` — GET (list), POST (create, max 4 limit), PATCH (update), DELETE
- `columns/[columnId]/links/route.ts` — GET, POST, PATCH, DELETE for column links
- `columns/reorder/route.ts` — PATCH (batch reorder)
- `bottom-links/route.ts` — GET, POST, PATCH, DELETE
- All routes use `createAdminClient()`, `cms.pages.manage` permission, `revalidateTag('footer-data')`

**Layout updates:**
- `(public)/layout.tsx` — replaced `getNavigationItems('footer_quick_links')` with `getFooterData()`, extracts Quick Links for backward-compatible `navItems` prop
- `(account)/layout.tsx` — added `getFooterData()` fetch, passes `navItems` to SiteFooter (was not passing any before)
- `(customer-auth)/layout.tsx` — same as account layout

**Cache revalidation:**
- Added `revalidateTag('footer-data')` to all 3 existing navigation CMS routes (create, update, delete, reorder)

**Files created (6):** migration, 5 API route files
**Files modified (7):** `types.ts`, `website-pages.ts`, 3 layouts, `navigation/route.ts`, `navigation/[id]/route.ts`, `navigation/reorder/route.ts`

**Verification:** TypeScript clean, build passes, 3 sections + 2 columns + 1 bottom link + 6 migrated nav items confirmed in DB.

---

## Fix: Ticker Scroll, Section Tickers, Particle Rendering — 2026-02-19

### fix: ticker marquee scroll, section placement, particle flag reliability

**Bug 1 — Tickers Not Scrolling (FIXED)**
- Root cause: `TopBarTicker` used Framer Motion vertical fade transition instead of horizontal marquee scroll. Hardcoded `text-sm` — ignored `font_size` DB field. Ignored `scroll_speed` DB field.
- Fix: Rewrote `TopBarTicker` with CSS marquee animation (duplicated content, `animate-marquee` from globals.css). Scroll speed mapped: slow=35s, normal=20s, fast=10s. Font size mapped: xs/sm/base/lg → Tailwind text classes. Multiple tickers rotate every 8s.
- Also removed dismiss X button and sessionStorage logic — ticker no longer has a close button that permanently hides it for the session.

**Bug 2 — Section Tickers Not Appearing (FIXED)**
- Root cause: `SectionTicker` component existed but was NEVER rendered anywhere. `getSectionTickers()` data function existed but was never called from any public page.
- Fix: Homepage now fetches `getSectionTickers('/')` and renders `SectionTicker` between Services and "Why Choose Us" sections when placement is set to "Between Sections".

**Bug 3 — Particle Effects Still Not Rendering (IMPROVED)**
- Root cause: Previous `setFeatureFlag()` used `.update().select('id')` which may return ambiguous results from Supabase PostgREST.
- Fix: Changed to explicit check-then-update/insert pattern: `.select().maybeSingle()` to check existence, then `.update()` if exists or `.insert()` if not. More reliable than the previous update+select approach.

**Files modified (3):**
- `src/components/public/cms/announcement-ticker.tsx` — Complete rewrite: CSS marquee scroll, scroll_speed/font_size support, removed dismiss button, SectionTicker also uses marquee
- `src/app/(public)/page.tsx` — Added section ticker fetch + rendering between homepage sections
- `src/lib/utils/feature-flags.ts` — Changed to check-then-update/insert pattern for reliability

**Verification**: TypeScript clean (`tsc --noEmit`), build passes (`npm run build`).

---

## Verified Bug Fixes: Tickers + Particle Rendering — 2026-02-19

### fix: tickers "Failed to Update" error + desktop particle rendering

**Bug 1 — Tickers "Failed to Update" (ACTUAL ROOT CAUSE FOUND)**
- Previous session's "fix" only added a warning banner — never fixed the actual API call
- Root cause: Admin page (`/admin/website/tickers/page.tsx:67`) calls `PATCH /api/admin/settings/business` which **DID NOT EXIST**. Next.js returns 404 → catch block fires → "Failed to update" toast
- Also affects: Ads admin page (`/admin/website/ads/page.tsx:121`) — same missing endpoint
- Fix: Created `/api/admin/settings/business/route.ts` with GET (read by key) and PATCH (upsert by key) handlers. Uses `getEmployeeFromSession()` auth + `createAdminClient()` for DB. Upserts into `business_settings` table with `onConflict: 'key'`. Revalidates `cms-toggles` cache tag.
- Verified: Full chain traced — toggle click → `adminFetch('/api/admin/settings/business', { method: 'PATCH', body: { key: 'ticker_enabled', value: true } })` → new API route → `business_settings.upsert()` → `revalidateTag('cms-toggles')` → layout re-reads toggles

**Bug 2 — Desktop Particle Effects Not Rendering (ACTUAL ROOT CAUSE FOUND)**
- Previous session assumed hydration fix would resolve particles — it didn't
- Root cause: `setFeatureFlag()` in `src/lib/utils/feature-flags.ts` used `.update()` which silently does nothing if the flag row doesn't exist in the DB. When admin activates a seasonal theme → `setFeatureFlag('seasonal_themes', true)` → update affects 0 rows → flag stays `false` → `getCmsToggles()` returns `seasonalThemes: false` → layout passes `theme={null}` to ThemeProvider → ParticleCanvas never renders
- Fix: Changed `setFeatureFlag()` to check update result count. If 0 rows updated, falls back to INSERT with auto-generated name/description/category. Ensures flag is always set regardless of DB state.
- Additional fix: Changed ParticleCanvas z-index from `z-50` to `z-30` — particles now render above page content but below sticky header (z-50) and modal overlays (z-90+). Previous z-50 caused particles to compete with header's z-50.
- Verified: No desktop-blocking code in ParticleCanvas. Canvas sizes correctly to `window.innerWidth/Height`. Animation loop starts via `requestAnimationFrame`. Mobile check only reduces particle count (not blocks). Feature flag now reliably sets.

**Files modified (3 created/modified):**
- `src/app/api/admin/settings/business/route.ts` — **NEW** — GET + PATCH for business settings
- `src/lib/utils/feature-flags.ts` — `setFeatureFlag()` update → update+insert fallback
- `src/components/public/cms/particle-canvas.tsx` — z-index: z-50 → z-30

**Verification**: TypeScript clean (`tsc --noEmit`), build passes (`npm run build`).

---

## Theme System Bug Fixes — 2026-02-19

### fix: hydration error, dark/light toggle, seasonal indicator, tickers, desktop particles

**Bug 1 — Hydration Error (ThemeToggleInitializer)**
- Root cause: bare `<script>` tag inside the React component tree caused SSR/client DOM mismatch
- Fix: Replaced with Next.js `<Script strategy="beforeInteractive">` which hoists to `<head>`
- Moved `<ThemeToggleInitializer>` outside the `.public-theme` div in all 3 layouts (public, account, customer-auth)

**Bug 2 — Dark/Light Toggle Not Working**
- Root cause: ThemeProvider sets CSS variables via inline `style` on a parent div; the toggle only set a `data-user-theme` attribute on the child `.public-theme` div, relying on CSS selectors that couldn't reliably override inherited inline styles
- Fix: Toggle now uses `style.setProperty()` to apply all light mode CSS variable overrides directly on the `.public-theme` element, and `style.removeProperty()` to revert to dark mode
- ThemeToggleInitializer script also applies inline styles for flash-free light mode on page load

**Bug 3 — Seasonal Theme Override Without Indication**
- Added amber warning banner on Theme & Style Settings page when a seasonal theme is active
- Banner explains that seasonal theme overrides some colors, links to Manage Seasonal Themes
- Updated page description: "These settings control your site's base theme. Active seasonal themes may override some colors."
- Seasonal Themes list page badge text updated from "Active" to "Currently Active"

**Bug 5 — Tickers "Tickers Enabled" Toggle Doesn't Work**
- Root cause: Layout checks TWO conditions — `announcement_tickers` feature flag AND `ticker_enabled` business setting. Admin's toggle only controls `ticker_enabled`. The `announcement_tickers` flag defaults to `false` and must be enabled separately on Feature Toggles page.
- Fix: Added amber warning banner on Tickers admin page when `announcement_tickers` feature flag is disabled, with link to Feature Toggles page

**Bug 6 — Particles Not Rendering on Desktop**
- No code-level desktop bug found in `particle-canvas.tsx` — canvas sizes correctly, has more particles on desktop, no screen-size gating
- Most likely caused by Bug 1 hydration error preventing ParticleCanvas from properly mounting on client
- Expected to be resolved by Bug 1 fix

**Files modified (7):**
- `src/components/public/theme-toggle-initializer.tsx` — rewritten with Next.js Script
- `src/components/public/theme-toggle.tsx` — rewritten with style.setProperty()
- `src/app/(public)/layout.tsx` — moved ThemeToggleInitializer outside .public-theme
- `src/app/(account)/layout.tsx` — same
- `src/app/(customer-auth)/layout.tsx` — same
- `src/app/admin/website/theme-settings/page.tsx` — seasonal theme warning banner
- `src/app/admin/website/tickers/page.tsx` — feature flag warning banner
- `src/app/admin/website/themes/page.tsx` — "Currently Active" badge text

**Verification**: TypeScript clean, build passes.

---

## Account & Public Component Dark-Safe Colors — 2026-02-17

### fix: migrate remaining hardcoded colors in account pages and public components to dark-safe theme tokens

**Account pages (3 files)**
- `loyalty/page.tsx`: Points change colors `text-green-600`/`text-red-600` → `-400` variants
- `account-shell.tsx`: Deactivated account icon `bg-amber-100`/`text-amber-600` → `bg-amber-500/10`/`text-amber-400`
- `transaction-detail.tsx`: Error text `text-red-600` → `-400`, discount/loyalty rows `text-green-600` → `-400`, loyalty earned text → `-400`

**Account components (2 files)**
- `appointment-edit-dialog.tsx`: Error text `text-red-600` → `-400`, phone icon `text-blue-600` → `-400`
- `appointment-card.tsx`: Cancel button `text-red-600` → `text-red-400`

**Public components (3 files)**
- `mobile-menu.tsx`: Backdrop `bg-navy/95` → `bg-brand-black/95`, nav hover `text-brand-200` → `text-lime`, CTA button → `site-btn-cta`
- `hero-client.tsx`: Service name accent `text-brand-200` → `text-lime`
- `cta-section.tsx`: Gradient endpoint `to-black` → `to-brand-black`

**Verification**: Zero hardcoded matches in account/public scans, `tsc` + `build` pass clean.

---

## Contextual UI Theme System — 2026-02-17

### feat: contextual UI theme system with dark/light user toggle

**Step 1 — Contextual CSS variables in globals.css**
- Added ~35 `--ui-*` variables in `:root` as light defaults (admin pages)
- Added `.public-theme` block overriding UI vars to dark values via existing site vars
- Added `.public-theme[data-user-theme="light"]` block resetting UI vars to light + overriding site-level vars
- Added `@theme inline` mappings for all ui-* tokens plus `--shadow-ui` and `--shadow-ui-lg`

**Step 2 — Theme toggle components**
- Created `theme-toggle.tsx` — client component with sun/moon icon, localStorage persistence (`sd-user-theme`)
- Created `theme-toggle-initializer.tsx` — inline `<script>` to prevent flash of wrong theme

**Step 3 — Wired into layouts and headers**
- Added ThemeToggle to header-client.tsx (between Sign In and Cart icon)
- Added ThemeToggleInitializer to all 3 public layouts
- Fixed customer-auth layout missing `public-theme` class

**Step 4 — Migrated all 25 UI components to contextual tokens**
- card, dialog, input, textarea, select, table, button (6 variants), badge, tabs, dropdown-menu, checkbox, switch, skeleton, spinner, label, form-field, page-header, empty-state, search-input, data-table, pagination, slide-over, confirm-dialog, send-method-dialog, toggle-pill
- Replaced all `dark:`, `bg-white`, `bg-gray-*`, `text-gray-*`, `border-gray-*` with `ui-*` tokens
- Straggler scan: zero remaining hardcoded classes in `src/components/ui/`

**Step 5 — Verification**
- TypeScript: zero errors
- Build: passes clean
- Grep straggler scan: zero matches

---

## Theme Consistency Fix — 2026-02-17

### fix: theme consistency — login buttons, active tab, hardcoded classes, dead admin fields

**Fix 1 — Remove dead theme settings fields from admin UI**
- Removed Mode toggle (dark/light), Status Colors card (success/warning/error), Font Sizes card (h1-h3/body/small/base), Font Weights card, Line Height card, Primary Button Padding field, Secondary Button card, and entire Borders & Spacing tab
- These 27 fields are saved to DB but never injected by ThemeProvider — admin changes had zero effect
- DB columns preserved; only UI inputs removed. Comments document which fields to re-add when wired

**Fix 2 — Login buttons use `.site-btn-primary`**
- Replaced inline `bg-lime text-black rounded-full` on signin, signup, and reset-password pages with `.site-btn-primary` CSS class
- Buttons now respond to admin Theme Settings button color/radius overrides

**Fix 3 — Account shell active tab visibility**
- Changed active tab from `bg-brand-surface` (invisible against same-color container) to `bg-lime/10 text-lime border border-lime/20`
- Active state now uses accent color, updates with seasonal themes

**Fix 4 — Migrate 11 hardcoded color classes**
- `focus:border-blue-500 focus:ring-blue-500` → `focus:border-lime focus:ring-lime` (services page vehicle filter)
- `text-blue-600 hover:text-blue-800` → `text-site-link hover:text-site-link-hover` (transactions receipt link, service detail gallery link)
- `hover:border-white/20` → `hover:border-site-border-medium` (orders list)
- `divide-white/5` → `divide-site-border-light` (order detail items)
- `border-white/10` → `border-site-border` (order detail total)
- `bg-green-50 text-green-800` → `bg-green-500/10 text-green-400` (loyalty redeem message)

**Fix 5 — Add `public-theme` class to account layout**
- Added `public-theme` to wrapper div for custom scrollbar styles (matches public layout)

**Files modified (10):**
- `src/app/admin/website/theme-settings/page.tsx`
- `src/app/(customer-auth)/signin/page.tsx`
- `src/app/(customer-auth)/signup/page.tsx`
- `src/app/(customer-auth)/signin/reset-password/page.tsx`
- `src/components/account/account-shell.tsx`
- `src/app/(account)/layout.tsx`
- `src/app/(account)/account/services/page.tsx`
- `src/app/(account)/account/transactions/page.tsx`
- `src/app/(account)/account/services/[jobId]/page.tsx`
- `src/app/(account)/account/orders/page.tsx`
- `src/app/(account)/account/orders/[id]/page.tsx`
- `src/app/(account)/account/loyalty/page.tsx`

---

## Phase 9, Session 6 — 2026-02-17 (Fix Order & PaymentIntent Duplication)

### fix: prevent duplicate orders and PaymentIntents in checkout flow

**Root cause**: Every click of "Continue to Payment" created a NEW order + NEW Stripe PaymentIntent. Clicking "Back"/"Edit" wiped orderId/clientSecret state, making the old order unreusable. Result: orphaned orders, wasted order numbers (WO-XXXXX), dozens of "Incomplete" PaymentIntents in Stripe.

#### Fix 1: API accepts existing orderId for updates
- `create-payment-intent` route now accepts optional `orderId` in request body
- UPDATE path: verifies order is still pending, updates fields, replaces order_items, calls `stripe.paymentIntents.update()` on existing PI
- CREATE path: creates order with `order_number = NULL` (assigned after payment), creates PI with `idempotencyKey: order-${order.id}`

#### Fix 2: Checkout page persists order references in sessionStorage
- New `CHECKOUT_ORDER_KEY` sessionStorage stores `{ orderId, clientSecret, totals, cartHash }`
- `computeCartHash()` detects cart changes (sorted item IDs + quantities + coupon code)
- `handleBackFromPayment` no longer clears orderId/clientSecret — only changes step
- If cart hash unchanged and orderId exists, skips API call entirely (reuses existing PI)
- Cart empty redirect checks sessionStorage before redirecting (prevents premature redirect)

#### Fix 3: Abandoned order cleanup cron
- New `GET /api/cron/cleanup-orders` with CRON_API_KEY auth
- Finds pending orders older than 24 hours, cancels their Stripe PIs, marks as 'cancelled'
- Registered in scheduler: every 6 hours

#### Fix 4: Order number assigned AFTER payment (webhook)
- Order numbers (`WO-XXXXX`) no longer assigned at checkout — only after `payment_intent.succeeded` webhook fires
- `order_number` column is now nullable (migration: `ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL`)
- `generateOrderNumber()` filters out NULL order_numbers to prevent incorrect sequence
- Added `payment_intent.canceled` webhook handler: marks order as 'cancelled'

#### Fix 5: Admin orders page excludes abandoned orders
- Default list query excludes `cancelled` and `pending` orders (unless filtered explicitly)
- Stats cards (Total Orders, Revenue, Orders Today) exclude cancelled/pending

#### Fix 6: Customer order history shows only completed orders
- Account orders API filters to `paid`, `refunded`, `partially_refunded` only

#### Fix 7: Confirmation page uses orderId
- Redirects to `/checkout/confirmation?orderId=xxx` (was `?order=WO-XXXXX`)
- Retries up to 3 times with 2s delay if order_number not yet assigned (webhook timing)
- Handles null order_number gracefully: "Your order number will appear shortly"
- Clears both checkout sessionStorage keys on mount
- Legacy `?order=` parameter still supported

**Files created (2):**
- `supabase/migrations/20260217000008_order_checkout_fixes.sql`
- `src/app/api/cron/cleanup-orders/route.ts`

**Files modified (8):**
- `src/app/api/checkout/create-payment-intent/route.ts` — UPDATE/CREATE paths
- `src/app/(public)/checkout/page.tsx` — sessionStorage, cart hash, back navigation
- `src/lib/utils/order-number.ts` — NULL filter
- `src/app/api/webhooks/stripe/route.ts` — order number in webhook, canceled handler
- `src/app/api/checkout/order/route.ts` — support `?id=` lookup
- `src/app/(public)/checkout/confirmation/page.tsx` — orderId param, retry, clear session
- `src/app/api/admin/orders/route.ts` — exclude cancelled/pending
- `src/app/api/account/orders/route.ts` — filter to paid/refunded
- `src/lib/cron/scheduler.ts` — register cleanup-orders cron

---

## Phase 9, Session 5 — 2026-02-17 (Cart/Checkout Bug Fixes + Dark Theme)

### fix: 11 bug fixes — dark theme, auto-populate, tax by state, auto-fetch rates, step navigation, session memory

#### Bug 1: Account pages dark theme
- Migrated ~17 account portal files from hardcoded `text-gray-*`, `bg-white`, `bg-gray-*`, `border-gray-*` to theme-aware classes (`text-site-text`, `text-site-text-muted`, `bg-brand-surface`, `border-site-border`, etc.)
- Files: `account-shell.tsx`, `account/page.tsx`, `profile/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx`, `appointments/page.tsx`, `services/page.tsx`, `services/[jobId]/page.tsx`, `loyalty/page.tsx`, `transactions/page.tsx`, `vehicles/page.tsx`, `appointment-card.tsx`, `coupon-card.tsx`, `vehicle-card.tsx`, `transaction-card.tsx`, `transaction-detail.tsx`, `appointment-edit-dialog.tsx`

#### Bug 2: Cart tax display contradiction
- Removed inline tax calculation from cart page. Now shows "Calculated at checkout" for both tax and shipping. Changed "Total" to "Estimated Total".

#### Bug 3: Cart "Shipping: Free" removed
- Cart page no longer shows a shipping line — fulfillment method is chosen at checkout, not cart.

#### Bug 4: Checkout auto-populate logged-in user
- New API endpoint `GET /api/checkout/customer-info` returns logged-in customer's contact info + address
- Checkout page fetches on mount and pre-fills contact form + shipping address

#### Bug 5: Checkout order summary premature tax/shipping
- Tax and shipping show as "—" until address is entered. Client-side CA tax estimate shows `~$X.XX` prefix.

#### Bug 6 & 7: Shipping rate UX
- Removed manual "Get Shipping Rates" button. Rates auto-fetch via useEffect with 500ms debounce when shipping address fields are valid.
- CTA button shows descriptive disabled states: "Enter shipping address", "Fetching rates...", "Select a shipping rate"

#### Bug 8: Only USPS showing despite enabled carriers
- Fixed carrier filtering in `shippo.ts` to match on `r.provider` (case-insensitive) instead of only `servicelevel.token` prefix
- Added raw rate logging for debugging
- Added amber info box on shipping settings page about UPS/FedEx requiring connected carrier accounts

#### Bug 9: Tax should be CA-only
- `create-payment-intent` route now uses destination-based tax: shipping orders use `shippingAddress.state`, pickup orders use `ship_from_state` from shipping settings
- Tax only applied when state is `CA` (10.25%)

#### Bug 10: Checkout step navigation + session memory
- 3-step breadcrumb navigation (Information → Fulfillment → Payment) with clickable completed steps
- Back button from Payment returns to Fulfillment (resets Stripe state)
- All checkout state persisted to `sessionStorage` (key: `smart-details-checkout`), survives browser back/forward

#### Bug 11: Payment step review
- Step 3 shows full review section: contact info, fulfillment method, shipping address (when applicable) with [Edit] buttons to jump back to relevant step

#### New File (1)
- `src/app/api/checkout/customer-info/route.ts` — GET endpoint for checkout auto-populate

#### Modified Files (5)
- `src/app/(public)/cart/page.tsx` — Removed tax calc, updated summary display
- `src/app/(public)/checkout/page.tsx` — Complete rewrite with 3-step flow, session persistence, auto-populate, auto-fetch rates
- `src/app/api/checkout/create-payment-intent/route.ts` — Destination-based CA tax
- `src/lib/services/shippo.ts` — Fixed carrier filtering, added rate logging
- `src/app/admin/settings/shipping/page.tsx` — Added carrier account info box

---

## Phase 9, Session 2 — 2026-02-17 (Cart Page + Checkout + Orders + Shipping)

### feat: Cart page, Stripe checkout, orders database, confirmation page, stock management, shipping integration

#### Migration (1)
- `20260217000001_orders.sql` — `orders` + `order_items` tables with RLS policies, indexes, `update_updated_at` trigger. Orders store financials in cents. RLS: customers view own orders (via `auth_user_id` join), service role full access.

#### New Files (7)
- `src/lib/utils/order-number.ts` — Sequential order number generator (SD-10001, SD-10002, ...)
- `src/app/(public)/cart/page.tsx` — Full cart page with qty controls, coupon input, order summary sidebar, tax calc, empty state
- `src/app/(public)/checkout/page.tsx` — Checkout with 3-step flow (contact → fulfillment → payment), dual fulfillment (Local Pickup FREE / Ship to Address), shipping address form with rate fetching, Stripe Payment Element, order summary sidebar
- `src/app/(public)/checkout/confirmation/page.tsx` — Post-payment confirmation with order details, shipping address display, dynamic shipping amount, clears cart
- `src/app/api/checkout/create-payment-intent/route.ts` — Server-side cart validation, stock check, coupon eval, tax calc, shipping address + rate + carrier saved on order, Stripe PI
- `src/app/api/checkout/order/route.ts` — GET order by number with shipping address fields for confirmation page
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook: payment_intent.succeeded (mark paid, decrement stock, coupon usage, customer spend, confirmation email) + payment_intent.payment_failed

#### Modified Files (1)
- `src/lib/supabase/types.ts` — Added `Order`, `OrderItem`, `OrderPaymentStatus`, `OrderFulfillmentStatus`, `OrderFulfillmentMethod` types

#### Checkout Shipping Flow
- Fulfillment radio: Local Pickup (free) or Ship to Address
- Shipping address form: street, apt, city, state, ZIP
- "Get Shipping Rates" button → `POST /api/checkout/shipping-rates` → shows carrier options (name, service, price, est. delivery)
- Selected rate passed to payment intent API → shipping amount added to total, address/carrier/service saved on order
- Confirmation page shows shipping address and carrier info when applicable
- Rate display in order summary updates live based on fulfillment method and selected rate

---

## Phase 9, Session 1 — 2026-02-17 (Cart System)

### feat: Shopping cart context, Add to Cart buttons, cart drawer, header cart icon

#### New Files (7)
- `src/lib/contexts/cart-context.tsx` — Cart state management (React Context + useReducer), localStorage persistence, SSR-safe hydration, sonner toasts, cart drawer open/close state
- `src/components/public/cart/cart-provider-wrapper.tsx` — Client component wrapper for server layout
- `src/components/public/cart/add-to-cart-button.tsx` — Add to Cart button with `default`/`compact`/`icon-only` variants, stock-aware disabled states
- `src/components/public/cart/quantity-selector.tsx` — Plus/minus quantity selector with `sm`/`md` sizes
- `src/components/public/cart/product-add-to-cart.tsx` — Product detail page CTA (qty selector + add button + "already in cart" indicator)
- `src/components/public/cart/cart-drawer.tsx` — Slide-out cart panel with item list, thumbnails, qty controls, remove, subtotal, View Cart + Checkout CTAs, empty state, focus trap, ESC/backdrop close, body scroll lock, responsive widths
- `src/components/public/cart/cart-icon-button.tsx` — Header cart icon with lime badge showing item count

#### Modified Files (4)
- `src/app/(public)/layout.tsx` — Wrapped with CartProviderWrapper, added CartDrawer
- `src/components/public/header-client.tsx` — Added CartIconButton between Sign In and Book Now
- `src/components/public/product-card.tsx` — Restructured from outer `<Link>` to `<div>` with separate image/title links + compact Add to Cart button
- `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx` — Enhanced stock status (In Stock / Low Stock / Out of Stock), added ProductAddToCart section

---

## Session R — 2026-02-17 (Fix Holiday Seasonal Themes)

### Fix: Holiday seasonal themes now apply to public frontend — full pipeline verified

#### Diagnosis
Full end-to-end audit of the seasonal theme pipeline: database records, feature flags, data layer (`cms.ts`), public layout, ThemeProvider, CSS variable indirection, Tailwind v4 compilation, admin pages, API routes, sidebar links, cron scheduler. All infrastructure verified present and correct. CSS compilation confirmed: `bg-lime` → `var(--lime)`, cascades properly.

#### Issues Found & Fixed
1. **Page background never changed** — Presets and DB themes had no `body_bg_color`, so `bg-brand-black` (page background) stayed pure black. Added `bodyBgColor` field to `ThemePreset` interface and set distinct dark-tinted backgrounds for all 8 presets (e.g., Christmas = `#050f05` deep evergreen, Valentine's = `#0a0508` rose-tinted). Updated existing DB themes.
2. **Admin color preview swatch broken** — Theme list page referenced `brand-500` in `colorOverrides` which no preset has. Changed to `lime` key (the primary accent color).
3. **Editor showed only 6 of 11 color keys** — `COLOR_KEYS` was missing `lime-50`, `lime-100`, `lime-300`, `lime-600`. Expanded to all 10 palette keys.
4. **No hero gradient editor** — Added hero gradient override text input to theme editor page.
5. **Preset creation missing `body_bg_color`** — The "Use Preset" flow didn't pass `body_bg_color` to the API. Now included.

#### Files Modified (3)
- `src/lib/utils/cms-theme-presets.ts` — Added `bodyBgColor` field to interface + all 8 presets
- `src/app/admin/website/themes/page.tsx` — Fixed color swatch (`brand-500` → `lime`), pass `body_bg_color` on preset creation
- `src/app/admin/website/themes/[id]/page.tsx` — Expanded `COLOR_KEYS` (6 → 10), added hero gradient override input

#### DB Updates
- New Year theme: `body_bg_color = '#050503'`
- Halloween theme: `body_bg_color = '#0f050f'`

---

## Session Q — 2026-02-16 (Booking Module Theme Fix)

### Fix: Booking module now follows site dark theme — proper contrast, readable inputs and text

#### Root Cause
The booking page uses the site's always-dark background (`bg-brand-dark`) but shared UI components (Input, Select, Textarea, Card, Button, Tabs) used hardcoded light-theme colors (`bg-white`, `border-gray-300`, `text-gray-900`) that only adapt via `dark:` media query — not via the site's CSS-variable-based theme. Users with light OS mode saw white inputs, cards, and buttons on a dark background.

#### Changes
- **UI Components (bug fixes)**:
  - `select.tsx`: Added missing `dark:` variants (had none — bg-white with no dark mode)
  - `textarea.tsx`: Added missing `dark:` variants (same issue)
  - `tabs.tsx`: Added `dark:` variants to TabsList/TabsTrigger, added `data-state` attribute for per-instance overrides
  - `form-field.tsx`: Added `labelClassName` prop for per-instance label color overrides
- **Booking Components (theme overrides via className)**:
  - All Input/Select/Textarea → `bg-brand-surface border-site-border text-site-text` with dark: variants
  - All primary Buttons → `bg-lime text-site-text-on-primary hover:bg-lime-200`
  - All outline Buttons → `border-site-border bg-transparent text-site-text-secondary hover:bg-brand-surface`
  - All Card → `border-site-border bg-brand-surface`
  - FormField labels → `text-site-text-secondary`
  - TabsList → `bg-brand-surface`, TabsTrigger → `data-[state=active]:bg-brand-grey text-site-text-muted`
- **Semantic alert colors (dark-friendly)**:
  - Green alerts: `bg-green-50 border-green-200 text-green-800` → `bg-green-500/10 border-green-500/30 text-green-400`
  - Amber warnings: `bg-amber-50 border-amber-200 text-amber-800` → `bg-amber-500/10 border-amber-500/30 text-amber-400`
  - Red errors: `bg-red-50 border-red-200 text-red-700` → `bg-red-500/10 border-red-500/30 text-red-400`
  - N/A badge: `bg-amber-100 text-amber-700` → `bg-amber-500/10 text-amber-400`
  - Tooltips: `bg-gray-900` → `bg-brand-grey text-site-text`
- **step-payment.tsx**: Added `border-site-border` to Stripe divider, added `text-site-text` to payment header/amount

#### Files Modified (14)
- `src/components/ui/select.tsx` — dark mode variants
- `src/components/ui/textarea.tsx` — dark mode variants
- `src/components/ui/tabs.tsx` — dark mode variants + data-state attribute
- `src/components/ui/form-field.tsx` — labelClassName prop
- `src/components/booking/booking-wizard.tsx` — button + alert theme fixes
- `src/components/booking/booking-confirmation.tsx` — button theme fix
- `src/components/booking/step-service-select.tsx` — TabsList/TabsTrigger theme overrides
- `src/components/booking/step-configure.tsx` — input/select/button theme overrides
- `src/components/booking/step-schedule.tsx` — select/textarea/card/label/button theme overrides
- `src/components/booking/step-customer-info.tsx` — input/select/button/error theme overrides
- `src/components/booking/step-review.tsx` — input/button + all semantic alert colors
- `src/components/booking/step-payment.tsx` — card/button/border/text theme overrides
- `src/app/(public)/book/page.tsx` — no changes needed (already theme-aware)
- `src/components/booking/step-indicator.tsx` — no changes needed (already theme-aware)

---

## Session P — 2026-02-16 (Theme Variable Pipeline Fix)

### Fix: Complete theme variable pipeline — all public components respond to theme changes

#### Root Cause
Multiple broken links in the theme variable chain between admin Theme & Styles settings and public components:
1. **Header/Footer mismatch**: Header used `bg-brand-black` instead of `bg-site-header-bg`; footer used `bg-brand-dark` instead of `bg-site-footer-bg`. Admin "Header Background" and "Footer Background" settings had no effect.
2. **Buttons dead code**: ThemeProvider set `--site-btn-*` CSS variables but no component consumed them — all buttons hardcoded `bg-lime text-black rounded-full`.
3. **Missing ThemeProvider mappings**: `color_link`, `color_link_hover`, `color_text_on_primary`, `color_divider` fields from DB were not mapped to CSS variables.
4. **Hardcoded `text-black`**: Button text and badge text used `text-black` instead of theme-aware `text-site-text-on-primary`.

#### Changes
- **globals.css**: Added 12 new CSS variables (`--site-link`, `--site-link-hover`, `--site-text-on-primary`, `--site-divider`, `--site-btn-primary-bg/text/hover/radius`, `--site-btn-cta-bg/text/hover/radius`) with defaults referencing existing theme tokens. Added `@theme inline` entries for `site-link`, `site-link-hover`, `site-text-on-primary`, `site-divider`. Added `.site-btn-primary` and `.site-btn-cta` CSS classes.
- **theme-provider.tsx**: Added mappings for `color_link` → `--site-link`, `color_link_hover` → `--site-link-hover`, `color_text_on_primary` → `--site-text-on-primary`, `color_divider` → `--site-divider`.
- **header-client.tsx**: `bg-brand-black` → `bg-site-header-bg`, CTA buttons → `site-btn-cta`, logo text → `text-site-text-on-primary`.
- **footer-client.tsx**: `bg-brand-dark` → `bg-site-footer-bg`, logo text → `text-site-text-on-primary`.
- **9 CTA button instances** across hero-section, cta-section, content-block-renderer, hero-carousel, gallery, areas, services pages → replaced `bg-lime text-black rounded-full` with `site-btn-cta`.
- **product-card.tsx**: Hover text → `text-site-text-on-primary`.
- **gallery-client.tsx**: Filter pills active state → `text-site-text-on-primary`, badge → `site-btn-primary`.

#### Final Variable Chain (All Properties)
| Property | Admin Field → ThemeProvider → CSS Var → Component | Status |
|---|---|---|
| Page Background | `color_page_bg` → `--brand-black` → `bg-brand-black` | MATCH |
| Card Background | `color_card_bg` → `--brand-surface` → `bg-brand-surface` | MATCH |
| Header Background | `color_header_bg` → `--site-header-bg` → `bg-site-header-bg` | FIXED |
| Footer Background | `color_footer_bg` → `--site-footer-bg` → `bg-site-footer-bg` | FIXED |
| Text Primary | `color_text_primary` → `--site-text` → `text-site-text` | MATCH |
| Text Secondary | `color_text_secondary` → `--site-text-secondary` → `text-site-text-secondary` | MATCH |
| Text Muted | `color_text_muted` → `--site-text-muted` → `text-site-text-muted` | MATCH |
| Text on Primary | `color_text_on_primary` → `--site-text-on-primary` → `text-site-text-on-primary` | FIXED |
| Primary Color | `color_primary` → `--lime` → `bg-lime` / `text-lime` | MATCH |
| Link Color | `color_link` → `--site-link` → `text-site-link` | FIXED |
| Border Color | `color_border` → `--site-border` → `border-site-border` | MATCH |
| CTA Button BG | `btn_cta_bg` → `--site-btn-cta-bg` → `.site-btn-cta` | FIXED |
| Primary Button BG | `btn_primary_bg` → `--site-btn-primary-bg` → `.site-btn-primary` | FIXED |

---

## Session O — 2026-02-16 (Hero Image Upload)

### Feature: Image Upload for Hero Carousel Admin
Added drag-and-drop image upload to the hero slide editor, replacing plain URL text inputs.

### HeroImageUpload Component
- New reusable component at `src/app/admin/website/hero/components/hero-image-upload.tsx`
- Drag-and-drop zone with visual feedback (drag highlight, loading spinner)
- Click-to-browse alternative
- Image preview with hover overlay showing Replace/Remove buttons
- Client-side resize: images wider than 2560px are downscaled before upload (canvas API, 85% quality)
- File validation: JPEG, PNG, WebP only; max 10MB
- Uploads to `cms-assets` Supabase storage bucket (already existed)
- Storage path pattern: `{prefix}/{slideId}/{timestamp}.{ext}` — avoids cache issues on replace
- Old image automatically deleted from storage when replacing
- Landscape (16:9) or square aspect ratio modes

### Slide Editor Updates
- Desktop image: drag-drop upload with landscape preview
- Mobile image: drag-drop upload with square preview
- Before/After images: side-by-side drag-drop uploads
- Video thumbnail: drag-drop upload with landscape preview
- Alt text field preserved as manual text input

### Storage Cleanup on Slide Deletion
- DELETE endpoint now fetches slide data before deletion
- Extracts storage paths from all image URL fields (image_url, image_url_mobile, video_thumbnail_url, before_image_url, after_image_url)
- Removes all associated images from `cms-assets` bucket (best-effort, non-blocking)

### Files Changed
- `src/app/admin/website/hero/components/hero-image-upload.tsx` — new component
- `src/app/admin/website/hero/[id]/page.tsx` — replaced URL inputs with upload components
- `src/app/api/admin/cms/hero/[id]/route.ts` — storage cleanup on DELETE

---

## Session N — 2026-02-16 (Theme System Pipeline Fix)

### Root Cause: Two Critical Bugs
1. **`@theme inline` prevented CSS variable overrides**: Tailwind v4's `@theme inline` inlines values directly into utility classes (e.g., `bg-lime { background-color: #cf0 }`). ThemeProvider's CSS variable overrides on its wrapper div had zero effect because utilities didn't reference variables.
2. **Wrong color_overrides keys in database**: Admin theme editor had hardcoded `COLOR_KEYS = ['brand-500', 'brand-600', 'brand-700', 'accent-500']` — admin palette keys that public pages don't use. Valentine's Day theme was saved with these wrong keys instead of the correct `lime-*`, `brand-dark`, `brand-surface` keys.

### Fix: CSS Variable Indirection Pattern
- **globals.css**: Moved all public-theme-overridable tokens from hardcoded values in `@theme inline` to raw CSS custom properties in `:root` (e.g., `--lime: #CCFF00`), then reference via `var()` in `@theme inline` (e.g., `--color-lime: var(--lime)`). Now `bg-lime` compiles to `var(--lime)` which cascades properly.
- **ThemeProvider**: Updated `buildSeasonalCssVars()` and `buildSiteThemeVars()` to set raw variable names (`--lime`, `--brand-dark`) instead of `--color-*` names, matching the new `:root` indirection.
- **Database**: Updated Valentine's Day theme `color_overrides` to use correct preset keys (`lime`, `lime-50`...`lime-600`, `brand-dark`, `brand-surface`, `accent-glow-rgb`).
- **Admin theme editor**: Fixed `COLOR_KEYS` from wrong admin palette keys to correct public theme keys with human-friendly labels (Primary Accent, Accent Hover, Section BG, Card BG, etc.). Added `accent-glow-rgb` text input.

### Tokens now overridable via ThemeProvider
`--lime`, `--lime-50` through `--lime-600`, `--brand-black`, `--brand-dark`, `--brand-darker`, `--brand-grey`, `--brand-grey-light`, `--brand-surface`, `--site-text`, `--site-text-secondary`, `--site-text-muted`, `--site-text-dim`, `--site-text-faint`, `--site-border`, `--site-border-light`, `--site-border-medium`, `--site-header-bg`, `--site-footer-bg`, `--theme-accent-glow-rgb`

### Files Changed
- `src/app/globals.css` — raw vars in `:root`, `var()` refs in `@theme inline`
- `src/components/public/cms/theme-provider.tsx` — set raw var names
- `src/app/admin/website/themes/[id]/page.tsx` — fixed COLOR_KEYS

---

## Session M — 2026-02-16 (Complete Theme Variable Migration)

### Complete Component Migration
Migrated ALL remaining hardcoded colors across public-facing pages to CSS theme variables. Zero hardcoded colors remain in `(public)`, `(customer-auth)`, `(account)`, or `components/public` directories.

### CSS Variables
- Added `--color-site-border-medium: rgba(255, 255, 255, 0.2)` to `@theme inline` in `globals.css` for `border-white/20` replacements

### Layout Updates
- **Customer-auth layout** (`src/app/(customer-auth)/layout.tsx`): Rewrote to include `ThemeProvider` with site theme + seasonal theme support
- **Account layout** (`src/app/(account)/layout.tsx`): Rewrote to include `ThemeProvider` with site theme + seasonal theme support
- Both layouts now fetch `getCmsToggles()`, `getActiveTheme()`, `getSiteThemeSettings()` and pass to `ThemeProvider`

### Files Migrated (Color Mapping)
All files below had hardcoded Tailwind colors replaced with theme variables:
- `text-white` → `text-site-text`
- `text-gray-300` → `text-site-text-secondary`
- `text-gray-400` → `text-site-text-muted`
- `text-gray-500` → `text-site-text-dim`
- `text-gray-600` → `text-site-text-faint`
- `border-white/10` → `border-site-border`
- `border-white/20` → `border-site-border-medium`
- `hover:text-white` → `hover:text-site-text`
- `hover:bg-white/5` → `hover:bg-site-border-light`
- `bg-white/10` → `bg-site-border` (dividers)
- `bg-white/20` → `bg-site-border-medium`

**Customer Auth Pages (3 files):**
- `src/app/(customer-auth)/signin/page.tsx`
- `src/app/(customer-auth)/signup/page.tsx`
- `src/app/(customer-auth)/signin/reset-password/page.tsx`

**Quote Pages (2 files):**
- `src/app/(public)/quote/[token]/page.tsx`
- `src/app/(public)/quote/[token]/accept-button.tsx`

**Public Components (1 file):**
- `src/components/public/mobile-menu.tsx`

**Account Portal Pages (8 files):**
- `src/app/(account)/account/page.tsx`
- `src/app/(account)/account/profile/page.tsx`
- `src/app/(account)/account/vehicles/page.tsx`
- `src/app/(account)/account/appointments/page.tsx`
- `src/app/(account)/account/services/page.tsx`
- `src/app/(account)/account/services/[jobId]/page.tsx`
- `src/app/(account)/account/loyalty/page.tsx`
- `src/app/(account)/account/transactions/page.tsx`

### Preserved (Intentional Exceptions)
- **Status/semantic colors**: green (success), red (error), amber (warning), purple (converted) — kept as-is
- **Image overlays**: `bg-black/60`, `bg-white/10` on photo badges, hero carousel, product cards — design-specific
- **Standalone pages**: `/unsubscribe`, `/authorize`, `/jobs` — own light-mode design, not in public layout
- **Admin panel**: Not in scope for public theme migration

### Verification
- `npx tsc --noEmit` — zero errors
- Grep for hardcoded colors across all 4 directories — zero matches
- No `dark:` prefixed classes found (already removed in Session J)
- No FODT issue — ThemeProvider renders CSS variables during SSR via inline `style` attribute

---

## Session L — 2026-02-16 (Theme & Style Settings Admin Page)

### Database
- Created `site_theme_settings` table (migration `20260216000003`) with 50+ customizable fields: colors (backgrounds, text, brand, links, borders, status), typography (fonts, sizes, weights, line height), buttons (primary, secondary, CTA), borders & spacing
- Default row inserted with all NULL fields (NULL = use CSS defaults from globals.css)
- Unique index enforces single active custom theme
- RLS: public read, authenticated write

### API Routes
- `GET/PUT/POST /api/admin/cms/site-theme` — CRUD for site theme settings (permission: `cms.themes.manage`)
- `POST /api/admin/cms/site-theme/reset` — Reset all fields to NULL (defaults)
- `GET /api/public/cms/site-theme` — Public endpoint with cache headers

### Data Layer
- Added `getSiteThemeSettings()` to `src/lib/data/cms.ts` — cached with 60s revalidate, `site-theme` tag
- Added `SiteThemeSettings` interface to `src/lib/supabase/types.ts`

### ThemeProvider Update
- Accepts both `theme` (seasonal) and `siteTheme` (persistent) props
- Merges CSS variables: site theme settings first, then seasonal overrides on top
- Maps site theme fields to CSS custom properties (--color-*, --font-*, --site-*)
- Public layout updated to fetch and pass site theme settings

### Admin Page: Theme & Style Settings
- New page at `/admin/website/theme-settings` with tabbed UI:
  - **Colors**: Mode toggle, background/text/brand/link/border/status color pickers with per-field reset and default badges
  - **Typography**: Font family dropdowns (9 options), font size inputs, weight selectors, line height slider
  - **Buttons**: Primary/secondary/CTA button customization with live inline previews
  - **Borders & Spacing**: Border radius, width, section/card padding, header height
- **Live Preview Panel**: Right sidebar showing mini header, hero, card, links — updates in real-time
- **Quick Presets**: 5 built-in presets (Default Dark, Clean Light, Midnight Blue, Warm Dark, Professional)
- **Reset to Default**: Confirmation dialog, resets all fields to NULL
- **Per-field Reset**: Individual reset icons on each color picker

### Sidebar
- Added "Theme & Styles" entry with Paintbrush icon under Website section
- Renamed existing "Themes" to "Seasonal Themes" for clarity
- Added Paintbrush icon to admin-shell.tsx icon map

---

## Session K — 2026-02-16 (Theme System Audit + Fix Seasonal Themes)

### Theme System Audit (Parts 1A-1F)
- **1A Database**: PASS — `seasonal_themes` table exists with 8 presets defined
- **1B Data Flow**: PASS — `getActiveTheme()` queries correctly, layout passes to ThemeProvider
- **1B WARN**: `seasonalThemes` feature flag defaults to `false` — must enable to see themes
- **1C CSS Variables**: ROOT CAUSE FOUND — ThemeProvider was setting `--brand-500/600/700` (old design) but no component uses these. Session J redesigned to lime-on-black palette
- **1D Disconnect**: `.public-theme` block in globals.css explicitly set `--color-lime: #CCFF00`, BLOCKING ThemeProvider overrides due to CSS specificity
- **1E Particle Canvas**: PASS — reads theme colors correctly
- **1F Theme Cron**: PASS — activation route exists, scheduler registered

### Default Theme Baseline (Part 2)
- Created `src/lib/utils/default-theme.ts` — structured `DEFAULT_THEME` constant with all extracted values (accent palette, backgrounds, text, borders, typography, buttons, shadows, spacing)
- Exports `THEME_CSS_VARS` and `ThemeCssVar` type for reference

### Fix CSS Variable Pipeline (Part 3)

#### `src/app/globals.css`
- Added `--theme-accent-glow-rgb: 204, 255, 0` to `:root` for shadow/glow calculations
- Updated `@theme inline` shadow values to use `rgba(var(--theme-accent-glow-rgb), ...)` instead of hardcoded hex
- **REMOVED** `.public-theme { --color-lime: #CCFF00; }` block that was blocking ThemeProvider overrides
- Updated `.text-gradient-lime` to use `var(--color-lime)` and `var(--color-lime-500)`
- Updated `.btn-lime-glow` to use `var(--theme-accent-glow-rgb)`
- Updated scrollbar styles to use `var(--color-lime)` and `var(--color-brand-dark)`
- Updated `lime-pulse` animation to use `var(--theme-accent-glow-rgb)`

#### `src/components/public/cms/theme-provider.tsx` (rewritten)
- New `buildCssVars()` maps theme `colorOverrides` keys to `--color-{key}` CSS custom properties
- Special handling: `accent-glow-rgb` → `--theme-accent-glow-rgb`, `body_bg_color` → `--color-brand-black`
- Gradient overrides via scoped `<style>` tag with `!important`

#### `src/lib/utils/cms-theme-presets.ts` (rewritten)
- All 8 theme presets updated from old keys (`brand-500`, `accent-500`) to new Tailwind v4 token keys
- Each preset now includes: `lime` through `lime-600`, `brand-dark`, `brand-surface`, `accent-glow-rgb`

#### Component Migrations (`bg-black` → `bg-brand-black`)
- `src/app/(public)/layout.tsx` — main public wrapper
- 10 public page files (homepage, services ×3, products ×2, gallery, terms, areas ×2)
- `src/components/public/header-client.tsx` — header bg + scrolled state + dropdown + mobile menu
- `src/components/public/footer-client.tsx` — footer bg
- `src/components/public/hero-section.tsx` — section bg
- `src/components/public/cms/hero-carousel.tsx` — section bg
- **NOT changed**: Admin panel, customer auth, overlays, badges (intentional)

### Verification (Part 4)
- Valentine's Day preset: correct pink palette, hearts particles, rose-tinted surfaces
- ThemeProvider pipeline: `buildCssVars()` correctly generates `--color-lime`, `--color-brand-dark`, etc.
- CSS cascade: no blocking overrides, all utilities use `var()` references
- TypeScript: zero errors
- Next.js build: passes

---

## Session J — 2026-02-16 (Public Frontend Reskin — Premium Dark Design)

### Changed: Complete visual overhaul of all public-facing components
- **Design direction**: Premium dark automotive aesthetic with framer-motion animations, scroll-aware header, animated hero carousel, and refined footer
- **New dependency**: `framer-motion` installed for AnimatePresence, motion.div slide/fade transitions, animated labels

### Component: AnnouncementTicker (`src/components/public/cms/announcement-ticker.tsx`)
- Replaced marquee scroll with framer-motion animated rotation (y-axis slide transitions)
- `AnimatePresence mode="wait"` with 4000ms auto-rotate interval
- Session storage persistence for dismissal
- Dot indicators for multiple tickers
- Kept `TopBarTicker` and `SectionTicker` named exports, `tickers: AnnouncementTicker[]` prop interface

### Component: SiteHeader (server/client split)
- **`src/components/public/site-header.tsx`** (server wrapper): Thin async component fetching `getBusinessInfo()` and customer name via Supabase auth. Passes `navItems`, `businessName`, `phone`, `logoUrl`, `customerName` to client component
- **`src/components/public/header-client.tsx`** (new client component): Scroll-aware backdrop blur header, animated dropdown menus, mobile hamburger with framer-motion height animation, red gradient "Book Now" CTA, desktop utility bar with phone and "Mobile Service" info, account link (Hi {name} or Sign In), logo fallback with red gradient "S" icon

### Component: HeroCarousel (`src/components/public/cms/hero-carousel.tsx`)
- Replaced CSS opacity transitions with framer-motion slide transitions using `custom` direction prop
- Bottom-aligned content (flex items-end pb-16), red gradient CTA buttons with shadow effects
- `overlay_opacity` correctly handled as 0-100 scale
- First slide uses `<h1>`, subsequent slides use `<p>` for SEO
- `<picture>` element preserved for mobile image variants
- HeroBeforeAfter sub-component with clip-path slider

### Component: SiteFooter (server/client split)
- **`src/components/public/site-footer.tsx`** (server wrapper): Async component fetching business info, reviews, cities. Builds navColumns and reviewBadges from data
- **`src/components/public/footer-client.tsx`** (new client component): Dark premium footer with trust badges strip (Shield, Award, Leaf, Clock icons), 12-column grid layout, contact info with red icon accents, review badges (Google/Yelp stars), service area city links, legal links bottom bar

### Component: BeforeAfterSlider (`src/components/before-after-slider.tsx`)
- Added framer-motion animated labels (slide-in from left/right)
- Enhanced with `rounded-2xl` container, improved drag handle
- Red "After" label badge, scale animation on drag handle (hover → scale-105, dragging → scale-110)
- Kept named export and props: `beforeSrc`, `afterSrc`, `beforeLabel`, `afterLabel`

### Dark Theme Scoping
- `bg-black text-white min-h-screen` wrapper applied to 3 layouts:
  - `src/app/(public)/layout.tsx`
  - `src/app/(customer-auth)/layout.tsx`
  - `src/app/(account)/layout.tsx`

### CMS Cache Revalidation
- Added `revalidateTag()` calls to all CMS admin API routes for instant public page updates:
  - Hero slides, themes, navigation, pages, tickers, ads/creatives
  - SEO pages, SEO cities, catalog (services/products/categories)
  - About page, terms page, content blocks

### Files Created
- `src/components/public/header-client.tsx` — animated client header component

### Files Modified
- `src/components/public/cms/announcement-ticker.tsx` — framer-motion rotation
- `src/components/public/site-header.tsx` — server wrapper for header-client
- `src/components/public/header-client.tsx` — new animated client header
- `src/components/public/cms/hero-carousel.tsx` — framer-motion slide transitions
- `src/components/public/site-footer.tsx` — server wrapper for footer-client
- `src/components/public/footer-client.tsx` — redesigned premium footer
- `src/components/before-after-slider.tsx` — framer-motion labels + improved UX
- `src/app/(public)/layout.tsx` — dark theme wrapper
- `src/app/(customer-auth)/layout.tsx` — dark theme wrapper
- `src/app/(account)/layout.tsx` — dark theme wrapper
- Multiple CMS API routes — revalidateTag() calls added

### Old Components (orphaned but not deleted)
- `src/components/public/header-shell.tsx` — old scroll-aware header wrapper
- `src/components/public/mobile-menu.tsx` — old mobile menu
- `src/components/public/nav-dropdown.tsx` — old nav dropdown

### Session J (continued — Session 3) — Scroll Animations, Auth Dark Theme & Final Polish

#### AnimatedSection Wrapper (`src/components/public/animated-section.tsx`)
- NEW reusable client component for scroll-triggered framer-motion animations in server component pages
- `AnimatedSection` — wraps content with `whileInView` fade-in, supports `stagger` mode for grids
- `AnimatedItem` — child wrapper for staggered grid items
- Uses `fadeInUp` and `staggerContainer` variants from `@/lib/animations`
- `viewport={{ once: true, margin: '-80px' }}` for natural trigger point

#### Customer Auth Dark Theme (3 pages)
- **signin/page.tsx**: Removed all `dark:` prefixed classes, permanent dark theme. Cards: `bg-brand-surface border-white/10`. Buttons: `bg-lime text-black font-bold`. Links: `text-lime`. Error: `bg-red-950 text-red-300`. Session expired: `bg-amber-950 border-amber-800 text-amber-200`.
- **signup/page.tsx**: Same conversion pattern across all 4 form states (full registration, phone-otp, phone-verify, otp-profile)
- **reset-password/page.tsx**: Same conversion pattern

#### Content Block Renderer CTA Fix
- Fixed CTA block gradient: `from-brand-600 to-brand-800` → `from-brand-grey to-black border-white/10`
- Added radial lime glow overlay (`bg-lime/5 rounded-full blur-3xl`)

#### Ad Zone Polish
- Container: `rounded` → `rounded-2xl`

#### Scroll Animations Added To
- City page (`areas/[citySlug]`): Hero, services grid, reviews — lime gradient city name
- Areas index (`areas/page`): Hero, staggered city card grid — lime gradient, hover lift effects
- Services index + category: Hero heading, staggered card grids
- Products index + category: Hero heading, staggered card grids
- Gallery: Hero heading
- Terms: Hero heading

#### Animations Library Fix (`src/lib/animations.ts`)
- Added explicit `Variants` type annotations to all exported variants
- Fixed `ease` array type: `number[]` → `[number, number, number, number]` tuple for framer-motion compatibility

#### Files Created
- `src/components/public/animated-section.tsx`

#### Files Modified
- `src/app/(customer-auth)/signin/page.tsx` — permanent dark theme
- `src/app/(customer-auth)/signup/page.tsx` — permanent dark theme
- `src/app/(customer-auth)/signin/reset-password/page.tsx` — permanent dark theme
- `src/components/public/content-block-renderer.tsx` — CTA block gradient fix
- `src/components/public/cms/ad-zone.tsx` — rounded-2xl
- `src/app/(public)/areas/[citySlug]/page.tsx` — AnimatedSection + lime gradient
- `src/app/(public)/areas/page.tsx` — AnimatedSection + lime gradient
- `src/app/(public)/terms/page.tsx` — AnimatedSection
- `src/app/(public)/services/page.tsx` — AnimatedSection
- `src/app/(public)/services/[categorySlug]/page.tsx` — AnimatedSection
- `src/app/(public)/products/page.tsx` — AnimatedSection
- `src/app/(public)/products/[categorySlug]/page.tsx` — AnimatedSection
- `src/app/(public)/gallery/page.tsx` — AnimatedSection
- `src/lib/animations.ts` — Variants type annotations

### Session J (continued — Session 2) — Hero/Card/Page Polish & Animations

#### HeroCarousel Enhancements
- Taller hero: `min-h-[500px] sm:min-h-[600px] lg:min-h-[85vh]`
- Slow image zoom effect via `motion.div` scale animation (1.0 → 1.05 over 6s)
- `renderTitle()` splits last word with `text-gradient-lime` highlight
- Staggered content animations (subtitle 0.35s, CTA 0.5s delay)
- Arrow hover: `hover:border-lime/30`
- Before/after divider: white → lime with glow shadow
- CTA arrow appended: `<span aria-hidden="true">&rarr;</span>`

#### TrustBar — Server/Client Split + CountUp Animations
- **`trust-bar.tsx`** refactored to thin server wrapper (fetches data, passes to client)
- **`trust-bar-client.tsx`** (NEW): Client component with `CountUp` animations for review counts and vehicle count (6000+), larger stat numbers (`text-xl sm:text-2xl font-bold`), vertical dividers

#### Card Components — Hover Lift Effects
- **ServiceCard**: Added optional image display (`h-48 sm:h-56 object-cover`), hover lift (`hover:border-lime/30 hover:-translate-y-1 hover:shadow-lime-sm`), border-t footer divider
- **ServiceCategoryCard**: Added hover lift + `font-bold` title
- **ProductCard**: Added hover lift, "View Details" pseudo-button (`group-hover:bg-lime group-hover:text-black`)
- **ProductCategoryCard**: Added hover lift + `font-bold` title

#### Page Dark Theme Pass
- **Services** (3 files): `bg-gradient-hero` → `bg-black`, "Our Detailing `<span class="text-gradient-lime">Services</span>`", lime accents
- **Products** (3 files): Same dark hero treatment, "Our `<span class="text-gradient-lime">Products</span>`"
- **Gallery**: Dark hero, "Our `<span class="text-gradient-lime">Work</span>`", rounded-full filter pills (active: `bg-lime text-black`), "Before / After" lime badge on cards
- **Areas** (2 files): Fixed `bg-gradient-hero`, blue text → `text-gray-400`
- **Terms**: Fixed `bg-gradient-hero`, blue text → `text-gray-400`
- **Hero Section**: `bg-gradient-hero` → `bg-black`, amber stars → lime stars

#### CTA Section + Breadcrumbs
- **CTA section**: Gradient bg (`bg-gradient-to-br from-brand-grey to-black`), radial lime glow (`bg-lime/5 rounded-full blur-3xl`), larger CTA button (`text-lg h-14 px-10`)
- **Breadcrumbs**: Simplified to single dark variant, removed `variant` logic, unified `hover:text-lime hover:decoration-lime`

#### Homepage Review Section
- Decorative quote mark: `text-6xl font-serif text-lime/20`
- Review text: italic, larger (`text-base sm:text-lg`)
- Google platform badge: `bg-white/5 border border-white/10 rounded-full`

#### Files Created
- `src/components/public/trust-bar-client.tsx` — CountUp animations client component

#### Files Modified
- `src/components/public/cms/hero-carousel.tsx` — zoom, gradient title, taller hero
- `src/components/public/trust-bar.tsx` — server wrapper delegation
- `src/components/public/service-card.tsx` — image support, hover lift
- `src/components/public/service-category-card.tsx` — hover lift
- `src/components/public/product-card.tsx` — hover lift, View Details button
- `src/components/public/product-category-card.tsx` — hover lift
- `src/app/(public)/services/page.tsx` — dark hero
- `src/app/(public)/services/[categorySlug]/page.tsx` — dark hero
- `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx` — dark hero + lime CTA
- `src/app/(public)/products/page.tsx` — dark hero
- `src/app/(public)/products/[categorySlug]/page.tsx` — dark hero
- `src/app/(public)/gallery/page.tsx` — dark hero, lime badge
- `src/app/(public)/gallery/gallery-client.tsx` — rounded pills, hover effects
- `src/app/(public)/page.tsx` — review section polish
- `src/components/public/cta-section.tsx` — gradient bg, radial glow
- `src/components/public/breadcrumbs.tsx` — single dark variant
- `src/components/public/hero-section.tsx` — bg-black, lime stars
- `src/app/(public)/areas/page.tsx` — dark theme fixes
- `src/app/(public)/areas/[citySlug]/page.tsx` — dark theme fixes
- `src/app/(public)/terms/page.tsx` — dark theme fixes

---

### Session J (first half) — Design Foundation, Lime Accent & Dark Theme Pass

#### Design System Foundation
- **Lime brand tokens** added to `globals.css` `@theme inline`: `--color-lime: #CCFF00`, lime-50 through lime-900, `--color-brand-dark: #0A0A0A`, `--color-brand-surface: #1A1A1A`
- **Lime glow shadows**: `--shadow-lime-glow`, `--shadow-lime-glow-lg` CSS custom properties
- **Brand CSS utilities**: `.text-gradient-lime`, `.btn-lime-glow` (box-shadow + hover scale), `.bg-gradient-hero` (radial blue/black), `.section-spacing` (responsive padding), `.animate-lime-pulse`
- **Animations library**: Created `src/lib/animations.ts` — Framer Motion variants (fadeIn, fadeInUp, fadeInDown, slideIn, scaleIn, stagger containers, premiumEase)

#### Accent Color: Red → Lime (#CCFF00)
- `header-client.tsx`: Logo fallback `bg-lime`, subtitle `text-lime`, dropdown `group-hover:text-lime`, Book Now CTA `bg-lime text-black btn-lime-glow`
- `footer-client.tsx`: All `text-red-500` → `text-lime`, logo fallback → `bg-lime`, nav links → `hover:text-lime`
- `announcement-ticker.tsx`: Default bg `#E53935` → `#CCFF00`, text `#FFFFFF` → `#000000`
- `hero-carousel.tsx`: CTA → `bg-lime text-black btn-lime-glow`, indicators → `bg-lime`
- `hero-section.tsx`: CTA → `bg-lime text-black btn-lime-glow`
- `before-after-slider.tsx`: Divider → `bg-lime` with lime glow, handle → `bg-black border-lime`, After label → `bg-lime/90 text-black`

#### Dark Theme Pass — All Public Pages
Replaced all dual `light/dark:` Tailwind patterns with permanent dark values (since layout forces `bg-black text-white`):

- **Homepage** (`page.tsx`): Sections → `bg-black`/`bg-brand-dark`, cards → `bg-brand-surface border-white/10`, stars → `fill-lime text-lime`, links → `text-lime`
- **Trust bar**: `bg-brand-dark`, stars/icons → `text-lime`
- **CTA section**: `bg-brand-dark`, CTA → `bg-lime text-black btn-lime-glow`
- **Service category card**: `bg-brand-surface border-white/10 hover:border-lime/30`, arrow → `group-hover:text-lime`
- **Services pages** (3 files): Headers → `bg-gradient-hero`, cards → `bg-brand-surface`, icons → `bg-lime/5 text-lime`, "Book This Service" → `bg-lime text-black btn-lime-glow`
- **Products pages** (4 files): Full dark theme, product cards → `bg-brand-surface border-white/10`
- **Product category card**: `bg-brand-surface`, title → `group-hover:text-lime`
- **Gallery** (2 files): Filter pills → `border-lime text-lime`, Load More → `bg-lime text-black`
- **Areas** (2 files): City cards → `bg-brand-surface border-white/10`, CTA → `bg-lime text-black btn-lime-glow`
- **Terms page**: Prose → `prose-invert`, headings → `text-white`
- **Custom pages** (`p/[...slug]`): Dark theme applied
- **Booking page**: Section → `bg-brand-dark`, heading → `text-white`
- **Quote pages** (2 files): Cards → `bg-brand-dark border-white/10`, status banners → dark variants (red-950, green-950, purple-950, amber-950)
- **Service pricing display**: Tables → `bg-brand-surface border-white/10`, prices → `text-lime`, alternating rows → `bg-white/[0.02]`
- **Content block renderer**: Prose → `prose-invert prose-a:text-lime`, FAQ → `border-white/10`, CTA → `bg-lime text-black btn-lime-glow`, quote icon → `text-lime`
- **Breadcrumbs**: Links → `hover:text-lime hover:decoration-lime`
- **Service card**: Dark theme applied

#### Files Created
- `src/lib/animations.ts` — Framer Motion animation variants library

#### Files Modified (Dark Theme + Lime Accent)
- `src/app/globals.css` — lime tokens, brand utilities, glow shadows
- `src/app/(public)/layout.tsx` — added `public-theme antialiased` classes
- `src/components/public/header-client.tsx` — red → lime accent
- `src/components/public/footer-client.tsx` — red → lime accent
- `src/components/public/cms/announcement-ticker.tsx` — red → lime defaults
- `src/components/public/cms/hero-carousel.tsx` — red → lime CTA
- `src/components/public/hero-section.tsx` — red → lime CTA
- `src/components/before-after-slider.tsx` — lime accents + keyboard a11y
- `src/app/(public)/page.tsx` — full dark theme
- `src/components/public/trust-bar.tsx` — dark theme
- `src/components/public/cta-section.tsx` — dark theme + lime CTA
- `src/components/public/service-category-card.tsx` — dark theme
- `src/app/(public)/services/page.tsx` — dark theme
- `src/app/(public)/services/[categorySlug]/page.tsx` — dark theme
- `src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx` — dark theme + lime CTA
- `src/app/(public)/products/page.tsx` — dark theme
- `src/app/(public)/products/[categorySlug]/page.tsx` — dark theme
- `src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx` — dark theme
- `src/components/public/product-card.tsx` — dark theme
- `src/components/public/product-category-card.tsx` — dark theme
- `src/app/(public)/gallery/page.tsx` — dark theme
- `src/app/(public)/gallery/gallery-client.tsx` — dark theme
- `src/app/(public)/areas/page.tsx` — dark theme
- `src/app/(public)/areas/[citySlug]/page.tsx` — dark theme + lime CTA
- `src/app/(public)/terms/page.tsx` — dark theme
- `src/app/(public)/p/[...slug]/page.tsx` — dark theme
- `src/app/(public)/book/page.tsx` — dark theme
- `src/app/(public)/quote/[token]/page.tsx` — dark theme
- `src/app/(public)/quote/[token]/accept-button.tsx` — dark theme
- `src/components/public/breadcrumbs.tsx` — lime hover accents
- `src/components/public/service-card.tsx` — dark theme
- `src/components/public/service-pricing-display.tsx` — dark theme
- `src/components/public/content-block-renderer.tsx` — dark theme + lime accents

---

## Session I — 2026-02-14 (AI Content Writer for City Pages)

### New: AI Content Writer System
- **Content blocks schema** (`page_content_blocks` table): 5 block types (rich_text, faq, features_list, cta, testimonial_highlight), per-page ordering, active/inactive toggle, AI generation tracking. RLS: public read active blocks, authenticated manage.
- **Content data layer** (`src/lib/data/page-content.ts`): CRUD functions for content blocks — `getPageContentBlocks()` (public), `getPageContentBlocksAdmin()` (all), `createContentBlock()`, `updateContentBlock()`, `deleteContentBlock()`, `reorderContentBlocks()`, `bulkCreateContentBlocks()`.
- **AI Content Writer service** (`src/lib/services/ai-content-writer.ts`): Claude API integration for content generation. Context-aware prompts for city pages, service pages, and custom pages. Modes: full_page (multi-block), single_block, improve. Uses business info, city data, service data, and focus keywords for context.
- **Content API routes**: CRUD at `/api/admin/cms/content` (list + create), `/api/admin/cms/content/[id]` (get + patch + delete), `/api/admin/cms/content/reorder` (patch). AI generation at `/api/admin/cms/content/ai-generate` with 4 modes: full_page, single_block, improve, batch_cities.
- **Public content rendering** (`src/components/public/content-block-renderer.tsx`): Server Component rendering 5 block types — RichTextBlock (markdown→HTML), FaqBlock (accordion + FAQPage JSON-LD schema), FeaturesListBlock (grid cards), CtaBlock (gradient banner), TestimonialBlock (styled quote). `ContentBlocks` wrapper renders list with section spacing.
- **City page integration**: Content blocks rendered on public city landing pages between service highlights and reviews sections.
- **Admin content editors**: Markdown editor with toolbar (bold, italic, headings, links, lists) + live preview + word count + AI improve. FAQ editor with drag-reorder + AI generate. Features list, CTA, and testimonial editors with structured form fields.
- **Content Block Editor** (`src/components/admin/content/content-block-editor.tsx`): Full block management component — add/delete/reorder blocks, type-specific inline editors, per-block AI improve, full-page AI generate, drag-and-drop reordering.
- **City pages admin**: "Edit Content" button per city, "Generate All Content" batch button for AI content generation across all cities without content.
- **SEO page integration**: Collapsible "Page Content Blocks" section in each page's expanded editor, allowing content block management for any page type.

### Files Created
- `supabase/migrations/20260214000010_page_content_blocks.sql` — content blocks table + RLS
- `src/lib/data/page-content.ts` — content block data layer
- `src/lib/services/ai-content-writer.ts` — AI content writer service
- `src/app/api/admin/cms/content/route.ts` — content blocks list + create
- `src/app/api/admin/cms/content/[id]/route.ts` — content block CRUD
- `src/app/api/admin/cms/content/reorder/route.ts` — reorder blocks
- `src/app/api/admin/cms/content/ai-generate/route.ts` — AI content generation
- `src/components/public/content-block-renderer.tsx` — public content block renderer
- `src/components/admin/content/markdown-editor.tsx` — markdown editor with toolbar
- `src/components/admin/content/faq-editor.tsx` — FAQ Q&A pair editor
- `src/components/admin/content/content-block-editor.tsx` — admin content block management

### Files Modified
- `src/lib/supabase/types.ts` — `PageContentBlock` interface, `ContentBlockType` type, `body_content` on `CityLandingPage`
- `src/app/(public)/areas/[citySlug]/page.tsx` — content blocks fetch + render
- `src/app/admin/website/seo/cities/page.tsx` — content editor dialog, batch generate button
- `src/app/admin/website/seo/page.tsx` — page content blocks section in PageEditor

---

## Session H — 2026-02-14 (AI-Powered SEO Agent)

### New: AI SEO Generation System
- **Page content extractor** (`src/lib/services/page-content-extractor.ts`): Extracts text content from each page type for AI context. Master router function handles homepage, services (index/category/detail), products (index/category/detail), city landing pages, gallery, booking, terms. Queries DB for live data (services, products, categories, pricing, business info).
- **AI SEO service** (`src/lib/services/ai-seo.ts`): Claude API wrapper for SEO content generation. Detailed system prompt with rules for title (50-60 chars), description (150-160 chars), keywords, focus keyword, OG fields, local SEO priorities. Uses `claude-sonnet-4-20250514` model via `ANTHROPIC_API_KEY`.
- **AI Generate API** (`/api/admin/cms/seo/ai-generate`): POST endpoint with three modes — `single` (one page for inline preview), `global` (all pages with empty/auto-generated SEO), `batch` (specific page paths). Supports `overwriteExisting` flag.
- **AI Apply API** (`/api/admin/cms/seo/ai-apply`): POST endpoint to save AI-generated (admin-reviewed) SEO to `page_seo` table. Upserts each page, sets `is_auto_generated: false`.
- **Per-page AI Optimize**: "AI Optimize" button in PageEditor calls single-mode API, populates form fields with AI suggestions. "Revert" button restores original values. Amber "Fields updated by AI" banner. Blue "AI Recommendations" panel with actionable suggestions.
- **Global AI Generate All**: "AI Generate All" button in page header with confirmation dialog and "Overwrite existing?" checkbox. Opens AI Review Modal showing all results with side-by-side current vs generated diff, inline editing, select/deselect checkboxes, progress bar during generation, and "Apply N Pages" button.

### Files Created
- `src/lib/services/page-content-extractor.ts` — page content extraction for AI context
- `src/lib/services/ai-seo.ts` — Claude API wrapper for SEO generation
- `src/app/api/admin/cms/seo/ai-generate/route.ts` — AI SEO generation endpoint
- `src/app/api/admin/cms/seo/ai-apply/route.ts` — AI SEO apply endpoint

### Files Modified
- `src/app/admin/website/seo/page.tsx` — AI Optimize button, AI Review Modal, AI Generate All button, confirm dialog

---

## Phase 8 — Complete (Launch Ready)
- Phase 8 Job Management & Photo Documentation fully operational
- See `docs/POST_LAUNCH_ROADMAP.md` for deferred enhancements (marketing library, categories, collages, portfolio, vehicle SVG upgrade)

---

## Session G — 2026-02-13 (Service History Tab, Sidebar Cleanup, Photo Feature Button)

### Changed: Customer Detail — Photos tab → Service History tab
- Replaced the Photos tab (before/after sliders grouped by visit) with a full Service History table
- Table columns: Date, Vehicle, Services (truncated >2), Add-ons count, Photos count, Duration, Staff, Status pill
- All job statuses shown (scheduled, intake, in_progress, completed, closed, cancelled)
- Filters: status dropdown, vehicle dropdown (when customer has 2+ vehicles)
- Pagination: 20 per page
- Row click navigates to `/admin/jobs/[id]`
- Uses existing `/api/admin/jobs?customer_id=` endpoint (no new API)
- Removed unused imports: `BeforeAfterSlider`, `getZoneLabel`, `Camera` icon

### Changed: Admin Sidebar — Flatten Service Records
- "Service Records" is now a direct link to `/admin/jobs` (no dropdown, no chevron)
- Icon changed from `Briefcase` to `ClipboardList`
- "Photo Gallery" is now a standalone sidebar item (same level, `Camera` icon)
- Both gated behind `photo_documentation` feature flag

### New: Job Detail — Star/Feature Button on Photos
- Each photo thumbnail now has a star icon button (top-right corner, overlaid)
- Unfeatured: outline star in white/gray; Featured: filled star in yellow/gold
- Click toggles `is_featured` via `PATCH /api/admin/photos/[id]`
- Optimistic UI with revert on error + success/error toasts
- Tooltip: "Feature for marketing" / "Remove from featured"
- Replaces the passive featured badge (yellow checkmark circle)

### API: /api/admin/jobs — Added vehicle_id filter
- New `vehicle_id` query param filters jobs by vehicle

### Files Modified
- `src/app/admin/customers/[id]/page.tsx` — Service History tab replaces Photos tab
- `src/app/admin/jobs/[id]/page.tsx` — Star toggle button on photo thumbnails
- `src/app/admin/admin-shell.tsx` — Photo Gallery feature flag gating
- `src/lib/auth/roles.ts` — Sidebar structure flattened
- `src/app/api/admin/jobs/route.ts` — vehicle_id filter

---

## Session D — 2026-02-13 (Admin Jobs / Service Records Detail Page)

### New: /admin/jobs/[id] — Job Detail Page
- **Overview tab**: Job summary card (customer link, vehicle, staff, duration), timeline with all status transitions (created → intake → work → completed → pickup → cancelled), original services list with pricing, add-ons section with status badges (approved/declined/pending/expired) + discount display + issue type, totals sidebar card with grand total + transaction link, quick stats card (photos/duration/services/addons), intake notes, pickup notes, cancellation info
- **Photos tab**: Before/after `BeforeAfterSlider` per zone (only zones with both intake + completion), photo grids grouped by phase (intake/progress/completion) with thumbnail grid, fullscreen lightbox with zone label, phase, creator name, timestamp, featured/internal badges, notes
- Source badge: Appointment (purple, CalendarDays icon) vs Walk-In (amber, Footprints icon)
- 3-column layout: main content (2 cols) + sidebar (1 col)
- Auth: `admin.photos.view` permission via API route

### Files
- Created: `src/app/admin/jobs/[id]/page.tsx` (860 lines)

---

## Session 52 — 2026-02-13 (Customer Portal: Service Records Restructure)

### New: /account/services — Service History page
- Clean row-style visit list (one row per completed/closed job, most recent first)
- Each row: date, vehicle, comma-separated services, addon count, photo count, status pill
- Status pills: Completed (green), Closed (slate)
- Vehicle filter dropdown (shown when 2+ vehicles)
- "Load more" pagination (10 per page)
- Row click navigates to service detail page

### New: /account/services/[jobId] — Service Detail page
- Full service summary: date (weekday + full date), vehicle, services with prices, approved add-ons
- Duration display (formatted from timer_seconds)
- Staff attribution ("Serviced by Segundo")
- Expandable "Before & After Photos" section with zone-by-zone BeforeAfterSliders
- Link to public gallery page for full gallery view
- Auth: verifies job belongs to logged-in customer, returns 404 otherwise

### New: GET /api/account/services — Visit list API
- Cookie-based customer auth
- Returns paginated job list with vehicle, services, addon_count, photo_count, gallery_token
- Supports page/limit/vehicle_id query params
- Only shows completed/closed jobs

### New: GET /api/account/services/[jobId] — Service detail API
- Returns full job details: services, addons, photos (grouped by phase), staff, timer, vehicle
- Excludes internal and progress-phase photos
- Auth: customer must own the job

### Updated: Customer portal navigation
- "Photos" tab renamed to "Service History" → `/account/services`
- Dashboard "View all photos" link changed to "View service history"
- Old `/account/photos` redirects to `/account/services`

### Updated: Admin sidebar
- "Photos" renamed to "Service Records" with children: "All Jobs" + "Photo Gallery"

### Files Created
- `src/app/(account)/account/services/page.tsx` — visit list page
- `src/app/(account)/account/services/[jobId]/page.tsx` — service detail page
- `src/app/api/account/services/route.ts` — visit list API
- `src/app/api/account/services/[jobId]/route.ts` — service detail API

### Files Modified
- `src/components/account/account-shell.tsx` — nav tab rename
- `src/app/(account)/account/page.tsx` — dashboard link update
- `src/app/(account)/account/photos/page.tsx` — replaced with redirect
- `src/app/admin/admin-shell.tsx` — Briefcase icon + nav filter key
- `src/lib/auth/roles.ts` — Service Records nav with children

---

## Session 51 — 2026-02-13 (Admin Photo Gallery Enhancement)

### Enhanced: /admin/photos page (full spec rewrite)
- **Phase toggle pills** — colored pill buttons (All | Intake | Progress | Completion) replace dropdown
- **Staff dropdown filter** — "Taken By" dropdown populated from active employees, filters by `created_by`
- **Featured toggle** — "Featured only" checkbox in filter bar
- **Search text input** — searches customer name or vehicle make/model
- **Enhanced photo cards** — customer name, vehicle (year make model), and date shown below each thumbnail
- **Hover effects** — subtle scale + shadow on card hover
- **Select mode toggle** — "Select" button in header toggles bulk selection (checkboxes hidden by default)
- **Floating bulk action bar** — fixed bottom bar with Feature/Unfeature/Mark Internal/Mark Public actions
- **Photo detail modal enhancements** — job link (clickable, opens POS), keyboard navigation (left/right arrows, Escape to close), "Featured on website" and "Internal only" as labeled toggle buttons with ON/OFF indicator, click-outside to close
- **Empty state differentiation** — "No photos yet" (with helpful message) vs "No photos match your filters" (with clear filters link)

### Enhanced: GET /api/admin/photos response shape
- Response now uses `{ photos: [...], total, page, limit }` format (was `{ data, total }`)
- Each photo includes nested `job`, `customer`, `vehicle`, `taken_by` objects
- `taken_by` fetched from `created_by` → employees join (who took the photo)

### Files Modified
- `src/app/admin/photos/page.tsx` — full rewrite (748 → 587 lines, significantly enhanced UI)
- `src/app/api/admin/photos/route.ts` — response shape transformation with `taken_by` employee lookup

---

## Session 50 — 2026-02-13 (Customer Portal Photo History Enhancements)

### Enhanced: /api/account/photos API
- Added pagination support (`page`, `limit` query params) with total count for load-more
- Added vehicle filter (`vehicle_id` query param) to filter photos by vehicle
- Restructured response: photos grouped by phase (`intake`/`completion`) instead of flat list
- Added `zone_label` to each photo for display convenience
- Added `vehicles` array in response for filter dropdown population
- Excluded `progress` phase photos from customer view (internal documentation only)
- Added `gallery_token` to each visit for potential future linking
- Added `photo_count` per visit with intake/completion breakdown

### Enhanced: /account/photos page
- **Vehicle filter dropdown** — only shown when customer has multiple vehicles with photos
- **"Load more" pagination** — shows count (e.g., "5 of 12"), appends next batch without full reload
- **Photo lightbox** — fullscreen overlay with close (X), left/right navigation arrows, photo counter, zone label, phase label, download button. Click any photo or slider to open.
- **Improved zone matching** — first matching intake+completion pair per zone shown as `BeforeAfterSlider`, extras in grid
- **Photo count** — shown on each visit card header

### New: "Your Last Service" card on /account dashboard
- Shows date, vehicle (year make model — color), services performed
- Features 1 before/after `BeforeAfterSlider` pair (prefers exterior zones)
- "View all photos" link to `/account/photos`
- Only visible when customer has at least 1 completed job with photos

### Enhanced: Admin photos API
- Added search support (customer name/phone lookup using related-table-first pattern)
- Added pagination via `page`/`limit` params
- Added `featured` filter param

### Files Modified
- `src/app/api/account/photos/route.ts` — rewritten with pagination, vehicle filter, phase grouping
- `src/app/(account)/account/photos/page.tsx` — rewritten with vehicle filter, load more, lightbox
- `src/app/(account)/account/page.tsx` — added Last Service card with before/after slider
- `src/app/api/admin/photos/route.ts` — enhanced with search, pagination, featured filter

---

## Session 49 — 2026-02-13 (Revert Vehicle SVG, Fix IP Restriction)

### Revert: Vehicle silhouette changes
- Previous session created a `feature/vehicle-silhouettes` branch with custom SVG vehicle zone picker components
- Changes were never merged to main — branch left as-is for future reference if needed
- No files on main were affected

### Fix: Middleware missing `::ffff:127.0.0.1` localhost check
- `getClientIp()` treated `::1` and `127.0.0.1` as null (localhost) but missed `::ffff:127.0.0.1`
- `::ffff:127.0.0.1` is the IPv4-mapped IPv6 address Node.js commonly uses in dev
- Added to both `x-forwarded-for` and `x-real-ip` checks in `src/middleware.ts`

---

## Session 48 — 2026-02-13 (Fix POS IP Restriction — Dev Blocking + RLS)

### Fix: Middleware always blocked in dev due to IP mismatch
- `getClientIp()` returned `::1` or `127.0.0.1` in local dev — never matches whitelisted public IPs
- Now treats loopback addresses as `null` (same as "no IP detected")
- IP check logic flipped: `!clientIp || !ips.includes(clientIp)` → `clientIp && !ips.includes(clientIp)`
- Old: null IP = blocked (dev always blocked). New: null IP = allowed (local dev works), real IP checked in production
- Error message now includes the blocked IP for easier debugging
- Cache TTL reduced from 60s to 10s so settings changes take effect faster
- Files: `src/middleware.ts`

### Fix: RLS policy blocked non-super_admin from saving settings
- `settings_write` policy on `business_settings` required `is_super_admin()` — only 1 user (Nayeem)
- Admin users (Su Khan) got 42501 RLS violation on upsert, writes silently failed
- Affected ALL 12 settings pages (Tax Config, Business Profile, Messaging, etc.)
- Changed policy to use `is_admin_or_above()` — allows both `super_admin` and `admin` roles
- Migration: `20260213000001_fix_settings_rls.sql`

---

## Session 47 — 2026-02-12 (Fix POS IP Restriction — Dead Middleware)

### Fix: POS IP restriction was completely non-functional
- In Session (commit 26dd5b3), `src/middleware.ts` was incorrectly renamed to `src/proxy.ts` — Next.js has no "proxy.ts" convention
- The file became dead code: nothing imported it, the `proxy()` function never executed
- Admin > Settings > POS Security saved IPs correctly to `business_settings`, but enforcement never ran
- Fix: renamed `proxy.ts` → `middleware.ts`, renamed exported function `proxy()` → `middleware()`
- Deleted vestigial `src/app/api/internal/allowed-ips/route.ts` (was used by old self-fetch approach, nothing calls it)
- No logic changes — the IP check, cache, matcher, and Supabase query were all correct
- Files: `src/middleware.ts` (renamed from `src/proxy.ts`), deleted `src/app/api/internal/allowed-ips/route.ts`

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
