# File Tree Reference — Smart Details Auto Spa

> **Purpose:** Exact file paths for every route, page, lib module, component, and migration.
> Claude Code prompts MUST reference this file instead of guessing paths.
>
> **Last updated:** 2026-02-22 (from `find` output)

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
src/app/api/admin/appointments/stats/route.ts
src/app/api/admin/audit-log/export/route.ts
src/app/api/admin/audit-log/route.ts
src/app/api/admin/current-ip/route.ts
src/app/api/admin/customers/[id]/photos/route.ts
src/app/api/admin/customers/[id]/portal-access/route.ts
src/app/api/admin/customers/[id]/reset-password/route.ts
src/app/api/admin/customers/[id]/route.ts
src/app/api/admin/customers/search/route.ts
src/app/api/admin/customers/stats/route.ts
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
src/app/api/admin/orders/[id]/route.ts
src/app/api/admin/orders/route.ts
src/app/api/admin/photos/[id]/route.ts
src/app/api/admin/photos/bulk/route.ts
src/app/api/admin/photos/route.ts
src/app/api/admin/purchase-orders/[id]/receive/route.ts
src/app/api/admin/purchase-orders/[id]/route.ts
src/app/api/admin/purchase-orders/route.ts
src/app/api/admin/quotes/route.ts
src/app/api/admin/quotes/stats/route.ts
src/app/api/admin/receipt-logo/route.ts
src/app/api/admin/stock-adjustments/route.ts
src/app/api/admin/transactions/stats/route.ts
src/app/api/admin/upload/content-image/route.ts
```

### Admin — CMS
```
src/app/api/admin/cms/about/route.ts
src/app/api/admin/cms/ads/analytics/route.ts
src/app/api/admin/cms/ads/creatives/[id]/route.ts
src/app/api/admin/cms/ads/creatives/route.ts
src/app/api/admin/cms/ads/placements/[id]/route.ts
src/app/api/admin/cms/ads/placements/route.ts
src/app/api/admin/cms/ads/zones/route.ts
src/app/api/admin/cms/catalog/products/route.ts
src/app/api/admin/cms/catalog/services/route.ts
src/app/api/admin/cms/content/[id]/route.ts
src/app/api/admin/cms/content/ai-generate/route.ts
src/app/api/admin/cms/content/reorder/route.ts
src/app/api/admin/cms/content/route.ts
src/app/api/admin/cms/hero/[id]/route.ts
src/app/api/admin/cms/hero/config/route.ts
src/app/api/admin/cms/hero/reorder/route.ts
src/app/api/admin/cms/hero/route.ts
src/app/api/admin/cms/navigation/[id]/route.ts
src/app/api/admin/cms/navigation/reorder/route.ts
src/app/api/admin/cms/navigation/route.ts
src/app/api/admin/cms/pages/[id]/route.ts
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
src/app/api/admin/cms/terms/route.ts
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
src/app/api/admin/marketing/promotions/route.ts
```

### Admin — Settings
```
src/app/api/admin/settings/business/route.ts
src/app/api/admin/settings/shipping/carriers/route.ts
src/app/api/admin/settings/shipping/route.ts
src/app/api/admin/settings/shipping/test-connection/route.ts
src/app/api/admin/settings/shipping/validate-address/route.ts
```

### Admin — Staff & Roles
```
src/app/api/admin/staff/[id]/permissions/route.ts
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
```

### Checkout (Online Store)
```
src/app/api/checkout/create-payment-intent/route.ts
src/app/api/checkout/customer-info/route.ts
src/app/api/checkout/order/route.ts
src/app/api/checkout/shipping-rates/route.ts
src/app/api/checkout/validate-address/route.ts
```

### Cron (Internal Scheduler)
```
src/app/api/cron/cleanup-audit-log/route.ts
src/app/api/cron/cleanup-idempotency/route.ts
src/app/api/cron/cleanup-orders/route.ts
src/app/api/cron/google-reviews/route.ts
src/app/api/cron/lifecycle-engine/route.ts
src/app/api/cron/qbo-sync/route.ts
src/app/api/cron/quote-reminders/route.ts
src/app/api/cron/stock-alerts/route.ts
src/app/api/cron/theme-activation/route.ts
```

### Customer Portal API
```
src/app/api/customer/appointments/[id]/cancel/route.ts
src/app/api/customer/appointments/[id]/route.ts
src/app/api/customer/coupons/route.ts
src/app/api/customer/link-account/route.ts
src/app/api/customer/link-by-phone/route.ts
src/app/api/customer/loyalty/route.ts
src/app/api/customer/profile/route.ts
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
src/app/api/pos/auth/logout/route.ts
src/app/api/pos/auth/pin-login/route.ts
src/app/api/pos/card-customer/route.ts
src/app/api/pos/coupons/validate/route.ts
src/app/api/pos/customers/[id]/type/route.ts
src/app/api/pos/customers/[id]/vehicles/route.ts
src/app/api/pos/customers/route.ts
src/app/api/pos/customers/search/route.ts
src/app/api/pos/end-of-day/route.ts
src/app/api/pos/end-of-day/summary/route.ts
src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts
src/app/api/pos/jobs/[id]/addons/route.ts
src/app/api/pos/jobs/[id]/cancel/route.ts
src/app/api/pos/jobs/[id]/checkout-items/route.ts
src/app/api/pos/jobs/[id]/complete/route.ts
src/app/api/pos/jobs/[id]/link-transaction/route.ts
src/app/api/pos/jobs/[id]/photos/[photoId]/route.ts
src/app/api/pos/jobs/[id]/photos/route.ts
src/app/api/pos/jobs/[id]/pickup/route.ts
src/app/api/pos/jobs/[id]/route.ts
src/app/api/pos/jobs/[id]/start-work/route.ts
src/app/api/pos/jobs/[id]/timer/route.ts
src/app/api/pos/jobs/populate/route.ts
src/app/api/pos/jobs/route.ts
src/app/api/pos/jobs/settings/route.ts
src/app/api/pos/loyalty/earn/route.ts
src/app/api/pos/loyalty/redeem/route.ts
src/app/api/pos/my-permissions/route.ts
src/app/api/pos/promotions/available/route.ts
src/app/api/pos/quotes/[id]/communications/route.ts
src/app/api/pos/quotes/[id]/convert/route.ts
src/app/api/pos/quotes/[id]/route.ts
src/app/api/pos/quotes/[id]/send/route.ts
src/app/api/pos/quotes/route.ts
src/app/api/pos/receipts/email/route.ts
src/app/api/pos/receipts/print/route.ts
src/app/api/pos/receipts/sms/route.ts
src/app/api/pos/refunds/route.ts
src/app/api/pos/services/durations/route.ts
src/app/api/pos/services/route.ts
src/app/api/pos/staff/available/route.ts
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
src/app/api/public/cms/tickers/route.ts
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
src/app/api/webhooks/stripe/route.ts
src/app/api/webhooks/twilio/inbound/route.ts
src/app/api/webhooks/twilio/status/route.ts
```

### Other
```
src/app/api/gallery/route.ts
src/app/api/jobs/[token]/photos/route.ts
src/app/api/t/[code]/route.ts
src/app/api/unsubscribe/[customerId]/route.ts
src/app/api/voice-agent/appointments/route.ts
src/app/api/voice-agent/availability/route.ts
src/app/api/voice-agent/customers/route.ts
src/app/api/voice-agent/quotes/route.ts
src/app/api/voice-agent/services/route.ts
src/app/api/waitlist/[id]/route.ts
src/app/api/waitlist/route.ts
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
src/app/admin/catalog/products/new/page.tsx
src/app/admin/catalog/products/page.tsx
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
src/app/admin/inventory/page.tsx
src/app/admin/inventory/purchase-orders/[id]/page.tsx
src/app/admin/inventory/purchase-orders/new/page.tsx
src/app/admin/inventory/purchase-orders/page.tsx
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
src/app/admin/marketing/compliance/page.tsx
src/app/admin/marketing/coupons/[id]/page.tsx
src/app/admin/marketing/coupons/new/page.tsx
src/app/admin/marketing/coupons/page.tsx
src/app/admin/marketing/promotions/page.tsx
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
src/app/admin/settings/business-profile/page.tsx
src/app/admin/settings/card-reader/page.tsx
src/app/admin/settings/coupon-enforcement/page.tsx
src/app/admin/settings/feature-toggles/page.tsx
src/app/admin/settings/integrations/quickbooks/page.tsx
src/app/admin/settings/messaging/page.tsx
src/app/admin/settings/mobile-zones/page.tsx
src/app/admin/settings/notifications/page.tsx
src/app/admin/settings/pos-favorites/page.tsx
src/app/admin/settings/pos-idle-timeout/page.tsx
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
```

### Website (CMS)
```
src/app/admin/website/page.tsx
src/app/admin/website/about/page.tsx
src/app/admin/website/ads/creatives/[id]/page.tsx
src/app/admin/website/ads/page.tsx
src/app/admin/website/catalog/page.tsx
src/app/admin/website/footer/page.tsx
src/app/admin/website/hero/[id]/page.tsx
src/app/admin/website/hero/page.tsx
src/app/admin/website/navigation/page.tsx
src/app/admin/website/pages/[id]/page.tsx
src/app/admin/website/pages/new/page.tsx
src/app/admin/website/pages/page.tsx
src/app/admin/website/seo/cities/page.tsx
src/app/admin/website/seo/page.tsx
src/app/admin/website/terms/page.tsx
src/app/admin/website/theme-settings/page.tsx
src/app/admin/website/themes/[id]/page.tsx
src/app/admin/website/themes/page.tsx
src/app/admin/website/tickers/[id]/page.tsx
src/app/admin/website/tickers/page.tsx
```

---

## Lib Modules (`src/lib/`)

### Auth
```
src/lib/auth/api-key.ts
src/lib/auth/check-permission.ts
src/lib/auth/customer-helpers.ts
src/lib/auth/get-employee.ts
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
src/lib/data/business-hours.ts
src/lib/data/business.ts
src/lib/data/cities.ts
src/lib/data/cms.ts
src/lib/data/featured-photos.ts
src/lib/data/page-content.ts
src/lib/data/products.ts
src/lib/data/receipt-config.ts
src/lib/data/reviews.ts
src/lib/data/services.ts
src/lib/data/team.ts
src/lib/data/vehicle-count.ts
src/lib/data/website-pages.ts
```

### Hooks
```
src/lib/hooks/use-async-action.ts
src/lib/hooks/use-business-info.ts
src/lib/hooks/use-feature-flag.ts
src/lib/hooks/use-online-status.ts
src/lib/hooks/use-permission.ts
```

### Migration
```
src/lib/migration/phone-utils.ts
src/lib/migration/types.ts
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

