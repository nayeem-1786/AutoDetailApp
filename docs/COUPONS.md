# Coupon System — Smart Details Auto Spa

## Overview

The coupon system uses an IF/THEN model that separates **who** can use a coupon, **what conditions** must be met, and **what discount** the customer receives. A single coupon can grant multiple rewards (e.g., "20% off Product A + Free Product B").

**Key design principles:**
- No coupon stacking — one coupon per transaction
- Coupons can be general, targeted to a customer, or targeted to customer groups via tags
- Conditions are optional — a coupon with no conditions works on any order
- Rewards live in a child table (`coupon_rewards`) so one coupon can discount multiple items
- Auto-apply coupons skip code entry and apply automatically at POS when conditions are met
- Draft auto-save — wizard progress is saved automatically so you never lose work

---

## Data Model

### `coupons` table

Stores the coupon identity, targeting, conditions, and constraints.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `name` | TEXT | Human-readable name (e.g., "Spring Booster Bundle") |
| `code` | TEXT UNIQUE | The code entered at POS (auto-generated if blank) |
| `status` | ENUM | `draft`, `active`, `redeemed`, `expired`, `disabled` |
| `auto_apply` | BOOLEAN | When true, POS applies automatically when conditions met — no code needed |
| **Targeting (WHO)** | | |
| `customer_id` | UUID FK | Lock to one specific customer (NULL = anyone) |
| `customer_tags` | TEXT[] | Match customers by tags (e.g., `{Detailer,VIP}`) |
| `tag_match_mode` | TEXT | `any` (customer has at least one tag) or `all` (customer has every tag) |
| **Conditions (IF)** | | |
| `condition_logic` | TEXT | `and` (all conditions must be met) or `or` (any condition suffices) |
| `requires_product_id` | UUID FK | Ticket must contain this specific product |
| `requires_service_id` | UUID FK | Ticket must contain this specific service |
| `requires_product_category_id` | UUID FK | Ticket must contain a product from this category |
| `requires_service_category_id` | UUID FK | Ticket must contain a service from this category |
| `min_purchase` | DECIMAL | Minimum order subtotal |
| **Constraints** | | |
| `is_single_use` | BOOLEAN | One use per customer |
| `use_count` | INTEGER | Current total uses |
| `max_uses` | INTEGER | Total use cap (NULL = unlimited) |
| `expires_at` | TIMESTAMPTZ | Expiration date/time |
| `campaign_id` | UUID FK | Links to campaign that generated this coupon |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `coupon_rewards` table

Stores what discount the customer gets. One coupon can have multiple reward rows.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Primary key |
| `coupon_id` | UUID FK | Parent coupon |
| `applies_to` | TEXT | `order`, `product`, or `service` |
| `discount_type` | TEXT | `percentage`, `flat`, or `free` |
| `discount_value` | DECIMAL | The amount (20 = 20%, 5.00 = $5, ignored for `free`) |
| `max_discount` | DECIMAL | Cap for percentage discounts (e.g., "20% off, max $50") |
| `target_product_id` | UUID FK | Specific product that gets discounted |
| `target_service_id` | UUID FK | Specific service that gets discounted |
| `target_product_category_id` | UUID FK | All products in this category get discounted |
| `target_service_category_id` | UUID FK | All services in this category get discounted |

### Target Resolution

| `applies_to` | Target set? | Meaning |
|--------------|-------------|---------|
| `order` | n/a | Discount applies to whole ticket subtotal |
| `product` | `target_product_id` | Discount on that one product |
| `product` | `target_product_category_id` | Discount on all products in that category |
| `product` | neither | Discount on ALL products in the ticket |
| `service` | `target_service_id` | Discount on that one service |
| `service` | `target_service_category_id` | Discount on all services in that category |
| `service` | neither | Discount on ALL services in the ticket |

---

## Wizard Flow (Admin Coupon Creation)

The coupon creation UI is a 6-step wizard at `/admin/marketing/coupons/new`. Progress is auto-saved as a draft coupon on every step transition, so you can leave and resume later via `/admin/marketing/coupons/new?edit=<id>`.

### Step 1 — Basics

> "What should we call this coupon?"

**Fields:**
- **Name** — Human-readable label (e.g., "Booster Bundle Deal")
- **Code** — Auto-generate toggle or custom entry (e.g., `BOOSTBUNDLE`)
- **Auto-apply** — Toggle. When ON, the POS applies this coupon automatically when conditions are met without requiring a code.

**Help text:**
> Auto-apply coupons are applied at the POS automatically when conditions are met — no code needed. Use this for loyalty perks or standing discounts for customer groups.

