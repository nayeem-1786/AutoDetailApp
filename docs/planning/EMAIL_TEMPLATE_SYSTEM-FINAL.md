# Email Templates + Brand Kit + Drip Sequences — Merged Final Plan

## Context

All 8+ email-sending locations use inline HTML strings hardcoded in API routes. No template management — changing any email requires code changes. Campaign emails are bare `<p>` tags with no branding. The lifecycle engine only sends SMS, not email. The quote sender bypasses `sendEmail()` entirely.

This system unifies everything: **Brand Kit** (global colors/logo/fonts), **Layout Templates** (structural HTML frames), **Content Templates** (block-based editable emails), **Segment Routing** (right template for right customer), **Drip Campaigns** (multi-step automated sequences with stop conditions), and **Gallery Photo Integration** (before/after pairs in email).

**Out of scope:** POS receipts — `generateReceiptHtml()` serves triple duty (thermal printer, POS dialog preview, and emailed receipt) and stays untouched. All three receipt outputs continue using the existing Receipt Printer settings system. The email template system does NOT touch receipts.

---

## Architecture: Three Layers

```
LAYER 1: Brand Kit (global settings — colors, logo, fonts, social links)
    ↓ inherited by
LAYER 2: Layout Templates (email_layouts table — header/body/footer frames, admin-editable colors)
    ↓ wraps
LAYER 3: Content Templates (editable email content using block editor)
    ↓ referenced by
    ├── Campaigns (copy blocks on use)
    ├── Automations (live reference to template_id)
    ├── Drip Sequences (live reference per step)
    └── Transactional senders (fallback to hardcoded if not customized)
```

---

## LAYER 1: Brand Kit

### Storage
`business_settings` table with keys prefixed `email_brand_*`:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `email_brand_primary_color` | string | `#1a1a2e` | Header background, primary buttons |
| `email_brand_accent_color` | string | `#CCFF00` | Secondary buttons, link highlights |
| `email_brand_text_color` | string | `#333333` | Body text |
| `email_brand_bg_color` | string | `#f5f5f5` | Email outer background |
| `email_brand_font_family` | string | `Arial, Helvetica, sans-serif` | Email-safe fonts only |
| `email_brand_logo_url` | string | (from receipt_config) | Reuse existing logo — single source of truth |
| `email_brand_logo_width` | number | `200` | Logo width in pixels |
| `email_brand_social_google` | string | (from google_review_url) | Google Business URL |
| `email_brand_social_yelp` | string | (from yelp_review_url) | Yelp page URL |
| `email_brand_social_instagram` | string | `""` | Instagram URL |
| `email_brand_social_facebook` | string | `""` | Facebook URL |
| `email_brand_footer_text` | string | `""` | Optional custom footer line |

### Admin UI
**Location:** Marketing > Email Templates > Brand Settings tab

- Color pickers for primary, accent, text, background
- Logo preview (pulls from receipt_config — single source of truth)
- Social link inputs
- Font selector dropdown (email-safe only: Arial, Georgia, Verdana, Tahoma, Times New Roman)
- Live preview panel showing a sample email with current brand settings

### Why This Matters
Every email — marketing, transactional, automation — inherits these values. Change the logo once, every email updates. Change the primary color, all buttons update. No per-email styling decisions.

---

## LAYER 2: Layout Templates

### What They Are
3 pre-built HTML email skeletons stored in the **`email_layouts` database table**. Each layout defines a structural frame (where the logo goes, how the header looks, where content sits, what the footer contains) plus layout-specific color overrides that layer on top of the Brand Kit defaults.

### Database Schema

**`email_layouts`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT NOT NULL | "Standard", "Minimal", "Promotional" |
| slug | TEXT UNIQUE NOT NULL | `standard`, `minimal`, `promotional` |
| description | TEXT | Use case description |
| structure_html | TEXT NOT NULL | HTML skeleton with `{{PLACEHOLDER}}` slots |
| color_overrides | JSONB DEFAULT '{}' | Layout-specific color overrides (layered on Brand Kit) |
| header_config | JSONB | `{ show_logo, logo_position, show_title, title_style }` |
| footer_config | JSONB | `{ show_social, compact, custom_text }` |
| is_default | BOOLEAN DEFAULT false | One layout marked default |
| created_at, updated_at | TIMESTAMPTZ | |

### Three Layouts (seeded at migration)

| Layout | Style | Use Case |
|--------|-------|----------|
| **Standard** | Logo centered in header band (primary_color bg), white content area, full footer with social icons | Transactional, review requests, general |
| **Minimal** | No header band — logo top-left small, clean white with subtle border, compact footer | Booking confirmations, stock alerts, internal notifications |
| **Promotional** | Full-width hero area (optional), bold header, prominent CTA styling, "View in browser" link, larger footer with social grid | Campaigns, win-back, seasonal, drip sequences |

### How They Work
Each layout's `structure_html` contains double-brace placeholder slots:

