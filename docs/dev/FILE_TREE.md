# File Tree Reference — Smart Details Auto Spa

> **Purpose:** Exact file paths for every route, page, lib module, component, and migration.
> Claude Code prompts MUST reference this file instead of guessing paths.
>
> **Last updated:** 2026-04-22 (Session 42G — drawer X buttons + POS Clear button gate)

---

## API Routes (`src/app/api/`)

### Account (Customer Portal)
```
src/app/api/account/orders/[id]/route.ts
src/app/api/account/orders/route.ts
src/app/api/account/photos/route.ts
src/app/api/account/services/[jobId]/route.ts
src/app/api/account/services/route.ts
```

### Admin
```
src/app/api/admin/appointments/[id]/mobile-address/route.ts  # PATCH mobile_address only (Phase Mobile-1.6)
src/app/api/admin/appointments/[id]/mobile-service/route.ts  # PATCH full mobile picker — toggle/zone/custom/address (Phase Mobile-1.9)
src/app/api/admin/appointments/stats/route.ts
src/app/api/admin/audit-log/export/route.ts
src/app/api/admin/audit-log/route.ts
src/app/api/admin/current-ip/route.ts
src/app/api/admin/customers/[id]/photos/route.ts
src/app/api/admin/customers/[id]/portal-access/route.ts
src/app/api/admin/customers/[id]/reset-password/route.ts
src/app/api/admin/customers/[id]/restore/route.ts
src/app/api/admin/customers/[id]/route.ts
src/app/api/admin/customers/check-duplicate/route.ts
src/app/api/admin/customers/route.ts
src/app/api/admin/customers/search/route.ts
src/app/api/admin/customers/stats/route.ts
src/app/api/admin/customers/purge/route.ts
src/app/api/admin/customers/[id]/purge-preview/route.ts
src/app/api/admin/global-search/route.ts
src/app/api/admin/footer/bottom-links/route.ts
src/app/api/admin/footer/columns/[columnId]/links/route.ts
src/app/api/admin/footer/columns/reorder/route.ts
src/app/api/admin/footer/columns/route.ts
src/app/api/admin/footer/sections/route.ts
src/app/api/admin/jobs/[id]/route.ts
src/app/api/admin/jobs/route.ts
src/app/api/admin/messaging/[conversationId]/summary/route.ts
src/app/api/admin/notification-recipients/[id]/route.ts
src/app/api/admin/notification-recipients/route.ts
src/app/api/admin/orders/[id]/refund/route.ts
src/app/api/admin/orders/[id]/refund/__tests__/refund.test.ts
src/app/api/admin/orders/[id]/route.ts
src/app/api/admin/orders/route.ts
src/app/api/admin/products/[id]/group/route.ts
src/app/api/admin/products/[id]/variants/route.ts
src/app/api/admin/products/group/route.ts
src/app/api/admin/products/barcode-lookup/route.ts
src/app/api/admin/photos/[id]/route.ts
src/app/api/admin/photos/bulk/route.ts
src/app/api/admin/photos/route.ts
src/app/api/admin/photos/tags/route.ts
src/app/api/admin/photos/gallery-preview/route.ts
src/app/api/admin/purchase-orders/[id]/receive/route.ts
src/app/api/admin/purchase-orders/[id]/route.ts
src/app/api/admin/purchase-orders/route.ts
src/app/api/admin/quotes/route.ts
src/app/api/admin/quotes/stats/route.ts
src/app/api/admin/receipt-logo/route.ts
src/app/api/admin/shop-expenses/export/route.ts
src/app/api/admin/stock-adjustments/route.ts
src/app/api/admin/inventory/counts/route.ts
src/app/api/admin/inventory/counts/[id]/route.ts
src/app/api/admin/inventory/counts/[id]/items/route.ts
src/app/api/admin/inventory/counts/[id]/commit/route.ts
src/app/api/admin/inventory/counts/[id]/cancel/route.ts
src/app/api/admin/inventory/counts/[id]/transition/route.ts
src/app/api/admin/inventory/counts/[id]/revert/route.ts
src/app/api/admin/inventory/counts/[id]/revert-preview/route.ts
src/app/api/admin/inventory/counts/__tests__/commit.test.ts
src/app/api/admin/inventory/counts/__tests__/revert.test.ts
src/app/api/admin/inventory/counts/__tests__/revert-preview.test.ts
src/app/admin/inventory/counts/__tests__/revert-flow.test.tsx
src/app/api/admin/transactions/stats/route.ts
src/app/api/admin/upload/content-image/route.ts
```

### Admin — Email Templates
```
src/app/api/admin/email-templates/route.ts
src/app/api/admin/email-templates/[id]/route.ts
src/app/api/admin/email-templates/[id]/preview/route.ts
src/app/api/admin/email-templates/[id]/test-send/route.ts
src/app/api/admin/email-templates/[id]/reset/route.ts
src/app/api/admin/email-templates/assignments/route.ts
src/app/api/admin/email-templates/gallery-photos/route.ts
src/app/api/admin/email-templates/brand-kit/route.ts
src/app/api/admin/email-templates/layouts/route.ts
src/app/api/admin/email-templates/layouts/[id]/route.ts
```

### Admin — Drip Sequences
```
src/app/api/admin/drip-sequences/route.ts
src/app/api/admin/drip-sequences/[id]/route.ts
src/app/api/admin/drip-sequences/[id]/steps/route.ts
src/app/api/admin/drip-sequences/[id]/steps/[stepId]/route.ts
src/app/api/admin/drip-sequences/[id]/enrollments/route.ts
src/app/api/admin/drip-sequences/[id]/enrollments/[enrollId]/route.ts
src/app/api/admin/drip-sequences/[id]/analytics/route.ts
```

### Admin — CMS
```
src/app/api/admin/cms/ads/analytics/route.ts
src/app/api/admin/cms/ads/creatives/[id]/route.ts
src/app/api/admin/cms/ads/creatives/route.ts
src/app/api/admin/cms/ads/placements/[id]/route.ts
src/app/api/admin/cms/ads/placements/route.ts
src/app/api/admin/cms/ads/zones/route.ts
src/app/api/admin/cms/catalog/products/route.ts
src/app/api/admin/cms/catalog/services/route.ts
src/app/api/admin/cms/products/ai-enrich/route.ts
src/app/api/admin/cms/products/ai-enrich/apply/route.ts
src/app/api/admin/cms/products/ai-enrich/status/route.ts
src/app/api/admin/cms/products/ai-enrich/results/route.ts
src/app/api/admin/cms/products/ai-enrich/delete-errors/route.ts
src/app/api/admin/cms/content/[id]/route.ts
src/app/api/admin/cms/migrate-data/route.ts
src/app/api/admin/cms/content/ai-generate/route.ts
src/app/api/admin/cms/migrate-markdown/route.ts
src/app/api/admin/cms/content/reorder/route.ts
src/app/api/admin/cms/content/route.ts
src/app/api/admin/cms/global-blocks/route.ts
src/app/api/admin/cms/global-blocks/[id]/route.ts
src/app/api/admin/cms/global-blocks/[id]/place/route.ts
src/app/api/admin/cms/homepage-settings/route.ts
src/app/api/admin/cms/hero/[id]/route.ts
src/app/api/admin/cms/hero/config/route.ts
src/app/api/admin/cms/hero/reorder/route.ts
src/app/api/admin/cms/hero/route.ts
src/app/api/admin/cms/navigation/[id]/route.ts
src/app/api/admin/cms/navigation/reorder/route.ts
src/app/api/admin/cms/navigation/route.ts
src/app/api/admin/cms/pages/[id]/route.ts
src/app/api/admin/cms/pages/[id]/preview/route.ts
src/app/api/admin/cms/pages/[id]/revisions/route.ts
src/app/api/admin/cms/pages/[id]/revisions/[revisionId]/route.ts
src/app/api/admin/cms/pages/[id]/revisions/[revisionId]/restore/route.ts
src/app/api/admin/cms/pages/ai-draft/route.ts
src/app/api/admin/cms/pages/route.ts
src/app/api/admin/cms/seo/ai-apply/route.ts
src/app/api/admin/cms/seo/ai-generate/route.ts
src/app/api/admin/cms/seo/ai-txt/route.ts
src/app/api/admin/cms/seo/cities/[id]/route.ts
src/app/api/admin/cms/seo/cities/route.ts
src/app/api/admin/cms/seo/pages/[encodedPath]/route.ts
src/app/api/admin/cms/seo/pages/route.ts
src/app/api/admin/cms/site-theme/reset/route.ts
src/app/api/admin/cms/site-theme/route.ts
src/app/api/admin/cms/themes/[id]/activate/route.ts
src/app/api/admin/cms/themes/[id]/deactivate/route.ts
src/app/api/admin/cms/themes/[id]/route.ts
src/app/api/admin/cms/themes/route.ts
src/app/api/admin/cms/tickers/[id]/route.ts
src/app/api/admin/cms/tickers/reorder/route.ts
src/app/api/admin/cms/tickers/route.ts
```

### Admin — Integrations (QuickBooks)
```
src/app/api/admin/integrations/qbo/accounts/route.ts
src/app/api/admin/integrations/qbo/callback/route.ts
src/app/api/admin/integrations/qbo/connect/route.ts
src/app/api/admin/integrations/qbo/disconnect/route.ts
src/app/api/admin/integrations/qbo/reports/export/route.ts
src/app/api/admin/integrations/qbo/reports/route.ts
src/app/api/admin/integrations/qbo/settings/route.ts
src/app/api/admin/integrations/qbo/status/route.ts
src/app/api/admin/integrations/qbo/sync/log/export/route.ts
src/app/api/admin/integrations/qbo/sync/log/route.ts
src/app/api/admin/integrations/qbo/sync/retry/route.ts
src/app/api/admin/integrations/qbo/sync/route.ts
```

### Admin — Marketing Analytics
```
src/app/api/admin/marketing/analytics/ab-tests/route.ts
src/app/api/admin/marketing/analytics/audience/route.ts
src/app/api/admin/marketing/analytics/automations/route.ts
src/app/api/admin/marketing/analytics/campaigns/[id]/route.ts
src/app/api/admin/marketing/analytics/campaigns/route.ts
src/app/api/admin/marketing/analytics/coupons/route.ts
src/app/api/admin/marketing/analytics/route.ts
src/app/api/admin/marketing/promotions/batch/route.ts
src/app/api/admin/marketing/promotions/clear/route.ts
src/app/api/admin/marketing/promotions/history/route.ts
src/app/api/admin/marketing/promotions/route.ts
```

### Admin — Settings
```
src/app/api/admin/settings/business/route.ts
src/app/api/admin/settings/revalidate-business/route.ts
src/app/api/admin/settings/shipping/carriers/route.ts
src/app/api/admin/settings/shipping/route.ts
src/app/api/admin/settings/shipping/test-connection/route.ts
src/app/api/admin/settings/shipping/validate-address/route.ts
```

### POS — Settings
```
src/app/api/pos/settings/quote-defaults/route.ts
```

### Admin — Credentials
```
src/app/api/admin/credentials/route.ts
src/app/api/admin/credentials/[id]/route.ts
src/app/api/admin/credentials/reorder/route.ts
```

### Admin — Team Members
```
src/app/api/admin/team-members/route.ts
src/app/api/admin/team-members/[id]/route.ts
src/app/api/admin/team-members/reorder/route.ts
```

### Admin — Vehicle Categories
```
src/app/api/admin/vehicle-categories/route.ts
src/app/api/admin/vehicle-categories/[id]/route.ts
src/app/api/admin/vehicle-categories/[id]/image/route.ts
```

### Admin — Vehicle Makes
```
src/app/api/admin/vehicle-makes/route.ts
```

### Admin — Staff & Roles
```
src/app/api/admin/staff/[id]/permissions/route.ts
src/app/api/admin/staff/[id]/reset-password/route.ts
src/app/api/admin/staff/[id]/route.ts
src/app/api/admin/staff/roles/[id]/reset/route.ts
src/app/api/admin/staff/roles/[id]/route.ts
src/app/api/admin/staff/roles/route.ts
```

### Admin — Stripe
```
src/app/api/admin/stripe/debug/route.ts
src/app/api/admin/stripe/locations/route.ts
src/app/api/admin/stripe/readers/[id]/route.ts
src/app/api/admin/stripe/readers/register/route.ts
src/app/api/admin/stripe/readers/route.ts
```

### Appointments
```
src/app/api/appointments/[id]/cancel/route.ts
src/app/api/appointments/[id]/notify/route.ts
src/app/api/appointments/[id]/route.ts
```

### Auth
```
src/app/api/auth/my-permissions/route.ts
src/app/api/authorize/[token]/approve/route.ts
src/app/api/authorize/[token]/decline/route.ts
src/app/api/authorize/[token]/route.ts
```

