# Session D14g: Standardize Vehicle Forms + Receipt Vehicle Line Items

Read CLAUDE.md and docs/dev/FILE_TREE.md first. Check docs/dev/DB_SCHEMA.md.

## Overview

Two changes:
1. Standardize all vehicle forms (Admin, Customer Portal, POS) to the same 6 fields with consistent controls
2. Move vehicle description from receipt info section to under each service line item

---

## Part 1: Standardize Vehicle Forms

Search the entire project for ALL vehicle create/edit forms. Known locations (verify via FILE_TREE.md):
- **Admin:** Customer detail > Vehicles tab > Edit Vehicle modal
- **Customer Portal:** Edit Vehicle modal (dark theme)
- **POS:** Add Vehicle modal/dialog

There may be others — search for patterns like `vehicle`, `make`, `model`, `Add Vehicle`, `Edit Vehicle`, `vehicle_type`, `size_class` in component files.

### Every vehicle form must have exactly these 6 fields in this order:

| # | Field | Label | Control Type | Details |
|---|-------|-------|-------------|---------|
| 1 | `vehicle_type` | Vehicle Type | Select dropdown | Options: Standard, Exotic, Oversized (or whatever current options are — keep existing) |
| 2 | `size_class` | Size Class | Select dropdown | Options: Sedan, SUV, Truck, etc. (keep existing options) |
| 3 | `year` | Year | Select dropdown | Range: current year + 2 down to 1980. E.g., 2028 down to 1980. Calculate dynamically: `new Date().getFullYear() + 2` for max. |
| 4 | `make` | Make | Searchable combobox | Fetches from `/api/vehicle-makes?active=true`. User types to filter. ONLY allows selection from the list — no free text entry. If a make is missing, user must ask admin to add it via POS Settings. Show placeholder: "Search makes..." |
| 5 | `model` | Model | Text input | Free text. Auto title-case on save. Placeholder: "e.g., Camry" |
| 6 | `color` | Color | Text input | Free text. Auto title-case on save. Placeholder: "e.g., Silver" |

### Layout (consistent across all 3 forms):

```
Row 1:  [Vehicle Type ▾]     [Size Class ▾]        ← 2 columns, 50/50
Row 2:  [Year ▾]  [Make 🔍]  [Model]               ← 3 columns, 33/33/33
Row 3:  [Color]                                     ← full width
```

