# Phase 8 — Job Management & Photo Documentation

> Reference document for the Smart Details Auto Spa job management system.
> This phase transforms the POS from a register-only tool into a full detailing workflow
> with intake documentation, job tracking, mid-service upsells, and photo galleries.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Detailer Workflow](#detailer-workflow)
5. [Jobs Tab (POS)](#jobs-tab-pos)
6. [Intake Flow](#intake-flow)
7. [Zone System](#zone-system)
8. [Camera & Photo Capture](#camera--photo-capture)
9. [Photo Annotations](#photo-annotations)
10. [Job Timer](#job-timer)
11. [Mid-Service Upsell & Authorization](#mid-service-upsell--authorization)
12. [AI Handling of Authorization Replies](#ai-handling-of-authorization-replies)
13. [Job Completion & Customer Notifications](#job-completion--customer-notifications)
14. [Pickup Sign-Off](#pickup-sign-off)
15. [Checkout Integration](#checkout-integration)
16. [Admin Photo Gallery](#admin-photo-gallery)
17. [Customer Detail — Photos Tab](#customer-detail--photos-tab)
18. [Customer Portal — Photo History](#customer-portal--photo-history)
19. [Public Gallery / Portfolio](#public-gallery--portfolio)
20. [Storage Strategy](#storage-strategy)
21. [Permissions & Feature Flags](#permissions--feature-flags)
22. [Session Breakdown](#session-breakdown)
23. [Open Questions & Future Enhancements](#open-questions--future-enhancements)

---

## Overview

**What this phase builds:**
- A `jobs` table that becomes the central record linking appointments, transactions, customers, vehicles, photos, and add-ons
- A "Jobs" tab in the POS where detailers manage their daily workflow
- Structured photo documentation with intake (pre-service) and completion (post-service) photo requirements
- A zone-based body diagram system for tagging photos to specific vehicle areas
- A job timer for tracking time spent per vehicle
- A mid-service upsell flow: detailer flags an issue → sends photo + estimate to customer → customer approves/declines via web link or SMS → approved work appends to the ticket
- AI-powered handling of customer SMS replies to upsell authorizations
- Customer notifications on job completion with before/after photos
- Admin photo gallery, customer detail photos tab, customer portal photo history, and a public-facing portfolio/showcase page

**Why it matters for an auto detailing business:**
- Intake photos protect against "that scratch wasn't there before" disputes
- Minimum photo requirements enforce quality documentation standards
- Mid-service upsells generate incremental revenue from work already in progress
- Before/after galleries are the #1 conversion tool for detailing businesses
- Job timers provide data for pricing accuracy and staff efficiency over time
- The `jobs` table bridges the gap between appointments and transactions — currently they're somewhat disconnected

---

## Architecture

### Central Entity: `jobs`

The `jobs` table is the backbone. Every vehicle service event creates a job record:

```
Appointment (booked online/phone)  ──→  Job  ──→  Transaction (payment at checkout)
Walk-in (created in POS)           ──→  Job  ──→  Transaction (payment at checkout)
```

A job always has: customer, vehicle, one or more services.
A job optionally has: appointment link (if booked), transaction link (set at checkout), add-ons (mid-service upsells).

### Where Things Live

| Component | Location | Accessed By |
|-----------|----------|-------------|
| Jobs tab (queue + workflow) | POS app (`/pos/jobs`) | Detailers |
| Job detail + intake + timer | POS app (`/pos/jobs/[id]`) | Detailers |
| Authorization page | Public page (`/authorize/[token]`) | Customers |
| Admin photo gallery | Admin (`/admin/photos`) | Managers/Admin |
| Customer photos tab | Admin (`/admin/customers/[id]` → Photos tab) | Managers/Admin |
| Customer portal photos | Portal (`/portal/photos`) | Customers |
| Public gallery | Public page (`/gallery`) | Everyone (SEO) |

### Integration Points

- **Appointments**: When a confirmed appointment's date arrives, a `job` record is auto-created (or created on-demand when detailer opens it)
- **POS Register**: At checkout, the cashier sees the completed job with all line items (original services + approved add-ons). Payment creates a `transaction` linked to the job.
- **AI Messaging**: The `buildSystemPrompt()` function injects pending authorization context when a customer has an active upsell request
- **SMS/Email**: Twilio for SMS (via existing `sendSms()`), Mailgun for email. Authorization links, completion notifications, and photo share links all go through existing sending infrastructure.
- **Lifecycle Engine**: New trigger type `job_completed` can fire lifecycle rules (e.g., "Send review request 30 min after job completion")
- **QBO Sync**: Transactions from jobs sync to QBO via existing fire-and-forget hooks — no changes needed

---

## Database Schema

### `jobs` table

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  assigned_staff_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'intake', 'in_progress', 'pending_approval', 'completed', 'closed', 'cancelled')),
  
  -- Services (JSON array of service IDs + names + prices for the job)
  services JSONB NOT NULL DEFAULT '[]',
  
  -- Timer
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  timer_seconds INTEGER NOT NULL DEFAULT 0,
  timer_paused_at TIMESTAMPTZ,
  
  -- Intake
  intake_started_at TIMESTAMPTZ,
  intake_completed_at TIMESTAMPTZ,
  intake_notes TEXT,
  
  -- Pickup
  estimated_pickup_at TIMESTAMPTZ,
  actual_pickup_at TIMESTAMPTZ,
  pickup_notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_appointment ON jobs(appointment_id);
CREATE INDEX idx_jobs_assigned_staff ON jobs(assigned_staff_id);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_date_status ON jobs(created_at, status);
```

### `job_photos` table

```sql
CREATE TABLE job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Classification
  zone TEXT NOT NULL,  -- e.g., 'exterior_front', 'interior_seats_front'
  phase TEXT NOT NULL CHECK (phase IN ('intake', 'progress', 'completion')),
  
  -- Storage
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  storage_path TEXT NOT NULL,
  
  -- Metadata
  notes TEXT,
  annotation_data JSONB,  -- Array of {type: 'circle'|'arrow'|'text', x, y, ...}
  is_featured BOOLEAN NOT NULL DEFAULT false,  -- Show on public gallery
  is_internal BOOLEAN NOT NULL DEFAULT false,   -- Internal only, don't show customer
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_job_photos_job ON job_photos(job_id);
CREATE INDEX idx_job_photos_job_phase ON job_photos(job_id, phase);
CREATE INDEX idx_job_photos_featured ON job_photos(is_featured) WHERE is_featured = true;
CREATE INDEX idx_job_photos_zone ON job_photos(job_id, zone, phase);
```

### `job_addons` table

```sql
CREATE TABLE job_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- What's being proposed
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  custom_description TEXT,  -- For free-form line items
  price DECIMAL(10,2) NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Authorization
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  authorization_token TEXT NOT NULL UNIQUE,
  message_to_customer TEXT,  -- The message sent with the upsell
  
  -- Timing
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  pickup_delay_minutes INTEGER DEFAULT 0,  -- Additional time for this addon
  
  -- Photos attached to this addon request
  photo_ids UUID[] DEFAULT '{}',  -- References job_photos.id
  
  -- Tracking
  customer_notified_via TEXT[],  -- ['sms', 'email']
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_job_addons_job ON job_addons(job_id);
CREATE INDEX idx_job_addons_status ON job_addons(status);
CREATE INDEX idx_job_addons_token ON job_addons(authorization_token);
CREATE INDEX idx_job_addons_pending ON job_addons(status, expires_at) WHERE status = 'pending';
```

### Migration for `business_settings` seeds

```sql
-- Authorization expiration (minutes)
INSERT INTO business_settings (key, value)
VALUES ('addon_auth_expiration_minutes', '"30"')
ON CONFLICT (key) DO NOTHING;

-- Minimum intake photos per zone group
INSERT INTO business_settings (key, value)
VALUES ('min_intake_photos_exterior', '"4"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_intake_photos_interior', '"2"')
ON CONFLICT (key) DO NOTHING;

-- Same minimums for completion photos
INSERT INTO business_settings (key, value)
VALUES ('min_completion_photos_exterior', '"4"')
ON CONFLICT (key) DO NOTHING;

INSERT INTO business_settings (key, value)
VALUES ('min_completion_photos_interior', '"2"')
ON CONFLICT (key) DO NOTHING;
```

---

## Detailer Workflow

The complete detailer flow from start to finish:

```
1. VIEW JOB QUEUE
   Detailer opens Jobs tab → sees today's jobs assigned to them
   Status: [Scheduled]

2. START INTAKE
   Taps job → taps "Start Intake"
   Status: [Scheduled] → [Intake]
   - Walk-around the vehicle with zone-based photo capture
   - Document existing damage (dents, scratches, dirt level)
   - Minimum: 4 exterior zones + 2 interior zones
   - Add notes per photo, annotate damage with circles/arrows
   - Tap "Complete Intake" when done (enforces minimums)

3. BEGIN WORK
   Taps "Start Work" → timer begins
   Status: [Intake] → [In Progress]
   - Timer visible on job card, persists across navigation
   - Detailer performs the booked services

4. FLAG ISSUE (optional, repeatable)
   At any point during work, detailer spots something
   - Taps "Flag Issue" → snaps photo → annotates
   - Selects service/product from catalog OR enters custom line item + price
   - Optional discount
   - Selects/writes message template
   - System calculates pickup delay from catalog duration (editable)
   - Taps "Send to Customer"
   Status: stays [In Progress], job card shows "Pending Authorization" badge
   
   Customer receives: SMS + email with photo, description, price, new ETA
   Customer responds via:
   a) Web link (approve/decline buttons) — preferred path
   b) SMS reply — AI handles (see AI section below)
   
   Addon expires after configurable timeout (default 30 min):
   - Auto-declined
   - Flagged as "Recommended for next visit" on customer record
   - Detailer notified

5. COMPLETE JOB
   Taps "Complete Job" → after-photos flow
   - Same zone picker: 4 exterior + 2 interior minimum
   - Side-by-side preview: intake photo vs completion photo per zone
   - Timer stops, total time recorded
   Status: [In Progress] → [Completed]
   
   Auto-notification to customer:
   - SMS + email: "Your vehicle is ready for pickup!"
   - Includes 1 before/after exterior + 1 before/after interior
   - Link to full photo gallery for the job

6. CUSTOMER PICKUP
   Customer arrives → cashier/detailer taps "Customer Pickup"
   - Timestamp recorded
   - Optional notes field ("customer satisfied", "noted concern about X")

7. CHECKOUT / CLOSE
   Cashier processes payment through existing POS register
   - Job line items (services + approved addons) populate the ticket
   - Standard POS payment flow
   - Transaction links to job
   Status: [Completed] → [Closed]
```

---

## Jobs Tab (POS)

### Location
New tab in POS navigation: **Jobs** (alongside existing POS tabs)

### Queue View (Default)
- Shows today's jobs for the logged-in staff member
- Filter pills: **My Jobs** (default) | **All Jobs** | **Unassigned**
- Each job card shows:
  - Customer name + vehicle (year/make/model/color)
  - Services booked (comma-separated)
  - Status pill (color-coded): Scheduled (gray), Intake (blue), In Progress (yellow), Pending Approval (orange), Completed (green), Closed (slate)
  - Assigned detailer name
  - Estimated pickup time
  - Time in progress (if timer is running)
  - Badge: 🔔 if addon pending authorization
- Sort: by status priority (In Progress first, then Intake, Scheduled, etc.)
- Tap a job → opens job detail view

### Walk-In Creation
- "New Walk-in" button at top of job queue → navigates to `/pos/quotes?mode=builder&walkIn=true`
- Uses the full Quote Builder in "walk-in mode": vehicle-size-aware pricing, scope tiers, per-unit quantities, products, coupons, loyalty points, manual discounts, custom items
- Walk-in mode UI changes: header shows "New Walk-In", hides "Valid Until" date picker and "Send Quote" button, shows single "Create Job" button
- On submit: saves quote as `status='converted'` for audit trail, then creates job via `POST /api/pos/jobs` with `quote_id` reference
- Customer required (validation enforced), at least one service required
- Products on quotes don't transfer to jobs — toast notifies user "Products will be added at checkout"
- Coupon code stored in job notes as "Coupon: {code}" for cashier reference at checkout
- Walk-in jobs have `appointment_id = NULL`
- Old walk-in wizard (`walk-in-flow.tsx`) removed — quote builder fully replaces it

### Quote-to-Job Conversion
- "Create Job" button on quote detail view for quotes in `draft`, `sent`, `viewed`, or `accepted` status
- Requires `pos.jobs.manage` permission and quote must have a customer
- Maps service items to job services, creates job via `POST /api/pos/jobs`, updates quote status to `converted`
- Duplicate prevention: server-side check rejects if a job already exists with the same `quote_id`
- `jobs.quote_id` FK column links job back to source quote for audit trail

### Auto-Population from Appointments
- Today's confirmed appointments auto-create `jobs` records
- Trigger: either a cron that runs at start of business day, or on-demand when the Jobs tab loads and finds confirmed appointments without corresponding jobs
- Appointment data maps to job: customer_id, vehicle_id, services (from appointment line items), assigned_staff_id (from appointment's assigned staff), estimated_pickup_at (appointment end time)
- Cancelled/no-show appointments do NOT create jobs

---

## Intake Flow

### Entry Point
Detailer taps "Start Intake" on a job card → `intake_started_at` set → status → `intake`

### Zone Picker UI
- Full-screen (or large modal) zone picker
- Simple SVG body diagram of a vehicle (top-down and side views) — not photorealistic, clean line art
- Tappable zone hotspots overlaid on the diagram
- Each zone shows:
  - Zone label (e.g., "Hood", "Driver Side")
  - Photo count badge (e.g., "3")
  - Green checkmark when at least 1 photo captured
  - Red outline if zone is in the "required minimum" set and not yet captured
- Two tabs/sections: **Exterior** | **Interior**
- Progress bar at top: "4/4 Exterior • 1/2 Interior" with color coding

### Minimum Requirements (configurable via business_settings)
- **Exterior**: 4 zones minimum (out of 8 available)
- **Interior**: 2 zones minimum (out of 7 available)
- Detailer chooses WHICH zones to photograph — not forced into specific ones
- "Complete Intake" button disabled until minimums met
- Can always take more photos than the minimum

### Intake Completion
- Tap "Complete Intake" → `intake_completed_at` set
- Status remains `intake` until detailer taps "Start Work"
- Intake photos are timestamped — this is the legal record of vehicle condition at drop-off

---

## Zone System

### Exterior Zones (8)

| Zone Key | Label | Description |
|----------|-------|-------------|
| `exterior_front` | Front | Front bumper, grille, headlights |
| `exterior_rear` | Rear | Rear bumper, taillights, exhaust area |
| `exterior_driver_side` | Driver Side | Full driver side profile |
| `exterior_passenger_side` | Passenger Side | Full passenger side profile |
| `exterior_hood` | Hood | Hood surface, common for paint issues |
| `exterior_roof` | Roof | Roof panel, often neglected |
| `exterior_trunk` | Trunk/Tailgate | Trunk lid or tailgate |
| `exterior_wheels` | Wheels & Tires | All wheels, tire condition, brake dust |

### Interior Zones (7)

| Zone Key | Label | Description |
|----------|-------|-------------|
| `interior_dashboard` | Dashboard | Dash, instrument cluster, vents |
| `interior_console` | Center Console | Shifter, cup holders, armrest |
| `interior_seats_front` | Front Seats | Driver and passenger seats |
| `interior_seats_rear` | Rear Seats | Back seat area |
| `interior_carpet` | Carpet/Floor | Floor mats, carpet, pedal area |
| `interior_door_panels` | Door Panels | All 4 door interiors |
| `interior_trunk_cargo` | Trunk/Cargo | Trunk liner, cargo area |

### Zone Groups (for minimum enforcement)
- **Exterior group**: All `exterior_*` zones → minimum configurable (default 4)
- **Interior group**: All `interior_*` zones → minimum configurable (default 2)
- Enforcement counts unique zones with at least 1 photo, not total photo count

---

## Camera & Photo Capture

### Capture Method
- HTML5 `<input type="file" accept="image/*" capture="environment">` for rear camera on iPad/mobile
- Falls back to file picker on desktop
- Tap zone → camera opens → snap → preview screen

### Preview Screen
- Full-size preview of captured photo
- Options: **Retake** | **Add Annotation** | **Save**
- Notes field (optional): free-text description of what's in the photo
- "Internal Only" toggle: when ON, photo is never shown to customer (for internal documentation only)

### Processing Pipeline
1. Client captures photo (native resolution)
2. Client-side: generate a preview/thumbnail for immediate display
3. Upload to Supabase Storage `job-photos/` bucket
4. Server-side processing (via API route):
   - Resize to max 1920px width (maintain aspect ratio)
   - JPEG quality 80%
   - Generate 400px thumbnail
   - Store both in `job-photos/{job_id}/{uuid}.jpg` and `job-photos/{job_id}/{uuid}_thumb.jpg`
5. Save record to `job_photos` table with URLs

### Multiple Photos Per Zone
- Allowed and encouraged (e.g., 3 angles of the same dent)
- Zone badge shows total count
- Photos within a zone have `sort_order` for consistent display

---

## Photo Annotations

### Tools
Simple canvas overlay on the captured/saved photo:
- **Circle**: Tap to place, drag to resize. Highlights damage areas.
- **Arrow**: Tap start point, drag to end point. Points to specific features.
- **Text Label**: Tap to place, type short label (e.g., "rock chip", "swirl marks")

### Storage
- Annotations stored as JSON in `job_photos.annotation_data`:
```json
[
  { "type": "circle", "x": 450, "y": 300, "radius": 80, "color": "#FF0000" },
  { "type": "arrow", "x1": 200, "y1": 150, "x2": 350, "y2": 280, "color": "#FF0000" },
  { "type": "text", "x": 400, "y": 500, "label": "Deep scratch", "color": "#FF0000" }
]
```
- Rendered as SVG overlay wherever the photo is displayed
- Non-destructive: original photo is untouched, annotations are a separate layer

### Design Priorities
- **Speed over polish.** This can't slow down the detailer. Simple tap-to-place, no complex editing.
- Default color: red (high contrast on most vehicle colors)
- Undo last annotation button
- "Clear All" option

---

## Job Timer

### Behavior
- Starts when detailer taps "Start Work" → `work_started_at` set
- Visible as a running clock on the job detail card: `HH:MM:SS`
- Persists across navigation (stored in DB, not just client state)
- Survives browser refresh, tab close, app restart

### Pause/Resume
- Detailer can pause timer (breaks, lunch, waiting on parts)
- Pause: `timer_paused_at` set, accumulated seconds saved to `timer_seconds`
- Resume: elapsed pause time discarded, `timer_paused_at` cleared, timer resumes from `timer_seconds`
- Visual indicator when paused (pulsing/dimmed timer display)

### Storage Pattern
```
timer_seconds = total accumulated work seconds (updated on pause and on completion)
work_started_at = when current work period began (reset on resume)
timer_paused_at = when paused (NULL when running)

Display formula:
  If paused: timer_seconds (static display)
  If running: timer_seconds + (now - work_started_at)
```

### Multi-Detailer (Future)
Current design: single timer per job. The timer tracks total wall-clock work time on the vehicle.

Future enhancement when multiple detailers are common: `job_staff_time` table tracking per-staff time segments. Not built in this phase.

### Completion
- Timer stops when detailer taps "Complete Job"
- Final `timer_seconds` calculated and stored
- `work_completed_at` set
- Timer data available in reporting (future: staff efficiency, pricing accuracy)

---

## Mid-Service Upsell & Authorization

### Detailer Flow

1. During `in_progress` status, detailer taps **"Flag Issue"** button
2. Camera opens → snap photo of the issue → optional annotation
3. **Select what to propose:**
   - **From catalog**: Search/browse existing services or products. Price auto-fills from catalog.
   - **Custom line item**: Free-text description + manual price entry.
4. **Optional discount**: Flat dollar amount off. Detailer has full authority — no manager approval needed.
5. **Pickup delay**: Auto-calculated from catalog service duration. Editable by detailer. Shows new estimated pickup time.
6. **Message to customer**: 
   - Pre-built templates (selectable):
     - "We noticed [issue] during your [service]. We can take care of it today for [price]."
     - "Your vehicle could really benefit from [service]. Here's what we found:"
     - "During our inspection we found [issue]. We recommend [service] for [price] — shall we go ahead?"
   - Or write a custom message
   - Template variables auto-fill: `{issue}`, `{service}`, `{price}`, `{delay}`, `{new_eta}`
7. **Preview screen**: Shows exactly what the customer will see (photo, message, price, buttons)
8. Tap **"Send to Customer"** → creates `job_addons` record with `status = 'pending'`

### Customer Experience

**SMS** (via `sendSms()` with MMS):
```
Hi {first_name}, our team found something during your detail today.

{custom_message}

Price: ${price} (${discount} off)
Additional time: ~{delay} minutes
New pickup ETA: {new_eta}

View details & approve: {authorization_link}
```

**Email** (via Mailgun):
- Same content with richer formatting
- Embedded photo(s)
- Prominent Approve / Decline buttons

**Authorization Page** (`/authorize/[token]`):
- Public page (no login required), accessed via unique token
- Shows:
  - Photo(s) with annotations
  - Issue description / proposed service
  - Price (original - discount = final)
  - Estimated additional time
  - New pickup ETA
  - Vehicle and current services for context
- Two buttons: **Approve** | **Decline**
- Optional: "Have a question?" text field → sends message to the conversation
- Approved → addon status `approved`, detailer notified (in-app badge + console log for now)
- Declined → addon status `declined`, detailer notified, flagged as "Recommended for next visit"
- Token is one-time use per status change (can re-visit page but can't re-approve/re-decline)

### Expiration

- Configurable via `business_settings.addon_auth_expiration_minutes` (default: 30)
- Background check: either a cron job or checked on-demand when job detail loads
- When expired:
  - Addon status → `expired`
  - Detailer sees "Authorization expired" on the job
  - Customer link shows "This authorization has expired"
  - Issue flagged as "Recommended for next visit" on customer/vehicle record
- Detailer can re-send a new authorization for the same issue if needed

### Multiple Addons
- A job can have multiple pending/approved addons
- Each is independent — customer approves/declines each separately
- Total pickup delay = sum of all approved addon delays
- All approved addons appear as line items at checkout

---

## AI Handling of Authorization Replies

### Problem
Customer receives the authorization SMS and replies via text instead of clicking the link. The AI auto-responder needs to understand the context and handle approvals/declines correctly.

### Solution
Follows the same pattern as auto-quote (`[GENERATE_QUOTE]` block parsing).

### Context Injection
When `buildSystemPrompt()` runs for a customer with a pending addon:

```
PENDING SERVICE AUTHORIZATION:
This customer has a pending add-on authorization for their current vehicle service visit.
- Add-on: {service/product name or custom description}
- Price: ${price} (${discount} off if applicable)  
- Proposed by: {detailer name}
- Sent: {time ago}
- Expires: {expiry time}
- Authorization ID: {addon_id}

RULES:
- If the customer says yes, approve, go ahead, do it, sounds good, or similar affirmative → confirm you'll let the team know and output [AUTHORIZE_ADDON:{addon_id}]
- If the customer says no, decline, skip it, not today, or similar negative → acknowledge gracefully, mention they can get it done next visit, and output [DECLINE_ADDON:{addon_id}]
- If they ask questions about the service, timing, or price → answer from the context above. Be helpful and informative.
- You CANNOT negotiate price. If they push back on cost, empathize and suggest they call the shop to discuss options.
- If they ask "how long will it take?" → tell them the estimated additional time ({delay} minutes).
- If they ask "when will my car be ready?" → tell them the new ETA ({new_eta}).
- Only output the [AUTHORIZE_ADDON] or [DECLINE_ADDON] block ONCE per addon.
```

### Webhook Parsing
In `src/app/api/webhooks/twilio/inbound/route.ts`, add parsing for:
- `[AUTHORIZE_ADDON:uuid]` → call `approveAddon(addonId)` → updates status, notifies detailer, sends confirmation SMS
- `[DECLINE_ADDON:uuid]` → call `declineAddon(addonId)` → updates status, notifies detailer, flags for next visit

Same pattern as `extractQuoteRequest()` — the AI output contains a structured block that the webhook parser catches and processes programmatically.

### Edge Cases
- **Multiple pending addons**: AI context includes ALL pending addons. Customer must reference which one, or if only 1 pending, AI assumes that one.
- **Already responded**: If addon is no longer `pending` (already approved/declined/expired), AI says "It looks like that's already been taken care of" and doesn't output any block.
- **Expired while customer is replying**: Check status before processing. If expired, inform customer and offer to have the shop re-send.
- **AI disabled on conversation**: If staff took over (`is_ai_enabled = false`), authorization SMS replies go to staff inbox — no AI involvement.

---

## Job Completion & Customer Notifications

### Completion Photo Flow
1. Detailer taps **"Complete Job"**
2. Same zone picker opens but for `completion` phase (after photos)
3. **Side-by-side preview**: each zone shows intake photo next to the completion photo being taken — helps detailer verify the transformation is captured
4. Same minimums as intake: 4 exterior + 2 interior zones
5. "Complete Job" button only enables once minimums met
6. Timer stops → `work_completed_at` set → final `timer_seconds` calculated
7. Status → `completed`

### Customer Notification (auto-triggered on completion)

**SMS** (via `sendSms()` with MMS for the photos):
```
Hi {first_name}! Your {vehicle_info} is all done and looking amazing! 🚗✨

Here's a preview of the results:
{before_after_link}

Ready for pickup at {business_name}.
```

**Email** (via Mailgun):
- Before/after photo pair embedded (one exterior, one interior)
- "View All Photos" button linking to the full gallery
- Job summary: services performed, total time, any approved add-ons

### Photo Selection for Notifications
- **Auto-selection** (default): System picks the first intake + first completion photo from the exterior group, and same from interior group — 2 before/after pairs
- **Detailer override**: During completion flow, detailer can tap "Select showcase photos" to pick which pairs to feature in the notification
- **Featured flag**: Selected photos get `is_featured = true`

### Customer-Facing Photo Gallery Page
- Public page at `/jobs/[token]/photos` (unique per job, token in jobs table or derived)
- Shows all non-internal photos grouped by zone
- Before/after slider (draggable divider) per zone
- Job summary: services, date, vehicle
- No login required — link shared via SMS/email
- Read-only — customer can view but not modify

---

## Pickup Sign-Off

### When Customer Arrives
- Cashier or detailer taps **"Customer Pickup"** on the completed job
- `actual_pickup_at` timestamp recorded
- Optional `pickup_notes` field: "Customer satisfied", "Customer noted concern about X", etc.
- This creates a paper trail: intake photos (drop-off condition) → completion photos (after service) → pickup timestamp

### Liability Chain
```
Drop-off: intake_started_at + intake photos (pre-service condition documented)
Service: work_started_at → work_completed_at (timer + any progress photos)
Completion: completion photos (post-service condition documented)  
Pickup: actual_pickup_at + pickup notes (customer acknowledged vehicle)
```

If a customer claims damage after pickup, the full photo timeline exists as evidence.

---

## Checkout Integration

### How Jobs Connect to POS Register

1. Job reaches `completed` status → shows in POS register as ready for checkout
2. Cashier opens the job (or it auto-loads when customer is looked up)
3. **Pre-populated ticket** with:
   - Original booked services (from `jobs.services` JSONB)
   - Approved add-ons (from `job_addons` where `status = 'approved'`)
   - Discounts applied to add-ons
   - Products from linked quote (via `quote_id` → `quote_items` where `product_id IS NOT NULL`)
   - Coupon code from linked quote (via `quote_id` → `quotes.coupon_code`)
4. Cashier can still modify the ticket (add/remove items, apply coupons) — standard POS flow
5. Payment processed via existing POS transaction flow
6. Transaction created → `jobs.transaction_id` set → job status → `closed`

### Product & Coupon Bridge (Quote → Job → Checkout)

Jobs only store **services** as JSONB snapshots. Products and coupons from the original quote are **not duplicated** into the job record. Instead, they're bridged at checkout time via the `quote_id` FK:

```
Quote (services + products + coupon_code)
  ↓ Create Job
Job (services JSONB only, quote_id FK)
  ↓ Checkout Items API
Ticket (services from job + products from quote_items + coupon from quotes.coupon_code)
```

**API**: `GET /api/pos/jobs/[id]/checkout-items`
- Loads services from `jobs.services` JSONB
- Loads approved addons from `job_addons`
- If `job.quote_id` exists:
  - Queries `quotes.coupon_code` for auto-apply at register
  - Queries `quote_items` where `product_id IS NOT NULL` for product line items
- Returns unified `items[]` array + `coupon_code` field

**Coupon persistence**: The `quotes.coupon_code` column (TEXT, nullable) stores the coupon code applied during quote creation. All quote save paths (Save Draft, Send Quote, Create Job) persist this value. The register's coupon validation system re-validates and applies the discount at checkout time.

### Key Rule
The job system generates line items, but the POS register remains the single source of truth for payment. No payment logic lives in the jobs system.

---

## Admin Photo Gallery

### Location
`/admin/photos` — new page in admin navigation

### Features
- Grid view of all job photos across all jobs
- Filters:
  - Date range picker
  - Customer search
  - Vehicle search
  - Service type
  - Zone (dropdown of all zones)
  - Phase: Intake / Progress / Completion
  - Staff member (who took the photo)
- Bulk select mode:
  - Toggle "Feature on website" for multiple photos at once
  - Bulk download (future enhancement)
- Photo detail modal:
  - Full-size photo with annotation overlay
  - Metadata: job link, customer, vehicle, zone, phase, notes, taken by, timestamp
  - Toggle: Featured / Internal Only
  - Link to the job detail

---

## Customer Detail — Photos Tab

### Location
6th tab on `/admin/customers/[id]` (after existing: Info, Vehicles, Loyalty, History, Quotes)

### Features
- Photos grouped by job/visit date (most recent first)
- Each group shows: date, vehicle, services performed, job status
- Within each group: before/after pairs by zone
- **Before/After comparison slider** — draggable divider showing intake vs completion side by side
- Filter by vehicle (if customer has multiple)
- Full vehicle condition history over time — same zone across multiple visits shows progression

---

## Customer Portal — Photo History

### Location
`/portal/photos` — new page in customer portal navigation

### Features
- Customer sees their own photo history (only jobs linked to their customer_id)
- Grouped by visit date
- Before/after slider per zone
- Excludes photos marked `is_internal = true`
- Download option per photo or per visit (zip future enhancement)

---

## Public Gallery / Portfolio

### Location
`/gallery` or `/our-work` — public SEO page

### Features
- Showcases jobs where at least one photo has `is_featured = true`
- Grid layout with before/after slider component (draggable divider)
- Filter by service type (ceramic coating, paint correction, full detail, etc.)
- Each showcase card: service name, vehicle type, before/after pair
- No customer names or identifying info shown — just the vehicle and the work
- SEO optimized: meta tags, structured data, lazy-loaded images
- Controlled by `photo_gallery` feature flag (new, Future category)

### Before/After Slider Component
- Reusable component: `<BeforeAfterSlider beforeSrc={} afterSrc={} />`
- Draggable vertical divider with "Before" / "After" labels
- Touch-friendly for mobile/iPad
- Used in: public gallery, customer detail photos tab, customer portal, job completion preview, authorization page

---

## Storage Strategy

### Supabase Storage
- Bucket: `job-photos` (new)
- Path pattern: `{job_id}/{uuid}.jpg` (full size) and `{job_id}/{uuid}_thumb.jpg` (thumbnail)
- Same auth pattern as existing `product-images` and `service-images` buckets
- Public read access for photos (needed for SMS MMS, email embeds, public gallery)
- Authenticated write access (only POS-authenticated staff can upload)

### Image Processing
- **Upload**: Full resolution from camera
- **Server-side resize**: Max 1920px width, maintain aspect ratio, JPEG quality 80%
- **Thumbnail**: 400px width for gallery grid views
- **Average photo**: ~200-400KB after compression (1920px JPEG 80%)
- **Estimated volume**: 10 cars/day × 12 photos/car = 120 photos/day × 300KB = ~36MB/day ≈ 1GB/month

### Why Not S3?
Supabase Storage IS S3 under the hood. Using the Supabase SDK keeps auth, uploads, and URL generation consistent with the existing product/service image patterns. If volume grows significantly, the underlying storage can be pointed at your own S3 bucket without changing application code.

---

## Permissions & Feature Flags

### New Feature Flag
- `photo_documentation` — gates the entire Jobs tab in POS and admin photo gallery
- Category: Core POS
- Default: enabled

- `photo_gallery` — gates the public `/gallery` page
- Category: Future
- Default: disabled (enable when ready to launch publicly)

### New POS Permissions
| Permission Key | Description | Default |
|----------------|-------------|---------|
| `pos.jobs.view` | View the Jobs tab and job queue | Allowed for all POS roles |
| `pos.jobs.manage` | Create walk-in jobs, start intake, begin work, complete jobs, reassign detailer | Allowed for Detailer, Manager, Owner |
| `pos.jobs.flag_issue` | Create mid-service upsell requests | Allowed for Detailer, Manager, Owner |
| `pos.jobs.cancel` | Cancel jobs (destructive action, separately grantable) | Allowed for Manager, Owner |

### New Admin Permissions
| Permission Key | Description | Default |
|----------------|-------------|---------|
| `admin.photos.view` | View admin photo gallery | Allowed for Manager, Admin, Owner |
| `admin.photos.manage` | Toggle featured/internal, bulk actions | Allowed for Admin, Owner |

---

## Session Breakdown

### Session 1 — Foundation: Schema + Jobs Tab + Auto-Population
- Database migrations: `jobs`, `job_photos`, `job_addons` tables + business_settings seeds
- Feature flags: `photo_documentation`, `photo_gallery`
- POS permissions: `pos.jobs.*`
- Jobs tab UI: queue view with status pills, filters, sort
- Walk-in creation flow
- Auto-population from appointments (today's confirmed → job records)
- Job detail view (shell — no intake or timer yet)

### Session 2 — Intake Flow + Camera + Zones
- Zone picker UI with SVG body diagram
- Camera integration (HTML5 capture)
- Photo upload to Supabase Storage with server-side resize + thumbnail
- `job_photos` CRUD API
- Photo annotation tool (circle, arrow, text)
- Minimum enforcement logic
- Intake completion flow
- Photo gallery component (reusable for all contexts)

### Session 3 — Timer + In-Progress + Mid-Service Upsell
- Job timer (start, pause, resume, stop)
- "Flag Issue" flow: camera → catalog/custom selection → discount → pickup delay → template message → preview → send
- `job_addons` CRUD API
- Authorization page (`/authorize/[token]`): public page with approve/decline
- SMS + email sending for authorization requests (via existing `sendSms()` + Mailgun)
- Authorization expiration logic (cron or on-demand check)
- Addon status change notifications to detailer (in-app)

### Session 4 — AI Authorization + Completion + Notifications
- AI context injection for pending addons (`buildSystemPrompt()`)
- Webhook parser for `[AUTHORIZE_ADDON:id]` and `[DECLINE_ADDON:id]`
- Completion photo flow (zone picker, minimums, side-by-side preview)
- Customer notification on completion (SMS with MMS + email)
- Customer-facing photo gallery page (`/jobs/[token]/photos`)
- Before/after slider component
- Pickup sign-off
- Checkout integration (job line items → POS ticket)

### Session 5 — Admin Gallery + Customer Photos + Public Showcase
- Admin photo gallery (`/admin/photos`) with filters and bulk actions
- Customer detail "Photos" tab (6th tab)
- Customer portal photo history (`/portal/photos`)
- Public gallery page (`/gallery`) with before/after sliders
- Feature flag gating for public gallery
- SEO optimization for public gallery
- CLAUDE.md updates: Phase 8 → Done

---

## Open Questions & Future Enhancements

### Decided
- ✅ Multi-detailer: supported in future, single timer for now
- ✅ Walk-ins: created from Jobs tab, same intake flow as appointments
- ✅ Discount authority: detailer has full authority, no manager approval
- ✅ Storage: Supabase Storage (S3 under the hood)
- ✅ Pickup delay: auto-calculated from catalog duration, editable by detailer
- ✅ Job assignment: auto-assigned from appointment (existing logic), unassigned jobs claimable

### Future Enhancements (Not in Phase 8)
- **Per-staff time tracking**: `job_staff_time` table for multi-detailer time allocation
- **Photo AI analysis**: Use Claude vision to auto-detect damage severity, suggest services
- **Customer signature capture**: Digital sign-off at drop-off and pickup
- **Bulk photo download**: Zip download per job or per customer
- **Recurring condition tracking alerts**: "This scratch has been documented for 3 visits — suggest repair"
- **Staff performance from timer data**: Average time per service type, efficiency metrics
- **Photo quality enforcement**: AI check that photo actually shows the labeled zone (not blurry/dark)
- **Video capture**: Short clips for major transformations
- **Automated before/after social media posts**: Select best pairs → post to Instagram/Facebook


### Claude Sessions - Execution Strategy
5 sessions total. Here's the dependency map:Session 1 — SOLO (must run first)
Schema, migrations, feature flags, permissions, Jobs tab UI, walk-in creation, auto-population from appointments. Everything else depends on these tables and the Jobs tab shell.Session 2 — SOLO (must run after Session 1)
Camera capture, photo upload pipeline, zone picker UI, annotations, intake flow. Modifies the job detail page that Session 1 creates.Session 3 — SOLO (must run after Session 2)
Timer, "Flag Issue" upsell flow, authorization page, addon expiration. Modifies the same job detail page and needs the camera/photo system from Session 2.Session 4 + Session 5 — RUN CONCURRENTLY ✅
These two don't touch the same files:

Session 4: AI authorization handling (modifies messaging-ai.ts + inbound webhook), completion photo flow (modifies job detail page), customer notifications, pickup sign-off, checkout integration
Session 5: All brand new standalone pages — admin photo gallery (/admin/photos), customer detail Photos tab, customer portal photos, public gallery (/gallery), before/after slider component
Session 5's galleries will initially only show intake photos until Session 4's completion flow exists, but that's fine — the pages will work and populate fully once both are done.

Summary:
Session 1  →  Session 2  →  Session 3  →  Session 4 ──→ Done
                                          Session 5 ──→ Done
                                          (run 4+5 together)
                                          
Total wall time: 4 rounds instead of 5.

### Session Structure: 5 Sessions
Sessions 1–4 must run sequentially — each one modifies the job detail page, adds to the same API routes, and builds on components from the prior session. Running them concurrently would cause merge conflicts.

Session 5 can be split into 3 concurrent sub-prompts since they're all NEW pages writing to completely separate files:
RoundSessionsModeWhyRound 1Session 1 — Schema + Jobs TabSoloCreates all tables, permissions, jobs queue. Everything depends on this.Round 2Session 2 — Intake + Camera + ZonesSoloBuilds zone picker, camera, photo upload. Modifies job detail page from Session 1.Round 3Session 3 — Timer + Upsell + AuthorizationSoloUses camera components from Session 2. Adds timer + auth page. Modifies job detail page.Round 4Session 4 — AI + Completion + NotificationsSoloModifies webhook parser, AI prompt, adds completion flow to job detail.Round 5Session 5A + 5B + 5C — GalleriesRun all 3 at same time5A = Admin gallery, 5B = Customer photos tabs, 5C = Public gallery. All NEW pages, zero file overlap.

Total: 4 solo rounds + 1 parallel round = 7 prompts, but only 5 wait cycles.