### Booking (Public)
```
src/app/api/book/check-customer/route.ts
src/app/api/book/check-phone/route.ts
src/app/api/book/payment-intent/route.ts
src/app/api/book/route.ts
src/app/api/book/slots/route.ts
src/app/api/book/validate-coupon/route.ts
src/app/api/book/__tests__/modifier-persistence.test.ts  # 4 tests — pins Item 15g Layer 15g-iv Scenario A: POST /api/book persists coupon + loyalty to dedicated columns, never to internal_notes (post-cleanup contract)
```

### Checkout (Online Store)
```
src/app/api/checkout/create-payment-intent/route.ts
src/app/api/checkout/customer-info/route.ts
src/app/api/checkout/order/route.ts
src/app/api/checkout/shipping-rates/route.ts
src/app/api/checkout/validate-address/route.ts
```

### Pay Link (Appointment Payment Links)
```
src/app/api/pay/[token]/intent/route.ts   — POST: create PI for /pay/[token] (Pay-Link Session 2)
```

### Cron (Internal Scheduler)
```
src/app/api/cron/cleanup-audit-log/route.ts
src/app/api/cron/cleanup-idempotency/route.ts
src/app/api/cron/cleanup-orders/route.ts
src/app/api/cron/cleanup-verification-codes/route.ts
src/app/api/cron/conversation-summaries/route.ts
src/app/api/cron/google-reviews/route.ts
src/app/api/cron/lifecycle-engine/route.ts
src/app/api/cron/qbo-sync/route.ts
src/app/api/cron/booking-reminders/route.ts
src/app/api/cron/quote-reminders/route.ts
src/app/api/cron/stock-alerts/route.ts
src/app/api/cron/theme-activation/route.ts
src/app/api/cron/voice-calls-poll/route.ts
```

### Customer Portal API
```
src/app/api/customer/appointments/[id]/cancel/route.ts
src/app/api/customer/appointments/[id]/route.ts
src/app/api/customer/check-exists/route.ts
src/app/api/customer/coupons/route.ts
src/app/api/customer/complete-profile/route.ts
src/app/api/customer/link-account/route.ts
src/app/api/customer/dismiss-email-prompt/route.ts
src/app/api/customer/email/route.ts
src/app/api/customer/email/send-code/route.ts
src/app/api/customer/email/verify-code/route.ts
src/app/api/customer/link-by-phone/route.ts
src/app/api/customer/loyalty/route.ts
src/app/api/customer/profile/route.ts
src/app/api/customer/profile/address/route.ts
src/app/api/customer/receipts/html/route.ts
src/app/api/customer/transactions/[id]/route.ts
src/app/api/customer/transactions/route.ts
src/app/api/customer/vehicles/[id]/route.ts
src/app/api/customer/vehicles/route.ts
```

### Marketing
```
src/app/api/marketing/automations/[id]/route.ts
src/app/api/marketing/automations/route.ts
src/app/api/marketing/campaigns/[id]/duplicate/route.ts
src/app/api/marketing/campaigns/[id]/recipients/route.ts
src/app/api/marketing/campaigns/[id]/route.ts
src/app/api/marketing/campaigns/[id]/send/route.ts
src/app/api/marketing/campaigns/audience-preview/route.ts
src/app/api/marketing/campaigns/audience-sample/route.ts
src/app/api/marketing/campaigns/process-scheduled/route.ts
src/app/api/marketing/campaigns/route.ts
src/app/api/marketing/compliance/opt-out/route.ts
src/app/api/marketing/compliance/route.ts
src/app/api/marketing/coupons/[id]/route.ts
src/app/api/marketing/coupons/[id]/stats/route.ts
src/app/api/marketing/coupons/[id]/summary/route.ts
src/app/api/marketing/coupons/route.ts
```

### Messaging (Two-Way SMS)
```
src/app/api/messaging/conversations/[id]/messages/route.ts
src/app/api/messaging/conversations/[id]/read/route.ts
src/app/api/messaging/conversations/[id]/route.ts
src/app/api/messaging/conversations/counts/route.ts
src/app/api/messaging/conversations/route.ts
src/app/api/messaging/send/route.ts
src/app/api/messaging/unread-count/route.ts
```

### Migration (Data Import)
```
src/app/api/migration/customers/route.ts
src/app/api/migration/loyalty/route.ts
src/app/api/migration/products/route.ts
src/app/api/migration/transactions/route.ts
src/app/api/migration/vehicles/route.ts
```

### POS
```
src/app/api/pos/appointments/route.ts                         # GET list (date range, default today+tomorrow) — Roadmap Item 12
src/app/api/pos/appointments/__tests__/list.test.ts
src/app/api/pos/appointments/[id]/route.ts                     # GET single appointment (Roadmap Item 15c — Jobs card Change Time)
src/app/api/pos/appointments/[id]/__tests__/get.test.ts
src/app/api/pos/appointments/[id]/cancel/route.ts              # POST cancel — POS-specific, notify_customer flag default false (Roadmap Item 15b)
src/app/api/pos/appointments/[id]/cancel/__tests__/cancel.test.ts
src/app/api/pos/appointments/[id]/load/route.ts                # Item 15f Phase 1 Layer 8b — GET TicketState-shaped payload for POS deep-link drain (`/pos?source=appointment&id=...`). Sibling of jobs/checkout-items. Gates on pos.jobs.manage (matches PUT cascade); refuses completed/cancelled status (matches save guard).
src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts # 10 cases — auth (401/403), 404 missing, 400 completed/cancelled, modifier-column passthrough, mobile_fee synthesis, deposit + deposit_date lookup
src/app/api/pos/appointments/[id]/mobile-address/route.ts     # PATCH mobile_address only (Phase Mobile-1.6)
src/app/api/pos/appointments/[id]/mobile-service/route.ts     # PATCH full mobile picker — toggle/zone/custom/address (Phase Mobile-1.9)
src/app/api/pos/appointments/[id]/notify/route.ts
src/app/api/pos/appointments/[id]/reschedule/route.ts          # PATCH date/time/detailer — notification suppression (Roadmap Item 12)
src/app/api/pos/appointments/[id]/reschedule/__tests__/reschedule.test.ts
src/app/api/pos/appointments/[id]/send-payment-link/route.ts   — Send pay-link via SMS/email/both (Pay-Link Session 3)
src/app/api/pos/auth/logout/route.ts
src/app/api/pos/auth/pin-login/route.ts
src/app/api/pos/auth/verify-override/route.ts
src/app/api/pos/card-customer/route.ts
src/app/api/pos/coupons/validate/route.ts
src/app/api/pos/customers/[id]/route.ts
src/app/api/pos/customers/[id]/address/route.ts
src/app/api/pos/customers/[id]/type/route.ts
src/app/api/pos/customers/[id]/vehicles/route.ts
src/app/api/pos/customers/__tests__/route.test.ts
src/app/api/pos/customers/check-duplicate/route.ts
src/app/api/pos/customers/route.ts
src/app/api/pos/customers/search/route.ts
src/app/api/pos/end-of-day/route.ts
src/app/api/pos/end-of-day/summary/route.ts
src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts
src/app/api/pos/jobs/[id]/addons/route.ts
src/app/api/pos/jobs/[id]/cancel/route.ts
src/app/api/pos/jobs/[id]/checkout-items/route.ts
src/app/api/pos/jobs/[id]/checkout-items/__tests__/coupon-fallback.test.ts  # 4 tests — pins Item 15g Layer 15g-i appointment-side coupon fallback when no job.quote_id bridge
src/app/api/pos/jobs/[id]/complete/route.ts
src/app/api/pos/jobs/[id]/link-transaction/route.ts
src/app/api/pos/jobs/[id]/photos/[photoId]/route.ts
src/app/api/pos/jobs/[id]/photos/route.ts
src/app/api/pos/jobs/[id]/reschedule/route.ts
src/app/api/pos/jobs/[id]/route.ts
src/app/api/pos/jobs/[id]/start-work/route.ts
src/app/api/pos/jobs/[id]/timer/route.ts
src/app/api/pos/jobs/populate/route.ts
src/app/api/pos/jobs/route.ts
src/app/api/pos/jobs/__tests__/walk-in-modifier-persistence.test.ts  # 6 tests — pins Item 15g Layer 15g-iv Scenario C: walk-in synthetic appointment persists 7-field modifier snapshot, percent → dollar resolution, over-discount clamp; + Item 15f Phase 1 Layer 8e — `scheduled_*_time` minute-precision shape
src/app/api/pos/jobs/settings/route.ts
src/app/api/pos/loyalty/earn/route.ts
src/app/api/pos/loyalty/redeem/route.ts
src/app/api/admin/mobile-zones/route.ts                       # GET (admin auth, Phase Mobile-1.9 — modal picker dropdown)
src/app/api/pos/mobile-zones/route.ts
src/app/api/pos/my-permissions/route.ts
src/app/api/pos/products/barcode-lookup/route.ts
src/app/api/pos/promotions/available/route.ts
src/app/api/pos/quotes/[id]/communications/route.ts
src/app/api/pos/quotes/[id]/convert/route.ts
src/app/api/pos/quotes/[id]/route.ts
src/app/api/pos/quotes/[id]/send/route.ts
src/app/api/pos/quotes/route.ts
src/app/api/pos/receipts/cash-drawer/route.ts
src/app/api/pos/receipts/email/route.ts
src/app/api/pos/receipts/html/route.ts
src/app/api/pos/receipts/print/route.ts
src/app/api/pos/receipts/print-copier/route.ts
src/app/api/pos/receipts/print-jobs/[id]/route.ts
src/app/api/pos/receipts/print-server/route.ts
src/app/api/pos/receipts/sms/route.ts
src/app/api/pos/refunds/route.ts
src/app/api/pos/shop-use/route.ts
src/app/api/pos/services/check-prerequisites/route.ts
src/app/api/pos/services/durations/route.ts
src/app/api/pos/services/route.ts
src/app/api/pos/staff/available/route.ts
src/app/api/pos/stripe/capture-payment/route.ts
src/app/api/pos/stripe/connection-token/route.ts
src/app/api/pos/stripe/payment-intent/route.ts
src/app/api/pos/sync-offline-transaction/route.ts
src/app/api/pos/transactions/[id]/route.ts
src/app/api/pos/transactions/route.ts
src/app/api/pos/transactions/search/route.ts
src/app/api/pos/version/route.ts
```

### Public API
```
src/app/api/public/business-info/route.ts
src/app/api/public/cms/ads/click/route.ts
src/app/api/public/cms/ads/impression/route.ts
src/app/api/public/cms/ads/route.ts
src/app/api/public/cms/hero/route.ts
src/app/api/public/cms/site-theme/route.ts
src/app/api/public/cms/theme/route.ts
src/app/api/public/cms/theme-preview/route.ts
src/app/api/public/cms/tickers/route.ts
src/app/api/public/products/search/route.ts
src/app/api/public/specialty-block-view/route.ts
src/app/api/public/specialty-callback/route.ts
```

### Quotes
```
src/app/api/quotes/[id]/accept/route.ts
src/app/api/quotes/[id]/convert/route.ts
src/app/api/quotes/[id]/pdf/route.ts
src/app/api/quotes/[id]/route.ts
src/app/api/quotes/[id]/send/route.ts
src/app/api/quotes/route.ts
```

### Staff (Schedules & Blocked Dates)
```
src/app/api/staff/blocked-dates/[id]/route.ts
src/app/api/staff/blocked-dates/route.ts
src/app/api/staff/create/route.ts
src/app/api/staff/schedules/[employeeId]/route.ts
src/app/api/staff/schedules/route.ts
```

### Webhooks
```
src/app/api/webhooks/mailgun/route.ts
src/app/api/webhooks/elevenlabs/call-complete/route.ts
src/app/api/webhooks/stripe/route.ts
src/app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts
src/app/api/webhooks/twilio/inbound/route.ts
src/app/api/webhooks/twilio/status/route.ts
src/app/api/webhooks/twilio/voice/route.ts
```

### Vehicle Categories (Public)
```
src/app/api/vehicle-categories/route.ts
```

### Vehicle Makes (Public)
```
src/app/api/vehicle-makes/route.ts
```

### Other
```
src/app/api/gallery/route.ts
src/app/api/jobs/[token]/photos/route.ts
src/app/api/t/[code]/route.ts
src/app/api/unsubscribe/[customerId]/route.ts
src/app/api/voice-agent/appointments/route.ts
src/app/api/voice-agent/availability/route.ts
src/app/api/voice-agent/context/route.ts
src/app/api/voice-agent/customers/route.ts
src/app/api/voice-agent/finalize-call/route.ts
src/app/api/voice-agent/initiation/route.ts
src/app/api/voice-agent/products/route.ts
src/app/api/voice-agent/products/details/route.ts
src/app/api/voice-agent/quotes/route.ts
src/app/api/voice-agent/send-info-sms/route.ts
src/app/api/voice-agent/notify-staff/route.ts
src/app/api/voice-agent/send-quote-sms/route.ts
src/app/api/voice-agent/services/route.ts
src/app/api/voice-agent/vehicle-classify/route.ts
src/app/api/waitlist/[id]/route.ts
src/app/api/waitlist/route.ts
```

