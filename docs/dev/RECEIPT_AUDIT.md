# Receipt System Audit — All Print/Email/SMS Paths

> **Date:** 2026-03-07
> **Purpose:** Map every receipt touchpoint, trace code paths, identify inconsistencies, propose unification.
> **Status:** AUDIT ONLY — no code changes.

---

## 1. Complete Touchpoint Map

### 1.1 POS Receipt Options (ReceiptOptions component)

**File:** `src/app/pos/components/receipt-options.tsx`

**Used in:**
- `src/app/pos/components/checkout/payment-complete.tsx` (after payment completion)
- `src/app/pos/components/transactions/transaction-detail.tsx` (POS transaction history)

**Actions Available:** Print (copier), Email, SMS, Receipt (thermal)

| Button | Function | Code Path |
|--------|----------|-----------|
| Print | `handleCopierPrint()` | `GET /api/pos/receipts/html` → window.open() → window.print() |
| Email | `handleEmail()` | `POST /api/pos/receipts/email` (via posFetch) |
| SMS | `handleSms()` | `POST /api/pos/receipts/sms` (via posFetch) |
| Receipt | `handleReceiptPrint()` | `POST /api/pos/receipts/print-server` (via posFetch) |

**Notes:**
- Uses `posFetch()` for all API calls (HMAC auth)
- No client-side HTML generation — all rendering happens server-side via API routes
- No QR code or barcode generation on client side

---

### 1.2 Admin Receipt Dialog (ReceiptDialog component)

**File:** `src/components/admin/receipt-dialog.tsx`

**Used in:**
- `src/app/admin/transactions/page.tsx` (Admin transactions list)
- `src/app/admin/customers/[id]/page.tsx` (Customer detail — History tab)

**Actions Available:** Print (copier), Email, SMS, Receipt (thermal)

| Button | Function | Code Path |
|--------|----------|-----------|
| Print | `handleCopierPrint()` | Client-side: uses pre-generated `receiptHtml` → window.open() → window.print() |
| Email | `handleEmail()` | `POST /api/pos/receipts/email` (via fetch, admin session auth) |
| SMS | `handleSms()` | `POST /api/pos/receipts/sms` (via fetch, admin session auth) |
| Receipt | `handleReceiptPrint()` | `POST /api/pos/receipts/print-server` (via fetch, admin session auth) |

**Data Loading:**
- On dialog open → `GET /api/pos/transactions/{id}` → returns `{ data, receipt_config, review_urls }`
- Client-side generates QR code images via `QRCode.toDataURL()` (Google + Yelp)
- Client-side calls `generateReceiptHtml(tx, config, images)` with QR images
- **Does NOT generate barcode image** — no bwip-js import

---

### 1.3 Customer Portal Transactions (Inline Dialog)

**File:** `src/app/(account)/account/transactions/page.tsx`

**Actions Available:** Print (copier), Email

| Button | Function | Code Path |
|--------|----------|-----------|
| Print | `handleReceiptPrint()` | Client-side: uses pre-generated `receiptHtml` → window.open() → window.print() |
| Email | `handleReceiptEmail()` | `POST /api/pos/receipts/email` (via fetch, customer session auth) |
| SMS | N/A | Not available in customer portal |
| Receipt | N/A | Not available in customer portal (no thermal printer access) |

**Data Loading:**
- On dialog open → `GET /api/customer/transactions/{id}` → returns `{ data, receipt_config }`
- **No `review_urls` returned** — customer API does not fetch review URLs
- Client-side calls `generateReceiptHtml(tx, config)` — **NO images passed** (no QR, no barcode)

---

### 1.4 Admin Settings — Receipt Printer (Test/Preview)

**File:** `src/app/admin/settings/receipt-printer/page.tsx`

**Actions Available:** Preview (dialog), Test Print (thermal)

| Button | Function | Code Path |
|--------|----------|-----------|
| Preview | `handlePreview()` | Client-side: `generateReceiptHtml(sampleTx, config, reviewImages)` → dialog |
| Test Print | `handleTestPrint()` | Client-side: `generateReceiptLines()` → `receiptToEscPos()` → direct POST to print server |

**Data Loading:**
- Loads review URLs from `business_settings` on mount
- Pre-generates QR images via `QRCode.toDataURL()`
- Uses sample transaction data (not real transactions)
- **Does NOT generate barcode** — no bwip-js usage

---