### Step 2 — Who Can Use This?

> "Who is this coupon for?"

**Three options (radio):**
1. **Everyone** — No restrictions
2. **Specific Customer** — Search and select one customer
3. **Customer Group** — Select one or more tags via searchable dropdown:
   - Type to search existing tags across all customers
   - Select from dropdown or create a new tag on the fly
   - Choose match mode (with tooltip):
     - *Match Any (OR)* — Customer needs at least one of the selected tags
     - *Match All (AND)* — Customer must have every selected tag

**Eligible Customer Count:**
An inline counter at the bottom of this step shows how many customers match the current targeting configuration (e.g., "12 eligible customers"). This updates automatically as you change targeting options, helping you gauge whether the audience is too narrow or too broad.

**Note on customer types:** "Detailer" and "Enthusiast" are stored as tags in the customer's `tags[]` array, not as separate flags. The `getCustomerType()` helper extracts them for display purposes (e.g., `CustomerTypeBadge`). These tags appear in the searchable dropdown if any customers already have them assigned.

**Example:**
> Use "Customer Group" with the "Detailer" tag to offer discounts to all your detailer customers. Use "Specific Customer" for one-off coupons like a birthday discount.

### Step 3 — Conditions (optional)

> "Does anything need to be in the ticket for this coupon to work?"

**Toggle:** "No conditions — works on any order" vs. "Set conditions"

When conditions are enabled:
- **Logic mode** — AND (all conditions must be met) or OR (any one condition suffices)
- **Requires product** — Searchable product picker (search by name, SKU, vendor, or category)
- **Product category** — Select from category dropdown
- **Requires service** — Searchable service picker (search by name or category)
- **Service category** — Select from category dropdown
- **Minimum purchase** — Dollar amount threshold

**Example:**
> Set "Requires Service: Booster Wash" so this coupon only activates when the customer is getting a Booster Wash. Add "Minimum Purchase: $50" with AND logic to require both.

### Step 4 — Rewards

> "What discount does the customer get?"

**Reward list with "Add Reward" button.** Each reward row has:
1. **Applies to** — Order / Specific Product / Specific Service / Product Category / Service Category
2. **Target** — Searchable product picker, searchable service picker, or category picker (based on applies_to choice). Product search shows name, SKU, vendor, and category for easy identification.
3. **Discount type** — Percentage Off / Dollar Amount Off / Free
4. **Value** — The percentage or dollar amount (disabled for "Free")
5. **Max discount** — Optional cap for percentage discounts

Multiple rewards are allowed. Example: two reward rows for "Booster Product 20% off + Air Freshener free."

**Example:**
> For a "Buy X, get Y free" coupon: set the condition to X in Step 3, then add a reward here for Y with discount type "Free."
>
> For a simple "20% off everything" coupon: skip conditions, add one reward with Applies To = "Entire Order", type = "Percentage", value = 20.

### Step 5 — Limits

> "How long should this coupon last?"

**Fields:**
- **Expiration date** — Date/time picker (optional)
- **Single use per customer** — Toggle (default ON)
- **Maximum total uses** — Number input (optional, NULL = unlimited)

**Example:**
> Set "Single use" for promotional coupons. Set "Max uses: 50" to limit total redemptions across all customers (e.g., first 50 customers only).

### Step 6 — Review

Plain-English summary card showing all configuration:

```
Booster Bundle Deal
Code: BOOSTBUNDLE (must enter at POS)

WHO:    All customers
IF:     Customer purchases Booster Wash service
THEN:   Booster Product is 20% off (max $5.00 discount)
        + Air Freshener is free
LIMITS: Expires Feb 28, 2026 · Single use per customer
```

**Actions:**
- **Create Coupon** — Activates the coupon (sets status to `active`)
- **Save Draft** — Saves current progress as a draft (accessible from the coupons list)

---

## Draft & Auto-Save

Coupons support a `draft` status for work-in-progress coupons:

- **Auto-save on navigation:** Every time you move between wizard steps (Next, Previous, or clicking a step indicator), the coupon is silently saved as a draft.
- **First save creates the draft:** On the first auto-save, a new coupon row is created with `status: 'draft'`. Subsequent saves update the existing record.
- **Resume editing:** Draft coupons appear in the coupons list with a "Draft" badge. Clicking a draft navigates to `/admin/marketing/coupons/new?edit=<id>` which reloads all wizard state.
- **Save Draft button:** Explicitly saves and returns to the coupons list.
- **Create Coupon:** Sets the status from `draft` to `active` (or creates a new active coupon if no draft exists).
- **Draft coupons skip duplicate code checks** during creation since the code may change before activation.

