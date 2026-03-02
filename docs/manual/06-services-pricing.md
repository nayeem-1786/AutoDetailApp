# 6. Services & Pricing

This chapter covers the service catalog — how services are organized, how to create and edit them, the six pricing models, add-on suggestions, prerequisites, and mobile service zones.

---

## 6.1 Service Catalog Overview

The service catalog is the foundation of the business. Every quote, booking, POS ticket, and public website listing draws from the same service data.

### Organizational Hierarchy

Services are organized in three layers:

1. **Service Categories** — Top-level groupings (e.g., "Express & Detail Services", "Ceramic Coatings")
2. **Services** — Individual service offerings within a category (e.g., "Signature Complete Detail")
3. **Pricing Tiers** — Price breakdowns per vehicle size, scope, or specialty type

### Where Services Appear

| Surface | What It Uses |
|---------|-------------|
| POS ticket builder | Active services, grouped by category, filtered by vehicle compatibility |
| Online booking | Active services with `online_bookable = true`, grouped by category |
| Public website | Active services with `show_on_website = true`, grouped by category |
| Quotes | Same service catalog as POS |
| Voice agent | Same catalog, pricing resolved by vehicle type |

### Navigation

- **Service list**: **Admin** → **Catalog** → **Services**
- **Categories**: **Admin** → **Catalog** → **Categories** → **Service Categories** tab
- **Vehicle categories**: **Admin** → **Catalog** → **Categories** → **Vehicle Categories** tab
- **Mobile zones**: **Admin** → **Settings** → **Mobile Zones**

---

## 6.2 Managing Service Categories

Navigate to **Admin** → **Catalog** → **Categories** and select the **Service Categories** tab.

### Viewing Categories

The table shows each category with its name, slug, display order, count of linked services, and active/inactive status. Categories are sorted by `display_order`.

### Creating a Category

1. Click **Add Service Category**
2. Fill in the required fields:

| Field | Required | Description |
|-------|:--------:|-------------|
| Name | Yes | Display name shown in POS, booking, and website (e.g., "Ceramic Coatings") |
| Slug | Yes | URL-friendly identifier, auto-generated from the name (e.g., `ceramic-coatings`) |
| Description | No | Optional description of the category |
| Display Order | No | Controls sort order. Lower numbers appear first. Defaults to 0. |

3. Click **Create Category**

> The slug is used in public URLs for service pages: `/services/{category-slug}/{service-slug}`. Choose slugs carefully — changing a slug after the page is indexed by search engines will break existing links.

### Editing a Category

Click the pencil icon next to any category to open the edit dialog. All fields are editable. Click **Save Changes** to apply.

### Deleting a Category

Click the trash icon next to a category. The system checks for linked active services first:

- If the category has linked services, deletion is blocked. Reassign those services to another category first.
- If no services are linked, a confirmation dialog appears. Deleting a category sets `is_active = false` (soft delete).

### Vehicle Categories

The **Vehicle Categories** tab displays the five fixed vehicle categories: Automobile, Motorcycle, RV, Boat, and Aircraft. These cannot be created or deleted — only their display settings can be edited.

Click the pencil icon on any vehicle category to edit:

| Field | Description |
|-------|-------------|
| Image | Upload a representative image (JPEG, PNG, or WebP, max 10 MB, recommended 800x600px) |
| Key | System identifier (read-only, e.g., `automobile`) |
| Display Name | Label shown in the booking flow |
| Description | Optional text displayed below the name |
| Image Alt Text | Accessibility text for the image |
| Active | Controls visibility in the booking flow |
| Display Order | Lower numbers appear first |

---

## 6.3 Creating & Editing Services

### Service List

Navigate to **Admin** → **Catalog** → **Services** to view the full catalog.

The list page provides:

- **Search** — Filter by service name or description
- **Category filter** — Show only services in a specific category
- **Classification filter** — Filter by Primary, Add-On Only, or Both
- **Pricing model filter** — Filter by Vehicle Size, Scope, Per Unit, Specialty, Flat Rate, or Custom Quote
- **Show Inactive toggle** — Include deactivated services in the list

Each row shows the service image thumbnail, name (clickable link to edit page), category, classification badge, pricing model badge, duration, mobile eligibility, and status. Inactive services show a **Reactivate** button inline.

If any active services are missing images, an amber warning banner appears at the top with the count.

### Creating a Service

1. Click **Add Service** on the services list page
2. Fill in the service details (see field reference below)
3. Select a pricing model and configure pricing (see section 6.4)
4. Click **Create Service**

