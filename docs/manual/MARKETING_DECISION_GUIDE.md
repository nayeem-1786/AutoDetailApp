# Marketing Decision Guide

A reference for "which messaging system do I use?" Smart Details has four separate systems for sending customer messages, and they are not interchangeable. Pick the wrong one and your message either won't fire or will fire in the wrong way. Pick the right one and the system handles the dedup, consent, and timing for you.

This guide is for everyday operators planning a customer outreach. It is not engineering documentation — it just answers "where do I click."

---

## 1. Quick Decision Tree

You want to send a message to a customer. Ask yourself the following, in order:

Is the message a direct response to something the customer just did with you — they paid, booked, got a quote, finished a job? Then it's already wired. Don't build anything new. The message goes through **SMS Templates** at `/admin/settings/messaging/sms-templates`. Edit the wording there if it needs tweaking; otherwise leave it alone. Example: a payment receipt SMS, a booking confirmation, a job-complete notice.

Do you want a single follow-up to fire automatically every time a specific event happens to a customer — like "review request 30 minutes after every closed service," or "thank-you SMS one hour after every product purchase"? Then you want a **Marketing Automation** at `/admin/marketing/automations`. Pick the trigger condition, set the delay, write the body, save. The system fires it once per customer per rule per 30 days.

Do you want a one-time outreach to a group of customers — a Memorial Day blast, a "we just opened a new location" announcement, a discount to enthusiast customers? Then you want a **Campaign** at `/admin/marketing/campaigns`. Build the audience filter, write the body, choose Send Now or schedule it for later.

Do you want a series of messages spread out over days or weeks — onboarding sequence, lapsed-customer winback, post-purchase upsell — where the second and third messages depend on whether the customer responded to the first? Then you want a **Drip** sequence, found inside Campaigns at `/admin/marketing/campaigns` → Drip tab.

If you can't decide between Campaign and Drip, the rule is: **one message = Campaign, more than one message in a sequence = Drip.**

---

## 2. SMS Templates

**What it is.** A library of 27 fixed transactional messages — receipts, confirmations, reminders, addon authorizations, voice-agent post-call SMS, staff notifications. Each one has a "slug" (a stable identifier) like `payment_receipt`, `booking_confirmed`, `job_complete`, `addon_authorization`, `quote_reminder`, `voice_quote`, `appointment_confirmed`.

**What it's for.** Editing the *wording* of an existing transactional SMS. The customer paid; the receipt SMS goes out automatically. The wording of that receipt is what you control here.

**What it's NOT for.** Creating new outreach. You cannot make SMS Templates send a message that doesn't already have a code path firing it. If the system doesn't already send a "happy birthday" SMS, adding a new SMS Template row does nothing — there is no trigger.

**When you'd actually edit one.** Rarely. Usually only when:
- The wording is off-brand or wrong
- You want a different chip (e.g., add `{loyalty_points}` to the receipt)
- A staff-recipient slug needs a different on-call phone number

**Where to find it.** `/admin/settings/messaging/sms-templates`. Each template has an Active toggle, a Body textarea with a chip picker, optional staff/detailer recipient fields, and a Test Phone for one-tap test sends.

**What's NOT editable.** The slug name, the category, and the "recipient type" (customer / staff / detailer). Those are seed values — they live in code, not in the admin.

---

## 3. Marketing Automations

**What it is.** Single-shot, event-triggered SMS or email sends. "When X happens to a customer, send Y after a delay of Z." Each rule is one event in, one message out.

**What it's for.** Reviews-after-service, "thanks for booking" follow-ups, post-cancellation re-engagement, post-quote-acceptance prompts. The natural home for **"every time event Y happens, send a single message."**

**What it's NOT for.** Multi-step sequences (use Drip), or one-time blasts to a segment (use Campaigns). It is also not a way to gate a send by customer attributes — there are no audience filters on Automations today, only a single optional service filter.

**Available triggers (post-Session 5):**
- `service_completed` — POS rang up the job (`jobs.status='closed'`)
- `after_work_completed` — detailer marked the work physically done (`jobs.status='completed'`)
- `after_transaction` — pure product POS sale, not linked to a job or appointment
- `after_appointment_booked` — newly created appointment (excludes cancelled/no-show)
- `after_appointment_cancelled` — appointment status flipped to cancelled
- `after_quote_accepted` — quote acceptance event