---

## Searchable Product & Service Pickers

All product and service selection fields in the Conditions and Rewards steps use a searchable combobox (the `SearchableSelect` component) instead of plain dropdowns:

- **Products** — Searchable by product name, SKU, vendor name, and category. Each option shows the product name with a sublabel containing SKU, category, and vendor for easy identification.
- **Services** — Searchable by service name and category. Each option shows the service name with a sublabel showing the category.
- **Categories** — Standard dropdown (smaller dataset, no search needed).

This is important because the product catalog can be large. Searching by SKU or vendor name helps quickly locate the right item.

---

## Scenario Reference

### Simple Coupons

| Scenario | Conditions | Rewards |
|----------|-----------|---------|
| 20% off entire order | None | 1 reward: order, percentage, 20 |
| $10 off | None | 1 reward: order, flat, 10 |
| 15% off max $25 | None | 1 reward: order, percentage, 15, max_discount=25 |

### Targeted Coupons

| Scenario | Targeting | Conditions | Rewards |
|----------|-----------|-----------|---------|
| $25 off for Nayeem | customer_id=Nayeem | None | 1 reward: order, flat, 25 |
| 10% off for Detailers (auto) | tags=[Detailer], auto_apply | None | 1 reward: order, percentage, 10 |
| VIP + Detailer 15% off | tags=[VIP,Detailer], match=all | None | 1 reward: order, percentage, 15 |

### Conditional Coupons (IF/THEN)

| Scenario | Conditions | Rewards |
|----------|-----------|---------|
| Buy Booster Wash, Product 20% off | requires_service=Booster Wash | 1 reward: product, percentage, 20, target=Booster Product |
| Ceramic Coating 15% off this month | requires_service=Ceramic Coating | 1 reward: service, percentage, 15, target=Ceramic Coating |
| Spend $100+, free Air Freshener | min_purchase=100 | 1 reward: product, free, target=Air Freshener |
| Buy Full Detail, free Spray + 50% off Freshener | requires_service=Full Detail | 2 rewards: (1) product, free, target=Ceramic Spray; (2) product, percentage, 50, target=Air Freshener |

### Category-Level Coupons

| Scenario | Conditions | Rewards |
|----------|-----------|---------|
| 20% off all Chemicals with any detail service | requires_service_category=Detailing | 1 reward: product, percentage, 20, target_category=Chemicals |
| Buy any service, all products 10% off | requires_service_category=any (or none) | 1 reward: product (no target = all), percentage, 10 |

### Campaign-Generated Coupons

When a campaign sends coupons, each recipient gets a unique coupon row:
- `code` = auto-generated unique 8-char code
- `customer_id` = the recipient
- `is_single_use` = true, `max_uses` = 1
- `campaign_id` = the parent campaign
- `coupon_rewards` = cloned from the template coupon's rewards

---

## Condition Logic (AND vs OR)

When `condition_logic = 'and'`, ALL set conditions must be satisfied:
- requires_product_id: product must be in ticket
- requires_service_id: service must be in ticket
- requires_product_category_id: a product from category must be in ticket
- requires_service_category_id: a service from category must be in ticket
- min_purchase: subtotal must meet threshold

When `condition_logic = 'or'`, ANY single condition being met is enough.

Unset conditions (NULL) are ignored — they don't count toward AND/OR.

---

## Auto-Apply Behavior

When `auto_apply = true`:
1. POS checks all auto-apply coupons after each item added to ticket
2. For each auto-apply coupon: verify targeting (customer/tags) and conditions
3. If conditions met and no coupon already applied, auto-apply with best discount
4. Cashier sees a notification: "Coupon DETAILER10 auto-applied: 10% off"
5. Cashier can remove the auto-applied coupon if needed

Auto-apply coupons still have a `code` (for reference/tracking) but the code is not entered manually.

---

## POS Validation Flow

When a coupon is applied (manually or auto):

```
1. Look up coupon by code (or by auto-apply scan)
2. Check status = 'active'
3. Check not expired
4. Check use_count < max_uses (if max_uses set)
5. Check single-use: customer hasn't used this coupon before
6. Check targeting:
   a. If customer_id set → must match current customer
   b. If customer_tags set → customer tags must match (any/all per tag_match_mode)
7. Check conditions (AND/OR logic):
   a. requires_product_id → product in ticket items
   b. requires_service_id → service in ticket items
   c. requires_product_category_id → product from category in ticket
   d. requires_service_category_id → service from category in ticket
   e. min_purchase → subtotal >= threshold
8. Fetch coupon_rewards
9. For each reward, calculate discount:
   - order: percentage/flat/free of subtotal
   - product/service specific: percentage/flat/free of that item's price
   - product/service category: sum of discounts on matching items
   - product/service (no target): sum of discounts on all items of that type
10. Return reward breakdown + total discount
```