### 1.5 Quotes (NOT receipt-related)

**Files:**
- `src/app/pos/components/quotes/quote-detail.tsx`
- `src/app/pos/components/quotes/quote-ticket-panel.tsx`

Quotes have their own send dialog for email/SMS delivery but these are **quote documents, not receipts**. They use separate API routes (`/api/pos/quotes/...`) and separate templates. Not in scope for this audit.

---

## 2. Code Path Traces

### 2.1 Print (Copier/Browser) — Three Different Paths

#### Path A: POS ReceiptOptions → `/api/pos/receipts/html`
1. `handleCopierPrint()` opens popup window
2. Fetches `GET /api/pos/receipts/html?transaction_id=...`
3. **Server-side** generates QR codes (QRCode.toDataURL) and barcode (bwip-js)
4. **Server-side** calls `generateReceiptHtml(tx, merged, images)` with all images
5. Returns full HTML page → browser print dialog
6. **Result:** Logo ✅, Barcode ✅, QR codes ✅, Full color ✅

#### Path B: Admin ReceiptDialog → Client-side HTML
1. `handleCopierPrint()` opens popup window
2. Uses pre-generated `receiptHtml` (generated during dialog open)
3. **Client-side** QR codes generated (QRCode.toDataURL)
4. **Client-side** barcode NOT generated (no bwip-js import)
5. `generateReceiptHtml(tx, config, images)` called with QR images but NO barcode
6. **Result:** Logo ✅, Barcode ❌, QR codes ✅, Full color ✅

#### Path C: Customer Portal → Client-side HTML
1. `handleReceiptPrint()` opens popup window
2. Uses pre-generated `receiptHtml` (generated during dialog open)
3. **No images generated at all** — no QR codes, no barcode
4. `generateReceiptHtml(tx, config)` called with NO images parameter
5. **Result:** Logo ✅, Barcode ❌, QR codes ❌, Full color ✅

### 2.2 Receipt (Thermal Printer) — Two Paths

#### Path A: POS ReceiptOptions + Admin ReceiptDialog → `/api/pos/receipts/print-server`
1. POST with `{ transaction_id }`
2. **Server-side** fetches transaction, receipt config, review URLs
3. Calls `generateReceiptLines(tx, merged, context)` with review URLs as context
4. Calls `receiptToEscPos(lines, 48)` — generates QR codes inline via raster bitmap
5. Sends ESC/POS binary to print server
6. **Result:** Logo (via futurePRNT NV) ✅, Barcode (via ESC/POS `GS k`) ✅, QR codes (raster) ✅, Bold ✅

#### Path B: Admin Settings Test Print → Direct to print server
1. Client-side calls `generateReceiptLines(sampleTx, config, reviewContext)`
2. Client-side calls `receiptToEscPos(lines, 48)`
3. Client-side POSTs binary to print server URL directly
4. Uses sample data (not real transaction)
5. **Result:** Logo (via futurePRNT NV) ✅, Barcode ✅, QR codes ✅, Bold ✅

### 2.3 Copier Print (Print Server PDF) — One Path

#### `/api/pos/receipts/print-copier`
1. POST with `{ transaction_id }`
2. **Server-side** generates QR codes and barcode (same as `/html` route)
3. Calls `generateReceiptHtml(tx, merged, images)` with all images
4. Modifies HTML: removes gray background, adds black border, adds `@page` size
5. Sends JSON `{ html }` to print server `/print-copier` endpoint for PDF conversion
6. **Result:** Logo ✅, Barcode ✅, QR codes ✅, Full color ✅

### 2.4 Email — One Path

#### `/api/pos/receipts/email`
1. POST with `{ transaction_id, email }`
2. **Server-side** generates QR codes and barcode (same pattern as `/html`)
3. Calls `generateReceiptHtml(tx, merged, images)` with all images
4. Also generates plaintext fallback
5. Sends via `sendEmail()` (Mailgun) with HTML body + plaintext fallback
6. **Result:** Logo ✅, Barcode ✅, QR codes ✅, Full color ✅

### 2.5 SMS — One Path

#### `/api/pos/receipts/sms`
1. POST with `{ transaction_id, phone }`
2. **Server-side** fetches review URLs as context
3. Calls `generateReceiptLines(tx, merged, context)` — QR/barcode are line objects
4. Calls `receiptToPlainText(lines, 40)` — QR rendered as URL text, barcode as `[number]`
5. Sends via `sendSms()` (Twilio)
6. **Result:** Logo N/A, Barcode (text fallback) ✅, QR (URL text) ✅, Plain text only