### Top-Level Route Handlers (`src/app/`)
```
src/app/ai.txt/route.ts                 — AI crawler instructions
src/app/robots.txt/route.ts             — Dynamic robots.txt
src/app/sitemap.xml/route.ts            — Dynamic sitemap
```

---

## Admin Pages (`src/app/admin/`)

### Dashboard
```
src/app/admin/page.tsx
```

### Appointments
```
src/app/admin/appointments/page.tsx
src/app/admin/appointments/scheduling/page.tsx
src/app/admin/appointments/waitlist/page.tsx
```

### Catalog
```
src/app/admin/catalog/categories/page.tsx
src/app/admin/catalog/products/[id]/page.tsx
src/app/admin/catalog/products/[id]/_components/stock-history-card.tsx
src/app/admin/catalog/products/[id]/__tests__/stock-history-card.test.tsx
src/app/admin/catalog/products/enrichment-review/page.tsx
src/app/admin/catalog/products/new/page.tsx
src/app/admin/catalog/products/page.tsx
src/app/admin/catalog/products/components/quick-edit-drawer.tsx
src/app/admin/catalog/services/[id]/page.tsx
src/app/admin/catalog/services/new/page.tsx
src/app/admin/catalog/services/page.tsx
```

### Customers
```
src/app/admin/customers/[id]/page.tsx
src/app/admin/customers/duplicates/page.tsx
src/app/admin/customers/new/page.tsx
src/app/admin/customers/page.tsx
```

### Inventory
```
src/app/admin/inventory/layout.tsx
src/app/admin/inventory/page.tsx
src/app/admin/inventory/counts/page.tsx
src/app/admin/inventory/counts/[id]/page.tsx
src/app/admin/inventory/counts/__tests__/detail-page.test.tsx
src/app/admin/inventory/purchase-orders/[id]/page.tsx
src/app/admin/inventory/purchase-orders/new/page.tsx
src/app/admin/inventory/purchase-orders/page.tsx
src/app/admin/inventory/shop-expenses/page.tsx
src/app/admin/inventory/stock-history/page.tsx
src/app/admin/inventory/vendors/[id]/page.tsx
src/app/admin/inventory/vendors/page.tsx
```

### Jobs
```
src/app/admin/jobs/[id]/page.tsx
src/app/admin/jobs/page.tsx
```

### Marketing
```
src/app/admin/marketing/page.tsx
src/app/admin/marketing/analytics/page.tsx
src/app/admin/marketing/automations/[id]/page.tsx
src/app/admin/marketing/automations/new/page.tsx
src/app/admin/marketing/automations/page.tsx
src/app/admin/marketing/campaigns/[id]/analytics/page.tsx
src/app/admin/marketing/campaigns/[id]/edit/page.tsx
src/app/admin/marketing/campaigns/[id]/page.tsx
src/app/admin/marketing/campaigns/new/page.tsx
src/app/admin/marketing/campaigns/page.tsx
src/app/admin/marketing/campaigns/_components/campaign-tabs.tsx
src/app/admin/marketing/campaigns/drip/new/page.tsx
src/app/admin/marketing/campaigns/drip/[id]/page.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-builder.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-steps-editor.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-step-card.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-analytics.tsx
src/app/admin/marketing/campaigns/drip/_components/drip-enrollments-table.tsx
src/app/admin/marketing/compliance/page.tsx
src/app/admin/marketing/coupons/[id]/page.tsx
src/app/admin/marketing/coupons/new/page.tsx
src/app/admin/marketing/coupons/page.tsx
src/app/admin/marketing/promotions/page.tsx
src/app/admin/marketing/promotions/_components/promotion-row.tsx
src/app/admin/marketing/promotions/_components/quick-sale-dialog.tsx
src/app/admin/marketing/promotions/_components/sale-history-section.tsx
src/app/admin/marketing/email-templates/page.tsx
src/app/admin/marketing/email-templates/[id]/page.tsx
src/app/admin/marketing/email-templates/_components/template-list.tsx
src/app/admin/marketing/email-templates/_components/brand-settings.tsx
src/app/admin/marketing/email-templates/_components/email-block-editor.tsx
src/app/admin/marketing/email-templates/_components/block-palette.tsx
src/app/admin/marketing/email-templates/_components/block-canvas.tsx
src/app/admin/marketing/email-templates/_components/block-properties.tsx
src/app/admin/marketing/email-templates/_components/photo-gallery-picker.tsx
src/app/admin/marketing/email-templates/_components/variable-inserter.tsx
src/app/admin/marketing/email-templates/_components/email-preview.tsx
src/app/admin/marketing/email-templates/_components/template-picker-modal.tsx
src/app/admin/marketing/email-templates/layouts/page.tsx
src/app/admin/marketing/email-templates/layouts/[id]/page.tsx
```

### Messaging
```
src/app/admin/messaging/page.tsx
```

### Migration
```
src/app/admin/migration/page.tsx
```

### Orders
```
src/app/admin/orders/[id]/page.tsx
src/app/admin/orders/page.tsx
```

### Photos
```
src/app/admin/photos/page.tsx
```

### Quotes
```
src/app/admin/quotes/[id]/page.tsx
src/app/admin/quotes/page.tsx
```

### Settings
```
src/app/admin/settings/page.tsx
src/app/admin/settings/audit-log/page.tsx
src/app/admin/settings/data-management/page.tsx
src/app/admin/settings/business-profile/page.tsx
src/app/admin/settings/card-reader/page.tsx
src/app/admin/settings/coupon-enforcement/page.tsx
src/app/admin/settings/enrichment/page.tsx
src/app/admin/settings/feature-toggles/page.tsx
src/app/admin/settings/integrations/quickbooks/page.tsx
src/app/admin/settings/messaging/page.tsx
src/app/admin/settings/mobile-zones/page.tsx
src/app/admin/settings/notifications/page.tsx
src/app/admin/settings/pos-favorites/page.tsx
src/app/admin/settings/pos-settings/page.tsx
src/app/admin/settings/pos-security/page.tsx
src/app/admin/settings/receipt-printer/page.tsx
src/app/admin/settings/reviews/page.tsx
src/app/admin/settings/shipping/page.tsx
src/app/admin/settings/tax-config/page.tsx
```

### Staff
```
src/app/admin/staff/[id]/page.tsx
src/app/admin/staff/new/page.tsx
src/app/admin/staff/page.tsx
src/app/admin/staff/roles/page.tsx
```

### Transactions
```
src/app/admin/transactions/page.tsx
src/app/admin/reports/payments/page.tsx           # Phase 1A.5: payments report grouped by method+platform, date-range, CSV export
```

### Website (CMS)
```
src/app/admin/website/page.tsx
src/app/admin/website/ads/creatives/[id]/page.tsx
src/app/admin/website/ads/page.tsx
src/app/admin/website/catalog/page.tsx
src/app/admin/website/credentials/page.tsx
src/app/admin/website/footer/page.tsx
src/app/admin/website/global-blocks/page.tsx
src/app/admin/website/hero/[id]/page.tsx
src/app/admin/website/hero/page.tsx
src/app/admin/website/homepage/page.tsx
src/app/admin/website/navigation/page.tsx
src/app/admin/website/pages/[id]/page.tsx
src/app/admin/website/pages/new/page.tsx
src/app/admin/website/pages/page.tsx
src/app/admin/website/seo/cities/page.tsx
src/app/admin/website/seo/page.tsx
src/app/admin/website/team/page.tsx
src/app/admin/website/theme-settings/page.tsx
src/app/admin/website/themes/[id]/page.tsx
src/app/admin/website/themes/page.tsx
src/app/admin/website/tickers/[id]/page.tsx
src/app/admin/website/tickers/page.tsx
```

---

## Customer-Facing Pages

### Public Site (`src/app/(public)/`)
```
src/app/(public)/layout.tsx              — Public layout (header, footer, tickers, theme)
src/app/(public)/page.tsx                — Homepage
src/app/(public)/services/page.tsx       — Service category listing
src/app/(public)/services/[categorySlug]/page.tsx
src/app/(public)/services/[categorySlug]/[serviceSlug]/page.tsx
src/app/(public)/products/page.tsx       — Product category listing
src/app/(public)/products/[categorySlug]/page.tsx
src/app/(public)/products/[categorySlug]/[productSlug]/page.tsx
src/app/(public)/gallery/page.tsx        — Photo gallery
src/app/(public)/areas/page.tsx          — Service areas
src/app/(public)/areas/[citySlug]/page.tsx
src/app/(public)/cart/page.tsx           — Shopping cart
src/app/(public)/checkout/page.tsx       — Checkout
src/app/(public)/checkout/confirmation/page.tsx
src/app/(public)/terms/page.tsx          — Terms & conditions
src/app/(public)/book/page.tsx           — Booking wizard
src/app/(public)/team/[memberSlug]/page.tsx — Team member detail page
src/app/(public)/p/[...slug]/page.tsx    — CMS dynamic pages
```

### Customer Auth (`src/app/(customer-auth)/`)
```
src/app/(customer-auth)/layout.tsx
src/app/(customer-auth)/signin/page.tsx
src/app/(customer-auth)/signin/reset-password/page.tsx
src/app/(customer-auth)/signup/page.tsx
```

### Admin Login (`src/app/(auth)/`)
```
src/app/(auth)/layout.tsx
src/app/(auth)/login/page.tsx               — Admin login page
src/app/(auth)/login/reset-password/page.tsx — Admin password reset
```

### Auth (`src/app/auth/`)
```
src/app/auth/callback/route.ts              — OAuth/magic-link code exchange
src/app/auth/reset-password/page.tsx        — Staff password reset landing page
```

### Customer Portal (`src/app/(account)/`)
```
src/app/(account)/layout.tsx
src/app/(account)/account/page.tsx              — Dashboard / overview
src/app/(account)/account/appointments/page.tsx — Upcoming & past appointments
src/app/(account)/account/loyalty/page.tsx      — Loyalty points
src/app/(account)/account/orders/page.tsx       — Order history
src/app/(account)/account/orders/[id]/page.tsx  — Order detail
src/app/(account)/account/photos/page.tsx       — My photos
src/app/(account)/account/profile/page.tsx      — Profile settings
src/app/(account)/account/services/page.tsx     — Service history
src/app/(account)/account/services/[jobId]/page.tsx — Service detail
src/app/(account)/account/transactions/page.tsx — Transaction history
src/app/(account)/account/vehicles/page.tsx     — My vehicles
```

### Dev-Only (`src/app/(dev)/`)
```
src/app/(dev)/receipt-preview/page.tsx          — Phase 0b.3 placeholder (NODE_ENV-gated). Future 12-scenario × 4-surface receipt visual harness.
```

### POS Pages (`src/app/pos/`)
```
src/app/pos/page.tsx                     — POS main workspace
src/app/pos/login/page.tsx               — POS PIN login
src/app/pos/end-of-day/page.tsx          — End-of-day cash count & reconciliation
src/app/pos/jobs/page.tsx                — Jobs management
src/app/pos/jobs/__tests__/handle-checkout-coupon.test.tsx  # 3 tests — pins Item 15g Layer 15g-i handleCheckout dispatch (RESTORE_TICKET coupon=null → SET_COUPON via /api/pos/coupons/validate) + idempotency
src/app/pos/appointments/page.tsx        — Appointments view (Roadmap Item 12 — POS footer reschedule surface)
src/app/pos/offline/page.tsx             — Offline fallback page
src/app/pos/quotes/page.tsx              — Quote builder & list
src/app/pos/transactions/page.tsx        — Transaction list
src/app/pos/transactions/[id]/page.tsx   — Transaction detail
```

### Standalone Public Pages
```
src/app/(public)/quote/[token]/page.tsx         — Public quote view/accept
src/app/(public)/quote/[token]/accept-button.tsx — Accept quote button component
src/app/(public)/receipt/[token]/page.tsx        — Public receipt view (token-based, no login)
src/app/(public)/receipt/[token]/print-button.tsx — Print/save-as-PDF button
src/app/(public)/pay/[token]/page.tsx            — Public appointment pay page (Pay-Link Session 2)
src/app/(public)/pay/[token]/pay-form.tsx        — Stripe Elements form for /pay/[token]
src/app/(public)/pay/[token]/processing-refresh.tsx — Auto-refresh helper for post-redirect "confirming" state
src/app/q/[token]/page.tsx               — Short quote URL redirect
src/app/s/[code]/route.ts               — Short link redirect (route handler)
src/app/authorize/[token]/page.tsx       — Job authorization (approve/decline)
src/app/jobs/[token]/photos/page.tsx     — Customer photo upload for jobs
src/app/unsubscribe/[customerId]/page.tsx — Email/SMS unsubscribe
```

---

## Lib Modules (`src/lib/`)