```html
{{LOGO_HTML}}
{{HEADER_CONTENT}}
{{BODY_CONTENT}}
{{FOOTER_CONTENT}}
{{UNSUBSCRIBE_LINK}}
{{PRIMARY_COLOR}} → resolved from Brand Kit (or layout color_overrides)
{{ACCENT_COLOR}} → resolved from Brand Kit (or layout color_overrides)
{{FONT_FAMILY}} → resolved from Brand Kit
{{BUSINESS_NAME}} → from getBusinessInfo()
{{SOCIAL_LINKS_HTML}} → rendered social icon row from Brand Kit
```

Color resolution order: layout `color_overrides` > Brand Kit defaults. This allows the Promotional layout to use bolder colors while Standard stays professional, all inheriting from the same Brand Kit base.

### Layout Manager Admin UI
**Location:** Marketing > Email Templates > Layouts tab (or `/admin/marketing/email-templates/layouts`)

- List 3 layouts with color swatches and description
- Edit page (`/admin/marketing/email-templates/layouts/[id]`):
  - Color pickers for layout-specific overrides (optional — blank = inherit from Brand Kit)
  - Header config toggles (show logo, logo position, show title)
  - Footer config toggles (show social icons, compact mode, custom footer text)
  - Live preview: sample email renders on the right as settings change
- Layouts cannot be deleted (system layouts), but colors and configs are fully editable

### CSS Approach
- **ALL styles inline** — no `<style>` blocks (Gmail strips them)
- **No CSS variables** — email clients don't support them. Brand Kit hex values injected at render time
- **Single-column design** (max-width 600px) — inherently mobile-responsive
- **Bulletproof buttons** using `<table><td>` pattern (only reliable method for Outlook)
- **Dark mode**: `<meta name="color-scheme" content="light dark">` plus data attributes for dark-aware clients
- **Email-safe fonts only** — restricted to the Brand Kit font dropdown options
- **Pre-tested across Gmail, Apple Mail, Outlook, Yahoo** before shipping

---

## LAYER 3: Content Templates

### Database Schema

**`email_templates`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| template_key | TEXT UNIQUE | NULL for custom; `booking_confirmation`, `review_request`, etc. for system |
| category | TEXT NOT NULL | `transactional`, `review`, `marketing`, `notification` |
| name | TEXT NOT NULL | Human-readable: "Booking Confirmation" |
| subject | TEXT NOT NULL | Subject line with {variables} |
| preview_text | TEXT DEFAULT '' | 90-char inbox snippet (before opening) |
| layout_id | UUID NOT NULL FK → email_layouts | References the layout to wrap this template |
| body_blocks | JSONB NOT NULL DEFAULT '[]' | `[{ id, type, data }]` |
| body_html | TEXT | Cached compiled HTML (regenerated on save) |
| variables | JSONB NOT NULL DEFAULT '[]' | Available variables for this template |
| segment_tag | TEXT | NULL = universal; 'luxury', 'ceramic', etc. for segment variants |
| is_system | BOOLEAN DEFAULT false | System templates can't be deleted |
| is_customized | BOOLEAN DEFAULT false | Edited from default → true. "Reset" reverts |
| version | INT DEFAULT 1 | Incremented on each save |
| created_at, updated_at | TIMESTAMPTZ | |
| updated_by | UUID FK → auth.users | |

**`email_template_assignments`** (segment routing: trigger → template)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| trigger_key | TEXT NOT NULL | `order_shipped`, `review_request`, `job_completion`, etc. |
| template_id | UUID FK → email_templates | |
| segment_filter | JSONB | `{ vehicle_category: 'luxury' }` — optional |
| priority | INT DEFAULT 0 | Higher priority wins when multiple segments match |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |

### Segment Routing Logic
1. Trigger fires (e.g., `review_request` after job completion)
2. Query `email_template_assignments` WHERE `trigger_key = 'review_request'` AND `is_active = true`
3. Sort by priority DESC, check each assignment's `segment_filter` against customer attributes
4. Return first match; fall back to assignment with NULL `segment_filter` (default)
5. If no assignments exist, fall back to template where `template_key` matches

**Example:** "Review Request - Ceramic Coating" (segment_tag: 'ceramic') and "Review Request - Standard" (no segment). Ceramic coating job → customer gets ceramic-specific email. Everyone else → standard.

### Seed Templates (16 total)

| template_key | Category | Name | Layout | Key Variables |
|---|---|---|---|---|
| booking_confirmation | Transactional | Booking Confirmation | standard | customer_name, appointment_date/time, service_name, vehicle_info |
| booking_reminder | Transactional | Booking Reminder | standard | customer_name, appointment_date/time, service_name |
| booking_cancellation | Transactional | Booking Cancelled | minimal | customer_name, appointment_date, booking_url |
| appointment_confirmation | Transactional | Appointment Notification | standard | customer_name, appointment_date/time, service_name, vehicle_info |
| review_request | Review | Review Request | standard | customer_name, service_name, google_review_link, yelp_review_link |
| review_followup | Review | Review Follow-Up | standard | customer_name, google_review_link, yelp_review_link |
| order_ready_pickup | Transactional | Order Ready for Pickup | standard | customer_name, order_number, {items_table} |
| order_shipped | Transactional | Order Shipped | standard | customer_name, order_number, tracking_url |
| order_delivered | Transactional | Order Delivered | standard | customer_name, order_number |
| order_refund | Transactional | Order Refund | minimal | customer_name, order_number, refund_amount |
| job_completion | Review | Job Completion | standard | customer_name, services_list, vehicle_info, gallery_url + photo pairs |
| welcome | Marketing | Welcome — New Customer | promotional | customer_name, coupon_code, booking_url |
| win_back | Marketing | Win-Back | promotional | customer_name, days_since_last_visit, coupon_code, booking_url |
| birthday | Marketing | Birthday / Anniversary | promotional | customer_name, coupon_code, booking_url |
| loyalty_upgrade | Marketing | Loyalty Tier Upgrade | standard | customer_name, loyalty_points, loyalty_value |
| stock_alert | Notification | Low Stock Alert (Internal) | minimal | (internal — product list) |