---

## Integration Points

### Files That Reference Coupons

**Database & Types:**
- `supabase/migrations/20260201000020_create_coupons.sql` — Original coupons table
- `supabase/migrations/20260203000007_enhance_coupons.sql` — Added name, targeting, conditions, coupon_rewards table
- `supabase/migrations/20260203000008_coupon_draft_status.sql` — Added `draft` status to coupon_status enum
- `src/lib/supabase/types.ts` — `Coupon` interface, `CouponStatus` enum (`draft | active | redeemed | expired | disabled`)
- `src/lib/utils/validation.ts` — `couponSchema`, `CouponInput` type
- `src/lib/utils/constants.ts` — `COUPON_STATUS_LABELS`, `DISCOUNT_TYPE_LABELS`

**POS (Point of Sale):**
- `src/app/pos/types.ts` — `TicketState.coupon`, `SET_COUPON` action
- `src/app/pos/context/ticket-context.tsx` — Coupon state management
- `src/app/pos/context/ticket-reducer.ts` — `SET_COUPON` case, discount calculation
- `src/app/pos/components/coupon-input.tsx` — Coupon code entry UI
- `src/app/api/pos/coupons/validate/route.ts` — Validation + discount calculation
- `src/app/api/pos/transactions/route.ts` — Saves coupon_id, increments use_count

**Admin Coupon Management:**
- `src/app/admin/marketing/coupons/page.tsx` — List page (search, filter by status including draft)
- `src/app/admin/marketing/coupons/new/page.tsx` — 6-step wizard with auto-save, searchable pickers, eligible count
- `src/app/admin/marketing/coupons/[id]/page.tsx` — Detail/edit page
- `src/app/api/marketing/coupons/route.ts` — GET/POST API (supports draft status)
- `src/app/api/marketing/coupons/[id]/route.ts` — GET/PATCH/DELETE API
- `src/app/api/marketing/coupons/[id]/stats/route.ts` — Usage stats API

**Campaign Integration:**
- `src/app/admin/marketing/campaigns/_components/campaign-wizard.tsx` — Coupon step in campaign wizard
- `src/app/api/marketing/campaigns/[id]/send/route.ts` — Per-customer coupon generation
- `src/app/api/marketing/campaigns/process-scheduled/route.ts` — Scheduled campaign coupon generation

**Customer Portal:**
- `src/app/api/customer/coupons/route.ts` — Customer's available coupons API
- `src/components/account/coupon-card.tsx` — Coupon display component
- `src/app/(account)/account/page.tsx` — Dashboard with coupon cards (maps `coupon_rewards` → `rewards`)

**Admin Customer Profile:**
- `src/app/admin/customers/[id]/page.tsx` — Clickable `CustomerTypeBadge` in page header for editing customer type tags
- `src/app/pos/components/customer-type-badge.tsx` — Shared badge component (cycles null → enthusiast → detailer → null)

---

## Implementation Status

### Phase A: Schema + Foundation ✅
1. DB migration (alter coupons, create coupon_rewards)
2. Draft status migration (add `draft` to coupon_status enum)
3. Updated TypeScript types (Coupon, CouponReward, CouponStatus with draft)
4. Updated Zod validation schemas
5. Updated constants (labels including draft)

### Phase B: API Routes ✅
6. Coupons CRUD API (handle rewards as nested objects, draft support)
7. POS coupon validate API (reward-based validation + discount calculation)
8. Campaign send/process-scheduled APIs (clone rewards per customer)
9. Customer coupons API

### Phase C: Admin UI ✅
10. Coupon creation wizard (6 steps) with:
    - Auto-save as draft on step navigation
    - Resume draft editing via `?edit=<id>` query param
    - Searchable tag dropdown for customer group targeting
    - Eligible customer count preview in targeting step
    - Searchable product pickers (name, SKU, vendor, category)
    - Searchable service pickers (name, category)
    - Match Any/All tooltip explanation
    - Save Draft and Create Coupon actions
11. Coupon list page (reward summary, draft badge, status filter)
12. Coupon detail page (rewards, conditions, targeting, stats)
13. Campaign wizard coupon step

### Phase D: POS Updates (pending)
14. Update POS validate response handling
15. Update ticket reducer for per-item discounts
16. Add auto-apply logic
17. Update coupon input component
18. Update transaction save to record per-item discounts