### Auth
```
src/lib/auth/api-key.ts
src/lib/auth/auth-provider.tsx             — Admin auth context provider
src/lib/auth/check-permission.ts
src/lib/auth/customer-auth-provider.tsx    — Customer auth context provider
src/lib/auth/customer-helpers.ts
src/lib/auth/auth-errors.ts               — Shared auth error string constants (used by auth hooks)
src/lib/auth/customer-signout.ts          — Shared customer sign-out utility (all customer sign-out call sites)
src/lib/auth/get-employee.ts
src/lib/auth/permission-context.tsx        — Permission context & provider
src/lib/auth/permissions.ts
src/lib/auth/require-permission.ts
src/lib/auth/roles.ts
```

### Campaigns
```
src/lib/campaigns/ab-testing.ts
```

### Cron
```
src/lib/cron/scheduler.ts
```

### Data Access
```
src/lib/data/booking.ts
src/lib/data/business-defaults.ts
src/lib/data/business-hours.ts
src/lib/data/business.ts
src/lib/data/cities.ts
src/lib/data/cms.ts
src/lib/data/credentials.ts
src/lib/data/featured-photos.ts
src/lib/data/homepage-settings.ts
src/lib/data/page-content.ts
src/lib/data/products.ts
src/lib/data/receipt-composer.ts                    — Phase 0b.1: pure composer for payment/refund/totals aggregation
src/lib/data/receipt-config.ts
src/lib/data/receipt-data.ts
src/lib/data/__tests__/receipt-composer.test.ts     — Phase 0b.1 / 1A: composer unit tests + 28 fixture byte-equality regressions
src/lib/data/__tests__/__fixtures__/receipt-baselines/inputs.ts — 17 ReceiptTransaction scenarios shared by capture script + tests (Phase 1A-followup: +scenarios 16 legacy-paid-in-full + 17 legacy-partial-payment; Phase 1A.5: +scenario 15 digital-zelle; Phase 1A: +scenarios 13 loyalty-only + 14 loyalty+cash+tax)
src/lib/data/__tests__/__fixtures__/receipt-baselines/*.html       — 14 captured HTML fixtures (regenerable)
src/lib/data/__tests__/__fixtures__/receipt-baselines/*.thermal.txt — 14 captured thermal fixtures (regenerable)
src/lib/data/refund-sources.ts
src/lib/data/reviews.ts
src/lib/data/services.ts
src/lib/data/team-members.ts
src/lib/data/vehicle-count.ts
src/lib/data/website-pages.ts
```

### Contexts
```
src/lib/contexts/cart-context.tsx           — Shopping cart context provider
```

### Hooks
```
src/lib/hooks/feature-flag-provider.tsx     — Feature flag context provider
src/lib/hooks/use-async-action.ts
src/lib/hooks/use-barcode-scanner.ts        — BT/USB scanner keystroke detection (mounted per-page)
src/lib/hooks/use-business-info.ts
src/lib/hooks/use-drag-drop-reorder.ts
src/lib/hooks/use-enter-submit.ts
src/lib/hooks/use-feature-flag.ts
src/lib/hooks/use-form-validation.ts
src/lib/hooks/use-online-status.ts
src/lib/hooks/use-permission.ts
src/lib/hooks/use-unsaved-changes.ts
src/lib/hooks/useCustomerLink.ts          — Customer linking API wrapper hook (check-exists, link-by-phone, link-account)
src/lib/hooks/usePhoneOtp.ts              — Phone OTP state machine hook (send, verify, resend, cooldown)
src/lib/hooks/useTableState.ts            — Admin table state hook (search, filters, sort, pagination) with URL sync
```

### Migration
```
src/lib/migration/phone-utils.ts
src/lib/migration/types.ts
```

### Security
```
src/lib/security/host-routing.ts
src/lib/security/ip-whitelist.ts
```

### POS
```
src/lib/pos/api-auth.ts
src/lib/pos/check-permission.ts
src/lib/pos/offline-queue.ts
src/lib/pos/session.ts
src/lib/pos/tile-colors.ts
```

### QuickBooks
```
src/lib/qbo/client.ts
src/lib/qbo/index.ts
src/lib/qbo/settings.ts
src/lib/qbo/sync-batch.ts
src/lib/qbo/sync-catalog.ts
src/lib/qbo/sync-customer.ts
src/lib/qbo/sync-log.ts
src/lib/qbo/sync-transaction.ts
src/lib/qbo/types.ts
```

### Email Template System
```
src/lib/email/types.ts
src/lib/email/block-renderers.ts
src/lib/email/layout-renderer.ts
src/lib/email/photo-resolver.ts
src/lib/email/template-resolver.ts
src/lib/email/send-cancellation-email.ts
src/lib/email/send-templated-email.ts
src/lib/email/send-void-notification.ts
src/lib/email/send-welcome-email.ts
src/lib/email/variables.ts
src/lib/email/drip-engine.ts
```

### SMS Template System
```
src/lib/sms/render-sms-template.ts          # Generic over SmsSlug (Session 2A.5); test-only __renderSmsTemplateForTesting export
src/lib/sms/sms-contracts.source.ts         # Hand-edited single source of truth (Session 2A.5)
src/lib/sms/palette.ts                      # AUTO-GENERATED from sms-contracts.source.ts (Session 2A.5; was hand-edited 2A)
src/lib/sms/generated-contracts.ts          # AUTO-GENERATED — SmsSlug, SMS_SLUGS, CONTRACTS_BY_SLUG, RenderVarsBySlug (Session 2A.5)
src/lib/sms/contract.ts                     # Zod contract schema + validators (Session 2A)
src/lib/sms/composites.ts                   # Caller-built composite chip builders (Session 2A)
src/lib/sms/dedup.ts                        # isRecentDuplicateSms — messages-log dedup helper (Session 2D.2)
src/lib/sms/hardcoded-messages.ts           # Static read-only display list for admin UI; also exports derived INTENTIONALLY_HARDCODED_SMS slug list (Sessions 2E.1b, 2E.2)
src/lib/sms/__tests__/render-sms-template.test.ts
src/lib/sms/__tests__/render-sms-template-contract.test.ts
src/app/api/admin/sms-templates/route.ts
src/app/api/admin/sms-templates/[slug]/route.ts
src/app/api/admin/sms-templates/[slug]/__tests__/route.test.ts
src/app/api/admin/sms-templates/[slug]/reset/route.ts
src/app/api/admin/sms-templates/[slug]/test/route.ts
src/app/api/pos/transactions/__tests__/auto-receipt-interlock.test.ts
src/app/api/pos/jobs/[id]/complete/__tests__/job-complete-vehicle-literal.test.ts
src/app/admin/settings/messaging/sms-templates/page.tsx
```

### Products
```
src/lib/products/barcode-lookup.ts          — Shared barcode/SKU lookup helper (POS + admin use this)
```

### Quotes
```
src/lib/quotes/convert-service.ts
src/lib/quotes/quote-service.ts                          # Layer 15g-v: extracted `computeQuoteTotals` writer-side helper (canonical net-of-modifiers formula); updateQuote recomputes on modifier-only PATCHes (items-guard lifted)
src/lib/quotes/send-service.ts                           # Layer 15g-v: templated email path passes composite `quote_modifier_block` + 6 individual modifier vars; HTML+text fallback renders modifier rows above Total
src/lib/quotes/manual-discount.ts                        # Layer 15g-v: extracted pure resolver (`resolveManualDiscountAmount`) so client-bundle consumers reach it without dragging convert-side deps
src/lib/quotes/modifier-display.ts                       # Layer 15g-v: shared `resolveQuoteModifierRows(quote)` consumed by all 5 receipt surfaces (public landing, email HTML, email text, PDF, POS quote-detail)
src/lib/quotes/__tests__/convert-service.test.ts        # 15 tests — pins Layer 15g-i coupon_code propagation (3) + Layer 15g-ii full modifier propagation (8) + Layer 15g-v writer-trust contract (4: coupon-only / loyalty-only / Q-0067-combined / defense-in-depth clamp)
src/lib/quotes/__tests__/quote-service.modifiers.test.ts  # 25 tests — Layer 15g-ii modifier persistence (13) + Layer 15g-v writer-side total_amount = net formula (12: createQuote single-modifier × 4 / combined / over-discount clamp; updateQuote recompute triggers + non-financial PATCH skip + full-replacement deterministic math)
src/lib/quotes/__tests__/modifier-display.test.ts        # 19 tests — Layer 15g-v shared helper: empty / coupon w+wo discount / loyalty w+wo points / manual label fallback / percent resolution / dollar clamp / partial collapse / ordering / Supabase NUMERIC-as-string coercion
src/lib/quotes/__tests__/modifier-chain.test.ts          # 4 tests — Layer 15g-iv Scenario B chain integration: Quote → convertQuote → checkout-items reads back identical modifier values; all-3 / coupon-only / modifier-free / manual percent → dollar resolution
src/lib/quotes/__tests__/derive-comm-pill.test.ts
src/lib/quotes/__tests__/send-service.test.ts            # Extended in Layer 15g-v with 4 cases: templated path passes composite+individual modifier vars (populated + empty); fallback HTML+text contain modifier rows (populated + omitted)
```

### Migrations
```
supabase/migrations/20260517052147_quote_sent_template_modifier_block.sql   # Layer 15g-v: update seeded `quote_sent` email template body to render {quote_modifier_block} between Tax and Total; widen variables list with 7 new modifier-related variables. Guarded by `is_customized = false` to preserve operator-customized templates.
```

### Search
```
src/lib/search/customer-search.ts
src/lib/search/customer-create-routing.ts          — Routes Find Customer query into New Customer form fields (phone/email/firstName/lastName) when search returns no results
src/lib/search/tokenize.ts
src/lib/search/__tests__/customer-search.test.ts
src/lib/search/__tests__/customer-create-routing.test.ts
src/lib/search/__tests__/tokenize.test.ts
```

### SEO
```
src/lib/seo/json-ld.ts
src/lib/seo/known-pages.ts
src/lib/seo/metadata.ts
src/lib/seo/page-seo.ts
```

### Services
```
src/lib/services/ai-content-writer.ts
src/lib/services/ai-product-enrichment.ts
src/lib/services/ai-seo.ts
src/lib/services/audit.ts
src/lib/services/coupon-summary.ts
src/lib/services/job-addons.ts
src/lib/services/messaging-ai-prompt.ts
src/lib/services/messaging-ai.ts
src/lib/services/conversation-summary.ts
src/lib/services/page-content-extractor.ts
src/lib/services/service-resolver.ts                 # resolveServiceByName + resolvePrice for voice agent / SMS auto-responder. Layer 3d: resolvePrice rewritten as thin wrapper around canonical engine; 4 silent-mispricing bugs (exotic/classic, per_unit, specialty, custom) closed.
src/lib/services/voice-post-call.ts
src/lib/services/shippo.ts
src/lib/services/picker-engine.ts                    # Canonical service-pricing engine (Item 15f Layer 1; Layer 2 added `open-custom-price-dialog` ServiceTapRoute variant + branch) — resolveServicePrice, resolveServicePriceWithSale, getServicePriceRange, routeServiceTap. Per CLAUDE.md Rule 22.
src/lib/services/use-service-picker.ts               # useServicePicker hook returning { CatalogPane, ActiveDialog, selectedServiceIds, tapService, reset } (Item 15f Layer 1; Layer 2 added tapService + custom-dialog wiring)
src/lib/services/custom-price-dialog.tsx             # <CustomPriceDialog> + buildCustomPricing helper for pricing_model='custom' (Item 15f Layer 2) — staff-assessment prompt with Stripe-min validation
src/lib/services/index.ts                            # Public barrel — re-exports engine + hook + custom-dialog + types (Item 15f Layer 1 + 2; Layer 8e removed `EditServicesDialog` export when the component was deleted)
src/lib/services/__tests__/picker-engine.test.ts     # Engine tests — exhaustive size_class + sale + routing per pricing_model. Layer 2 flipped the 'custom' pin to assert open-custom-price-dialog.
src/lib/services/__tests__/use-service-picker.test.tsx # Hook contract tests with vi-mocked CatalogBrowser/ServicePricingPicker/CustomPriceDialog (Item 15f Layer 1+2)
src/lib/services/__tests__/custom-price-dialog.test.tsx # 11 tests — dialog rendering, validation, confirm/cancel emit, buildCustomPricing helper (Item 15f Layer 2)
src/lib/services/__tests__/service-resolver.test.ts  # 27 tests — pin all 4 Layer-3d bug fixes (exotic/classic fall-through, per_unit $0, specialty first-tier, custom $0); covers flat / vehicle_size / scope / per_unit / specialty / custom dispatch + size-class edge cases.
```

Backward-compat shim for the canonical engine (Item 15f Layer 1):
```
src/app/pos/utils/pricing.ts                         # @deprecated re-exports from @/lib/services/picker-engine — kept for unmigrated call sites; Layer 3b will retire it
```

### Supabase
```
src/lib/supabase/admin.ts
src/lib/supabase/anon.ts
src/lib/supabase/client.ts
src/lib/supabase/database.types.ts
src/lib/supabase/middleware.ts
src/lib/supabase/server.ts
src/lib/supabase/types.ts
```

