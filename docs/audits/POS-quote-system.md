# POS Quotes System — Complete Audit

> **Date:** 2026-03-28
> **Scope:** Quote editing flow, list UI, data model, voice agent integration, and improvement plan
> **Status:** Read-only audit — no code changes

---

## Table of Contents

1. [Quote Edit Flow](#1-quote-edit-flow)
2. [Quote List UI — Current State](#2-quote-list-ui--current-state)
3. [Quote Detail Page](#3-quote-detail-page)
4. [Database Schema](#4-database-schema)
5. [Public Quote Page](#5-public-quote-page)
6. [API Endpoints](#6-api-endpoints)
7. [Voice Agent Quote Integration](#7-voice-agent-quote-integration)
8. [Gaps & Missing Features](#8-gaps--missing-features)
9. [Improvement Plan](#9-improvement-plan)

---

## 1. Quote Edit Flow

### How Editing Works in POS

The POS quote builder (`src/app/pos/components/quotes/quote-builder.tsx`) loads an existing quote into a ticket panel. Staff can add/remove services and products, change customer/vehicle, adjust notes and validity, then save.

**Load existing quote** (lines 39-126):
1. `GET /api/pos/quotes/{quoteId}` fetches full quote with items, customer, vehicle
2. Maps database `quote_items` → React `TicketItem` format
3. Dispatches `LOAD_QUOTE` action to populate the ticket panel state

**Save edited quote** (ticket-panel lines 191-261):
- **Existing quote**: `PATCH /api/pos/quotes/{quoteId}` with updated items, customer, vehicle, notes
- **New quote**: `POST /api/pos/quotes` to create
- Items are **fully replaced** on edit (delete all old `quote_items`, insert new list)
- `access_token` is **preserved** — customer's existing link shows updated items

**Resend after edit** (send-dialog lines 28-59):
- `POST /api/pos/quotes/{quoteId}/send` with `{ method: 'email' | 'sms' | 'both' }`
- Generates short link via `createShortLink()`
- SMS: "Estimate {number} from {business}\nTotal: {amount}\n\nView: {shortLink}"
- Email: templated or hardcoded HTML with full quote details
- Records in `quote_communications`
- Status updates: if draft → sets to `sent`. If already sent/viewed/accepted → preserves current status

### Quote Service — Update Logic (`src/lib/quotes/quote-service.ts:229-324`)

1. Fetch current quote (verify exists, not deleted)
2. Build update payload (only provided fields)
3. If items provided: delete ALL existing `quote_items` → insert new items → recalculate subtotal/tax/total
4. Tax only applied to product items (not services)
5. Update quote record, return with full relations

### Key Implementation Details

- **Access token never changes** — generated once at creation (6-char random string), persists through all edits
- **Full item replacement** — no item-level patching, entire items array is replaced on each save
- **Status-based actions**: Draft (edit, send, convert, delete), Sent/Viewed (edit, resend, convert), Accepted (edit, convert), Expired (re-quote only), Converted (read-only)

---

## 2. Quote List UI — Current State

### POS Quotes List (`src/app/pos/components/quotes/quote-list.tsx`)

| Feature | Status |
|---------|--------|
| Search by quote #, customer name, phone | Yes |
| Status filter tabs | Yes — All, Draft, Sent, Viewed, Accepted |
| Pagination (20/page) | Yes |
| Date range filter | No |
| Column sorting | No |
| Bulk actions | No |

**Table columns:** Date, Quote #, Customer, Services, Vehicle, Status, Total

### Admin Quotes List (`src/app/admin/quotes/page.tsx`)

| Feature | Status |
|---------|--------|
| Search by quote #, customer name | Yes (no phone search) |
| Status filter dropdown | Yes |
| Date range filter (from/to) | Yes |
| Pagination (20/page) | Yes |
| Column sorting | No |
| Bulk actions | No |
| Pipeline stats (per-status cards) | Yes — count + total value per status |
| Quote metrics | Yes — avg value, booking rate, avg days to convert, total count |

**Table columns:** Date, Quote #, Customer, Services, Vehicle, Status, Total, Days Open, Sends, Actions

### Status Column Problem

The current status model conflates two different concepts in one column:

| Value | What It Represents | Type |
|-------|-------------------|------|
| `draft` | Created, not sent | Business action |
| `sent` | Delivered to customer | Business action |
| `viewed` | Customer opened the link | Customer action |
| `accepted` | Customer clicked Accept | Customer action |
| `converted` | Turned into appointment/job | Business action |
| `expired` | Validity period passed | System state (not automated) |

These shouldn't be in the same column. A customer-viewed quote is still "Sent" from the business perspective — the viewing is engagement data, not a status change.

---

## 3. Quote Detail Page

### Admin Detail (`src/app/admin/quotes/[id]/page.tsx`)

**Displayed information:**
- Customer card: name, phone, email, member since, last visit, lifetime spend, loyalty points, visit count, vehicle
- Services table: item name, tier, notes, quantity, unit price, total price, subtotal, tax, grand total
- Details card: created date, valid until, viewed at, accepted at, notes, last contacted (sent_at)
- Communication history: channel (email/SMS icon), sent_to, status (sent/failed), error, timestamp

**Actions:** Status badge (display only), Edit in POS, View in POS, Copy public link

### POS Detail (`src/app/pos/components/quotes/quote-detail.tsx`)

**Status-based actions:**
- Draft: Edit, Send, Convert to Appointment, Create Job, Delete
- Sent/Viewed: Edit, Resend, Convert to Appointment, Create Job
- Accepted: Edit, Convert to Appointment, Create Job
- Expired: Re-Quote
- Converted: Read-only with linked appointment/job reference

---

## 4. Database Schema

### `quotes` Table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| quote_number | TEXT UNIQUE NOT NULL | Auto-generated (e.g., QT-001) |
| customer_id | UUID NOT NULL FK | References customers |
| vehicle_id | UUID FK | References vehicles |
| status | quote_status enum | draft, sent, viewed, accepted, converted, expired |
| subtotal | DECIMAL(10,2) | Sum of all items |
| tax_amount | DECIMAL(10,2) | Tax on product items only |
| total_amount | DECIMAL(10,2) | Subtotal + tax |
| notes | TEXT | Free-form notes |
| valid_until | TIMESTAMPTZ | Expiration date |
| sent_at | TIMESTAMPTZ | First send timestamp |
| viewed_at | TIMESTAMPTZ | First customer view |
| accepted_at | TIMESTAMPTZ | Customer acceptance |
| converted_appointment_id | UUID FK | References appointments |
| access_token | TEXT | 6-char public access token |
| coupon_code | TEXT | Applied coupon |
| created_by | UUID FK | Employee who created |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ | Soft delete |

### `quote_items` Table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| quote_id | UUID NOT NULL FK | Cascades on delete |
| service_id | UUID FK | Optional |
| product_id | UUID FK | Optional |
| item_name | TEXT NOT NULL | Display name |
| quantity | INTEGER | Default 1 |
| unit_price | DECIMAL(10,2) | |
| total_price | DECIMAL(10,2) | quantity × unit_price |
| tier_name | TEXT | e.g., sedan, truck_suv |
| notes | TEXT | Item-level notes |

### `quote_communications` Table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| quote_id | UUID NOT NULL FK | Cascades on delete |
| channel | TEXT | 'email' or 'sms' |
| sent_to | TEXT NOT NULL | Email or phone |
| status | TEXT | 'sent' or 'failed' |
| error_message | TEXT | Only if failed |
| message | TEXT | Message body (used for dedup tags like [reminder]) |
| sent_by | UUID FK | Employee who triggered |
| created_at | TIMESTAMPTZ | |

---

## 5. Public Quote Page

**URL:** `/quote/[access_token]`
**File:** `src/app/(public)/quote/[token]/page.tsx`

**Customer view:** Business header, quote number, customer/vehicle info, services table, totals, notes, Accept button (only if sent or viewed status)

**Tracking:**
- Accessing page: sets `viewed_at` and status → `viewed` (first view only)
- Accepting: sets `accepted_at` and status → `accepted`, fires webhook, sends SMS confirmation to customer + staff

---

## 6. API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/pos/quotes` | GET | List with filters, search, pagination | POS HMAC |
| `/api/pos/quotes` | POST | Create new quote | POS + quotes.create |
| `/api/pos/quotes/[id]` | GET | Fetch detail | POS |
| `/api/pos/quotes/[id]` | PATCH | Update quote (items, customer, etc.) | POS |
| `/api/pos/quotes/[id]` | DELETE | Soft-delete (draft only) | POS |
| `/api/pos/quotes/[id]/send` | POST | Send via email/SMS/both | POS + quotes.send |
| `/api/pos/quotes/[id]/convert` | POST | Convert to appointment | POS + quotes.convert |
| `/api/pos/quotes/[id]/communications` | GET | Communication history | POS |
| `/api/admin/quotes` | GET | Admin list with filters | Admin auth |
| `/api/admin/quotes/stats` | GET | Pipeline stats + metrics | Admin auth |
| `/api/quotes/[id]/accept` | POST | Customer accepts (public) | access_token |
| `/api/quotes/[id]/pdf` | GET | Generate PDF | access_token |

---

## 7. Voice Agent Quote Integration

### Current State

The voice agent creates quotes via two paths:
- `send_quote_sms` tool (mid-call) → `POST /api/voice-agent/send-quote-sms` → creates new quote + sends SMS
- `autoGenerateQuote()` in `voice-post-call.ts` → creates new quote after call ends

Both always create **new** quotes. There is no update/edit capability from the voice agent.

### Can the Voice Agent Reuse the POS Edit Flow?

**Yes — the infrastructure exists**, but auth is the blocker:
- POS endpoints use HMAC auth (`authenticatePosRequest()`)
- Voice agent endpoints use API key auth (`validateApiKey()`)
- The voice agent can't call POS endpoints directly

**To enable voice agent quote editing:**
1. Create a new endpoint: `PATCH /api/voice-agent/quotes/[id]` with API key auth
2. Reuse the existing `updateQuote()` from `src/lib/quotes/quote-service.ts` (shared service function)
3. Reuse `sendQuote()` from `src/lib/quotes/send-service.ts` to resend
4. Add a new ElevenLabs tool: `update_quote` that accepts quote_id + items to add/remove
5. The customer's existing link auto-shows updated items (access_token preserved)

**Alternative (simpler):** When the voice agent detects a customer has a recent quote and wants to add a service, expire the old quote and create a new one with all items. Customer gets a new link. Old link shows expired. This requires zero new endpoints — just logic in `autoGenerateQuote()` to check for recent quotes and merge items. ~20 lines.

**Recommendation:** Defer to post-launch. The POS edit flow handles quote modifications for now. Voice agent quote editing is a convenience, not a requirement.

---

## 8. Gaps & Missing Features

### Data Model Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| No quote expiration automation | High | `valid_until` exists but nothing sets status to `expired` |
| No decline tracking | Medium | No mechanism for customer to decline or staff to mark lost |
| No quote version history | Medium | Edits overwrite — no way to see previous versions |
| Only first view tracked | Low | `viewed_at` captures first view only, no repeat view count |
| No response time metrics | Low | No calculated field for time between send and first view |
| No source tracking | Low | Can't tell if quote originated from phone call, SMS, walk-in, admin |

### UI/UX Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Status column conflates business and customer actions | High | See Section 2 analysis |
| No column sorting | Medium | Can't sort by date, total, status, etc. |
| No "hot quotes" indicator | Medium | Viewed-but-not-accepted quotes are warmest leads — no visual indicator |
| Admin list missing phone search | Low | POS has it, admin doesn't |
| No bulk actions | Low | Can't select multiple quotes for bulk send/delete |
| No CSV export | Low | |
| No "Download PDF" button | Low | PDF endpoint exists but no UI button in detail view |

### Functionality Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Expired quotes never auto-marked | High | Show as "Sent" forever after valid_until passes |
| No follow-up automation for accepted-but-not-converted | Medium | Accepted quotes sit until staff manually checks |
| No customer notification on quote edit + resend | Low | If quote is edited after sending, customer isn't notified of changes |

---

## 9. Improvement Plan

### Priority Assessment

This is a thorough audit. CC's priority ranking is spot on. Here's my take on what matters most and what to defer:

**Priority 1 (Status Model)** is the right call but scope it carefully. The current enum has 6 values: draft, sent, viewed, accepted, converted, expired. CC suggests separating quote state from customer engagement. The cleanest approach is NOT changing the database enum — that's a risky migration touching every query. Instead, keep the enum as-is but change how the UI presents it:

- List view status column shows the "business state" — Draft, Sent, Converted, Expired
- When a sent quote has been viewed, show a small eye icon next to "Sent"
- When a sent/viewed quote has been accepted, show "Accepted" as a highlighted badge (this IS an actionable state — staff needs to convert it)
- The filter tabs become: All, Draft, Active (sent+viewed), Accepted, Converted, Expired

This is a frontend-only change. Zero database migration. Zero API changes.

**Priority 2 (Activity Timeline)** is high value and builds on existing data. The timestamps already exist (created_at, sent_at, viewed_at, accepted_at) and quote_communications tracks sends. You just need to stitch them into a chronological list in the detail view. Maybe 40-50 lines of frontend code. The one missing piece is view count — right now viewed_at only tracks first view. Adding a view_count integer column is a tiny migration and a one-line increment in the public quote page.

**Priority 3 (Enhanced List View)** — do the quick wins now, defer the rest. Typeahead search and column sorting are standard patterns. Date range filter is useful. Phone in the customer column is a one-line change. The "hot quotes" highlight is clever — quotes viewed in the last 24-48 hours but not accepted are your warmest leads. All of these are frontend changes against the existing API.

**Priority 4 (Voice Agent Quote Editing)** — defer to post-launch. The infrastructure exists but it needs a new auth-compatible endpoint. Not a launch blocker.

**Priority 5 (Minor UX)** — the expired quote cron is the only one I'd pull forward. If valid_until passes and nothing updates the status, expired quotes show as "Sent" forever. A simple cron that runs daily and marks expired quotes would clean up the list view automatically. That's 15 lines in a cron route.

### Recommended Session Plan

- **Session 14A** — Quote list view overhaul: status column redesign, engagement icons, phone in customer column, filter tabs (All/Draft/Active/Accepted/Converted/Expired), column sorting, typeahead search, "hot quotes" visual indicator
- **Session 14B** — Quote detail overhaul: activity timeline, view count tracking, engagement summary, follow-up suggestions
- **Session 14C** — Quote expiration cron + date range filters + any polish from 14A/14B testing

---

## File Reference

| Purpose | Path |
|---------|------|
| POS quotes page | `src/app/pos/quotes/page.tsx` |
| POS quote list | `src/app/pos/components/quotes/quote-list.tsx` |
| POS quote detail | `src/app/pos/components/quotes/quote-detail.tsx` |
| POS quote builder | `src/app/pos/components/quotes/quote-builder.tsx` |
| POS quote ticket panel | `src/app/pos/components/quotes/quote-ticket-panel.tsx` |
| POS quote send dialog | `src/app/pos/components/quotes/quote-send-dialog.tsx` |
| Quote context (state) | `src/app/pos/context/quote-context.tsx` |
| Quote service (CRUD) | `src/lib/quotes/quote-service.ts` |
| Quote send service | `src/lib/quotes/send-service.ts` |
| Quote convert service | `src/lib/quotes/convert-service.ts` |
| Admin quotes list | `src/app/admin/quotes/page.tsx` |
| Admin quote detail | `src/app/admin/quotes/[id]/page.tsx` |
| Public quote page | `src/app/(public)/quote/[token]/page.tsx` |
| Quote accept endpoint | `src/app/api/quotes/[id]/accept/route.ts` |
| POS quotes API | `src/app/api/pos/quotes/route.ts` |
| POS quote CRUD API | `src/app/api/pos/quotes/[id]/route.ts` |
| POS quote send API | `src/app/api/pos/quotes/[id]/send/route.ts` |
| Voice agent quote SMS | `src/app/api/voice-agent/send-quote-sms/route.ts` |
| Voice post-call auto-quote | `src/lib/services/voice-post-call.ts` |
| DB schema reference | `docs/dev/DB_SCHEMA.md` |
