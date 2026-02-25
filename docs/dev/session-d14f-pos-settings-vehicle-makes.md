# Session D14f: POS Settings Page + Vehicle Management

Read CLAUDE.md and docs/dev/FILE_TREE.md first. Check docs/dev/DB_SCHEMA.md before creating any new fields/tables.

## Overview

Repurpose the existing "POS Idle Timeout" admin page into a broader "POS Settings" page, then add a Vehicle Management card for managing the verified list of vehicle makes.

---

## Part 1: Repurpose Page

**File:** The existing POS Idle Timeout page (find via FILE_TREE.md — likely `src/app/admin/settings/pos-idle-timeout/` or similar)

### Changes:
1. **Page title:** Change from "POS Idle Timeout" → **"POS Settings"**
2. **Page description:** "Configure POS behavior, auto-logout, and vehicle options."
3. **Rename existing card:** "Auto-Logout Timer" → **"POS Auto-Logout Timer"** — no other changes to this card's functionality
4. **URL/route:** Rename the route folder to `pos-settings` (e.g., `src/app/admin/settings/pos-settings/page.tsx`). Update any navigation links that point to the old route (check sidebar nav config, breadcrumbs, any hrefs).
5. **Sidebar nav:** Update the label from "POS Idle Timeout" to "POS Settings" in the admin settings navigation

---

## Part 2: Vehicle Makes Table (Migration)

Create a new migration to add a `vehicle_makes` table:

```sql
CREATE TABLE vehicle_makes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with common makes
INSERT INTO vehicle_makes (name, sort_order) VALUES
  ('Acura', 1),
  ('Alfa Romeo', 2),
  ('Aston Martin', 3),
  ('Audi', 4),
  ('Bentley', 5),
  ('BMW', 6),
  ('Buick', 7),
  ('Cadillac', 8),
  ('Chevrolet', 9),
  ('Chrysler', 10),
  ('Dodge', 11),
  ('Ferrari', 12),
  ('Fiat', 13),
  ('Ford', 14),
  ('Genesis', 15),
  ('GMC', 16),
  ('Honda', 17),
  ('Hyundai', 18),
  ('Infiniti', 19),
  ('Jaguar', 20),
  ('Jeep', 21),
  ('Kia', 22),
  ('Lamborghini', 23),
  ('Land Rover', 24),
  ('Lexus', 25),
  ('Lincoln', 26),
  ('Lotus', 27),
  ('Lucid', 28),
  ('Maserati', 29),
  ('Mazda', 30),
  ('McLaren', 31),
  ('Mercedes-Benz', 32),
  ('Mini', 33),
  ('Mitsubishi', 34),
  ('Nissan', 35),
  ('Polestar', 36),
  ('Porsche', 37),
  ('RAM', 38),
  ('Rivian', 39),
  ('Rolls-Royce', 40),
  ('Subaru', 41),
  ('Tesla', 42),
  ('Toyota', 43),
  ('Volkswagen', 44),
  ('Volvo', 45);

-- Enable RLS
ALTER TABLE vehicle_makes ENABLE ROW LEVEL SECURITY;

-- RLS policy: all authenticated users can read
CREATE POLICY "vehicle_makes_read" ON vehicle_makes
  FOR SELECT TO authenticated USING (true);

-- RLS policy: only admins can write (match existing admin policy pattern)
CREATE POLICY "vehicle_makes_admin_write" ON vehicle_makes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE employees.auth_id = auth.uid()
      AND employees.role_id IN (
        SELECT id FROM roles WHERE name IN ('owner', 'admin')
      )
    )
  );
```

---

## Part 3: Vehicle Makes API

Create API route: `src/app/api/admin/vehicle-makes/route.ts`

**GET** — List all makes (ordered by sort_order, then name):
```typescript
// Returns: { makes: { id, name, is_active, sort_order }[] }
// Filter: optional ?active=true to only return active makes
```

**POST** — Add a new make:
```typescript
// Body: { name: string }
// Auto title-case the name before saving (but preserve known acronyms: BMW, GMC, RAM)
// Return 409 if duplicate name exists (case-insensitive check)
```

**PATCH** — Update a make:
```typescript
// Body: { id: string, name?: string, is_active?: boolean, sort_order?: number }
```

**DELETE** — Remove a make:
```typescript
// Body: { id: string }
// Only allow delete if no vehicles in the DB reference this make name
// If referenced, return 409 with message: "Cannot delete — vehicles exist with this make"
```

Also create a public/shared API for the combobox (used by POS and customer portal):
`src/app/api/vehicle-makes/route.ts`

**GET** — Returns only active makes, sorted:
```typescript
// Returns: { makes: { id, name }[] }
// No auth required beyond session (customers need this too)
```

---

## Part 4: Vehicle Management Card UI

Add a new card below the "POS Auto-Logout Timer" card on the POS Settings page.

**Card title:** "Vehicle Makes"
**Card description:** "Manage the list of vehicle manufacturers available in dropdowns across POS, admin, and customer portal."

### Layout:

```
┌──────────────────────────────────────────────────────────┐
│ Vehicle Makes                                             │
│ Manage vehicle manufacturers for dropdowns.               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─────────────────────────────┐  [Add Make]               │
│ │ 🔍 Search makes...         │                           │
│ └─────────────────────────────┘                           │
│                                                           │
│  Acura                                        [Toggle] ✕  │
│  Alfa Romeo                                   [Toggle] ✕  │
│  Aston Martin                                 [Toggle] ✕  │
│  Audi                                         [Toggle] ✕  │
│  Bentley                                      [Toggle] ✕  │
│  BMW                                          [Toggle] ✕  │
│  ...                                                      │
│                                                           │
│  Showing 45 makes (42 active)                             │
└──────────────────────────────────────────────────────────┘
```

### Features:

1. **Search/filter** — text input at top, filters the list as you type (client-side filter)
2. **Add Make button** — opens a small inline form or popover: text input + "Add" button. Auto title-cases. Shows error if duplicate.
3. **Each row shows:**
   - Make name (left)
   - Active/inactive toggle (Switch component, right) — deactivating hides from dropdowns but doesn't delete data
   - Delete button (X icon, right of toggle) — with confirmation. Blocked if vehicles reference this make (show toast with error message).
4. **Counter** at bottom: "Showing {total} makes ({active} active)"
5. Load all makes on page load via GET /api/admin/vehicle-makes

### Title-case logic for "Add Make":

```typescript
function titleCaseMake(name: string): string {
  const acronyms = ['BMW', 'GMC', 'RAM', 'BYD', 'MG'];
  const upper = name.trim().toUpperCase();
  if (acronyms.includes(upper)) return upper;
  
  return name.trim()
    .split(/[\s-]+/)
    .map((word, i, arr) => {
      // Preserve hyphenated names like Mercedes-Benz
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(name.includes('-') ? '-' : ' ');
}
```

---

## Part 5: Update DB_SCHEMA.md

Add the `vehicle_makes` table to docs/dev/DB_SCHEMA.md under a "Reference Data" section.

---

## Files to create:
- Migration file in `supabase/migrations/`
- `src/app/api/admin/vehicle-makes/route.ts` (admin CRUD)
- `src/app/api/vehicle-makes/route.ts` (public read-only for combobox)

## Files to modify:
- Existing POS idle timeout page → rename to POS Settings, rename route folder
- Admin sidebar/nav config — update label and href
- `docs/dev/DB_SCHEMA.md` — add vehicle_makes table

Update CHANGELOG.md, CLAUDE.md (route renamed), and FILE_TREE.md (new API routes + renamed page), then git add -A && git commit && git push.