### Types
```
src/lib/types/roles.ts
```

### Utils
```
src/lib/utils/admin-fetch.ts
src/lib/utils/ai-page-context.ts
src/lib/utils/analytics-helpers.ts
src/lib/utils/assign-detailer.ts
src/lib/utils/attribution.ts
src/lib/utils/audience.ts
src/lib/utils/cms-theme-presets.ts
src/lib/utils/cms-zones.ts
src/lib/utils/cn.ts
src/lib/utils/constants.ts
src/lib/utils/coupon-helpers.ts
src/lib/utils/default-theme.ts
src/lib/utils/email-consent.ts
src/lib/utils/email.ts
src/lib/utils/feature-flags.ts
src/lib/utils/form.ts
src/lib/utils/compose-line-items.ts                     # Phase Mobile-1.7: display-only line-item composer; appends synthetic mobile-fee row for quote/appointment renderers
src/lib/utils/format-address.ts
src/lib/utils/format-channel.ts
src/lib/utils/format.ts
src/lib/utils/google-place-id.ts                                # Normalizer + validator for Google Place ID (handles double-encoded JSONB reads, URL paste, quote-stripping)
src/lib/utils/idempotency.ts
src/lib/utils/issue-types.ts
src/lib/utils/job-zones.ts
src/lib/utils/light-mode-vars.ts
src/lib/utils/link-tracking.ts
src/lib/utils/mailgun-signature.ts
src/lib/utils/mobile-address-action.ts
src/lib/utils/mobile-service-edit.ts                            # Pure helpers: delta math + JSONB sync + paid-cents (Phase Mobile-1.9)
src/lib/utils/resolve-mobile-fields.ts                          # Shared mobile-fields validation/resolver (Phase Mobile-1.9, consumed by quote-service + mobile-service PATCH endpoints)
src/lib/utils/order-emails.ts
src/lib/utils/order-number.ts
src/lib/utils/phone-validation.ts
src/lib/utils/quote-number.ts
src/lib/utils/render-annotations.ts
src/lib/utils/revalidate.ts
src/lib/utils/role-defaults.ts
src/lib/utils/pst-date.ts
src/lib/utils/sale-history.ts
src/lib/utils/sale-pricing.ts
src/lib/utils/shipping-types.ts
src/lib/utils/short-link.ts
src/lib/utils/conversation-helpers.ts
src/lib/utils/voice-perf.ts
src/lib/utils/sms-consent.ts
src/lib/utils/sms.ts
src/lib/utils/template.ts
src/lib/utils/ticker-sections.ts
src/lib/utils/validation.ts
src/lib/utils/service-extraction.ts
src/lib/utils/refund-math.ts        # Phase Money-Unify-1: deprecated re-export shim — `export * from './money'`. Removed at Unify-Final.
src/lib/utils/money.ts              # Phase Money-Unify-1: canonical money module (renamed from refund-math.ts). Exports toCents/fromCents, STRIPE_MIN_AMOUNT_CENTS=50, STRIPE_MIN_DOLLARS, refund-math helpers, invariants
src/lib/utils/stock-adjustments.ts
src/lib/utils/stripe-card-details.ts        # Phase 1A.5: extractCardDetailsFromCharge — Stripe brand/last4 helper for online card payment paths
src/lib/utils/system-actors.ts
src/lib/utils/vehicle-categories.ts
src/lib/utils/vehicle-helpers.ts
src/lib/utils/__tests__/compose-line-items.test.ts      # Phase Mobile-1.7: 17 cases — synthetic mobile-fee row, field normalization, Q-0051 regression
src/lib/utils/__tests__/constants.test.ts
src/lib/utils/__tests__/format-address.test.ts
src/lib/utils/__tests__/refund-math.test.ts
src/lib/utils/__tests__/money.test.ts                   # Phase Money-Unify-1: 11 tests — STRIPE_MIN_AMOUNT_CENTS/STRIPE_MIN_DOLLARS, LOYALTY.REDEEM_RATE_CENTS, refund-math re-export shim
src/lib/utils/__tests__/format-money.test.ts            # Phase Money-Unify-1: 25 tests — formatMoney/formatMoneyForInput edges, 1M-iter byte-identical equivalence vs formatCurrency
src/lib/utils/__tests__/stock-adjustments.test.ts
src/lib/utils/__tests__/mobile-service-edit.test.ts
src/lib/utils/__tests__/resolve-mobile-fields.test.ts
src/lib/utils/__tests__/validation-mobile-address.test.ts
src/lib/utils/__tests__/validation-refund-shopuse.test.ts
src/lib/utils/__tests__/vehicle-categories.test.ts
src/lib/utils/__tests__/sms-normalization.test.ts         # Phase Normalization-1: 8 cases — sendSms/sendMarketingSms rejection on invalid, normalization of (XXX) XXX-XXXX and 11-digit shapes, E.164 pass-through
src/lib/utils/__tests__/conversation-helpers-normalization.test.ts # Phase Normalization-1: 4 cases — findOrCreateConversation rejection on invalid + normalized lookup/insert
src/lib/utils/webhook.ts
```

### Other
```
src/lib/animations.ts
```

---

## Components (`src/components/`)

### UI Primitives (`src/components/ui/`)
```
src/components/ui/badge.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/checkbox.tsx
src/components/ui/confirm-dialog.tsx
src/components/ui/data-table.tsx
src/components/ui/dialog.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/empty-state.tsx
src/components/ui/form-field.tsx
src/components/ui/input.tsx
src/components/ui/label.tsx
src/components/ui/page-header.tsx
src/components/ui/pagination.tsx
src/components/ui/search-input.tsx
src/components/ui/section-error-badge.tsx
src/components/ui/select.tsx
src/components/ui/send-method-dialog.tsx
src/components/ui/skeleton.tsx
src/components/ui/slide-over.tsx
src/components/ui/spinner.tsx
src/components/ui/switch.tsx
src/components/ui/table.tsx
src/components/ui/tabs.tsx
src/components/ui/textarea.tsx
src/components/ui/toggle-pill.tsx
src/components/ui/vehicle-make-combobox.tsx
src/components/ui/__tests__/confirm-dialog.test.tsx
src/components/ui/__tests__/dialog.test.tsx
src/components/ui/__tests__/search-input.test.tsx
```

### Admin Components
```
src/components/admin/content/content-block-editor.tsx
src/components/admin/content/credentials-editor.tsx
src/components/admin/content/faq-editor.tsx
src/components/admin/content/gallery-editor.tsx
src/components/admin/content/terms-sections-editor.tsx
src/components/admin/content/page-html-editor.tsx
src/components/admin/content/team-grid-editor.tsx
src/components/admin/drag-drop-reorder.tsx
src/components/admin/html-editor-toolbar.tsx
src/components/admin/html-image-manager.tsx
src/components/admin/icon-picker.tsx
src/components/admin/image-upload-field.tsx
src/components/admin/receipt-dialog.tsx
src/components/admin/table-toolbar.tsx
src/components/admin/toolbar-items/accordion-dialog.tsx
src/components/admin/toolbar-items/button-dialog.tsx
src/components/admin/toolbar-items/callout-dialog.tsx
src/components/admin/toolbar-items/columns-dialog.tsx
src/components/admin/toolbar-items/divider-dialog.tsx
src/components/admin/toolbar-items/embed-dialog.tsx
src/components/admin/toolbar-items/link-dialog.tsx
src/components/admin/toolbar-items/list-dialog.tsx
src/components/admin/toolbar-items/map-embed-dialog.tsx
src/components/admin/toolbar-items/social-links-dialog.tsx
src/components/admin/toolbar-items/table-dialog.tsx
src/components/admin/toolbar-items/video-embed-dialog.tsx
```

### Public Site Components
```
src/components/public/animated-section.tsx
src/components/public/before-after-slider.tsx
src/components/public/breadcrumbs.tsx
src/components/public/cms/ad-zone.tsx
src/components/public/cms/announcement-ticker.tsx
src/components/public/cms/hero-carousel.tsx
src/components/public/cms/particle-canvas.tsx
src/components/public/cms/section-ticker-slot.tsx
src/components/public/cms/theme-preview-banner.tsx
src/components/public/cms/theme-provider.tsx
src/components/public/content-block-renderer.tsx
src/components/public/gallery-lightbox.tsx
src/components/public/cta-section.tsx
src/components/public/footer-client.tsx
src/components/public/header-client.tsx
src/components/public/header-shell.tsx
src/components/public/hero-client.tsx
src/components/public/hero-section.tsx
src/components/public/home-animations.tsx
src/components/public/json-ld.tsx
src/components/public/mobile-menu.tsx
src/components/public/nav-dropdown.tsx
src/components/public/product-card.tsx
src/components/public/product-category-card.tsx
src/components/public/product-search.tsx
src/components/public/scroll-reveal.tsx
src/components/public/service-card.tsx
src/components/public/service-category-card.tsx
src/components/public/service-pricing-display.tsx
src/components/public/conditional-footer.tsx
src/components/public/site-footer.tsx
src/components/public/site-header.tsx
src/components/public/theme-toggle-initializer.tsx
src/components/public/theme-toggle.tsx
src/components/public/team-grid-layout.tsx
src/components/public/trust-bar-client.tsx
src/components/public/trust-bar.tsx
```

### Cart Components
```
src/components/public/cart/add-to-cart-button.tsx
src/components/public/cart/cart-drawer.tsx
src/components/public/cart/cart-icon-button.tsx
src/components/public/cart/cart-provider-wrapper.tsx
src/components/public/cart/product-add-to-cart.tsx
src/components/public/cart/quantity-selector.tsx
```

### Account Components
```
src/components/account/account-shell.tsx
src/components/account/profile-completion-banner.tsx
src/components/account/appointment-card.tsx
src/components/account/coupon-card.tsx
src/components/account/transaction-card.tsx
src/components/account/transaction-detail.tsx
src/components/account/vehicle-card.tsx
src/components/account/vehicle-form-dialog.tsx
```

### Booking Components
```
src/components/booking/booking-confirmation.tsx
src/components/booking/booking-wizard.tsx
src/components/booking/inline-auth.tsx              (inline collapsible sign-in/sign-up for Step 3)
src/components/booking/step-confirm-book.tsx        (merged confirm & book page — Step 3)
src/components/booking/step-indicator.tsx
src/components/booking/step-payment.tsx
src/components/booking/step-schedule.tsx
src/components/booking/step-service-select.tsx      (merged service select + configure — Step 2; Item 15f Layer 3c migrated price math to canonical engine 2026-05-16, exports `computePrice` + `getServicePriceDisplay` for test consumption)
src/components/booking/step-vehicle.tsx              (vehicle selection — Step 1)
src/components/booking/specialty-vehicle-block.tsx   (exotic/classic booking block page — Session 27)
src/components/booking/__tests__/step-service-select.test.tsx  # Item 15f Layer 3c — pins all 6 pricing_model values through canonical-engine path
```

### Quote Components
```
src/components/quotes/notify-customer-dialog.tsx
src/components/quotes/quote-book-dialog.tsx
```

### Job Components
```
src/components/jobs/send-payment-link-dialog.tsx   — POS Send Payment Link channel-pick modal (Pay-Link Session 3b)
src/components/jobs/payment-link-amount-modal.tsx  — POS Pre-send amount selector (25/50/75/Full + Custom) (Pay-Link Session 5)
src/components/jobs/edit-mobile-modal.tsx          — Shared full mobile picker edit modal (POS + admin, mode prop) (Phase Mobile-1.9)
src/components/jobs/payment-mismatch-banner.tsx    — Non-blocking warning after mobile edit when total ≠ paid (Phase Mobile-1.9)
src/components/jobs/__tests__/edit-mobile-modal.test.tsx
```

### Other
```
src/components/before-after-slider.tsx
src/components/photo-gallery.tsx
src/components/qbo-sync-badge.tsx
src/components/service-pricing-form.tsx
```

---

## POS Lib (`src/app/pos/lib/`)

```
pos-fetch.ts          — POS API fetch wrapper with 401 redirect
receipt-template.ts   — Receipt line generation, plain text, HTML, ESC/POS renderers
stripe-terminal.ts    — Stripe Terminal SDK integration
```

---

## POS Hooks (`src/app/pos/hooks/`)

```
use-catalog.ts              — Shared catalog data hook (products, services)
use-prerequisite-check.ts   — Service prerequisite check before adding to ticket/quote
use-edit-mode-drain.ts      — Item 15f Phase 1 Layer 8b. POS deep-link drain (`/pos?source=...&id=...&returnTo=...`). Validates UUID + safe-internal-path, fetches load endpoint, dispatches ENTER_EDIT_MODE + modifier follow-ups. Mounted in pos-workspace.tsx. Exports pure helpers (`isUuid`, `isSafeInternalPath`, `buildTicketStateFromLoad`, `runEditModeDrain`) for unit-testing.
```