### Service Fields Reference

#### Service Details Card

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Service Name | Yes | — | Display name (e.g., "Express Exterior Wash") |
| Description | No | — | What the service includes. Shown on website and booking. |
| Category | No | None | Assign to a service category for grouping |
| Classification | Yes | Primary | How this service can be sold (see table below) |
| Base Duration (minutes) | Yes | 60 | Estimated time to complete. Used for calendar scheduling. Step: 15 min. |
| Vehicle Compatibility | Yes | Standard | Which vehicle types this service applies to. At least one must be selected. |
| Special Requirements | No | — | Notes about equipment or conditions needed (e.g., "Aviation-approved products only") |

#### Service Classifications

| Value | Label | Meaning |
|-------|-------|---------|
| `primary` | Primary (Standalone) | Can be booked as the main service on a ticket. Appears as a top-level booking option. |
| `addon_only` | Add-On Only | Must be purchased alongside a primary service. Cannot be booked independently. |
| `both` | Both (Standalone or Add-On) | Can be booked standalone or added to another service. Appears in both the primary catalog and add-on suggestions. |

#### Vehicle Compatibility

Select one or more vehicle types this service is compatible with:

| Value | Label | Notes |
|-------|-------|-------|
| `standard` | Standard | Automobiles (sedans, trucks, SUVs, vans) |
| `motorcycle` | Motorcycle | Motorcycles of all types |
| `rv` | RV | Recreational vehicles and motorhomes |
| `boat` | Boat | Boats of all sizes |
| `aircraft` | Aircraft | Fixed-wing aircraft and jets |

Most automobile services use `standard` only. Specialty vehicle services (motorcycle detail, boat wash, etc.) use their respective type.

#### Service Options Card

| Toggle | Default | Description |
|--------|---------|-------------|
| Mobile Eligible | Off | Can be performed at the customer's location. Mobile surcharge applies (see section 6.8). |
| Online Bookable | On | Appears in the online booking wizard. Turn off for services that require phone or POS only. |
| Staff Assessed | Off | Only staff can add this to a ticket. Hidden from customer-facing channels. Used for surcharges like "Excessive Cleaning Fee". |
| Taxable | Off | Whether sales tax applies. Services are generally not taxed. |

#### Display Settings Card

| Field | Default | Description |
|-------|---------|-------------|
| Display Order | 0 | Controls sort position in POS and booking. Lower numbers appear first. |
| Active | On | When off, the service is hidden from POS, booking, and the website. |

#### Service Image Card

Upload an image for the service. Images are stored in the `service-images` Supabase storage bucket. Accepted formats: JPEG, PNG, WebP. On the edit page, an **Image Alt Text** field appears after upload for accessibility and SEO.

### Editing a Service

Click any service name in the list to open its detail page. The edit page has four tabs:

| Tab | What It Contains |
|-----|-----------------|
| **Details** | Service name, description, category, classification, duration, vehicle compatibility, options, display settings, image |
| **Pricing** | Standard pricing tiers, sale pricing, sale period dates |
| **Add-Ons** | Add-on suggestion configuration for this service |
| **Prerequisites** | Services that must be completed before this one |

Each tab saves independently. Click the relevant **Save** button after making changes on each tab.

### Deactivating vs. Deleting

- **Deactivating** — Toggle the Active switch to off on the Details tab. A confirmation dialog appears. The service becomes invisible in POS and booking but its data is preserved.
- **Deleting** — Click the **Delete** button (requires `services.delete` permission). This also performs a soft delete (sets `is_active = false`) and redirects to the service list.
- **Reactivating** — On the services list, inactive services show a **Reactivate** button. Click it to restore the service to active status.

---

## 6.4 Pricing Tiers

Every service uses one of six pricing models. The pricing model is selected when creating a service and determines how prices are entered and resolved.

### Pricing Models

| Model | Label | How It Works |
|-------|-------|-------------|
| `vehicle_size` | Vehicle Size | Three fixed price tiers based on vehicle size class: Sedan, Truck/SUV (2-Row), SUV (3-Row) / Van |
| `scope` | Scope | Named tiers representing scope of work. Each tier can optionally be vehicle-size-aware. |
| `per_unit` | Per Unit | A single price per unit (e.g., per panel, per seat) with an optional maximum |
| `specialty` | Specialty | Named tiers for specialty vehicle types (motorcycle, RV, boat, aircraft sizing) |
| `flat` | Flat Rate | One price regardless of vehicle size |
| `custom` | Custom Quote | A "starting at" price displayed to customers; final price determined after inspection |

