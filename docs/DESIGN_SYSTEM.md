# Design System — Visual Consistency Rules

> **Purpose:** This document defines every visual pattern used in the app. Sub-agents MUST follow these rules exactly to maintain UI consistency across all pages. No exceptions. No "close enough."
>
> **Stack:** Tailwind CSS (mobile-first), lucide-react icons, sonner toasts.

---

## Table of Contents

1. [Color Palette](#1-color-palette)
2. [Typography](#2-typography)
3. [Spacing & Layout](#3-spacing--layout)
4. [Component Patterns](#4-component-patterns)
5. [Page Layout Templates](#5-page-layout-templates)
6. [Status & State Indicators](#6-status--state-indicators)
7. [Interactive Patterns](#7-interactive-patterns)
8. [Dark Mode](#8-dark-mode)
9. [Responsive Breakpoints](#9-responsive-breakpoints)
10. [Anti-Patterns](#10-anti-patterns)

---

## 1. Color Palette

### Brand & Semantic Colors

The app uses Tailwind's default palette with specific semantic assignments. Do NOT deviate.

| Purpose | Light Mode | Dark Mode | Usage |
|---------|-----------|-----------|-------|
| **Primary action** | `bg-blue-600 text-white` | `dark:bg-blue-500` | Primary buttons, active tabs |
| **Primary hover** | `hover:bg-blue-700` | `dark:hover:bg-blue-600` | Button hover states |
| **Destructive** | `bg-red-600 text-white` | `dark:bg-red-500` | Delete, cancel, danger actions |
| **Destructive hover** | `hover:bg-red-700` | `dark:hover:bg-red-600` | Destructive button hover |
| **Success** | `text-green-600` / `bg-green-50` | `dark:text-green-400` / `dark:bg-green-900/20` | Success toasts, confirmed states |
| **Warning** | `text-amber-600` / `bg-amber-50` | `dark:text-amber-400` / `dark:bg-amber-900/20` | Stale indicators, pending states |
| **Info** | `text-blue-600` / `bg-blue-50` | `dark:text-blue-400` / `dark:bg-blue-900/20` | Informational badges |
| **Muted text** | `text-gray-500` | `dark:text-gray-400` | Secondary labels, timestamps |
| **Body text** | `text-gray-900` | `dark:text-gray-100` | Primary content |
| **Borders** | `border-gray-200` | `dark:border-gray-700` | Cards, dividers, inputs |
| **Background** | `bg-white` | `dark:bg-gray-900` | Page background |
| **Card background** | `bg-white` | `dark:bg-gray-800` | Cards, panels |
| **Subtle background** | `bg-gray-50` | `dark:bg-gray-800/50` | Table rows, secondary panels |

### Clickable Text (Links in Tables)

All clickable text in data tables uses this EXACT pattern:

```
text-blue-600 hover:text-blue-800 hover:underline
```

Applied to: Customer names, quote numbers, receipt numbers, coupon codes — every clickable cell in every `DataTable`.

---

## 2. Typography

### Font

The app uses the system font stack via Tailwind defaults. Do NOT import custom fonts.

### Size Scale

| Element | Tailwind Class | Size | Usage |
|---------|---------------|------|-------|
| Page title | `text-2xl font-bold` | 24px | `PageHeader` title |
| Page description | `text-sm text-gray-500` | 14px | `PageHeader` description |
| Section heading | `text-lg font-semibold` | 18px | Card titles, section headers |
| Card stat number | `text-2xl font-bold` | 24px | Dashboard stat cards |
| Card stat label | `text-sm text-gray-500` | 14px | Dashboard stat descriptions |
| Body text | `text-sm` | 14px | Standard content |
| Table cell | `text-sm` | 14px | DataTable cells |
| Table header | `text-xs font-medium text-gray-500 uppercase` | 12px | DataTable headers |
| Badge text | `text-xs` | 12px | Status badges |
| Muted/secondary | `text-xs text-gray-500` | 12px | Timestamps, IDs |
| Price display | `text-sm font-medium` | 14px | Prices in tables/lists |
| Total/summary price | `text-lg font-semibold` | 18px | Quote totals, checkout totals |

### Font Weight Rules

- `font-bold` — page titles, stat numbers, primary emphasis
- `font-semibold` — section headings, important labels, totals
- `font-medium` — table headers, prices, button text
- Default (400) — body text, table cells, descriptions

---

## 3. Spacing & Layout

### Page Structure

Every admin page follows this spacing:

```html
<div className="space-y-6">            <!-- 24px gap between major sections -->
  <PageHeader ... />                    <!-- Title bar -->
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
    <!-- Search + filters row -->
  </div>
  <DataTable ... />                     <!-- Or main content -->
</div>
```

### Card Grid

Dashboard stat cards and detail page info cards:

```html
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <Card>...</Card>
</div>
```

| Context | Grid | Gap |
|---------|------|-----|
| Dashboard stats | `grid sm:grid-cols-2 lg:grid-cols-4` | `gap-4` |
| Detail page info | `grid sm:grid-cols-2 lg:grid-cols-4` | `gap-4` |
| 2-column layout | `grid sm:grid-cols-2` | `gap-4` or `gap-6` |
| Form fields | `grid sm:grid-cols-2` | `gap-4` |

### Internal Spacing

| Element | Pattern | Pixels |
|---------|---------|--------|
| Page section gap | `space-y-6` | 24px |
| Card internal padding | `p-4` or `p-6` | 16px or 24px |
| Form field gap | `space-y-4` | 16px |
| Button group gap | `gap-2` | 8px |
| Badge/icon gap | `gap-1.5` | 6px |
| Icon + text inline | `gap-2` | 8px |
| Table cell padding | Built into DataTable | — |

### Standard Widths

| Element | Class | Usage |
|---------|-------|-------|
| Search input | `w-full sm:w-64` | All list page search bars |
| Filter dropdown | `w-full sm:w-40` | Status/type filter selects |
| Dialog (small) | `max-w-md` | Confirm, simple actions |
| Dialog (medium) | `max-w-lg` | Forms, activity logging |
| Dialog (large) | `max-w-2xl` | Complex forms, previews |
| Main content | `max-w-7xl mx-auto` | Page container |

---

## 4. Component Patterns

### Page Header

Every page starts with:

```tsx
<PageHeader
  title="Quotes"
  description={`${items.length} total`}
  action={
    <Button onClick={...}>
      <Plus className="h-4 w-4" /> Create
    </Button>
  }
/>
```

### Search + Filter Row

Every list page has:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
  <SearchInput
    value={search}
    onChange={setSearch}
    placeholder="Search by name, phone, or email..."
    className="w-full sm:w-64"
  />
  <Select value={statusFilter} onValueChange={setStatusFilter}>
    {/* filter options */}
  </Select>
</div>
```

### Stat Cards (Dashboard)

```tsx
<Card className="p-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-gray-500">Awaiting Response</p>
      <p className="text-2xl font-bold">{count}</p>
    </div>
    <IconComponent className="h-8 w-8 text-gray-400" />
  </div>
</Card>
```

### Status Badges

Always use the `Badge` component with the correct variant:

| Status Type | Values → Variants |
|-------------|-------------------|
| Quote status | draft→default, sent→info, viewed→warning, accepted→success, expired→destructive, converted→secondary |
| Follow-up | not_contacted→default, attempted→warning, in_contact→info, scheduled→success, no_response→destructive |
| Appointment | pending→warning, confirmed→success, completed→secondary, cancelled→destructive, no_show→destructive |
| Coupon | active→success, disabled→default, expired→destructive |

### DataTable

The `DataTable` component provides a consistent card-contained table with sorting, pagination, export, and bulk actions. It renders its own visual container — do NOT wrap it in a `<Card>` on list pages.

**Visual treatment (built into the component):**
- **Container:** `overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm`
- **Header row:** `bg-gray-50` background with `border-b border-gray-200` separator
- **Header text:** `text-xs font-medium text-gray-500 uppercase tracking-wider`
- **Body row separators:** `border-b border-gray-100` (lighter than header border)
- **Sort icons:** `h-4 w-4 text-gray-400` (ArrowUpDown)
- **Export bar:** Inside container, `border-b border-gray-200 px-4 py-3` (when `exportFilename` is set)
- **Pagination:** Inside container, `border-t border-gray-200 px-4 py-3` (when more than 1 page)

**Usage on list pages (bare — no Card wrapper):**

```tsx
<DataTable
  columns={columns}
  data={filtered}
  emptyTitle="No quotes found"
  emptyDescription="Create your first quote from the POS."
/>
```

**Usage inside detail page sections (nested in Card is OK):**

```tsx
<Card>
  <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
  <CardContent>
    <DataTable columns={columns} data={items} pageSize={10} />
  </CardContent>
</Card>
```

### Empty States

Every list/table has an empty state:

```tsx
<DataTable
  columns={columns}
  data={filtered}
  emptyTitle="No quotes found"
  emptyDescription="Create your first quote from the POS."
  emptyIcon={FileText}
  emptyAction={<Button onClick={...}>Create Quote</Button>}
/>
```

### Loading States

```tsx
// Full page loading
if (loading) return (
  <div className="flex items-center justify-center py-12">
    <Spinner size="lg" />
  </div>
);

// Inline loading (button)
<Button disabled={saving}>
  {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
  Save
</Button>
```

### Toast Notifications

```tsx
import { toast } from 'sonner';

toast.success('Quote sent successfully');
toast.error(result.error || 'Failed to send quote');
```

**Rules:**
- Success toast after every successful mutation
- Error toast with API error message + fallback
- NO loading toasts — use button disabled states
- NO `alert()` calls — always use toast

---

## 5. Page Layout Templates

### List Page

```
┌─────────────────────────────────────────┐
│ PageHeader (title + count + action btn) │
├─────────────────────────────────────────┤
│ [Search input]  [Filter 1]  [Filter 2]  │
├─────────────────────────────────────────┤
│ [Tab 1] [Tab 2] [Tab 3] [Tab 4]        │ (optional)
├─────────────────────────────────────────┤
│                                         │
│            DataTable                    │
│   (columns, rows, pagination)           │
│                                         │
│   --- or Empty State ---                │
│                                         │
└─────────────────────────────────────────┘
```

### Detail Page

```
┌─────────────────────────────────────────┐
│ PageHeader (title + badge + actions)    │
├─────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│ │ Card │ │ Card │ │ Card │ │ Card │   │  Info cards (grid)
│ └──────┘ └──────┘ └──────┘ └──────┘   │
├─────────────────────────────────────────┤
│                                         │
│  Main content section                   │  Services table, form, etc.
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  Timeline / History                     │  Activities, communications
│                                         │
└─────────────────────────────────────────┘
```

### Dashboard

```
┌─────────────────────────────────────────┐
│ PageHeader ("Dashboard")                │
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │Stat │ │Stat │ │Stat │ │Stat │       │  Top-level stats
│ └─────┘ └─────┘ └─────┘ └─────┘       │
├─────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐     │
│ │  Calendar    │  │  Quick Links │     │  Two-column
│ │              │  │  / Actions   │     │
│ └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────┘
```

---

## 6. Status & State Indicators

### Colored Dots (Compact Status)

Used in POS quote list for follow-up status:

```tsx
<span className={cn(
  "h-2 w-2 rounded-full inline-block",
  FOLLOW_UP_STATUS_COLORS[status]  // from constants.ts
)} />
```

### Stale Indicator

Quotes without recent activity show an orange warning:

```tsx
<AlertTriangle className="h-4 w-4 text-amber-500" />
```

### Inline Status Select

Follow-up status is editable inline on list pages:

```tsx
<Select value={status} onValueChange={handleChange}>
  <SelectTrigger className="h-7 text-xs w-32">
    <SelectValue />
  </SelectTrigger>
  {/* options from FOLLOW_UP_STATUS_LABELS */}
</Select>
```

---

## 7. Interactive Patterns

### Icon Sizes

| Context | Size | Class |
|---------|------|-------|
| Button icon (with text) | 16px | `h-4 w-4` |
| Standalone action icon | 16px | `h-4 w-4` |
| Stat card icon | 32px | `h-8 w-8` |
| Empty state icon | 48px | `h-12 w-12` |
| Navigation icon | 20px | `h-5 w-5` |

### Button Patterns

| Pattern | Classes |
|---------|---------|
| Primary | `<Button>` (default variant) |
| Secondary | `<Button variant="outline">` |
| Destructive | `<Button variant="destructive">` |
| Ghost/subtle | `<Button variant="ghost">` |
| Small button | `<Button size="sm">` |
| Icon-only | `<Button variant="ghost" size="sm"><Icon className="h-4 w-4" /></Button>` |
| Button with icon | `<Button><Icon className="h-4 w-4" /> Label</Button>` |

### Confirmation Flows

All destructive actions require confirmation via `ConfirmDialog`:

```tsx
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Delete Quote"
  description="This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"
  onConfirm={handleDelete}
/>
```

### Customer Search

Consistent across all implementations:
- 2-character minimum before searching
- 300ms debounce
- Digits → phone search, text → name search
- Results show name + phone + email

---

## 8. Dark Mode

All public-facing pages support dark mode via `dark:` Tailwind variants.

### Pattern

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
    <p className="text-gray-500 dark:text-gray-400">Muted text</p>
  </Card>
</div>
```

### Rules

- Every `bg-white` needs a `dark:bg-gray-800` or `dark:bg-gray-900`
- Every `text-gray-900` needs a `dark:text-gray-100`
- Every `text-gray-500` needs a `dark:text-gray-400`
- Every `border-gray-200` needs a `dark:border-gray-700`
- Email templates have separate dark mode handling

---

## 9. Responsive Breakpoints

Tailwind mobile-first breakpoints:

| Breakpoint | Prefix | Min Width | Usage |
|-----------|--------|-----------|-------|
| Default | (none) | 0px | Mobile layout (stack, full-width) |
| `sm` | `sm:` | 640px | Tablet (side-by-side, fixed widths) |
| `md` | `md:` | 768px | Small desktop |
| `lg` | `lg:` | 1024px | Desktop (4-column grids) |
| `xl` | `xl:` | 1280px | Wide desktop |

### Standard Responsive Patterns

```html
<!-- Full width mobile → fixed desktop -->
<div className="w-full sm:w-64" />

<!-- Stack mobile → row desktop -->
<div className="flex flex-col gap-4 sm:flex-row sm:items-center" />

<!-- 1 → 2 → 4 column grid -->
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" />

<!-- Hide on mobile, show on desktop -->
<div className="hidden sm:block" />
```

---

## 10. Anti-Patterns

These will be REJECTED in code review:

| ❌ Don't Do This | ✅ Do This Instead |
|------------------|-------------------|
| Inline styles (`style={{ color: 'red' }}`) | Tailwind classes (`text-red-600`) |
| Custom CSS files for components | Tailwind utility classes |
| `alert()` for notifications | `toast()` from sonner |
| Custom loading spinners | `<Spinner />` component |
| Custom table implementations | `<DataTable />` component |
| `px-3 py-2` for card padding (inconsistent) | `p-4` or `p-6` (standard) |
| `text-lg` for body text | `text-sm` (14px is body standard) |
| `font-bold` for everything | Use weight scale per typography section |
| Hardcoded color hex values | Tailwind color classes |
| `rounded-xl` on cards (inconsistent) | `rounded-lg` (Tailwind Card default) |
| `shadow-xl` on cards (heavy) | `shadow-sm` or default Card shadow |
| Custom badge/pill components | `<Badge variant="..." />` |
| `margin-top: 20px` between sections | `space-y-6` on parent |
| Random icon sizes per page | Follow icon size table above |
| Missing dark mode variants on public pages | Always add `dark:` equivalents |
