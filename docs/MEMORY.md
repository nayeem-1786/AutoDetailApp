# Claude Code Memory

## Smart Details Auto Spa (AutoDetailApp)

### Architecture Patterns
- **Admin API routes**: Use `createAdminClient()` (service role) to bypass RLS after auth check with `createClient()`
- **POS API routes**: Use `authenticatePosRequest()` + `createAdminClient()` - POS has separate HMAC auth
- **Session expiry**: Use `adminFetch()` from `@/lib/utils/admin-fetch` to auto-redirect on 401
- **Customer portal**: Uses `createClient()` with RLS - customers can only see their own data

### Common Bugs & Fixes
- **Empty admin pages**: Usually RLS issue - switch from `createClient()` to API route with `createAdminClient()`
- **"Already used coupon" on new coupon**: Coupon was edited (same ID), not created new. Warn user when editing used coupons.
- **Payment fails with $0 total**: Stripe rejects $0 amounts. Skip payment step when discounts cover full amount.
- **Soft-delete vs hard-delete**: Check if DELETE endpoints actually delete or just update status

### Coupon System
- `customer_id = NULL` means coupon available to everyone
- `is_single_use` defaults to `true` - checked against transactions table
- Coupon code has UNIQUE constraint - can't have duplicates
- Validate duplicate codes BEFORE saving draft (on goNext, not just on create)

### Booking Flow
- Step 6 is payment, controlled by `online_booking_payment` feature flag
- Under $100 = full payment, $100+ = $50 deposit
- `grandTotal` can be $0 or negative with big discounts - handle gracefully

### API Endpoints Created This Project
- `/api/admin/customers/search` - Admin customer search (name or phone)
- `/api/customer/coupons` - Portal user's available coupons
- `/api/book/payment-intent` - Stripe payment intent for booking
- `/api/book/validate-coupon` - Validates coupon for booking services

### Key Files
- `src/lib/supabase/admin.ts` - Service role client (bypasses RLS)
- `src/lib/supabase/server.ts` - Cookie-based auth client
- `src/lib/utils/admin-fetch.ts` - Auth-aware fetch with 401 redirect
- `src/app/admin/marketing/coupons/new/page.tsx` - 6-step coupon wizard