**Configurable per rule:**
- Trigger condition (one of the above)
- Trigger Service (optional — restrict to a specific service)
- Delay (days + minutes)
- Action: SMS, email, or both
- SMS body (free text with `{chip}` substitution from the Customer / Business / Links / Loyalty / Event Context palette)
- Email subject + body (HTML or block-editor template)
- Optional coupon attachment (cloned to a single-use coupon per execution)
- Active toggle
- Display Order (sort key for the admin list — does NOT control send order; see Section 7)

**Behaviors operators MUST understand:**
- **30-day per-customer-per-rule dedup.** A given customer cannot receive the same rule's message more than once in any rolling 30-day window. If you create a "review request after every service" rule, a customer who gets two services in the same week receives only one SMS.
- **24-hour cron lookback.** Events older than 24 hours will not trigger. If the cron is down for >24h (rare), the missed events are gone — there is no replay.
- **Marketing consent gating.** `sms_consent` must be `true` on the customer record. Customers who haven't consented are silently skipped at send time.
- **Cron interval.** Runs every 10 minutes. Worst-case 10-min lag between event and dispatch (plus your configured delay).
- **No audience filters.** "Review request after every service, but only for VIP customers" — not expressible. There is no audience filter slot on Automations today (gap noted in Section 8).

**Where to find it.** `/admin/marketing/automations`.

---

## 4. Campaigns

**What it is.** Operator-initiated, broadcast-style outreach to a customer segment. You build the audience, write the message, click Send Now (or schedule for later).

**What it's for.** One-time announcements, holiday promos, segment-specific offers. **"Send this message to these customers, once."**

**What it's NOT for.** Recurring sends (rebuild it each time, or use a Drip with a single step), or event-triggered sends (use Automations).

**Two sub-modes:**
- **Immediate** — built and sent now. Audience is materialized at Send time, message goes out within seconds.
- **Scheduled** — set `scheduled_at` to a future date/time. The campaign sits in `status='scheduled'` until the cron picks it up. As of Session 6a (May 2026), the `process-scheduled` cron runs every 5 minutes and dispatches anything whose `scheduled_at <= NOW()`. **Worst-case 5-min lag from your scheduled time to actual dispatch.** Operator-acceptable for marketing.

**Audience filter capabilities (today):**
- `customer_type` (enthusiast / professional)
- `last_service` (single service ID)
- `days_since_visit_min` / `max`
- `vehicle_type`
- `min_spend` (lifetime)
- `tags` (contains-all)
- `has_email` / `has_phone`
- Implicit consent enforcement (`sms_consent=true` for SMS, `email_consent=true` for email)

**No zip filter, no "first-time customer" filter, no segment-by-loyalty-tier filter.** See Section 8 for current gaps.

**Configurable per campaign:**
- Channel: SMS / email / both
- Schedule: now / scheduled-at-datetime
- Optional coupon (cloned to single-use codes per recipient)
- A/B testing with split percentages and optional auto-winner selection
- SMS body (free text + chip substitution)
- Email subject + body (block editor or HTML)
- Audience preview (count before sending)
- Recipients table (post-send)

**Examples that fit Campaigns well:**
- "VIP customers from the last 60 days — 20% off ceramic coatings"
- "All customers — store closed Memorial Day, schedule before Friday"
- "Customers who haven't visited in 30+ days — we miss you, here's $25 off"

**Where to find it.** `/admin/marketing/campaigns`.

---

## 5. Drip

**What it is.** A multi-step, multi-message sequence enrolled per customer with stop conditions and an optional handoff to a "nurture" sequence at the end. Each step has its own delay, channel, body, and optional coupon. Once enrolled, the customer progresses through the steps over days or weeks until they finish, until a stop condition triggers, or until they hit the nurture handoff.

**What it's for.** Anything where a *sequence* matters. Onboarding (3 messages over 14 days). Post-purchase upsell (2 messages over a month). Lapsed-customer winback that gradually escalates over weeks.

**What it's NOT for.** Single-shot sends. If your sequence has only one step, that's a Campaign or an Automation, not a Drip.

**This is the canonical home for chained messaging in Smart Details.** A common confusion: Marketing Automations has a `chain_order` field (renamed to **"Display Order"** in Session 6a). That field is purely a sort key for the admin rules list — it does NOT cause Automation rules to fire in sequence. If you want one message to follow another, you build a Drip.