### Quotes
```
src/lib/quotes/convert-service.ts
src/lib/quotes/quote-service.ts
src/lib/quotes/send-service.ts
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
src/lib/services/ai-seo.ts
src/lib/services/audit.ts
src/lib/services/coupon-summary.ts
src/lib/services/job-addons.ts
src/lib/services/messaging-ai-prompt.ts
src/lib/services/messaging-ai.ts
src/lib/services/page-content-extractor.ts
src/lib/services/shippo.ts
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
src/lib/utils/format.ts
src/lib/utils/idempotency.ts
src/lib/utils/issue-types.ts
src/lib/utils/job-zones.ts
src/lib/utils/link-tracking.ts
src/lib/utils/mailgun-signature.ts
src/lib/utils/order-emails.ts
src/lib/utils/order-number.ts
src/lib/utils/phone-validation.ts
src/lib/utils/quote-number.ts
src/lib/utils/render-annotations.ts
src/lib/utils/revalidate.ts
src/lib/utils/role-defaults.ts
src/lib/utils/sale-pricing.ts
src/lib/utils/shipping-types.ts
src/lib/utils/short-link.ts
src/lib/utils/sms-consent.ts
src/lib/utils/sms.ts
src/lib/utils/template.ts
src/lib/utils/ticker-sections.ts
src/lib/utils/validation.ts
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
```