---

## 3. Comparison Table

| Feature | POS Print (browser) | Admin Print (browser) | Customer Print (browser) | POS/Admin Thermal | Admin Test Print | Copier Print (server) | Email | SMS |
|---------|--------------------|-----------------------|--------------------------|-------------------|------------------|-----------------------|-------|-----|
| **Logo** | YES (img tag) | YES (img tag) | YES (img tag) | YES (NV memory) | YES (NV memory) | YES (img tag) | YES (img tag) | N/A |
| **Barcode** | YES (bwip-js server) | **NO** (missing) | **NO** (missing) | YES (GS k ESC/POS) | YES (GS k ESC/POS) | YES (bwip-js server) | YES (bwip-js server) | Text fallback |
| **QR Codes** | YES (server QRCode) | YES (client QRCode) | **NO** (missing) | YES (raster bitmap) | YES (raster bitmap) | YES (server QRCode) | YES (server QRCode) | URL text |
| **Review URLs fetched** | YES (server) | YES (via /transactions API) | **NO** (not returned) | YES (server) | YES (on mount) | YES (server) | YES (server) | YES (server) |
| **receipt_images passed** | YES (all 3) | Partial (QR only) | **NO** (none) | N/A (uses context) | N/A (uses context) | YES (all 3) | YES (all 3) | N/A (uses context) |
| **Phone formatted** | YES | YES | YES | YES | YES (sample) | YES | YES | YES |
| **Vehicle line** | YES | YES | YES | YES | YES (sample) | YES | YES | YES |
| **Custom text zones** | YES | YES | YES | YES | YES | YES | YES | YES |
| **Bold text** | YES (HTML) | YES (HTML) | YES (HTML) | YES (ESC/POS) | YES (ESC/POS) | YES (HTML) | YES (HTML) | N/A |
| **Color output** | YES | YES | YES | N/A (thermal) | N/A (thermal) | YES | YES | N/A |
| **Dark mode support** | YES (CSS media) | YES (CSS media) | YES (CSS media) | N/A | N/A | NO (removed) | YES (CSS media) | N/A |
| **Auth method** | POS HMAC | Admin session | Customer RLS | POS/Admin | Direct (no auth) | POS/Admin | POS/Admin/Customer | POS/Admin |
| **HTML generation** | Server-side | Client-side | Client-side | N/A | N/A | Server-side | Server-side | N/A |

---

## 4. Shared vs Duplicate Components

### 4.1 Shared Components

| Component/Function | File | Used By |
|-------------------|------|---------|
| `generateReceiptHtml()` | `src/app/pos/lib/receipt-template.ts` | ALL HTML paths (server API routes + client components) |
| `generateReceiptLines()` | `src/app/pos/lib/receipt-template.ts` | Thermal print route, SMS route, admin test print |
| `receiptToEscPos()` | `src/app/pos/lib/receipt-template.ts` | Thermal print route, admin test print |
| `receiptToPlainText()` | `src/app/pos/lib/receipt-template.ts` | SMS route |
| `fetchReceiptConfig()` | `src/lib/data/receipt-config.ts` | ALL API routes + admin settings page |
| `resolveShortcodes()` | `src/app/pos/lib/receipt-template.ts` | Via `getZonesForPlacement()` in all paths |

### 4.2 Duplicate Implementations

| Pattern | Instances | Files |
|---------|-----------|-------|
| **Transaction fetch query** (same `.select()` with relations) | 5× duplicated | `print-server/route.ts`, `html/route.ts`, `email/route.ts`, `sms/route.ts`, `print-copier/route.ts` |
| **Review URL fetch** (same `business_settings` query) | 5× duplicated | `print-server/route.ts`, `html/route.ts`, `email/route.ts`, `sms/route.ts`, `print-copier/route.ts` |
| **QR code generation** (same `QRCode.toDataURL()` calls) | 4× duplicated | `html/route.ts`, `email/route.ts`, `print-copier/route.ts`, `receipt-dialog.tsx` |
| **Barcode generation** (same bwip-js call) | 3× duplicated | `html/route.ts`, `email/route.ts`, `print-copier/route.ts` |
| **Auth check pattern** (POS + admin fallback) | 5× duplicated | All 5 receipt API routes |
| **Transaction-to-ReceiptTransaction mapping** | 7× duplicated | All API routes + `receipt-dialog.tsx` + customer portal |
| **Receipt dialog UI** (buttons, input fields, state) | 2× (partially) | `receipt-dialog.tsx` vs customer portal inline implementation |