---

## Content Block Types (11 total)

All render to **TABLE-based HTML with inline styles**. Each renderer is a pure function: `(blockData, brandKit) → HTML string`.

### text
```json
{ "type": "text", "data": { "content": "Hey {first_name}! Thanks for choosing us.", "align": "left" } }
```
Rich text with bold/italic/links/variable insertion. Output: `<p>` with inline styles from Brand Kit.

### heading
```json
{ "type": "heading", "data": { "text": "Your Order is Ready!", "level": 1 } }
```
H1/H2/H3 with inline styles. Separate from text for semantic control across layouts.

### button
```json
{ "type": "button", "data": { "text": "Book Now", "url": "{booking_url}", "color": "primary", "align": "center" } }
```
Color: "primary" (Brand Kit primary) or "accent" (Brand Kit accent) or custom hex. Output: bulletproof `<table><td>` button (Outlook-compatible).

### image
```json
{ "type": "image", "data": { "src": "https://...", "alt": "Interior detail", "width": 560, "link": "{booking_url}" } }
```
Upload from device or browse from Gallery (featured photos). Max width 560px. Optional click-through link.

### photo_gallery (Before/After)
```json
{
  "type": "photo_gallery",
  "data": {
    "mode": "manual",
    "pairs": [{ "before_url": "...", "after_url": "...", "caption": "Hot Shampoo Extraction" }],
    "gallery_link": true
  }
}
```
**Two modes:**
- **Manual**: Admin browses `job_photos` (filtered by service/zone/tag, `is_featured = true`), selects 1-4 pairs. URLs stored in block data.
- **Dynamic**: `{ "mode": "dynamic", "service_match": true, "zone_filter": null, "tag_filter": ["extraction"], "limit": 2 }`. At send time, rendering pipeline queries matching photos. Falls back to any featured pair.

**Rendering:** Side-by-side table — Before image (left) with "BEFORE" label, After image (right) with "AFTER" label. 280px max per image. Optional "View Full Gallery" CTA below.

### coupon
```json
{ "type": "coupon", "data": { "heading": "Your Exclusive Offer", "code_variable": "{coupon_code}", "description": "15% off your next detail", "style": "card" } }
```
Style options: `card` (bordered box with dashed border), `banner` (full-width colored strip), `inline` (text only). Coupon code prominently displayed.

### divider
```json
{ "type": "divider", "data": { "style": "solid", "color": "#cccccc" } }
```

### spacer
```json
{ "type": "spacer", "data": { "height": 20 } }
```

### social_links
```json
{ "type": "social_links", "data": { "use_brand_kit": true } }
```
Renders social icon row from Brand Kit social URLs. Can override with custom links.

### two_column
```json
{ "type": "two_column", "data": { "left": [/* blocks */], "right": [/* blocks */] } }
```
Table-based 50/50 layout. Left and right each contain nested blocks.

### Special: `{items_table}` variable
Not a block type — a **pre-rendered HTML variable** for transactional emails. The sending function generates an HTML `<table>` from order/transaction items and passes it as `variables.items_table`. The template just contains `{items_table}` in a text block. The block editor shows this as a non-editable preview with sample data.

---

## Drip Campaigns

### Database Schema

**`drip_sequences`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT NOT NULL | "Win-Back Inactive Customers" |
| description | TEXT | |
| trigger_condition | TEXT NOT NULL | `no_visit_days`, `after_service`, `new_customer`, `manual_enroll`, `tag_added` |
| trigger_value | JSONB | `{ days: 30 }`, `{ service_id: uuid }`, `{ tag: "vip" }` |
| stop_conditions | JSONB NOT NULL | `{ on_purchase: true, on_booking: true, on_reply: false }` |
| nurture_sequence_id | UUID FK → drip_sequences | On stop, enroll here (NULL = just stop) |
| is_active | BOOLEAN DEFAULT false | |
| audience_filters | JSONB | Same filter format as campaigns |
| created_at, updated_at | TIMESTAMPTZ | |
| created_by | UUID FK → auth.users | |