### Vehicle Size Pricing

This is the most common model. When selected, three price inputs appear:

| Tier | Label | Examples |
|------|-------|---------|
| `sedan` | Sedan | Sedans, coupes, compact cars (Civic, Camry, Model 3) |
| `truck_suv_2row` | Truck/SUV (2-Row) | SUVs, trucks, crossovers (RAV4, F-150, Tahoe) |
| `suv_3row_van` | SUV (3-Row) / Van | Full-size vans, 3-row SUVs (Suburban, Sprinter, Odyssey) |

Enter a dollar amount for each tier. Prices are stored in the `service_pricing` table with three rows per service.

When a vehicle-size-priced service is added to a POS ticket, the system auto-selects the correct tier based on the customer's vehicle. Staff can override if needed.

### Scope Pricing

Scope pricing defines named tiers representing different levels of work. Each tier has:

| Field | Description |
|-------|-------------|
| Tier Name | Internal identifier (e.g., `floor_mats`) |
| Display Label | Label shown to customers (e.g., "Floor Mats Only") |
| Price | Dollar amount for this tier |
| Vehicle Size Aware | Toggle. When enabled, the tier uses three sub-prices (Sedan, Truck/SUV, SUV/Van) instead of a single price. |

Click **Add Tier** to add more tiers. Click the trash icon to remove a tier (minimum one required). Tiers are stored as rows in `service_pricing`.

> Scope pricing is used for services like Hot Shampoo Extraction, where the work scope varies significantly. The last tier ("Complete Interior") enables the vehicle-size-aware toggle so the price changes based on whether the vehicle is a sedan vs. a large SUV.

### Per Unit Pricing

For services charged by count (e.g., scratch repair per panel):

| Field | Description |
|-------|-------------|
| Price Per Unit | Dollar amount per unit |
| Max Units | Maximum number of units per service (e.g., 4 panels). Optional. |
| Unit Label | What the unit is called (e.g., "panel", "seat", "row") |

Per unit pricing is stored directly on the `services` table (`per_unit_price`, `per_unit_max`, `per_unit_label`) — not in the `service_pricing` table.

In the POS, tapping the service again increments the unit count. When the maximum is reached, a warning appears.

### Specialty Pricing

Specialty pricing is used for non-automobile vehicles. It defines named tiers specific to the vehicle category:

| Vehicle Category | Typical Tier Names |
|-----------------|-------------------|
| Motorcycle | Standard/Cruiser, Touring/Bagger |
| RV | Up to 24', 25-35', 36'+ |
| Boat | Up to 20', 21-26', 27-32' |
| Aircraft | 2-4 Seater, 6-8 Seater, Turboprop/Jet |

Each tier has a name, display label, and price. Click **Add Tier** to add more. Tiers are stored as rows in `service_pricing`.

> The tier name keys (e.g., `standard_cruiser`, `rv_up_to_24`, `boat_21_26`) map directly to the `vehicles.specialty_tier` column. When a specialty vehicle is on a ticket, the system resolves the price by matching the vehicle's `specialty_tier` to the `service_pricing.tier_name`.

### Flat Rate Pricing

A single price for all vehicles. Enter the dollar amount in the **Flat Price** field. The price is stored on the `services.flat_price` column — no rows are created in `service_pricing`.

### Custom Quote Pricing

For services that require inspection before final pricing (e.g., flood damage repair). Enter a **Starting Price** that displays to customers as "Starting at $X". The actual price is determined at the POS after inspection. Stored on `services.custom_starting_price`.

### Where Pricing Data Lives

| Pricing Model | Storage Location |
|---------------|-----------------|
| `vehicle_size` | `service_pricing` table — 3 rows (sedan, truck_suv_2row, suv_3row_van) |
| `scope` | `service_pricing` table — N rows (one per scope tier) |
| `specialty` | `service_pricing` table — N rows (one per specialty tier) |
| `flat` | `services.flat_price` column |
| `per_unit` | `services.per_unit_price`, `per_unit_max`, `per_unit_label` columns |
| `custom` | `services.custom_starting_price` column |

### Sale Pricing

Services that use the `service_pricing` table (vehicle_size, scope, and specialty models) support sale pricing. On the service edit page **Pricing** tab:

1. **Sale prices per tier** — Enter a reduced price for each tier. The sale price must be less than the standard price and greater than $0.
2. **Discount helpers** — Instead of entering each sale price manually, use the discount controls:
   - **Direct** — Enter each sale price individually
   - **Percentage** — Enter a percentage (e.g., 20%) and all sale prices auto-calculate from standard prices
   - **Fixed** — Enter a dollar amount (e.g., $25) to subtract from each standard price