### 4.3 Separate API Routes (All Under `/api/pos/receipts/`)

| Route | Purpose | Unique Logic |
|-------|---------|--------------|
| `GET /api/pos/receipts/html` | Browser print HTML | Returns text/html |
| `POST /api/pos/receipts/print-server` | Thermal printer | ESC/POS binary → print server |
| `POST /api/pos/receipts/print-copier` | Copier PDF print | HTML → print server PDF conversion |
| `POST /api/pos/receipts/email` | Email delivery | HTML + plaintext → Mailgun |
| `POST /api/pos/receipts/sms` | SMS delivery | Plain text → Twilio |
| `POST /api/pos/receipts/cash-drawer` | Cash drawer kick | ESC/POS drawer command only |

---

## 5. Discrepancy List

### DISCREPANCY 1: Admin ReceiptDialog Missing Barcode
- **What:** `receipt-dialog.tsx` generates QR codes client-side but does NOT generate barcode images
- **Where:** `src/components/admin/receipt-dialog.tsx` lines 88-96
- **Correct path:** `/api/pos/receipts/html` (line 69-80) generates barcode via bwip-js
- **Missing:** `import bwipjs from 'bwip-js'` and barcode generation block
- **Impact:** Admin transactions and customer detail pages show receipts without barcode
- **Fix:** Add bwip-js import and generate `images.barcode` before calling `generateReceiptHtml()`

### DISCREPANCY 2: Customer Portal Missing QR Codes AND Barcode
- **What:** Customer portal calls `generateReceiptHtml(tx, config)` with NO `images` parameter
- **Where:** `src/app/(account)/account/transactions/page.tsx` line 122
- **Correct path:** Admin dialog at least generates QR images
- **Missing:** No QRCode import, no bwip-js import, no image generation, no review URL fetch
- **Impact:** Customer portal receipts have no barcode, no QR codes for reviews
- **Fix:** Either generate images client-side (like admin dialog) or fetch review URLs from API

### DISCREPANCY 3: Customer Portal API Missing Review URLs
- **What:** `GET /api/customer/transactions/{id}` returns `{ data, receipt_config }` but NOT `review_urls`
- **Where:** `src/app/api/customer/transactions/[id]/route.ts` line 74-77
- **Correct path:** `GET /api/pos/transactions/{id}` returns `{ data, receipt_config, review_urls }`
- **Missing:** Review URL query + `review_urls` in response
- **Impact:** Even if client-side QR generation were added, there are no URLs to generate from
- **Fix:** Add review URL fetch to customer transaction API (same pattern as POS transaction API)

### DISCREPANCY 4: Client-Side vs Server-Side HTML Generation Split
- **What:** POS `handleCopierPrint()` fetches server-rendered HTML via `/api/pos/receipts/html`, but Admin ReceiptDialog and Customer Portal generate HTML client-side
- **Impact:** Server-side has access to bwip-js (Node.js library), while client-side does not — causing the barcode gap. Also means admin/customer paths have slightly different rendering timing.
- **Why it matters:** bwip-js is a server-only library (uses Node.js Buffer). Client-side would need a different barcode library or the server must provide the barcode image.

### DISCREPANCY 5: Admin Test Print Uses Direct Print Server Access
- **What:** Admin settings Test Print bypasses the `/api/pos/receipts/print-server` route entirely — generates ESC/POS client-side and POSTs directly to the print server
- **Where:** `src/app/admin/settings/receipt-printer/page.tsx` lines 482-514
- **Impact:** Works for test purposes but bypasses server auth. Uses sample data so not a real problem, but it's a different code path.

### DISCREPANCY 6: Duplicate Transaction-to-ReceiptTransaction Mapping
- **What:** The same 15-field mapping from database transaction to `ReceiptTransaction` interface is copy-pasted 7 times across different files
- **Impact:** Maintenance risk — if `ReceiptTransaction` interface changes, 7 places need updating
- **Files:** All 5 API routes, `receipt-dialog.tsx`, customer portal

---

## 6. Unification Plan

### Phase 1: Fix Barcode in Admin ReceiptDialog (Quick Win)

