# 9. Marketing

The marketing system handles customer outreach through SMS and email. It includes one-time campaigns, automated lifecycle sequences, two-way SMS messaging with an AI auto-responder, coupon distribution, promotions (sale pricing), compliance tracking, and analytics.

This chapter covers campaigns, automations, promotions, messaging, analytics, TCPA compliance, and Google review solicitation.

---

## 9.1 Marketing Overview

Navigate to **Admin** → **Marketing** to reach the marketing hub. The hub shows quick stats (active coupons, campaigns this month, active automations) and links to each section.

### Marketing Sections

| Section | Purpose |
|---------|---------|
| **Campaigns** | One-time SMS/email blasts to targeted audiences |
| **Automations** | Automated lifecycle sequences triggered by customer activity |
| **Coupons** | Discount codes (see [Chapter 8, Section 8.8](./08-online-store.md#88-coupons--discounts)) |
| **Promotions** | Sale pricing across services and products |
| **Analytics** | Cross-campaign performance metrics |
| **Compliance** | SMS/email consent audit log |

### Feature Flags

Marketing channels are controlled by feature flags in **Admin** → **Settings** → **Feature Toggles**:

| Flag | Controls |
|------|----------|
| **SMS Marketing** | All outbound marketing SMS (campaigns + automations) |
| **Email Marketing** | All outbound marketing email |
| **Two-Way SMS** | Messaging inbox and AI auto-responder |
| **Google Review Requests** | Review solicitation automation |

Disabling a flag prevents that channel from sending. Campaigns using a disabled channel show a warning in the wizard but can still be created (they will send once the flag is re-enabled).

### SMS vs. Email

| Channel | Strengths | Considerations |
|---------|-----------|----------------|
| **SMS** | High open rate, immediate delivery | Character limits (160/segment), TCPA compliance required, per-message cost |
| **Email** | Rich content, no per-message cost | Lower open rate, spam filter risk |
| **Both** | Maximum reach | Customers receive on whichever channel they have consented to |

---

## 9.2 Campaigns

Navigate to **Admin** → **Marketing** → **Campaigns** to create and manage campaigns.

### Campaign List

**Header:** Shows total campaign count and a **Create Campaign** button.

**Filters:** Status (All, Draft, Scheduled, Sent, Cancelled) and Channel (All, SMS, Email, SMS + Email).

**Table columns:**

| Column | Description |
|--------|-------------|
| **Name** | Campaign name (clickable link) |
| **Channel** | SMS, Email, or SMS + Email |
| **Status** | Status badge |
| **Recipients** | Number of recipients |
| **Delivered** | Number successfully delivered |
| **Sent** | Date sent |

**Row actions:** Edit/Resume (draft and scheduled only), Duplicate (all campaigns), Delete.

### Campaign Statuses

| Status | Meaning | Badge |
|--------|---------|-------|
| **Draft** | Work in progress | Gray |
| **Scheduled** | Set to send at a future time | Blue |
| **Sending** | Currently being sent | Yellow |
| **Sent** | Delivery complete | Green |
| **Paused** | Temporarily paused | — |
| **Cancelled** | Campaign was cancelled | Red |

### Creating a Campaign

The campaign wizard has five steps. Progress is auto-saved as a draft on every step navigation.

#### Step 1: Basics

| Field | Required | Description |
|-------|----------|-------------|
| **Campaign Name** | Yes | Descriptive name |
| **Channel** | Yes | SMS, Email, or SMS + Email |

If a selected channel's feature flag is disabled, a warning banner is shown.

#### Step 2: Audience

Build a targeted audience using these filters:

| Filter | Options |
|--------|---------|
| **Customer Type** | Any, Enthusiast, Professional |
| **Last Service** | Any service, or a specific service |
| **Vehicle Type** | Any, Standard, Motorcycle, RV, Boat, Aircraft |
| **Days Since Last Visit (min)** | Minimum days since last appointment |
| **Days Since Last Visit (max)** | Maximum days since last appointment |
| **Minimum Lifetime Spend** | Minimum total spend |

Click **Preview Audience** to see how many customers match and how many have the required consent for the selected channel. If customers match but none have consent, an amber warning explains the issue.

**Consent enforcement:** SMS requires `sms_consent = true` and a phone number. Email requires `email_consent = true` and an email address. "Both" requires at least one.

#### Step 3: Message

**SMS template fields (when SMS or Both):**

| Field | Description |
|-------|-------------|
| **SMS Message** | Message body with merge field support |

The editor shows a character counter and segment counter (SMS messages over 160 characters are split into multiple segments at 153 characters each).

**Email template fields (when Email or Both):**

| Field | Description |
|-------|-------------|
| **Email Subject** | Subject line with merge field support |
| **Email Body** | Message body with merge field support |

**Template merge fields** are inserted by clicking chips grouped by category:

| Category | Fields |
|----------|--------|
| **Customer Info** | `{first_name}`, `{last_name}` |
| **Business** | `{business_name}`, `{business_phone}`, `{business_address}` |
| **Links** | `{booking_url}`, `{book_url}` (personalized with customer data pre-filled), `{offer_url}` (routes to shop or booking based on coupon target), `{google_review_link}`, `{yelp_review_link}` |
| **Loyalty & History** | `{loyalty_points}`, `{loyalty_value}`, `{visit_count}`, `{days_since_last_visit}`, `{lifetime_spend}` |
| **Coupons** | `{coupon_code}` |

#### A/B Testing

Toggle **Enable A/B Testing** to test two message variants:

1. The original message becomes **Variant A**
2. A new **Variant B** section appears with its own SMS/email fields
3. Set the traffic split: 50/50, 60/40, 70/30, or 80/20
4. Optionally enable **Auto-select Winner** after 24 hours, 48 hours, 72 hours, or 1 week — the variant with the higher click-through rate is declared the winner

Recipients are randomly assigned to variants based on the split percentage.

#### Step 4: Coupon (Optional)

Attach an existing active coupon to the campaign, or create a new one inline. When a coupon is attached, each recipient receives a unique single-use coupon code generated from the template.

The inline coupon creation dialog supports:

- Discount type (percentage, dollar amount, free)
- Target (entire order, specific product, specific service)
- Max discount cap (for percentage type)
- Max uses and expiration
- Single use per customer

#### Step 5: Review & Send

The review step shows a summary of all settings:

- Campaign name, channel, audience counts, coupon info
- A/B testing configuration (if enabled)
- Message template previews

**Preview with Real Customer Data** opens a dialog that renders templates using actual audience member data, letting you see exactly what recipients will receive. Navigate through up to 50 sample customers.

**Sending options:**

| Option | Description |
|--------|-------------|
| **Send Now** | Sends immediately to all eligible recipients |
| **Schedule** | Set a future date/time and click "Schedule Now" |

### Campaign Detail Page

After sending, the detail page shows:

- **Info cards:** Channel, status, sent date, created date
- **Performance metrics:** Recipients, delivered, opened, clicked, redeemed, revenue
- **Message previews:** SMS and/or email templates
- **Recipients table:** Customer name, contact info, channel, delivery status, open/click tracking, coupon code, sent date (paginated at 20 per page)

Click **View Analytics** for deeper campaign analysis.

### Campaign Analytics

The analytics page (available for sent campaigns) includes:

- **Summary KPI cards** — Key performance indicators
- **Delivery funnel** — Visual breakdown from sent to delivered to opened to clicked
- **Variant comparison** — Side-by-side A/B test results (if applicable)
- **Click details** — Clicks by URL and recent click activity
- **Engagement timeline** — When engagement occurred over time
- **Recipient table** — Filterable, paginated list of all recipients with delivery details

---

## 9.3 Automations (Lifecycle Engine)

Navigate to **Admin** → **Marketing** → **Automations** to create automated messaging sequences.

### How It Works

The lifecycle engine is a cron job that runs every 10 minutes. It operates in two phases:

1. **Schedule** — Scans for recent events (completed appointments, transactions) and creates pending executions with a scheduled delivery time (event time + configured delay)
2. **Execute** — Sends messages for any pending executions whose scheduled time has arrived

**Deduplication:** The engine prevents duplicate sends at two levels:
- **Source-level:** Same appointment/transaction + rule combination is never processed twice
- **Customer-level:** Same customer + rule combination is not repeated within 30 days

### Automation List

The list shows all lifecycle rules with inline active/inactive toggles.

| Column | Description |
|--------|-------------|
| **Name** | Rule name (clickable link) |
| **Trigger** | Trigger condition |
| **Delay** | Time delay before sending ("Immediate" or days/minutes) |
| **Action** | Channel badge (SMS, Email, SMS + Email) |
| **Service** | Specific service or "Any" |
| **Coupon** | Attached coupon name or dash |
| **Active** | Toggle switch |

### Creating an Automation

Click **Create Rule** to open the automation form.

**Trigger card:**

| Field | Required | Description |
|-------|----------|-------------|
| **Rule Name** | Yes | Descriptive name |
| **Description** | No | Optional description |
| **Trigger Condition** | Yes | What event starts the automation |
| **Trigger Service** | No | Limit to a specific service or "Any" |
| **Delay** | No | Days and minutes to wait before sending |
| **Chain Order** | No | Order in multi-step sequences |

**Available trigger conditions:**

| Trigger | Description |
|---------|-------------|
| **After Service** | Fires when an appointment is completed |
| **After Transaction** | Fires when a POS checkout is completed |
| **No Visit (Days)** | Fires when a customer hasn't visited for N days |
| **Birthday** | Fires on the customer's birthday |

**Action card:**

| Field | Required | Description |
|-------|----------|-------------|
| **Send Via** | Yes | SMS, Email, or SMS + Email |
| **SMS Template** | If SMS | Message body with merge fields |
| **Email Subject** | If Email | Subject line with merge fields |
| **Email Body** | If Email | Message body with merge fields |

Automation templates support all the same merge fields as campaigns, plus additional **Event Context** fields:

| Field | Description |
|-------|-------------|
| `{service_name}` | Name of the service that triggered the automation |
| `{vehicle_info}` | Customer's vehicle description |
| `{appointment_date}` | Date of the triggering appointment |
| `{appointment_time}` | Time of the triggering appointment |
| `{amount_paid}` | Transaction amount |

**Coupon card (optional):** Attach an active coupon. When triggered, the system generates a unique single-use code for each recipient.

**Options card:**

- **Active** — Enable immediately on creation
- **Vehicle-aware** — Include vehicle info in messages

### Execution Flow

When the lifecycle engine fires for a rule:

1. Checks if the SMS Marketing feature flag is enabled (keeps executions pending if disabled)
2. Skips if the rule has been deactivated or deleted
3. Skips if the customer has no phone or has revoked SMS consent
4. Resolves all template variables (customer data, business info, loyalty points, event context)
5. Generates a unique coupon code if a coupon is attached
6. Sends the message via the configured channel
7. Records the execution status

**Execution statuses:**

| Status | Meaning |
|--------|---------|
| **Pending** | Scheduled, waiting for delivery time |
| **Sent** | Successfully delivered |
| **Failed** | Delivery failed (error recorded) |
| **Skipped** | Skipped (rule deactivated, consent revoked, etc.) |

---

## 9.4 Promotions

Navigate to **Admin** → **Marketing** → **Promotions** to manage sale pricing across services and products. This is separate from coupon codes — promotions are direct price reductions that apply automatically.

### Promotions Page

**Filters:**

| Filter | Options |
|--------|---------|
| **Search** | Service or product name |
| **Type** | All, Services, Products |
| **Status** | All, Active, Scheduled, Expired, No Sale |

**Summary cards** show counts of Active, Scheduled, and Expired sales.

Items are grouped by status in collapsible sections. Each row shows the item type (service or product), name, pricing by tier (sedan, truck/SUV, SUV/van) with original price struck through and sale price in green, end date, and action buttons.

### Sale Status Values

| Status | Meaning |
|--------|---------|
| **Active** | Sale is currently running |
| **Scheduled** | Sale has a future start date |
| **Expired** | Sale end date has passed |
| **No Sale** | No sale pricing configured |

### Quick Sale

Click **Quick Sale** to apply sale pricing to multiple items at once:

1. **Select Items** — Search and select services and/or products
2. **Discount** — Choose percentage off or fixed amount off, then enter the value
3. **Apply to Tiers** (services only) — Choose which pricing tiers to apply the discount to (Sedan, Truck/SUV, SUV/Van)
4. **Sale Period** — Set start and end dates
5. **Preview** — Review before/after prices for all selected items

The preview flags "invalid" entries where the sale price would be zero or exceed the original price.

### Ending a Sale

Click the red X button on any active or scheduled sale to clear all sale prices and dates for that item.

---

## 9.5 Two-Way SMS Messaging

Navigate to **Admin** → **Messaging** to access the SMS inbox. Requires the `two_way_sms` feature flag to be enabled.

### Messaging Inbox

The inbox uses a two-panel layout:

- **Left panel:** Conversation list with search, status filter pills (Open, Closed, Archived with counts), and real-time updates via Supabase Realtime
- **Right panel:** Active conversation thread with message history

Conversations are sorted by most recent message. Each conversation shows the customer name (or phone number for unknown senders) and a preview of the latest message.

### Conversation Statuses

| Status | Meaning |
|--------|---------|
| **Open** | Active conversation |
| **Closed** | Resolved (auto-closes after configurable inactivity period) |
| **Archived** | Archived (auto-archives after configurable period) |

### Sending Messages

Type a message in the compose field and send. Messages are sent via Twilio and appear immediately in the thread (optimistic rendering). Delivery status is tracked.

### AI Auto-Responder

When enabled, the AI assistant automatically replies to inbound SMS messages. The AI uses Claude to generate responses based on:

- Your business's service catalog with pricing
- Active coupons and promotions
- Business hours and contact info
- Conversation history (last 20 messages)
- Customer context (name, transaction history) for returning customers
- Product catalog (activated by keyword detection)

**Business hours behavior:**

| Caller Type | During Hours | After Hours |
|-------------|-------------|-------------|
| **Unknown numbers** | AI responds (configurable) | AI always responds |
| **Known customers** | AI responds (configurable) | AI always responds |

The AI keeps messages under 160 characters, asks only 1–2 questions per message, and uses a casual, friendly tone. It never makes up pricing — it only quotes prices from the service catalog.

### Messaging Settings

Navigate to **Admin** → **Settings** → **Messaging** to configure:

**AI Assistant:**

| Setting | Description |
|---------|-------------|
| **Enable AI Assistant** | Master toggle for AI auto-responses |
| **Unknown numbers (business hours)** | Whether AI responds to unknown callers during open hours |
| **Customers (business hours)** | Whether AI responds to known customers during open hours |
| **AI Prompt** | Custom behavioral instructions for the AI. Service catalog and business info are appended automatically. |

Click **Apply Standard Template** to reset the AI prompt to the default.

**Conversation Lifecycle:**

| Setting | Options |
|---------|---------|
| **Auto-close after** | 24 hours, 48 hours, 72 hours, 1 week, 2 weeks, Never |
| **Auto-archive after** | 7 days, 14 days, 30 days, 60 days, 90 days, Never |

---

## 9.6 Analytics Dashboard

Navigate to **Admin** → **Marketing** → **Analytics** for a cross-campaign performance overview.

### Period Selector

All metrics are scoped to a selectable time period (default: 30 days).

### Overview KPIs

| Metric | Description |
|--------|-------------|
| **Total SMS Sent** | SMS messages sent in the period |
| **Total Email Sent** | Emails sent in the period |
| **SMS Delivery Rate** | Percentage of SMS successfully delivered |
| **Email Delivery Rate** | Percentage of emails successfully delivered |
| **Overall Delivery Rate** | Combined delivery rate across channels |
| **Click-Through Rate** | Percentage of delivered messages that were clicked |
| **Opt-Out Rate** | Percentage of recipients who opted out |
| **Revenue Attributed** | Revenue attributed to marketing activity |

### Channel Comparison

Side-by-side SMS vs. Email comparison showing: sent, delivered, delivery rate, clicked, click rate, opted out, and estimated cost (SMS at $0.0079 per message).

### Performance Tables

The dashboard includes five data sections:

| Section | What It Shows |
|---------|---------------|
| **Campaign Performance** | Per-campaign metrics |
| **Automation Performance** | Per-automation metrics |
| **Coupon Performance** | Per-coupon distributed, redeemed, redemption rate, discount given, revenue from orders |
| **Audience Health** | Consent and engagement metrics |
| **A/B Test Results** | Variant-level comparison with winner designation |

---

## 9.7 TCPA Compliance

The system tracks SMS and email consent to comply with TCPA (Telephone Consumer Protection Act) regulations.

### Consent Collection

SMS consent is collected at these touchpoints:

| Source | How Consent Is Captured |
|--------|------------------------|
| **Booking form** | Customer checks consent box during online booking |
| **Customer portal** | Customer manages preferences in their account |
| **Inbound SMS** | Responding to a message implies consent |
| **Admin manual** | Staff manually sets consent in the compliance dashboard |

### Consent Tracking

Every consent change is recorded in the `sms_consent_log` with:

- Customer ID
- Action (opt in or opt out)
- Source (booking form, admin manual, inbound SMS, unsubscribe page, customer portal)
- Keyword (e.g., "STOP" for opt-out)
- Previous and new consent values
- Timestamp

### Opt-Out Handling

**STOP keyword:** When a customer texts "STOP", their SMS consent is automatically revoked. All marketing SMS includes a "\nReply STOP to unsubscribe" footer appended by the system.

**Unsubscribe page:** Each customer has a unique unsubscribe URL (`/unsubscribe/[customerId]`) included in marketing emails. The page allows customers to manage their preferences:

**Communication channels (toggleable):**
- SMS Messages
- Email Messages

**Notification types:**
- Appointment Reminders — Always on (required, cannot be disabled)
- Service Updates — Always on (required, cannot be disabled)
- Promotions & Offers — Toggleable
- Loyalty Updates — Toggleable

An **Unsubscribe from All** button disables all preferences at once.

### Compliance Dashboard

Navigate to **Admin** → **Marketing** → **Compliance** to view the consent audit log.

**Summary stats:** SMS Opted In count and Email Opted In count.

**Consent log table:**

| Column | Description |
|--------|-------------|
| **Customer** | Customer name |
| **Channel** | SMS or Email |
| **Action** | Opt In (green badge) or Opt Out (red badge) |
| **Source** | How the consent change occurred |
| **Date** | When the change occurred |

The log shows the 100 most recent consent changes.

**Manual Opt-Out:** Click the **Manual Opt-Out** button to search for a customer and manually revoke their SMS or email consent. The dialog shows the customer's current consent status before you confirm.

### Marketing vs. Transactional SMS

The system distinguishes between two types of SMS:

| Type | Consent Required | Examples |
|------|-----------------|----------|
| **Marketing** | Yes (sms_consent) | Campaigns, automations, promotions |
| **Transactional** | No | Appointment reminders, service updates, booking confirmations, completion notifications |

Marketing SMS is never sent to customers without explicit consent, regardless of how the message is triggered.

### Daily Frequency Cap

To prevent over-messaging, the system enforces a daily cap on marketing SMS per customer (default: 5 messages per day, configurable via business settings). This counts both campaign sends and lifecycle automation sends.

---

## 9.8 Google Reviews

The system can automatically request Google reviews from customers after service.

### How It Works

When the **Google Review Requests** feature flag is enabled:

1. After a service is completed, a lifecycle automation fires (configurable delay, default 30 minutes)
2. The customer receives an SMS with a link to leave a Google review
3. Each customer receives at most one review request per 30 days (enforced by the lifecycle engine's deduplication)

### Review Settings

Navigate to **Admin** → **Settings** → **Reviews** to configure:

**Review Links:**

| Field | Description |
|-------|-------------|
| **Google Review URL** | Direct link to your Google review page |
| **Yelp Review URL** | Direct link to your Yelp review page |

These URLs are used in the `{google_review_link}` and `{yelp_review_link}` template merge fields.

**Website Review Data:**

| Field | Description |
|-------|-------------|
| **Google Reviews** | Rating and review count (read-only, fetched automatically) |
| **Yelp Reviews** | Rating and review count (manually entered) |

This data is displayed on the public website (trust bar, homepage).

**Google Review Requests:**

The settings page shows whether the feature flag is enabled and links to the automations page where review request rules are managed as lifecycle rules.

---

*Previous: [Online Store](./08-online-store.md) | Next: [Accounting & Integrations](./10-accounting.md)*