3. **Sale period** — Optionally set a start date and/or end date. Leave dates empty for no time limit.

Sale pricing uses two fields on the `services` table:
- `sale_starts_at` — When the sale begins (applies to all tiers)
- `sale_ends_at` — When the sale ends

Each pricing row in `service_pricing` has a `sale_price` column that stores the reduced price.

#### Sale Status Indicators

The Pricing tab header shows a badge when sale prices are configured:

| Status | Meaning |
|--------|---------|
| Active | Sale is currently running (start date passed, end date not reached) |
| Scheduled | Sale has prices set but the start date is in the future |
| Expired | Sale end date has passed |

A **Sale Preview** panel shows the before/after prices with savings calculations.

To remove all sale prices, click **Clear All Sale Prices** and confirm.

> Flat-priced services do not have a sale pricing mechanism. To offer a discount on a flat-priced add-on, use the combo price on the add-on suggestion (see section 6.5).

---

## 6.5 Add-On Suggestions

Add-on suggestions are upsell prompts that appear when a primary service is selected in the POS or during booking.

### How They Work

1. A customer or staff member selects a primary service
2. The system queries `service_addon_suggestions` for that primary service
3. Matching add-ons display as suggestion cards showing the service name, standard price, and combo price (if configured) with savings highlighted
4. Staff can add the suggestion with one tap, or the customer can select it during booking
5. If the suggestion is dismissed, the add-on can still be added manually

### Configuring Add-On Suggestions

Navigate to the service edit page and select the **Add-Ons** tab. The tab badge shows the count of configured suggestions.

#### Adding a Suggestion

1. Click **Add Suggestion**
2. Fill in the form:

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Add-On Service | Yes | — | The service to suggest. Dropdown filters to services classified as `addon_only` or `both` that are not already configured as suggestions for this service. |
| Combo Price | No | None | Reduced price when this add-on is purchased with the primary service. Leave empty to suggest at the add-on's standard price. |
| Display Order | No | Next available | Lower numbers appear first in the suggestion list |
| Auto-Suggest | Yes | On | When on, the suggestion appears automatically. When off, it only appears when staff manually browses add-ons. |
| Seasonal | No | Off | When on, the suggestion only appears during the specified date range |
| Seasonal Start | No | — | Start date for seasonal suggestion (only when Seasonal is on) |
| Seasonal End | No | — | End date for seasonal suggestion |

3. Click **Save**

#### Editing a Suggestion

Click the pencil icon on any suggestion row to open the edit dialog. All fields are editable.

#### Removing a Suggestion

Click the trash icon and confirm. This is a hard delete — the suggestion is permanently removed.

### Combo Pricing

Combo pricing is the mechanism for discounting add-on services when paired with a specific primary service:

- The `combo_price` is stored on `service_addon_suggestions` — it is contextual to the specific primary + add-on pair
- At POS, the system displays: ~~$175~~ **$140** (Save $35) when combo pricing is active
- If multiple primary services on one ticket have combo prices for the same add-on, the best (lowest) combo price applies
- Combo price applies only when both the primary and add-on are on the same ticket

> For flat-priced add-on services, combo pricing via `service_addon_suggestions.combo_price` is the only way to offer a discounted price. Flat-priced services do not have `service_pricing` rows and therefore no `sale_price` mechanism.

---

## 6.6 Service Prerequisites

Prerequisites enforce service dependencies. For example, ceramic coating services require paint correction to be completed first.

### How They Work

When a service with a prerequisite is added to a ticket or booking:

1. The system checks the prerequisite conditions based on the enforcement type
2. If the condition is not met, the system responds according to the enforcement level (block, warn, or allow)

### Configuring Prerequisites

Navigate to the service edit page and select the **Prerequisites** tab. The tab badge shows the count of configured prerequisites.

#### Adding a Prerequisite

1. Click **Add Prerequisite**
2. Fill in the form:

| Field | Required | Default | Description |
|-------|:--------:|---------|-------------|
| Prerequisite Service | Yes | — | The service that must be completed first. Dropdown shows all active services except the current one and any already configured. |
| Enforcement | Yes | Recommended | How strictly the prerequisite is enforced (see enforcement types below) |
| History Window (days) | Conditional | 30 | Only for `required_history` enforcement. How recently the prerequisite must have been completed. |
| Warning Message | No | — | Custom message shown when the prerequisite is not met |

3. Click **Save**

### Enforcement Types