### Admin Components
```
src/components/admin/content/content-block-editor.tsx
src/components/admin/content/faq-editor.tsx
src/components/admin/content/markdown-editor.tsx
src/components/admin/content/page-html-editor.tsx
src/components/admin/html-editor-toolbar.tsx
src/components/admin/html-image-manager.tsx
src/components/admin/icon-picker.tsx
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
src/components/public/cms/theme-provider.tsx
src/components/public/content-block-renderer.tsx
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
src/components/public/scroll-reveal.tsx
src/components/public/service-card.tsx
src/components/public/service-category-card.tsx
src/components/public/service-pricing-display.tsx
src/components/public/site-footer.tsx
src/components/public/site-header.tsx
src/components/public/theme-toggle-initializer.tsx
src/components/public/theme-toggle.tsx
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
src/components/account/appointment-card.tsx
src/components/account/appointment-edit-dialog.tsx
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
src/components/booking/step-configure.tsx
src/components/booking/step-customer-info.tsx
src/components/booking/step-indicator.tsx
src/components/booking/step-payment.tsx
src/components/booking/step-review.tsx
src/components/booking/step-schedule.tsx
src/components/booking/step-service-select.tsx
```

### Quote Components
```
src/components/quotes/notify-customer-dialog.tsx
src/components/quotes/quote-book-dialog.tsx
```