**File:** `src/components/admin/receipt-dialog.tsx`

1. Add `import bwipjs from 'bwip-js'` — **PROBLEM:** bwip-js requires Node.js Buffer, won't work client-side
2. **Alternative:** Use `bwip-js/browser` or pre-generate barcode on the server

**Recommended approach:** Change the admin dialog data-loading to call `/api/pos/receipts/html` (like POS does) to get server-rendered HTML, rather than generating HTML client-side. This eliminates the client-side dependency entirely.

### Phase 2: Fix Customer Portal Missing Images

**File:** `src/app/api/customer/transactions/[id]/route.ts`

1. Add review URL fetch (copy from `/api/pos/transactions/[id]/route.ts`)
2. Return `review_urls` in response

**File:** `src/app/(account)/account/transactions/page.tsx`

1. Option A: Generate QR images client-side (like admin dialog) — still can't do barcode
2. Option B (recommended): Fetch server-rendered HTML from a new endpoint or extend existing one

### Phase 3: Extract Shared Transaction Fetch Helper

Create `src/lib/data/receipt-data.ts`:

```typescript
export async function fetchTransactionForReceipt(supabase, transactionId) {
  // 1. Fetch transaction with relations
  // 2. Fetch receipt config
  // 3. Fetch review URLs
  // 4. Generate QR + barcode images
  // 5. Map to ReceiptTransaction
  // Returns: { tx, config, images, context }
}
```

This eliminates the 5× duplicated transaction fetch + review URL fetch + image generation across API routes.

### Phase 4: Unify Client-Side Print to Use Server-Rendered HTML

Change Admin ReceiptDialog and Customer Portal to fetch HTML from `/api/pos/receipts/html` instead of generating client-side:

1. Remove `generateReceiptHtml` imports from client components
2. Remove `QRCode` import from `receipt-dialog.tsx`
3. Both dialogs fetch HTML from server on open (like POS already does for Print)
4. Display fetched HTML in preview
5. Print button uses same HTML
6. Email/SMS/Receipt buttons already use server-side API routes — no change needed

**Benefits:**
- Single source of truth for HTML rendering (server-side)
- All images (barcode, QR) generated server-side with Node.js libraries
- No client-side QR/barcode library dependencies
- Consistent output across all touchpoints

### Phase 5: Extract Shared Auth Check

Create auth helper that handles the POS-or-admin auth check pattern, used by all 5 receipt routes:

```typescript
export async function authenticateReceiptRequest(request: NextRequest) {
  const posEmployee = authenticatePosRequest(request);
  if (posEmployee) return { type: 'pos', employee: posEmployee };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { type: 'admin', user };
  return null;
}
```

### Priority Order

1. **Phase 1+2** (Critical): Fix barcode and QR gaps — customers/admins see incomplete receipts
2. **Phase 4** (High): Unify to server-side rendering — prevents future drift
3. **Phase 3** (Medium): Extract shared helper — reduces duplication
4. **Phase 5** (Low): Extract auth helper — minor cleanup

---

## 7. File Inventory

### Files That Need Changes (for unification)

| File | Change |
|------|--------|
| `src/components/admin/receipt-dialog.tsx` | Fetch HTML from server instead of client-side generation |
| `src/app/(account)/account/transactions/page.tsx` | Fetch HTML from server instead of client-side generation |
| `src/app/api/customer/transactions/[id]/route.ts` | Add review_urls to response (if keeping client-side gen) |
| `src/app/api/pos/receipts/html/route.ts` | Possibly add customer auth support |
| `src/lib/data/receipt-data.ts` | **NEW** — shared transaction fetch + image gen helper |

### Files That Are Correct (no changes needed)

| File | Why |
|------|-----|
| `src/app/pos/components/receipt-options.tsx` | Uses server API for all actions |
| `src/app/api/pos/receipts/print-server/route.ts` | Full server-side generation |
| `src/app/api/pos/receipts/print-copier/route.ts` | Full server-side generation |
| `src/app/api/pos/receipts/email/route.ts` | Full server-side generation |
| `src/app/api/pos/receipts/sms/route.ts` | Full server-side generation |
| `src/app/pos/lib/receipt-template.ts` | Core template engine — correct |
| `src/lib/data/receipt-config.ts` | Config fetcher — correct |
| `src/app/admin/settings/receipt-printer/page.tsx` | Test/preview only — acceptable |