### Remove from ALL forms:
- **License Plate** — remove from form UI (keep column in DB, just don't display)
- **VIN** — remove from form UI (keep column in DB, just don't display)
- **Notes** — remove from form UI (keep column in DB, just don't display)

### Auto title-case helper:

Apply on save/submit for Model and Color fields:

```typescript
function titleCaseField(value: string): string {
  if (!value?.trim()) return '';
  return value.trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
```

### Make combobox component:

If a reusable combobox doesn't already exist in the project, create one at `src/components/ui/vehicle-make-combobox.tsx` (or similar). It should:

1. Fetch makes from `/api/vehicle-makes` on mount (cache with SWR/state)
2. Filter as user types (client-side)
3. Show dropdown of matching makes
4. On select, set the value
5. Do NOT allow arbitrary text that isn't in the list
6. Show "No matching makes found. Ask your admin to add it in POS Settings." when filter returns empty

If a combobox component already exists (check for Combobox, Command, Popover patterns in components/ui), reuse and adapt it.

---

## Part 2: Receipt — Vehicle Under Service Line Items

### ReceiptTransaction interface update

**File:** `src/app/pos/lib/receipt-template.ts`

Add `color` to the vehicle type:

```typescript
// BEFORE
vehicle?: { year?: string; make?: string; model?: string } | null;

// AFTER  
vehicle?: { year?: string; make?: string; model?: string; color?: string } | null;
```

Also, the vehicle needs to be associated with each line item, not just the transaction. Update the line item type:

```typescript
// Check what the current line item interface looks like — it likely has:
// name, quantity, price, type, etc.
// Add:
vehicle?: { year?: string; make?: string; model?: string; color?: string } | null;
```

**Important:** Look at how the POS currently associates vehicles with services in a transaction. The vehicle may already be on each line item, or it may be at the transaction level. If it's transaction-level only, the simplest approach is: use the transaction-level vehicle and display it under every service line item (since a single transaction typically covers one vehicle).

### Remove vehicle from info section

In BOTH `generateReceiptLines()` and `generateReceiptHtml()`:

Delete the vehicle line from the info section entirely. The info section becomes 3 lines:

```
Receipt #SD-006127                    Feb 22, 2026, 4:42 PM
Nayeem Khan, Enthusiast                    (424) 363-7450
nayeem@121media.com                  Customer Since: Jun 2023
```

### Add vehicle under each service line item

In BOTH `generateReceiptLines()` and `generateReceiptHtml()`, when rendering line items:

```
Full Detail -- Sedan ................................ $129.99
   2027 Silver Honda Accord                                   ← NEW
   Ceramic Coating ...................................... $49.99
   Interior Freshener .................................... $9.99
```

The vehicle line should:
- Appear directly below the service name+price line
- Be indented the same way product add-ons are indented (find the existing indent pattern — likely 3 spaces for thermal, padding-left for HTML)
- Format: `{year} {color} {make} {model}` — filter out empty parts
- NO price on the right side — just the vehicle description
- Only show under **service** line items (not products/add-ons)

**In `generateReceiptLines()` (thermal):**
```typescript
// After pushing the service line item, check for vehicle
if (item.type === 'service' && tx.vehicle) {
  const vehicleDesc = [tx.vehicle.year, tx.vehicle.color, tx.vehicle.make, tx.vehicle.model]
    .filter(Boolean)
    .join(' ');
  if (vehicleDesc) {
    lines.push({
      type: 'text',
      text: `   ${vehicleDesc}`,  // indented — match existing product indent style
    });
  }
}
```

**In `generateReceiptHtml()` (browser/email):**
```html
<!-- After the service row, add a vehicle description row -->
<tr>
  <td style="padding-left:20px; font-size:13px; color:#666;">
    {year} {color} {make} {model}
  </td>
</tr>
```
Match the existing indent/style pattern used for product sub-items.

### Update all ReceiptTransaction builders

Find ALL places that build ReceiptTransaction objects (identified in D14 session — 5 API routes). Ensure `vehicle.color` is included in the query:

```sql
-- Add color to the vehicle join/select
vehicles.color
```

### Update shortcode resolver

In `resolveShortcodes()`, update the `{vehicle}` shortcode to include color:

```typescript
const vehicleStr = vehicle
  ? [vehicle.year, vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  : '';
```

### Update receipt preview sample data

In the admin receipt settings preview, update the sample vehicle:
```typescript
vehicle: {
  year: '2027',
  make: 'Honda',
  model: 'Accord',
  color: 'Silver',
},
```

---

## Verification Checklist

1. **All 3 vehicle forms** have identical 6 fields with identical layout
2. **Year dropdown** shows current+2 down to 1980
3. **Make combobox** only allows selection from vehicle_makes table
4. **Model + Color** auto title-case on save
5. **License Plate, VIN, Notes** removed from all form UIs (DB columns untouched)
6. **Receipt info section** — 3 lines only, no vehicle line
7. **Receipt line items** — vehicle description appears indented under each service
8. **Both thermal and HTML** renderers updated
9. **Shortcode `{vehicle}`** includes color
10. **Preview** shows vehicle under service line items

## Files to modify:
- All vehicle form components (Admin, Customer Portal, POS) — search and standardize
- `src/app/pos/lib/receipt-template.ts` — remove vehicle from info, add under line items, update shortcode
- All API routes that build ReceiptTransaction — add vehicle.color
- Receipt preview sample data in admin settings page
- Possibly create: `src/components/ui/vehicle-make-combobox.tsx` (if no reusable combobox exists)

Update CHANGELOG.md, CLAUDE.md (if structure changed), and FILE_TREE.md (if new components created), then git add -A && git commit && git push.