### Other
```
src/components/before-after-slider.tsx
src/components/photo-gallery.tsx
src/components/qbo-sync-badge.tsx
src/components/service-pricing-form.tsx
```

---

## POS Components (`src/app/pos/components/`)

```
addon-suggestions.tsx       customer-type-badge.tsx      pos-workspace.tsx
bottom-nav.tsx              customer-type-prompt.tsx     product-detail.tsx
catalog-browser.tsx         customer-vehicle-summary.tsx promotions-tab.tsx
catalog-card.tsx            eod/                        receipt-options.tsx
catalog-grid.tsx            held-tickets-panel.tsx      refund/
catalog-panel.tsx           keypad-tab.tsx              register-tab.tsx
category-tabs.tsx           loyalty-panel.tsx           search-bar.tsx
category-tile.tsx           offline-indicator.tsx       service-detail-dialog.tsx
checkout/                   offline-queue-badge.tsx     service-pricing-picker.tsx
coupon-input.tsx            pin-screen.tsx              swipeable-cart-item.tsx
customer-create-dialog.tsx  pin-pad.tsx                 ticket-actions.tsx
customer-lookup.tsx         pos-service-worker.tsx      ticket-item-row.tsx
                                                        ticket-panel.tsx
                                                        ticket-totals.tsx
                                                        transactions/
                                                        vehicle-create-dialog.tsx
                                                        vehicle-selector.tsx
                                                        quotes/
```

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
```

---

## Docs (`docs/`)

```
docs/CHANGELOG.md
docs/dev/ARCHITECTURE.md
docs/dev/CONVENTIONS.md
docs/dev/DASHBOARD_RULES.md
docs/dev/DATA_MIGRATION_RULES.md
docs/dev/DESIGN_SYSTEM.md
docs/dev/FILE_TREE.md          ← this file
docs/dev/POS_SECURITY.md
docs/dev/QBO_INTEGRATION.md
docs/dev/SERVICE_CATALOG.md
docs/manual/README.md
docs/manual/website/README.md
docs/planning/COUPONS.md
docs/planning/iPAD.md
docs/planning/MEMORY.md
docs/planning/NEW_SITE.md
docs/planning/PHASE8_JOB_MANAGEMENT.md
docs/planning/POST_LAUNCH_ROADMAP.md
docs/planning/PROJECT.md
docs/audits/ (18 audit files)
```