**`drip_steps`** (dedicated table — NOT reusing lifecycle_rules)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| sequence_id | UUID FK → drip_sequences ON DELETE CASCADE | |
| step_order | INT NOT NULL | 0, 1, 2, 3... |
| delay_days | INT NOT NULL | Days after previous step (or trigger for step 0) |
| delay_hours | INT DEFAULT 0 | Fine-tuned timing |
| channel | TEXT NOT NULL | `email`, `sms`, `both` |
| template_id | UUID FK → email_templates | Reference model — always latest |
| sms_template | TEXT | SMS body with {variables} |
| coupon_id | UUID FK → coupons | Optional per-step coupon |
| subject_override | TEXT | Override template subject (NULL = use template's) |
| exit_condition | TEXT | Per-step override: `has_transaction`, `has_appointment`, `opened_email`, `clicked_link` |
| exit_action | TEXT | `stop`, `move`, `tag` |
| exit_sequence_id | UUID FK → drip_sequences | For exit_action = 'move' |
| exit_tag | TEXT | For exit_action = 'tag' |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |

**`drip_enrollments`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| sequence_id | UUID FK → drip_sequences | |
| customer_id | UUID FK → customers | |
| current_step | INT DEFAULT 0 | |
| enrolled_at | TIMESTAMPTZ | |
| next_send_at | TIMESTAMPTZ | Calculated from cumulative delays |
| status | TEXT NOT NULL | `active`, `completed`, `stopped`, `paused` |
| stopped_reason | TEXT | `purchased`, `booked`, `replied`, `manual`, `unsubscribed`, `tagged` |
| stopped_at | TIMESTAMPTZ | |
| nurture_transferred | BOOLEAN DEFAULT false | |
| created_at | TIMESTAMPTZ | |
| UNIQUE(sequence_id, customer_id) | | One enrollment per customer per sequence |

**`drip_send_log`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| enrollment_id | UUID FK → drip_enrollments | |
| step_id | UUID FK → drip_steps | |
| step_order | INT | Denormalized for funnel queries |
| channel | TEXT | |
| status | TEXT | `sent`, `failed`, `skipped` |
| mailgun_message_id | TEXT | For delivery/open/click tracking |
| coupon_code | TEXT | Generated coupon if applicable |
| sent_at | TIMESTAMPTZ | |
| error_message | TEXT | |

### Altered Tables
- **`lifecycle_rules`**: ADD `email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL`
- **`campaigns`**: ADD `email_body_blocks JSONB`, `email_layout_id UUID REFERENCES email_layouts(id)`, `email_preview_text TEXT`

### How Drip Execution Works

Added to lifecycle engine cron (`/api/cron/lifecycle-engine`):

**Phase 0 — Enrollment Check** (new):
- For each active drip_sequence, query customers matching trigger + audience_filters
- `no_visit_days`: customers where last transaction > X days ago, not already enrolled
- `after_service`: recent completions matching service, not enrolled
- `new_customer`: recently created customers matching filters
- `tag_added`: customers who received the target tag recently
- Insert `drip_enrollments` with `status='active'`, `current_step=0`, calculate `next_send_at`

**Phase 0.5 — Exit Condition Check** (new):
- Before executing any drip step, check sequence-level `stop_conditions` AND step-level `exit_condition`
- `has_transaction`: customer completed a purchase since `enrolled_at`?
- `has_appointment`: customer booked since `enrolled_at`?
- `opened_email`: opened any email in this sequence (via Mailgun webhook)?
- `clicked_link`: clicked any link in this sequence (via Mailgun webhook)?
- If exit condition met:
  - Update enrollment: `status='stopped'`, `stopped_reason`, `stopped_at`
  - Execute `exit_action`: **stop** (done), **move** (enroll in `exit_sequence_id`), **tag** (add `exit_tag` to customer)
  - Skip remaining steps

**Phases 1-2** (existing lifecycle engine phases continue unchanged for standalone rules)

**Phase 3 — Drip Step Execution** (new):
- Query `drip_enrollments` WHERE `status = 'active'` AND `next_send_at <= now()`
- For each: load current step, resolve template, render with Brand Kit + layout, send email/SMS
- Generate coupon if step has `coupon_id`
- Log to `drip_send_log`
- Advance `current_step`, calculate `next_send_at` for next step
- If no more steps → `status = 'completed'`

### Drip Builder UI

**Location:** Marketing > Campaigns → "Drip" tab (alongside "One-Time")

**List view:** Name, trigger type, active enrollments, total sent, conversion rate (stopped with purchase/booking ÷ total enrolled), status badge, actions.

**Builder page** (`/admin/marketing/campaigns/drip/new` and `/drip/[id]`):
1. **Basics**: Name, description
2. **Trigger & Audience**: Trigger type dropdown, trigger config, audience filters (reuse campaign filter UI)
3. **Steps**: Visual timeline editor
   - Each step card: step number, delay, channel, template name, coupon badge
   - Expandable: delay days/hours, channel, template picker, SMS textarea, coupon, per-step exit condition
   - "Add Step" button, drag to reorder
4. **Stop Conditions**: Checkboxes + exit actions (stop/move to sequence/add tag)
5. **Nurture Handoff**: "When stopped, enroll in: [sequence dropdown]"
6. **Review**: Visual summary, audience preview count, per-step email previews

### Drip Analytics
- **Funnel**: Enrolled → Step 1 → Step 2 → ... → Completed
- **Drop-off**: How many stopped at each step and why
- **Conversion**: Customers who purchased/booked during or after drip
- Data from `drip_enrollments` + `drip_send_log`

### Customer Detail Page Integration
New section on customer detail page: **"Active Sequences"**
- Shows which drip sequences the customer is enrolled in
- Current step, enrolled date, next send date
- Actions: skip to next step, pause, cancel enrollment, move to different sequence
- Manual enroll button to add customer to any drip sequence

---

## Email Rendering Pipeline

```
fetchBrandKit() → { primary_color, accent_color, text_color, bg_color, font_family, logo_url, ... }

resolveEmailTemplate(triggerKey, customerAttributes?)
  → uses email_template_assignments for segment routing
  → { template, layout }

renderEmail(template, layout, brandKit, variables, { isMarketing })
  → 1. Compile body_blocks → inner HTML (each block renderer uses brandKit colors)
  → 2. For photo_gallery blocks with mode=dynamic: query job_photos for matching pairs
  → 3. Resolve {variables} in inner HTML
  → 4. Load layout structure_html from email_layouts table
  → 5. Resolve colors: layout.color_overrides > brandKit defaults
  → 6. Inject resolved colors + Brand Kit values into layout placeholders
  → 7. Inject compiled inner HTML into {{BODY_CONTENT}} slot
  → 8. Inject footer (business info, social links, unsubscribe for marketing)
  → 9. Generate plain text fallback (strip HTML, keep text)
  → { html, text }

sendTemplatedEmail(to, triggerKey, variables, { customerAttributes?, isMarketing? })
  → fetchBrandKit() → resolveEmailTemplate() → renderEmail() → sendEmail()
```

---

## Integration Points

### Campaigns (One-Time) — Copy Model
Campaign wizard Message step:
1. "Choose Template" → template picker modal (marketing category)
2. Blocks COPIED into `campaigns.email_body_blocks`
3. Inline block editor for customization
4. Subject, preview_text, layout (via `email_layout_id` FK) editable per campaign
5. **Fallback**: No template selected → existing textarea remains (backward compat)

### Automations (Standalone Rules) — Reference Model
Automation editor:
1. Template selector dropdown replaces plain text email field
2. Stores `email_template_id` on lifecycle_rule (reference — always latest version)
3. Preview button, "Edit Template" link
4. Existing `email_template` text field stays for backward compat with custom inline content

### Transactional Senders — Fallback Model
Each sender gets template lookup:
1. Attempt `resolveEmailTemplate(template_key, customerAttributes)`
2. If template found AND `is_customized = true` → render from template system
3. Otherwise → fall back to existing hardcoded HTML (zero-risk migration)

| Sender | File | Template Key |
|--------|------|-------------|
| Order: Ready for Pickup | `src/lib/utils/order-emails.ts` | `order_ready_pickup` |
| Order: Shipped | `src/lib/utils/order-emails.ts` | `order_shipped` |
| Order: Delivered | `src/lib/utils/order-emails.ts` | `order_delivered` |
| Order: Refund | `src/lib/utils/order-emails.ts` | `order_refund` |
| Job Completion | `src/app/api/pos/jobs/[id]/complete/route.ts` | `job_completion` |
| Quote | `src/lib/quotes/send-service.ts` | `quote_sent` |
| Appointment | `src/app/api/pos/appointments/[id]/notify/route.ts` | `appointment_confirmation` |
| Stock Alert | `src/app/api/cron/stock-alerts/route.ts` | `stock_alert` |
| Campaigns | `src/app/api/marketing/campaigns/[id]/send/route.ts` | (uses email_body_blocks) |
| Lifecycle Engine | `src/app/api/cron/lifecycle-engine/route.ts` | (uses email_template_id) |

**Note:** Quote sender (`send-service.ts`) currently bypasses `sendEmail()` and calls Mailgun directly. Fix: switch to `sendEmail()` as part of migration.

---

## Build Order (9 sub-phases)

Dependencies: 1 → 2 → 3/4 (parallel) → 5 → 6 → 7 → 8 → 9

### Sub-phase 1: Database + Brand Kit + Rendering Engine ✅

- [x] Migration: `email_layouts` table + seed 3 layout rows
- [x] Migration: `email_templates` table
- [x] Migration: `email_template_assignments` table
- [x] Migration: `drip_sequences` table
- [x] Migration: `drip_steps` table
- [x] Migration: `drip_enrollments` table
- [x] Migration: `drip_send_log` table
- [x] Migration: ALTER `lifecycle_rules` — add `email_template_id`
- [x] Migration: ALTER `campaigns` — add `email_body_blocks`, `email_layout_id`, `email_preview_text`
- [x] Brand Kit: seed `email_brand_*` values in `business_settings`
- [x] `src/lib/email/types.ts` — Block data shapes + Brand Kit types
- [x] `src/lib/email/block-renderers.ts` — 11 block renderers (table-based, inline styles)
- [x] `src/lib/email/layout-renderer.ts` — Full pipeline (Brand Kit + layout + blocks → HTML)
- [x] `src/lib/email/photo-resolver.ts` — Dynamic gallery photo queries
- [x] `src/lib/email/template-resolver.ts` — Segment routing logic
- [x] `src/lib/email/send-templated-email.ts` — High-level send function
- [x] `src/lib/email/variables.ts` — Extended variable definitions per category

### Sub-phase 2: API Routes — Templates + Layouts ✅

- [x] `GET/POST /api/admin/email-templates` — List + create templates
- [x] `GET/PATCH/DELETE /api/admin/email-templates/[id]` — Single template CRUD
- [x] `GET/POST /api/admin/email-templates/assignments` — Segment routing assignments
- [x] `GET/PATCH /api/admin/email-templates/layouts` — List layouts
- [x] `GET/PATCH /api/admin/email-templates/layouts/[id]` — Single layout edit
- [x] `POST /api/admin/email-templates/[id]/preview` — Preview render endpoint
- [x] `POST /api/admin/email-templates/[id]/test-send` — Test send endpoint
- [x] `POST /api/admin/email-templates/[id]/reset` — Reset to default endpoint
- [x] `GET /api/admin/email-templates/gallery-photos` — Gallery photo browser for manual pick
- [x] `GET/PATCH /api/admin/email-templates/brand-kit` — Brand Kit settings

### Sub-phase 3: Admin UI — Template List + Layout Manager + Brand Settings ✅

- [x] Email Templates page (`/admin/marketing/email-templates`) with category tabs
- [x] `template-list.tsx` — Template list with category filtering
- [x] Brand Settings tab (`brand-settings.tsx`) — color pickers, logo, fonts, social links
- [x] Layout Manager page (`/admin/marketing/email-templates/layouts`) — list 3 layouts
- [x] Layout edit page (`/admin/marketing/email-templates/layouts/[id]`) — color pickers + header/footer config + live preview
- [x] `layout-manager.tsx` — Layout list component (merged into layouts/page.tsx)
- [x] `layout-editor.tsx` — Layout edit form with live preview (merged into layouts/[id]/page.tsx)
- [x] Sidebar nav entry in `src/lib/auth/roles.ts`

### Sub-phase 4: Admin UI — Block Editor ✅

- [x] `email-block-editor.tsx` — Main editor orchestrator (3-panel: palette + canvas + properties)
- [x] `block-palette.tsx` — Left sidebar with 10 block types (two_column included)
- [x] `block-canvas.tsx` — Center drag-and-drop canvas (native HTML5 DnD, inline preview text)
- [x] `block-properties.tsx` — Right panel for block settings (per-type property editors)
- [x] `photo-gallery-picker.tsx` — Photo gallery block picker (browse job_photos, zone/tag filters)
- [x] `variable-inserter.tsx` — Variable insertion dropdown (search, per-category filtering)
- [x] `email-preview.tsx` — iframe preview with desktop/mobile toggle
- [x] Test send dialog (integrated into template editor page)
- [x] `template-picker-modal.tsx` — Shared template picker (category filter, used by campaigns/drips)
- [x] Template editor page (`/admin/marketing/email-templates/[id]`) — settings, block editor, preview, test send, reset

### Sub-phase 5: Campaign + Automation Integration ✅

- [ ] Campaign page tabs: One-Time | Drip (`campaign-tabs.tsx`) — deferred to Sub-phase 6 (drip system)
- [x] Campaign wizard Message step: block editor toggle + layout selector + preview text
- [x] Campaign API routes: accept `email_body_blocks`, `email_layout_id`, `email_preview_text` (validation schemas updated)
- [x] Campaign send route: render from blocks via `renderFromBlocks()` when present, fallback to legacy `<p>` rendering
- [x] Automation editor: `email_template_id` dropdown + template link (both new + edit pages)
- [x] Automation API route: accept `email_template_id` (validation schema updated)
- [x] Lifecycle engine: dual-channel (SMS + email), checks both feature flags, sends via `sendTemplatedEmail()` or `renderFromBlocks()` for template-based rules, legacy plain-text fallback

### Sub-phase 6: Drip Campaign System ✅

- [x] `GET/POST /api/admin/drip-sequences` — List + create sequences
- [x] `GET/PATCH/DELETE /api/admin/drip-sequences/[id]` — Single sequence CRUD
- [x] `GET/POST /api/admin/drip-sequences/[id]/steps` — Steps CRUD
- [x] `GET/PATCH/DELETE /api/admin/drip-sequences/[id]/steps/[stepId]` — Single step CRUD
- [x] `GET/POST /api/admin/drip-sequences/[id]/enrollments` — Enrollments list + manual enroll
- [x] `PATCH /api/admin/drip-sequences/[id]/enrollments/[enrollId]` — Pause/resume/cancel/skip enrollment
- [x] `GET /api/admin/drip-sequences/[id]/analytics` — Funnel + conversion data
- [x] Drip builder page (`/admin/marketing/campaigns/drip/new` and `/drip/[id]`)
- [x] `drip-builder.tsx` — Main builder with trigger, audience, steps, stop conditions
- [x] `drip-steps-editor.tsx` — Visual timeline editor
- [x] `drip-step-card.tsx` — Individual step card (delay, channel, template, coupon, exit)
- [x] Drip list view under Campaigns "Drip" tab (`campaign-tabs.tsx`)
- [x] `drip-analytics.tsx` — Funnel, drop-off, conversion charts
- [x] `drip-enrollments-table.tsx` — Enrollment list with actions
- [x] `src/lib/email/drip-engine.ts` — Drip enrollment + execution + stop condition logic
- [x] Lifecycle engine integration: Phase 0 (enrollment), Phase 0.5 (exit check), Phase 3 (step execution)
- [x] Customer detail page: "Sequences" tab with enrollment display + manual enroll actions

### Sub-phase 7: Sender Migration (backward compatible)

- [x] Order: Ready for Pickup (`order-emails.ts`) — template fallback
- [x] Order: Shipped (`order-emails.ts`) — template fallback
- [x] Order: Delivered (`order-emails.ts`) — template fallback
- [x] Order: Refund (`order-emails.ts`) — template fallback
- [x] Job Completion (`/api/pos/jobs/[id]/complete/route.ts`) — template fallback
- [x] Quote Send (`send-service.ts`) — template fallback + switch to `sendEmail()`
- [x] Appointment Notification (`/api/pos/appointments/[id]/notify/route.ts`) — template fallback
- [x] Stock Alerts (`/api/cron/stock-alerts/route.ts`) — template fallback

### Sub-phase 8: Seed Data + Compliance

- [x] Seed: 12 templates (8 system + 4 drip) with `body_blocks` matching current hardcoded HTML
- [x] Seed: 8 default `email_template_assignments` (one per system template_key)
- [x] Seed: 2 example drip sequences (30-Day Win-Back, Welcome Series) + 5 steps
- [x] `{unsubscribe_url}` auto-injection verified — `layout-renderer.ts:236-238` handles marketing emails
- [x] `{gallery_url}` variable verified — defined in variables.ts, passed by job completion sender
- [x] Added `quote_date` variable to QUOTE_VARS + EMAIL_VARIABLE_GROUPS
- [x] Pass `quote_date` in quote sender (`send-service.ts`)

### Sub-phase 9: Docs + Cleanup

- [x] Update `docs/dev/DB_SCHEMA.md` — Already documented (lines 1252-1401) during sub-phases 1-6
- [x] Update `docs/dev/FILE_TREE.md` — Already documented during sub-phases 1-6
- [x] Update `docs/CHANGELOG.md` — Session changelog entries per sub-phase
- [x] Update `src/lib/supabase/types.ts` — Added 7 row types + 5 enum types for email template system

---

## New Files

**Lib (rendering engine):**
- [ ] `src/lib/email/types.ts`
- [ ] `src/lib/email/block-renderers.ts`
- [ ] `src/lib/email/layout-renderer.ts`
- [ ] `src/lib/email/photo-resolver.ts`
- [ ] `src/lib/email/template-resolver.ts`
- [ ] `src/lib/email/send-templated-email.ts`
- [ ] `src/lib/email/variables.ts`
- [ ] `src/lib/email/drip-engine.ts`

**API routes — Templates + Layouts:**
- [ ] `src/app/api/admin/email-templates/route.ts`
- [ ] `src/app/api/admin/email-templates/[id]/route.ts`
- [ ] `src/app/api/admin/email-templates/[id]/preview/route.ts`
- [ ] `src/app/api/admin/email-templates/[id]/test-send/route.ts`
- [ ] `src/app/api/admin/email-templates/[id]/reset/route.ts`
- [ ] `src/app/api/admin/email-templates/assignments/route.ts`
- [ ] `src/app/api/admin/email-templates/gallery-photos/route.ts`
- [ ] `src/app/api/admin/email-templates/brand-kit/route.ts`
- [ ] `src/app/api/admin/email-templates/layouts/route.ts`
- [ ] `src/app/api/admin/email-templates/layouts/[id]/route.ts`

**API routes — Drip:**
- [ ] `src/app/api/admin/drip-sequences/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/steps/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/steps/[stepId]/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/enrollments/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/enrollments/[enrollId]/route.ts`
- [ ] `src/app/api/admin/drip-sequences/[id]/analytics/route.ts`

**Admin pages:**
- [ ] `src/app/admin/marketing/email-templates/page.tsx`
- [ ] `src/app/admin/marketing/email-templates/[id]/page.tsx`
- [ ] `src/app/admin/marketing/email-templates/layouts/page.tsx`
- [ ] `src/app/admin/marketing/email-templates/layouts/[id]/page.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/page.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/new/page.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/[id]/page.tsx`

**Admin components — Templates:**
- [ ] `src/app/admin/marketing/email-templates/_components/template-list.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/brand-settings.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/layout-manager.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/layout-editor.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/email-block-editor.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/block-palette.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/block-canvas.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/block-properties.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/email-preview.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/variable-inserter.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/template-picker-modal.tsx`
- [ ] `src/app/admin/marketing/email-templates/_components/photo-gallery-picker.tsx`

**Admin components — Drip:**
- [ ] `src/app/admin/marketing/campaigns/_components/campaign-tabs.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/_components/drip-builder.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/_components/drip-steps-editor.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/_components/drip-step-card.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/_components/drip-analytics.tsx`
- [ ] `src/app/admin/marketing/campaigns/drip/_components/drip-enrollments-table.tsx`

**Migration:**
- [ ] `supabase/migrations/YYYYMMDD_email_template_system.sql`

---

## Modified Files

- [ ] `src/lib/auth/roles.ts` — Sidebar nav entry (Email Templates)
- [ ] `src/lib/supabase/types.ts` — Email template + drip TypeScript types
- [ ] `src/lib/utils/template.ts` — Add {unsubscribe_url}, {gallery_url} to VARIABLE_GROUPS
- [ ] `src/app/admin/marketing/campaigns/page.tsx` — Tabs (One-Time | Drip) — deferred to Sub-phase 6
- [x] `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` — Block editor toggle + layout selector
- [x] `src/app/api/marketing/campaigns/route.ts` — Accept email_body_blocks, email_layout_id (via schema)
- [x] `src/app/api/marketing/campaigns/[id]/route.ts` — Accept email_body_blocks, email_layout_id (via schema)
- [x] `src/app/api/marketing/campaigns/[id]/send/route.ts` — Render from blocks when present
- [x] `src/app/admin/marketing/automations/[id]/page.tsx` — Template dropdown
- [x] `src/app/admin/marketing/automations/new/page.tsx` — Template dropdown
- [x] `src/app/api/marketing/automations/[id]/route.ts` — Accept email_template_id (via schema)
- [x] `src/app/api/cron/lifecycle-engine/route.ts` — Email rendering + dual-channel sending
- [ ] `src/lib/cron/scheduler.ts` — Ensure lifecycle-engine cron covers drip processing
- [ ] `src/lib/utils/order-emails.ts` — Template fallback
- [ ] `src/app/api/pos/jobs/[id]/complete/route.ts` — Template fallback
- [ ] `src/app/api/pos/appointments/[id]/notify/route.ts` — Template fallback
- [ ] `src/lib/quotes/send-service.ts` — Template fallback + switch to sendEmail()
- [ ] `src/app/api/cron/stock-alerts/route.ts` — Template fallback
- [ ] `src/app/admin/customers/[id]/page.tsx` — Active sequences section
- [ ] `docs/dev/DB_SCHEMA.md` — Document new tables
- [ ] `docs/dev/FILE_TREE.md` — Add new file paths
- [ ] `docs/CHANGELOG.md` — Update

---

## Verification

### Brand Kit + Templates
- [ ] **Brand Kit** → Change primary color, verify all template previews update
- [ ] **Create template** → Verify saves with blocks, layout_id, preview_text, variables
- [ ] **Preview** → Verify TABLE-based HTML, inline styles, no CSS variables, bulletproof buttons
- [ ] **Test send** → Send to personal email, verify in Gmail + Apple Mail
- [ ] **Photo gallery (manual)** → Browse, pick pairs, verify side-by-side rendering with labels
- [ ] **Photo gallery (dynamic)** → Configure service_match, trigger send, verify correct photos pulled
- [ ] **Segment routing** → Two templates, same key, different segments → verify correct one selected
- [ ] **Reset to default** → Edit system template, reset, verify reverts

### Layout Manager
- [ ] **Edit layout colors** → Change Promotional accent color, verify templates using that layout reflect new color
- [ ] **Layout color override** → Set layout override, verify it takes priority over Brand Kit default
- [ ] **Layout header/footer config** → Toggle show_social off, verify footer updates in preview

### Campaign + Automation Integration
- [ ] **Campaign with template** → Select template, customize blocks, send, verify branded email
- [ ] **Campaign layout selection** → Change campaign's email_layout_id, verify correct layout wraps the email
- [ ] **Automation with template** → Set template_id, trigger event, verify email sends with latest template content
- [ ] **Backward compat** → Existing campaigns with raw email_body still work
- [ ] **Backward compat** → All 8 senders work without customized templates (hardcoded fallback)

### Drip Campaigns
- [ ] **Create drip** → 3-step win-back with delays, templates, coupon on step 3
- [ ] **Auto-enrollment** → "No visit in 30 days" trigger, verify eligible customers enrolled
- [ ] **Step execution** → Verify step 1 sends, then step 2 after delay
- [ ] **Stop condition** → Enrolled customer books → verify drip stops with reason "booked"
- [ ] **Per-step exit** → Step with exit_action="tag" → verify tag added on exit
- [ ] **Nurture handoff** → Stopped customer auto-enrolled in nurture sequence
- [ ] **Manual enrollment** → Add customer from admin UI
- [ ] **Customer detail** → Verify active sequences section shows enrollments with actions
- [ ] **Analytics** → Verify funnel + conversion metrics
- [ ] **Pause/resume** → Pause sequence, verify no sends. Resume, verify picks back up

### Compliance
- [ ] **CAN-SPAM** → Marketing emails include physical address + unsubscribe link in footer
- [ ] **Unsubscribe** → Click unsubscribe link → verify email consent revoked via existing Mailgun webhook flow