- `src/app/pos/hooks/__tests__/use-edit-mode-drain.test.ts` — 24 cases: validators (UUID + 5 open-redirect attack classes), build-state pure helper, drain endpoint selection + dispatch sequence + coupon re-validation, error paths (403/404/network/malformed), Layer 8c `MARK_EDIT_INITIAL_STATE` as final dispatch (ordering vs coupon revalidate).

- `src/app/pos/components/edit-mode-banner.tsx` — Item 15f Phase 1 Layer 8c + Layer 8d label revamp. Subtle amber banner at top of Sale workspace when `ticket.editMode` is true. Surfaces "Editing Appointment: {customer} — {date}" via `buildEditLabel` helper (exported for tests), with fallback hierarchy: customer+date → customer-only → date-only → UUID-prefix safety net. "Unsaved changes" badge compares `serializeTicketEditSlice(ticket)` against `ticket.editInitialSnapshot`. Returns null outside edit mode.
- `src/app/pos/components/__tests__/edit-mode-banner.test.tsx` — 14 cases: render gating, Layer 8d customer+date label (appointment + job variants), 4-tier fallback hierarchy, dirty/clean states, pre-MARK snapshot=null suppression, `buildEditLabel` pure-function unit tests.
- `src/app/pos/components/__tests__/ticket-actions-edit-mode.test.tsx` — 12 cases for the editMode branch of `<TicketActions>`: button swap (Save Changes + Cancel), Save POST payload shape (services + 6 modifier fields, percent→dollar resolution), success/error paths, clean vs dirty Cancel UX.
- `src/app/pos/components/__tests__/pos-workspace-products-gating.test.tsx` — Item 15f Phase 1 Layer 8d. 3 cases: Products tab interactive when editMode=false (no regression), disabled when editMode=true (aria + cursor-not-allowed), clicking disabled tab surfaces toast + does not switch active tab.
- `src/app/pos/components/__tests__/register-tab-favorites-gating.test.tsx` — Item 15f Phase 1 Layer 8d-bis. 4 cases: Register tab favorite/quick-add buttons gated for product favorites in edit mode (4th product-add surface). Non-edit-mode adds normally, edit-mode rejects + surfaces toast.info, edit-mode renders aria-disabled + opacity-40 + cursor-not-allowed, service favorites unaffected (services ARE editable).
- `src/app/pos/jobs/components/__tests__/edit-services-deep-link.test.ts` — Item 15f Phase 1 Layer 8d-bis (Option G4). 4 cases: pure URL-builder contract pinning `source=job`, `id=JOB_UUID` (NOT appointment UUID — Layer 8d shipped the appointment UUID and 404'd; drain now resolves appointment_id from response), `returnTo=/pos/jobs?jobId=<job>` URL-encoded, three-param outer query string.

---

## POS Components (`src/app/pos/components/`)

```
addon-suggestions.tsx       customer-type-badge.tsx      pos-workspace.tsx
bottom-nav.tsx              customer-type-prompt.tsx     product-detail.tsx
                                                        shop-use-dialog.tsx
catalog-browser.tsx         customer-vehicle-summary.tsx promotions-tab.tsx
catalog-card.tsx            eod/                        receipt-options.tsx
catalog-grid.tsx            held-tickets-panel.tsx      refund/
catalog-panel.tsx           keypad-tab.tsx              register-tab.tsx
category-tabs.tsx           loyalty-panel.tsx           search-bar.tsx
category-tile.tsx           offline-indicator.tsx       service-detail-dialog.tsx
checkout/                   offline-queue-badge.tsx     service-pricing-picker.tsx
coupon-input.tsx            manager-pin-dialog.tsx      prerequisite-removal-dialog.tsx
                            pin-screen.tsx              prerequisite-warning-dialog.tsx
                                                        swipeable-cart-item.tsx
customer-complete-profile-dialog.tsx
customer-create-dialog.tsx  pin-pad.tsx                 ticket-actions.tsx
customer-lookup.tsx         pos-service-worker.tsx      ticket-item-row.tsx
                                                        ticket-panel.tsx
                                                        ticket-totals.tsx
                                                        transactions/
                                                        vehicle-create-dialog.tsx
                                                        vehicle-selector.tsx
                                                        __tests__/customer-create-dialog.test.tsx
                                                        __tests__/customer-lookup.test.tsx
                                                        __tests__/service-detail-dialog.test.tsx
                                                        __tests__/service-pricing-picker.test.tsx
                                                        __tests__/ticket-actions.test.tsx
                                                        __tests__/catalog-browser-custom-routing.test.tsx  # Item 15f Layer 3e — pins `<CatalogBrowser>` opens `<CustomPriceDialog>` for pricing_model=custom
                                                        utils/__tests__/pricing.test.ts
                                                        quotes/
```

Item 15f Layer 3e additions:
- `src/app/pos/components/catalog-browser.tsx` — adds `customPriceService` state + custom branch in 3 tap handlers + `<CustomPriceDialog>` mount. Routes `pricing_model === 'custom'` directly to staff-assessment dialog, bypassing the disabled-button bug in `<ServiceDetailDialog>`.

Phase Mobile-1.1 additions:
- `src/app/pos/components/checkout/save-address-dialog.tsx`
- `src/app/pos/components/checkout/__tests__/save-address-dialog.test.tsx`
- `src/app/pos/components/quotes/__tests__/mobile-fee-picker.test.tsx`

Roadmap Item 12 (POS Appointments) additions:
- `src/app/pos/components/appointments/appointments-view.tsx`
- `src/app/pos/components/appointments/reschedule-appointment-dialog.tsx`
- `src/app/pos/components/appointments/types.ts`

Roadmap Item 15b (Cancel from POS Appointments + This Month filter) additions:
- `src/app/pos/components/appointments/cancel-appointment-dialog.tsx`
- `src/app/pos/components/appointments/__tests__/appointments-view.test.tsx`

Roadmap Item 15c ("Change Time" affordance on Jobs Card) additions:
- `src/app/pos/jobs/components/change-time-button.tsx`
- `src/app/pos/jobs/components/__tests__/change-time-button.test.tsx`

Roadmap Item 15a (Edit Services on Admin Appointment Dialog with cascade to job) additions:
- `src/lib/appointments/edit-services.ts` — Pure helpers (Zod body schema, `buildJobServicesJsonb()`, `computeTotalsForServiceEdit()`).
- `src/lib/appointments/__tests__/edit-services.test.ts`
- `src/lib/appointments/service-edit.ts` — Item 15f Phase 1 Layer 8a: shared cascade helper `editAppointmentServices(supabase, { appointmentId, body, actor, source, ipAddress })`. Auth-agnostic; called by both admin and POS routes. Owns Zod parse + snapshot + totals recompute + rollback + audit. Exports `ServiceEditError` (typed code + httpStatus for HTTP mapping).
- `src/lib/appointments/__tests__/service-edit.test.ts` — Item 15f Phase 1 Layer 8a: 15 cases covering structured error contract (each code/status pair), source discriminator threading to audit row, return shape with/without linked job, modifier preservation invariant.
- `src/app/api/admin/appointments/[id]/services/route.ts` — PUT cascade endpoint (`appointment_services` + `jobs.services` JSONB sync with manual rollback). Item 15f Phase 1 Layer 8a: refactored to a thin auth + actor-build + helper-call + error-mapping wrapper (442 → 84 lines). Response shape preserved; existing tests pass unmodified.
- `src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts`
- `src/app/api/pos/appointments/[id]/services/route.ts` — Item 15f Phase 1 Layer 8a: POS-authed sibling. Same cascade helper, different auth surface (authenticatePosRequest + pos.jobs.manage). Audit row tagged `source: 'pos'`. Server-side only this layer; frontend wiring lands in Layer 8b/8d.
- `src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts` — Item 15f Phase 1 Layer 8a: 18 cases covering POS auth (401/403), validation parity with admin, cascade parity, audit source tagging, notification suppression, modifier preservation, idempotency.
- `src/app/api/admin/services/active/route.ts` — Session-authed GET active services for admin pickers. Item 15f Layer 3e widened SELECT to include `description` + `custom_starting_price` so the modal could pass them to `<CustomPriceDialog>` (modal deleted in Phase 1 Layer 8e; SELECT widening retained — harmless).
- _(deleted Layer 8e)_ `src/components/appointments/edit-services-modal.tsx` — Item 15a's bespoke modal; unreachable since Layer 8d routed Admin "Edit in POS" button to POS edit mode.
- _(deleted Layer 8e)_ `src/components/appointments/__tests__/edit-services-modal-custom.test.tsx` — orphan after the modal was deleted.
- _(deleted Layer 8e)_ `src/lib/services/edit-services-dialog.tsx` — Layer 3a-i's POS Jobs-card dialog; unreachable since Layer 8d routed the Jobs card pencil to POS edit mode.
- _(deleted Layer 8e)_ `src/lib/services/__tests__/edit-services-dialog.test.tsx` — orphan after the dialog was deleted.
- `src/app/admin/appointments/components/__tests__/time-input-truncation.test.tsx` — Item 15f Phase 1 Layer 8e — 3 cases pinning the Admin Appointment dialog's HH:MM truncation of legacy seconds-precise `scheduled_*_time` values. Defense-in-depth for the walk-in path's pre-Layer-8e seconds writes.
- `supabase/migrations/20260518000000_truncate_appointment_scheduled_times_to_minute.sql` — Item 15f Phase 1 Layer 8e — idempotent one-time backfill: UPDATE appointments SET scheduled_*_time = date_trunc('minute', ...) WHERE seconds <> 0. Closes the walk-in legacy data drift.
- `src/lib/appointments/__tests__/edit-flow.integration.test.ts` — Item 15f Phase 1 Layer 8f — 14 cases: end-to-end edit-via-POS joins (load → drain → save). Pins source=appointment + source=job (Option G4) happy paths, modifier-only / combined / all-services-removed edits, bogus UUID 404, status guard lockstep (`completed`/`cancelled`/`no_show`), drain↔cascade pricing parity.
- `docs/dev/PHASE_1_TEST_COVERAGE.md` — Item 15f Phase 1 Layer 8f — Phase 1 test coverage matrix. Per-surface × test-type table, intentional gaps with rationale, file-to-test mapping for future maintenance. Updated whenever a Phase 1 contract changes.
- `supabase/migrations/20260518193527_normalize_google_place_id.sql` — Idempotent one-time UPDATE that unwraps the double-encoded `business_settings.google_place_id` JSONB value. Scope: only the `google_place_id` key; WHERE clause matches the exact `"\"...\""` drift pattern.
- `src/lib/utils/__tests__/google-place-id.test.ts` — 26 unit tests for the Place ID normalizer (double-encoded unwrap, URL extraction, quote-strip, trim, validation).
- `src/app/api/admin/cms/homepage-settings/__tests__/place-id-guard.test.ts` — 7 integration tests for the PUT route's google_place_id 400 guard + normalization.

Item 15g Layer 15g-iii (UI surfacing + checkout hydration for modifiers) additions:
- `src/components/appointments/modifier-summary.tsx` — Shared `<ModifierSummary variant="admin|pos">` + `hasAppliedModifiers()` helper. Read-only summary of coupon / loyalty / manual discount on appointment-derived surfaces. Mounted on Admin Appointment dialog + Jobs card Services tile.
- `src/components/appointments/__tests__/modifier-summary.test.tsx` — 12 cases covering both the helper truth table + the component's conditional rendering per modifier type + POS dark-mode variant.

---

## Migrations (`supabase/migrations/`)

```
20260201000001_create_enums.sql
20260201000002_create_employees.sql
20260201000003_create_customers.sql
20260201000004_create_vehicles.sql
20260201000005_create_vendors.sql
20260201000006_create_product_categories.sql
20260201000007_create_products.sql
20260201000008_create_service_categories.sql
20260201000009_create_services.sql
20260201000010_create_service_pricing.sql
20260201000011_create_service_addon_suggestions.sql
20260201000012_create_service_prerequisites.sql
20260201000013_create_mobile_zones.sql
20260201000014_create_packages.sql
20260201000015_create_appointments.sql
20260201000016_create_transactions.sql
20260201000017_create_transaction_items.sql
20260201000018_create_payments.sql
20260201000019_create_refunds.sql
20260201000020_create_coupons.sql
20260201000021_create_loyalty_ledger.sql
20260201000022_create_campaigns.sql
20260201000023_create_lifecycle_rules.sql
20260201000024_create_marketing_consent_log.sql
20260201000025_create_sms_conversations.sql
20260201000026_create_quotes.sql
20260201000027_create_photos.sql
20260201000028_create_time_records.sql
20260201000029_create_purchase_orders.sql
20260201000030_create_po_items.sql
20260201000031_create_feature_flags.sql
20260201000032_create_permissions.sql
20260201000033_create_audit_log.sql
20260201000034_create_business_settings.sql
20260201000035_rls_policies.sql
20260201000036_create_indexes.sql
20260201000037_create_functions_triggers.sql
20260201000038_public_seo_setup.sql
20260201000039_seed_services.sql
20260201000040_booking_setup.sql
20260201000041_customer_portal_rls.sql
20260201000042_create_cash_drawers.sql
20260201000043_create_customer_payment_methods.sql
20260201000044_add_check_payment_method.sql
20260203000001_create_waitlist_entries.sql
20260203000002_create_employee_schedules.sql
20260203000003_create_blocked_dates.sql
20260203000004_add_quotes_access_token.sql
20260203000005_add_voice_agent_api_key.sql
20260203000006_expand_webhook_events.sql
20260203000007_enhance_coupons.sql
20260203000008_coupon_draft_status.sql
20260203000009_multi_product_conditions.sql
20260203000010_coupon_max_visits.sql
20260203000011_create_campaign_recipients.sql
20260204000001_customer_type_and_promotions.sql
20260204000002_rename_detailer_to_professional.sql
20260205125428_pending_schema_updates.sql
20260205214638_booking_payment_options.sql
20260205222803_coupon_rewards_rls.sql
20260206000001_create_quote_communications.sql
20260206000002_quote_access_token_to_text.sql
20260206000003_quotes_customer_nullable.sql
20260207000001_unique_pin_code.sql
20260207000002_quotes_soft_delete.sql
20260208000001_transaction_stats_rpc.sql
20260209000001_find_duplicate_customers.sql
20260209000002_merge_customers.sql
20260209000003_merge_customers_security_definer.sql
20260209000004_fix_merge_entry_type.sql
20260209000005_merge_customers_preserve_data.sql
20260209000006_fix_merge_loyalty_columns.sql
20260209000007_fix_merge_delete_safety.sql
20260209000008_short_links.sql
20260209000009_service_image_url.sql
20260209000010_fix_payment_method_percentage.sql
20260209000011_create_messaging_tables.sql
20260209000012_conversation_lifecycle_cron.sql
20260209000013_ai_audience_settings.sql
20260209000014_add_message_to_quote_communications.sql
20260209000015_lifecycle_executions_and_review_settings.sql
20260209000016_seed_google_review_rules.sql
20260210000001_fix_review_seed_templates.sql
20260210000002_add_coupon_id_to_lifecycle_rules.sql
20260210000003_sms_consent_log.sql
20260210000004_add_customer_portal_consent_source.sql
20260210000005_sms_delivery_tracking.sql
20260210000006_link_clicks.sql
20260210000007_email_delivery_log.sql
20260210000008_campaign_variants_and_attribution.sql
20260210000009_campaigns_ab_fields.sql
20260210000010_add_variant_id_to_tracking.sql
20260210000011_qbo_integration_schema.sql
20260210000012_remove_qbo_feature_flag.sql
20260210000013_qbo_restore_feature_flag_remove_credentials.sql
20260211000001_update_marketing_flag_descriptions.sql
20260211000002_feature_flag_categories_cleanup.sql
20260211000003_update_two_way_sms_description.sql
20260211000004_inventory_phase6_session1.sql
20260211000005_purchase_orders_stock_adjustments.sql
20260211000006_notification_recipients.sql
20260211000007_roles_permissions_foundation.sql
20260211000008_route_access.sql
20260211000009_permissions_rls.sql
20260211000010_product_images.sql
20260212000001_qbo_sync_source.sql
20260212000002_qbo_realtime_sync.sql
20260212000003_phase8_jobs_schema.sql
20260212000004_job_photos_storage.sql
20260212000005_add_gallery_token.sql
20260212000006_jobs_cancellation_columns.sql
20260212000007_consolidate_job_permissions.sql
20260212000008_jobs_unique_appointment_id.sql
20260212000009_jobs_add_quote_id.sql
20260212000010_add_coupon_code_to_quotes.sql
20260212000011_addon_issue_type.sql
20260213000001_fix_settings_rls.sql
20260214000001_cms_hero_carousel.sql
20260214000002_cms_tickers.sql
20260214000003_cms_ads.sql
20260214000004_cms_themes.sql
20260214000005_cms_catalog_controls.sql
20260214000006_cms_feature_flags.sql
20260214000007_cms_storage.sql
20260214000008_cms_permissions.sql
20260214000009_seo_engine.sql
20260214000010_page_content_blocks.sql
20260216000001_page_navigation_management.sql
20260216000002_fix_pages_permission.sql
20260216000003_site_theme_settings.sql
20260217000001_orders.sql
20260217000002_shipping_settings.sql
20260217000003_product_shipping_dimensions.sql
20260217000004_orders_shipping_columns.sql
20260217000005_order_events.sql
20260217000006_order_permissions_fix.sql
20260217000007_fix_order_number_prefix.sql
20260217000008_order_checkout_fixes.sql
20260219000001_ticker_scroll_speed_value.sql
20260219000002_footer_sections.sql
20260219000003_footer_business_info_type.sql
20260219000004_footer_brand_column.sql
20260219000005_hero_slide_colors.sql
20260219000006_footer_unique_constraints.sql
20260219000007_idempotency_keys.sql
20260219000008_ticker_section_position_text.sql
20260219000009_sale_pricing.sql
20260220000001_transactions_offline_id.sql
20260222000001_coupon_summary.sql
20260222000002_create_audit_log.sql
20260222000003_fix_audit_log_schema.sql
20260222000004_customer_phone_email_unique.sql
20260223000001_create_vehicle_makes.sql
20260224000001_vehicle_category_expansion.sql
20260224000002_create_vehicle_categories.sql
20260224000003_merge_express_signature_categories.sql
20260225000001_cleanup_category_merge.sql
20260225000002_seed_addon_suggestions.sql
20260226000001_expand_block_type_constraint.sql
20260227000001_create_team_members.sql
20260227000002_cleanup_migrated_settings.sql
20260227000003_team_member_excerpt.sql
20260227000004_create_credentials.sql
20260228000001_page_preview_tokens.sql
20260228000002_create_page_revisions.sql
20260228000003_homepage_settings.sql
20260228000004_global_blocks.sql
20260228000005_seo_business_settings.sql
20260228000006_homepage_settings_expansion.sql
20260228000007_og_image_setting.sql
20260301000001_ticker_message_gap.sql
20260301000002_drop_orphaned_photos_table.sql
20260301000003_add_job_photos_tags.sql
20260303000001_email_template_system.sql
20260303000002_seed_email_templates.sql
20260304000001_email_template_rls_policies.sql
20260311000001_add_transaction_access_token.sql
20260312000001_add_transaction_items_pricing_fields.sql
20260312000002_add_products_barcode_index.sql
20260314000001_rename_override_pricing_to_discount_override.sql
20260314000002_update_manual_discounts_description.sql
20260314000003_add_transaction_items_is_addon.sql
20260314000004_add_pos_override_prerequisites_permission.sql
20260314000005_add_transaction_items_prerequisite_note.sql
20260316000001_feature_flags_anon_select_policy.sql
20260317000001_add_services_sale_price.sql
20260317000002_sale_history.sql
20260322000001_add_missing_permission_definitions.sql
20260323000001_create_print_jobs.sql
20260324000001_move_photo_gallery_to_operations.sql
20260324000002_conversation_summaries.sql
20260324000003_cross_channel_bridge.sql
20260325000001_voice_call_log.sql
20260327000001_sms_template_system.sql
20260329000001_sms_template_variable_audit.sql
20260329000002_jobs_appointment_id_unique_constraint.sql
20260330000001_system_sms_logging.sql
20260330000002_quote_items_sale_columns.sql
20260330000003_vehicles_unique_constraint.sql
20260331000001_email_prompt_dismissed.sql
20260331000002_email_verification_system.sql
20260401000001_clean_unknown_vehicle_fields.sql
20260402000001_fix_cancellation_email_template_vars.sql
20260403000001_product_specs_and_variant_grouping.sql
20260404000001_product_enrichment_system.sql
20260404000002_enrichment_drafts_rls_and_cleanup.sql
20260404000003_enrichment_batches_table.sql
20260404000004_backfill_og_images.sql
20260410000001_staff_notification_sms_template.sql
20260417000001_vehicle_exotic_classic_flags.sql
20260417000002_service_exotic_classic_floor_prices.sql
20260418000001_drop_service_floor_price_columns.sql
20260418000002_extend_vehicle_size_class_enum.sql
20260418000003_backfill_and_drop_specialty_flags.sql
20260420000001_extend_stock_adjustments.sql
20260421000001_add_vendor_reorder_fields.sql
20260421000002_create_stock_counts.sql
20260422000001_drop_idx_customers_search.sql
20260424000001_revert_stock_count.sql
20260424000002_revert_stock_count_structured_errors.sql
20260424000003_void_transaction_rpc.sql
20260424000004_extend_stock_adjustments_for_orders.sql
20260425000003_universal_palette_contracts.sql
20260425000004_align_detailer_variables.sql
20260425000005_drop_detailer_first_name_from_variables.sql
20260427000001_appointment_confirmed_service_total_optional.sql
20260427000002_appointment_confirmed_body_split_lines.sql
20260427000003_cheap_add_wave_optional_chips.sql
20260427000004_drop_sms_templates_variables_column.sql
20260427000005_demote_business_chips_to_optional.sql
20260427000006_seed_specialty_sub_slugs.sql
20260428000001_seed_3a_chip_driven_slugs.sql
20260428000002_seed_3b_chip_driven_slugs.sql
20260428000003_seed_3c_chip_driven_slugs.sql
20260428000004_voice_call_log_retry_state.sql
20260428000005_lifecycle_executions_job_id_and_review_cleanup.sql
20260429000001_seed_3d_receipt_sms_chip_driven.sql
20260430000001_rfb2_drop_birthday_and_expand_lifecycle.sql
20260502194628_add_appointment_payment_link.sql
20260502203149_add_payment_link_sent_templates.sql
20260502224451_add_cash_tendered_to_payments.sql
20260503024921_add_refunds_notes.sql
20260503160000_add_payment_link_amount_cents.sql
20260503181924_add_pos_walkin_consent_source.sql
20260510000001_add_digital_payment_enum_value.sql     # Phase 1A.5: extend payment_method enum with 'digital'
20260510000002_add_digital_platform_column.sql        # Phase 1A.5: payments.digital_platform column + biconditional CHECK + partial index
20260511000001_add_mobile_fee_item_type.sql           # Mobile fix D2: extend transaction_item_type enum with 'mobile_fee'
20260511000002_add_mobile_zone_snapshot_and_quote_mobile.sql # Mobile fix D2: appointments.mobile_zone_name_snapshot + quotes mobile_* columns + consistency CHECKs
20260512152847_quote_communications_delivery_tracking.sql    # Phase Messaging-1+2: twilio_sid column + 3-status enum (sent/failed/blocked) on quote_communications
20260513022648_phone_normalization_phase_1.sql               # Phase Normalization-1: backfill 3 employees + 1 business_settings + 38 sms_delivery_log + ALTER employees ADD CONSTRAINT valid_phone
20260513050241_phone_schema_hardening.sql                    # Phase Schema-Hardening-1: 4 new E.164 CHECK constraints (conversations.phone_number, sms_delivery_log.to_phone, sms_conversations.phone_number, sms_consent_log.phone) + retroactive idempotent capture of quote_communications.valid_sent_to (channel-aware Option B)
20260514051953_unify_2_inventory_family_to_cents.sql         # Phase Money-Unify-2: ADD COLUMN unit_cost_cents on purchase_order_items + stock_adjustments; ADD COLUMN min_order_amount_cents on vendors; DROP NOT NULL on purchase_order_items.unit_cost; backfill ROUND × 100; CHECK >= 0; CREATE OR REPLACE FUNCTION void_transaction() writes unit_cost_cents (with TODO Unify-D)
20260517021350_lifecycle_persistence.sql                     # Item 15g Layer 15g-ii: lifecycle persistence schema — ADD COLUMN appointments.{loyalty_points_redeemed,loyalty_discount,manual_discount_value,manual_discount_label} + quotes.{coupon_discount,loyalty_points_to_redeem,loyalty_discount,manual_discount_type,manual_discount_value,manual_discount_label} + 3 CHECK constraints (appointments_manual_discount_coherent, quotes_manual_discount_coherent, quotes_loyalty_coherent). All additive + non-breaking.
```

## Scripts

```
scripts/capture-receipt-baselines.ts        # Phase 0b.1: regenerates 12-scenario HTML+thermal fixtures
scripts/diff-receipt-renders.ts             # Phase 0b.2: byte-diff harness for production transactions; user runs locally
scripts/import-square-data.mjs
scripts/regen-db-schema.ts
scripts/regen-sms-contracts.ts              # Codegen: SMS palette + per-slug typed contracts (Session 2A.5)
scripts/seed-admin.ts
scripts/seed-data.ts
scripts/seed-receipt-test-transactions.sql  # Phase 0b.1: receipt-test seed scaffolding (NOT executed; for Phase 0b.2 byte-diff harness)
scripts/fix-zelle-misclassification.sql     # Phase 1A.5: one-off SQL fix template for the Zelle-mismarked-as-Cash transaction (NOT executed)
scripts/fix-mobile-backfill.sql             # Mobile fix D2: backfill template for SD-006253 + SD-006278 (NOT executed; operator runs manually post-deploy)
```

## Config

```
vitest.config.ts
eslint.config.mjs
```

---

## ESLint — Custom Rules (`eslint-rules/`)

```
eslint-rules/phone-no-raw-display.js                       # Phase Lint-Hardening-1: flags raw {customer.phone} in JSX without formatPhone() wrapper
eslint-rules/__tests__/phone-no-raw-display.test.js        # 23 RuleTester cases (10 valid, 13 invalid) — vitest picks up via include
eslint-rules/money-no-unsuffixed-money-prop.js             # Phase Money-Unify-1: flags cents-typed values bound to identifiers lacking Cents/_cents suffix
eslint-rules/__tests__/money-no-unsuffixed-money-prop.test.js  # 21 RuleTester cases (14 valid, 7 invalid)
eslint-rules/services-no-bespoke-pricing.js                # Item 15f Layer 4: enforces CLAUDE.md Rule 22 — 3 signals (function-name pattern, switch-over-pricing_model w/o engine call, direct vehicle_size_*_price reads). Ships at 'error'.
eslint-rules/__tests__/services-no-bespoke-pricing.test.js # 19 RuleTester cases (10 valid, 9 invalid)
```

Item 15f Layer 4 additions / changes (4 bespoke-pricer migrations + helper extraction):
- New: `src/app/api/book/_pricing.ts` — `computeExpectedPrice` extracted from `route.ts` (Next.js route files only permit GET/POST/etc. exports; underscore prefix excludes from route resolution).
- New: `src/app/api/book/__tests__/compute-expected-price.test.ts` — 12 cases pinning canonical-engine routing.
- Modified: `src/app/api/book/route.ts` — imports `computeExpectedPrice` from `./_pricing`.
- Modified: `src/components/booking/booking-wizard.tsx` — `reconstructConfig` migrated to canonical engine.
- Modified: `src/components/public/service-card.tsx` — `getStartingPrice` migrated to canonical engine.
- Modified: `src/app/api/voice-agent/services/route.ts` — pricing array builder migrated; SELECT widened to fetch full ServicePricing.
- Modified: `src/components/appointments/edit-services-modal.tsx` — single sanctioned `// eslint-disable-next-line services/no-bespoke-pricing` comment above the dead-code `resolveServicePrice`. **Deleted in Phase 1 Layer 8e (2026-05-17)** — eslint-disable comment went with it. Codebase-wide `eslint-disable.*services/no-bespoke-pricing` count is now 0.
- Modified: `src/app/admin/appointments/components/appointment-detail-dialog.tsx` — Admin "Edit Services" button disabled (deletion-window safety).
- New: `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` — 2 cases pinning the disabled button + no-modal-mount.
- Modified: `CLAUDE.md` Rule 22 — updated to reflect rule is now `'error'`-enforced.
- Modified: `eslint.config.mjs` — registered `services/no-bespoke-pricing` under the `services` plugin namespace.

---

## Docs (`docs/`)

```
docs/CHANGELOG.md
docs/adr/                                              # Architecture Decision Records (Phase ADR-1)
docs/adr/README.md                                     # Index + when-to-write criteria + how-to
docs/adr/_template.md                                  # Canonical ADR template (≤800 words, 6 sections)
docs/adr/0001-canonical-form-pattern.md                # Meta-pattern: storage canonical + wire canonical + display formatted + input formatted
docs/adr/0002-phone-format-integrity.md                # 5-layer defense for phones — application of ADR-0001
docs/adr/0003-money-math-via-integer-cents.md          # Integer-cents arithmetic + 4 invariants — application of ADR-0001
docs/adr/0004-receipt-four-surface-synchronization.md  # Thermal + HTML print + public page + email update together
docs/adr/0005-timezone-policy-pacific.md               # America/Los_Angeles everywhere; never UTC at the app layer
docs/dev/ARCHITECTURE.md
docs/dev/DB_SCHEMA.md          # Full database schema reference (70+ tables)
docs/dev/CONVENTIONS.md
docs/dev/DASHBOARD_RULES.md
docs/dev/DATA_MIGRATION_RULES.md
docs/dev/DESIGN_SYSTEM.md
docs/dev/FILE_TREE.md          ← this file
docs/dev/PHONE_LINT.md       # Phase Lint-Hardening-1: phone/no-raw-display rule rationale, scope, opt-out, severity-upgrade plan
docs/dev/MONEY.md            # Phase Money-Unify-1: canonical money model, helper API, naming convention, money/no-unsuffixed-money-prop rule, cross-system sync points (Stripe min DB CHECK + REDEEM_RATE float/int duality)
docs/dev/POS_SECURITY.md
docs/dev/TROUBLESHOOTING.md
docs/dev/QBO_INTEGRATION.md
docs/dev/SERVICE_CATALOG.md
docs/dev/LIFECYCLE_AUDIT_2026-05-15.md          # Lifecycle audit — Quote → Appointment → Job → Transaction surface map (data model, state transitions, POS×Admin matrix, permissions, gap inventory)
docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md  # Audit: viability of generalizing quote → POS edit pattern to appointment/job service edits (Item 15f Layer 3a-i follow-up; recommendation to revert Layer 3a-i and route service edits through POS Sale tab)
docs/dev/LIFECYCLE_PERSISTENCE_AUDIT_2026-05-16.md  # Audit: discount/coupon/loyalty persistence across Quote → Appointment → Job → Transaction; identifies schema gaps (quotes/jobs missing columns) + logic gaps (convertQuote drops coupon_code despite column existing; checkout-items doesn't read appointment.coupon_code); recommendation for future Item 15g (~5 sessions full fix, ~0.5 session MVP)
docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md  # Audit (read-only): trace of all 8 customers.loyalty_points_balance writers + refund-path restoration. Finding: pre-transaction loyalty edits do NOT need balance mutation (snapshot-only design per Lifecycle §9.5). Recommends Option A1 — ship loyalty/coupon/manual_discount editability in Phase 1 Layer 8c at ~0.25 session backend extension; no refund-helper extraction needed.
docs/dev/APPOINTMENT_JOB_STATUS_FLOW_AUDIT_2026-05-17.md  # Audit (read-only): full inventory of appointments.status + jobs.status writers (8 + 7 paths), state machines, cross-table divergence. Finding: columns are orthogonal by design; UAT-observed appt=in_progress+job=scheduled is normal walk-in pattern from pos/jobs/route.ts:387. F1 whitelist refinement for Phase 1 Layer 8d-bis: refuse {completed, cancelled, no_show}. The user's "in_progress blocked" report is unverified — current load endpoint allows in_progress; recommends UAT reproduction before code change.
docs/dev/QUOTE_TOTAL_AND_RECEIPT_AUDIT_2026-05-16.md  # Audit: quotes.total_amount is persisted as pre-discount (subtotal + tax) but every UI/SMS/email/PDF/admin consumer treats it as final amount; convert-service is the only correctly-defensive reader. Plus: 4 quote-receipt surfaces (SMS body, public landing, email HTML, PDF) all render Subtotal/Tax/Total with no modifier line items. Recommends Layer 15g-v: writer fix + receipt modifier rendering. ~1-1.5 sessions, no schema migration. Lands before Phase 1.
docs/sessions/receipt-unification-phase-0b-2.md   # Phase 0b.2: byte-diff harness operator runbook + 10-scenario SQL queries
docs/sessions/receipt-unification-phase-1a.md     # Phase 1A: visual UX changes (Total Paid, Paid in Full ✓, deposit chrome retired, payment timestamps)
docs/sessions/receipt-unification-phase-1a-5.md   # Phase 1A.5: digital payment types (Zelle/Venmo/AppleCash/Other) + Stripe webhook brand/last4 capture
docs/sessions/receipt-unification-phase-1a-followup.md  # Phase 1A-followup: admin filter stale-closure fix, legacy Paid-in-Full fallback, thermal middle-dot CP437 0xFA
docs/sessions/receipt-unification-phase-1a-followup-2.md  # Phase 1A-followup-2: thermal ✓ via CP437 0xFB + admin search bypasses all filters + PAID_IN_FULL consolidated
docs/sessions/mobile-fee-1-1-address-handling.md  # Phase Mobile-1.1: address pre-fill + X clear + mandatory validation + save-to-customer (Option X+)
docs/sessions/mobile-fee-1-2-uat-fixes.md         # Phase Mobile-1.2: UAT bug fixes — error wording, customer-swap clear, zone vs Custom-path error distinction
docs/sessions/mobile-fee-1-3-prefill-state-recovery.md  # Phase Mobile-1.3: addressWasAutoPrefilled flag recovery on mount (loaded-quote scenario)
docs/sessions/mobile-fee-1-4-parser-improvements.md  # Phase Mobile-1.4: parseAddressString handles 4 common US address formats (anchored-from-end strategy)
docs/sessions/mobile-fee-1-5-zip-only-format.md      # Phase Mobile-1.5: parser Format E (Street, City ZIP) + "CA" state default (two-pass regex)
docs/sessions/mobile-fee-1-6-address-display-edit.md # Phase Mobile-1.6: mobile_address display + edit on POS jobs detail + admin appointment dialog
docs/sessions/mobile-fee-1-7-display-composer.md     # Phase Mobile-1.7: shared composeLineItems utility — adds mobile fee as synthetic line on quote/appointment display surfaces
docs/sessions/mobile-fee-1-8-composer-idempotency.md # Phase Mobile-1.8: composer idempotency (skip synthetic append when jobs.services JSONB already carries mobile entry) + POS quote detail wiring
docs/sessions/messaging-1-2-send-flow-and-delivery.md # Phase Messaging-1+2: send pipeline overhaul (HTTP 422 on total failure, 3-status enum, twilio_sid JOIN for delivery tracking)
docs/sessions/mobile-fee-1-9-full-picker-edit.md     # Phase Mobile-1.9: full mobile picker edit on POS jobs detail + admin appointment dialog — toggle/zone/custom/address with live zone reads, save-time snapshot, payment-mismatch banner
docs/sessions/mobile-fee-1-9-1-zone-dropdown-fix.md  # Phase Mobile-1.9.1: zone-dropdown shows correct selection in edit mode (JOB_SELECT +mobile_zone_id, zonesLoaded resync, deleted-zone recovery)
docs/sessions/normalization-1-phone-format-integrity.md  # Phase Normalization-1: chokepoint phone normalization in sendSms/findOrCreateConversation, 5 unprotected endpoints, form-side hygiene, backfill + CHECK on employees.phone, 4 shadow conversations deferred
docs/sessions/phone-ux-1-display-and-input.md            # Phase Phone-UX-1: canonical phone display + input formatting — null-safe formatPhone, palette-driven SMS chip auto-format, 22 HIGH + 5 MEDIUM display sites, 7 input forms, 3 duplicate impls consolidated
docs/sessions/schema-hardening-1-phone-checks.md         # Phase Schema-Hardening-1: 5 phone CHECK constraints (4 new + 1 retroactive channel-aware on quote_communications.sent_to), inline DB-contract doc in send-service.ts, defense-in-depth complete
docs/sessions/lint-hardening-1.2-and-1.3-leak-fixes-and-rule-tightening.md  # Phase Lint-Hardening-1.2+1.3: 4 phone display leaks fixed (formatPhone wraps) + 11 tel: hrefs wrapped with phoneToE164 + 5 phone/no-raw-display rule adjustments (skip &&/?: test, recognize formatPhone(x)||x fallback, skip key/input value attrs, drop cell/mobile bare generics). Warning count 90→19. +15 rule tests.
docs/sessions/adr-1-establish-decision-records-practice.md  # Phase ADR-1: established docs/adr/ as ongoing practice. 5 initial ADRs (canonical form pattern, phone integrity, money cents, receipt 4-surface, timezone). 15 candidate ADRs identified for follow-up. CLAUDE.md Rule 5 updated to include ADR step at session end.
docs/manual/README.md
docs/manual/01-getting-started.md
docs/manual/02-dashboard.md
docs/manual/03-job-management.md
docs/manual/05-customers.md
docs/manual/MARKETING_DECISION_GUIDE.md   # Operator decision tree for the 4 messaging systems (Session 6c)
docs/manual/website/README.md
docs/hardware/print-server/package.json
docs/hardware/print-server/README.md
docs/hardware/print-server/server.js
docs/planning/CMS_OVERHAUL_PROJECT_PLAN.md
docs/planning/COUPONS.md
docs/planning/iPAD.md
docs/planning/MEMORY.md
docs/planning/NEW_SITE.md
docs/planning/PHASE8_JOB_MANAGEMENT.md
docs/planning/POST_LAUNCH_ROADMAP.md
docs/planning/PROJECT.md
docs/audits/ (18 audit files)
```