| Type | Label | Behavior |
|------|-------|----------|
| `required_same_ticket` | Required (Same Ticket) | The prerequisite service must be on the same ticket. Blocks adding the service without it. |
| `required_history` | Required (History) | The prerequisite must exist in the vehicle's service history within the configured number of days. |
| `recommended` | Recommended | Shows a warning message but allows proceeding. Used when the prerequisite may have been done elsewhere. |

#### Example: Ceramic Coatings

All ceramic shield services (1-Year, 3-Year, 5-Year) have a prerequisite for Paint Correction (Single-Stage or 3-Stage):

- **Enforcement**: `required_same_ticket` or `required_history` (within 30 days)
- **Behavior**: If paint correction is not on the ticket and not in the vehicle's recent service history, the system blocks the ceramic coating and prompts the user to add paint correction

The Booster Detail uses `recommended` enforcement for ceramic coating history — it shows a warning if no coating history is found, but allows proceeding since the coating may have been applied elsewhere.

#### Editing and Removing Prerequisites

- Click the pencil icon to edit any prerequisite
- Click the trash icon and confirm to remove (hard delete)

---

## 6.7 Packages / Combos

The database includes `packages` and `package_services` tables for bundled service packages.

### Package Structure

| Table | Purpose |
|-------|---------|
| `packages` | Defines the package (name, description, bundled price) |
| `package_services` | Links individual services to a package |

A package has a single bundled price that is less than the sum of the individual service prices, providing a built-in discount.

> The current catalog uses the add-on suggestion system with combo pricing (section 6.5) for most bundled discount scenarios. The packages table provides an additional mechanism for creating fixed-price bundles that include multiple services.

---

## 6.8 Mobile Zones

Mobile zones define geographic service areas with distance-based travel surcharges for mobile detailing appointments.

### Overview

When a customer books a mobile service, the system determines which zone their address falls in and applies the corresponding surcharge. The surcharge is a flat fee applied once per appointment, regardless of how many services are on the ticket.

### Feature Flag

Mobile service availability is controlled by the `MOBILE_SERVICE` feature flag. If disabled:

- Mobile zones are still manageable in settings, but a warning banner appears
- The mobile option is hidden from the booking flow
- The `getMobileZones()` data function returns an empty array

Enable mobile service in **Admin** → **Settings** → **Feature Toggles**.

### Managing Mobile Zones

Navigate to **Admin** → **Settings** → **Mobile Zones**.

The page shows a table of all configured zones with columns for name, distance range, surcharge, and availability status.

#### Creating a Zone

1. Click **Add Zone**
2. Fill in the form:

| Field | Required | Description |
|-------|:--------:|-------------|
| Zone Name | Yes | Display name (e.g., "Zone 1 - Nearby") |
| Min Distance (mi) | Yes | Starting distance from the shop in miles |
| Max Distance (mi) | Yes | Ending distance from the shop in miles |
| Surcharge | Yes | Dollar amount added to the appointment total |
| Display Order | No | Controls sort position. Lower numbers appear first. |

3. Click **Create Zone**

#### Editing a Zone

Click the pencil icon on any zone row to open the edit dialog.

#### Toggling Availability

Use the inline toggle switch in the Status column to enable or disable a zone without deleting it. Unavailable zones are not shown to customers during booking.

#### Deleting a Zone

Click the trash icon and confirm. This is a hard delete — the zone is permanently removed.

### Default Zone Configuration

| Zone | Min Distance | Max Distance | Surcharge |
|------|:----------:|:----------:|:---------:|
| Zone 1 | 0 mi | 5 mi | $40.00 |
| Zone 2 | 5 mi | 10 mi | $80.00 |

### Mobile Booking Rules

- The surcharge is applied **once per appointment** — not per service
- If any service on a mobile ticket is not mobile-eligible, the entire appointment must be in-shop
- During online booking: the customer toggles "Mobile Service", enters their address, the system calculates the zone, and only mobile-eligible services are shown
- At POS: staff sets the "Mobile" flag on a ticket, enters the customer address, and the zone surcharge is auto-applied
- Customers beyond the maximum distance of all active zones cannot book mobile service

### Mobile-Eligible Services

A service must have **Mobile Eligible** toggled on (section 6.3) to be available for mobile appointments. Services requiring controlled environments (paint correction, ceramic coatings), heavy equipment (extraction, undercarriage cleaning), or enclosed spaces (ozone treatment) are not mobile-eligible.

---

*Previous: [Customers](./05-customers.md) | Next: [Website & CMS](./07-cms-website.md)*
