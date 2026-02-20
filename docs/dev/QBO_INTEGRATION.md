# QuickBooks Online Integration

## Overview
Smart Details Auto Spa syncs POS transactions, customers, and catalog items to QuickBooks Online for accounting. The integration is optional and controlled via Settings > Integrations > QuickBooks Online.

## Architecture
- Source of truth: Smart Details app (Supabase)
- Accounting layer: QuickBooks Online
- Sync direction: One-way push (App → QBO)
- Sync timing: Real-time for transactions (fire-and-forget after POS completion), on-demand for catalog/customer backfill

## Data Flow
1. POS transaction completed → Background sync → Sales Receipt created in QBO
2. New customer created → Background sync → Customer created in QBO (if auto-sync enabled)
3. Manual "Sync All" → Pushes unsynced transactions, customers, and catalog updates

## Entity Mapping

| Smart Details | QBO Entity | QBO Type |
|---|---|---|
| Transaction | Sales Receipt | SalesReceipt |
| Customer | Customer | Customer |
| Service | Item | Service |
| Product | Item | NonInventory |
| Coupon discount | Discount Line | DiscountLineDetail |

## Database Columns
- customers.qbo_id — QBO Customer ID
- customers.qbo_synced_at — Last sync timestamp
- services.qbo_id — QBO Item ID
- products.qbo_id — QBO Item ID
- transactions.qbo_id — QBO SalesReceipt ID
- transactions.qbo_sync_status — pending/synced/failed/skipped/null
- transactions.qbo_sync_error — Error message if failed
- transactions.qbo_synced_at — Last sync timestamp

## Feature Toggle
Gated behind qbo_enabled in feature_flags table + business_settings. When OFF: zero API calls, zero overhead, POS operates normally, new transactions get qbo_sync_status = NULL. When ON: completed transactions auto-push, failed syncs logged and retryable, manual sync available.

## Setup
1. Intuit Developer account at developer.intuit.com
2. Create app with "QuickBooks Online and Payments" scope, select com.intuit.quickbooks.accounting
3. Copy Client ID + Client Secret
4. Smart Details: Settings > Integrations > QuickBooks Online
5. Enter credentials, select environment (Sandbox/Production)
6. Click "Connect to QuickBooks" → authorize in popup
7. Configure Income Account and Deposit Account mappings
8. Enable the integration toggle

## OAuth Tokens
- Access token: 1 hour expiry, auto-refreshed by QboClient
- Refresh token: 100 days expiry. If expired, reconnect via Settings.
- Stored in business_settings table (not env vars)

## POS Integration
- Transaction hook: fires after every completed POS transaction
- Customer hook: fires after new customer creation (if qbo_auto_sync_customers is enabled)
- Both hooks are fire-and-forget — POS response returns immediately
- If QBO is disabled or down, POS works perfectly with zero impact

## Sync Log
All sync operations are logged to the `qbo_sync_log` table with:
- entity_type, entity_id, action (create/update)
- status (success/failed), error_message
- request/response payloads, duration_ms
- Viewable in Settings > QuickBooks > Sync Log

## API Routes

### OAuth
- `GET /api/admin/integrations/qbo/connect` — Generate OAuth URL
- `GET /api/admin/integrations/qbo/callback` — Exchange code for tokens
- `POST /api/admin/integrations/qbo/disconnect` — Clear tokens
- `GET /api/admin/integrations/qbo/status` — Connection status
- `GET/PATCH /api/admin/integrations/qbo/settings` — Read/write settings
- `GET /api/admin/integrations/qbo/accounts` — List QBO accounts

### Sync
- `POST /api/admin/integrations/qbo/sync` — Manual sync (body: { type: 'all' | 'transactions' | 'customers' | 'catalog' })
- `POST /api/admin/integrations/qbo/sync/retry` — Retry failed syncs (body: { transactionId? })
- `GET /api/admin/integrations/qbo/sync/log` — View sync log (query: limit, offset, status, entity_type)
- `DELETE /api/admin/integrations/qbo/sync/log` — Clear sync log

## Troubleshooting
- Token expired: Auto-refresh handles access tokens. If refresh token expires (100 days), disconnect and reconnect.
- Duplicate name error (6240): Auto-handled — appends phone/ID suffix.
- Rate limits: QBO allows 500 req/min. Our volume (10-30 transactions/day) is well under.
- Failed syncs: Check sync log in Settings. Use "Retry Failed" or retry individual transactions.
- QBO down: POS works perfectly. Failed syncs queued for retry.
- $0 transactions: Automatically skipped (qbo_sync_status = 'skipped').
- Walk-in customers: Mapped to a generic "Walk-in Customer" in QBO.

## File Structure
- src/lib/qbo/client.ts — API client with token refresh
- src/lib/qbo/settings.ts — Read/write QBO settings
- src/lib/qbo/types.ts — TypeScript types
- src/lib/qbo/sync-customer.ts — Customer sync engine
- src/lib/qbo/sync-catalog.ts — Service/product sync engine
- src/lib/qbo/sync-transaction.ts — Transaction → Sales Receipt sync
- src/lib/qbo/sync-log.ts — Sync log helpers
- src/lib/qbo/index.ts — Re-exports
- src/app/api/admin/integrations/qbo/* — OAuth + sync API routes
- src/app/admin/settings/integrations/quickbooks/page.tsx — Settings UI
- src/components/qbo-sync-badge.tsx — Reusable status badge

## PST Timezone
All transaction dates sent to QBO use America/Los_Angeles. This matches the app's timezone.