**Available triggers:**
- `no_visit_days` (lapsed-customer cohort — fires for any customer whose last visit was N+ days ago)
- `after_service` (specific service was rendered)
- `new_customer` (recent `customers.created_at`)
- `manual_enroll` (operator manually adds customer via Drip enrollment UI)
- `tag_added` (currently NOT wired to anything that watches tags — see Section 8)

**Per sequence:**
- Trigger condition + per-trigger value (e.g., `days: 60` for `no_visit_days`)
- Audience filters (same shape as Campaigns)
- Stop conditions: `on_purchase`, `on_booking`, `on_reply` since enrollment (defaults: purchase + booking stop, reply doesn't)
- Optional nurture handoff: `nurture_sequence_id` to roll customers into a long-term sequence after the main one ends

**Per step:**
- Order
- Delay (days + hours)
- Channel
- Template (email block-editor) or SMS body (free text)
- Optional coupon
- Optional exit condition with exit action (move to another sequence, apply tag, etc.)

**Examples that fit Drip well:**
- "New customer — welcome at +1 day, tips at +7 days, first-purchase nudge at +14 days"
- "Lapsed at 60 days — gentle reminder, then 14 days later a $25 incentive, then 14 days later a final $50 ask"
- "Post-ceramic-coating — care instructions at +1 day, 6-month inspection reminder at +180 days"

**Where to find it.** `/admin/marketing/campaigns` → click the Drip tab in the top-of-page tabs. (It is not in its own sidebar entry; it lives as a tab inside Campaigns.)

---

## 6. Common Operator Scenarios

| Scenario | Right system | Configuration |
|---|---|---|
| Send a review request after every paid service | Marketing Automation | `trigger=service_completed`, delay=30 min |
| Send a "we miss you" to lapsed customers (>60 days, past spend >$125) | Campaign | filters: `days_since_visit_min=60`, `min_spend=125`. **Note**: cannot combine event + segment filters (no recurring "weekly sweep" pattern today — gap §8). |
| One-time announcement of a new service to all opted-in customers | Campaign | immediate, no filters set (implicit consent enforcement = "all opted-in") |
| First-time customer welcome 3 days after their first transaction | Marketing Automation | `trigger=after_transaction`, delay=3 days. **Caveat**: no first-vs-repeat distinction today — fires for every transaction regardless of visit count. |
| Discount to customers in zip codes 90701–90717 | Campaign | **NOT YET SUPPORTED** — no zip filter in audience builder today (gap §8) |
| Pre-visit reminders 24h before scheduled appointments | Already wired | Built-in `booking_reminder` cron + SMS Template — do nothing |
| "Thanks for your booking" confirmation immediately after booking | Marketing Automation possible | `trigger=after_appointment_booked`, delay=immediate. **Usually skipped** because the built-in `booking_confirmed` SMS Template already fires transactionally. |
| 3-message onboarding sequence over 2 weeks | Drip | `trigger=new_customer`, 3 steps with delays of 1d / 7d / 14d |
| Quote follow-up 48h after acceptance if no booking yet | Marketing Automation | `trigger=after_quote_accepted`, delay=48h. **Caveat**: there is no "if no booking" stop condition on Automations — it fires regardless. To get the no-booking gate, use a Drip with `on_booking=true` stop condition. |
| Birthday discount | **NOT SUPPORTED** | The `customers.birthday` column was dropped in Session 5 (no operator workflow was capturing it). No birthday trigger exists. |
| Review request → reminder if no response → final ask after 7 days | Drip | 3 steps, channel = SMS, body per step. **Belongs in Drip, NOT in chained Marketing Automations** — Automations does not orchestrate chains. |
| Memorial Day blast scheduled for May 26 at 9:00 AM | Campaign, scheduled mode | Set `scheduled_at='2026-05-26T09:00 PST'`. Session 6a wired up the dispatch cron — runs every 5 min, worst-case 5-min lag from 9:00 AM. |

---

## 7. Important Behaviors and Gotchas

These are the non-obvious behaviors that bite operators who don't know about them.

**Marketing consent vs transactional consent.** Customers must have `sms_consent=true` to receive any Marketing Automation or Campaign. Transactional SMS (receipts, confirmations, reminders, addon authorizations) bypass this flag because they're tied to a service the customer initiated — TCPA carve-out for service-specific messages the customer reasonably expects. So a customer who hasn't consented to marketing will still get a `payment_receipt` SMS after paying, but will NOT receive a "we miss you" Campaign.

**Dedup windows on Marketing Automations.** Same customer + same rule = once per 30 days, hard cap. If a customer pays for two services in the same week, your "review request after every service" rule fires once, not twice. There is no per-rule custom dedup window today (gap §8).

**Cron lookback on Marketing Automations.** Events older than 24 hours don't trigger. If your cron stops running for a day (e.g., dev server restart loop, prod outage), the events that happened during that gap are gone — there's no replay. Production cron is reliable on the Hostinger VPS; this is mainly a dev-environment concern.

**Process-scheduled cron interval (Campaigns).** Runs every 5 minutes. If you schedule a campaign for 9:00 AM, it actually dispatches between 9:00 and 9:05. Operator-acceptable for marketing — don't schedule something that needs second-precision.

**`chain_order` field on Marketing Automations.** Now labeled **"Display Order"** in the admin form (Session 6a renamed). It controls the sort order of rules in the admin list view. It does NOT cause rules to fire in sequence. If you want sequenced sends, use Drip.

**Consent capture status (as of May 2026).** All 1,328 existing customers were backfilled with `sms_consent=true` via phone outreach in April–May 2026, with audit rows in `sms_consent_log` (`source='admin_manual'`, `keyword='VERBAL'`). Future customers are captured at creation per Session 6b. So today's marketing audience is essentially "all current customers" — minus any who explicitly opted out.

**Multiple systems can target the same customer at the same time.** If both an Automation and a Drip step target the same customer in the same window, both fire. There is no global rate limit across systems — only per-rule dedup within Automations and per-step ordering within Drip. If you build many overlapping rules, customers can get hit multiple times.

**A campaign's audience is materialized at Send time, not at Build time.** So if you build a campaign on Monday targeting "customers with last visit ≥ 30 days," and you Send on Friday, the audience is computed Friday — customers whose 30-day mark crossed during the week are included.

---

## 8. Future Capability Gaps

Things operators ask for but the system doesn't do today. Don't try to make them work; if you have a use case that needs one of these, flag it as a feature request.

- **Audience filters on Marketing Automations.** "Send a review request after every service, but only for enthusiast customers" — not expressible. Automations has only an optional service filter; no segment overlay.
- **Stop conditions on Marketing Automations.** "Send a 7-day quote follow-up, but cancel if the customer books in the meantime" — not expressible. Drip has stop conditions; Automations does not. A pending lifecycle execution keeps its scheduled time even if the trigger condition becomes obsolete.
- **Zip / geographic filter on Campaign audiences.** `customers.zip` exists in the database, but the audience builder doesn't expose it. No way to target ZIP 90701–90717 today.
- **Birthday triggers.** No `customers.birthday` column (dropped in Session 5 — no workflow was capturing it). No birthday trigger on any system.
- **Drip ↔ Automation integration.** No way to use a Marketing Automation event (e.g., `after_quote_accepted`) as a trigger for a Drip enrollment. Drip triggers are independent.
- **Per-rule custom dedup windows.** All Marketing Automation rules share the 30-day default. No way to set "weekly review request" or "quarterly check-in" with a custom window.
- **First-time vs repeat customer distinction.** `after_transaction` fires for every transaction, regardless of visit count. There is no "first transaction only" trigger.
- **Recurring single-shot Campaign.** No way to say "every Monday, sweep customers matching X and send Y." You'd rebuild the campaign each Monday, or use a Drip with `no_visit_days` + a single step (works but feels heavyweight).
- **`tag_added` Drip trigger** (technical orphan). The trigger value exists in the dropdown, but there is no infrastructure that watches `customer.tags` changes and enrolls. Selecting it does nothing. Full removal pending in Session 6d.
- **Per-customer marketing-history view.** No admin surface that shows "this customer received these 5 marketing messages in the last 90 days." Operators investigating "what did this customer get?" have to cross-reference `lifecycle_executions`, `campaign_recipients`, and `drip_enrollments` manually.

---

When in doubt: **transactional → SMS Templates, single event → Automation, one-time blast → Campaign, multi-step sequence → Drip.** That covers 90%+ of operator decisions.
