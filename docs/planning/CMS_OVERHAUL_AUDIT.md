# CMS Content System Overhaul — Phase A Audit

> **Audited:** 2026-02-26
> **Auditor:** Claude Code (Opus 4.6)
> **Status:** Complete — ready for Phase B planning
> **Companion:** `CMS_OVERHAUL_PROJECT_PLAN.md`

---

## Table of Contents

1. [Content Block System Inventory](#1-content-block-system-inventory)
2. [About Page Inventory](#2-about-page-inventory)
3. [Terms Page Inventory](#3-terms-page-inventory)
4. [Cities/SEO Inventory](#4-citiesseo-inventory)
5. [Footer Drag-Drop Assessment](#5-footer-drag-drop-assessment)
6. [Image Upload Inventory](#6-image-upload-inventory)
7. [Form Validation Audit](#7-form-validation-audit)
8. [Pages Editor Inventory](#8-pages-editor-inventory)
9. [Toast Message Audit Table](#9-toast-message-audit-table)
10. [URL Image Field Replacement Checklist](#10-url-image-field-replacement-checklist)
11. [Public Frontend Routing Map](#11-public-frontend-routing-map)
12. [Homepage Composition Analysis](#12-homepage-composition-analysis)
13. [Seasonal Themes Assessment](#13-seasonal-themes-assessment)
14. [Dead Code Deletion Checklist](#14-dead-code-deletion-checklist)
15. [DB Schema Excerpts](#15-db-schema-excerpts)
16. [Component Dependency Map](#16-component-dependency-map)
17. [Data Migration Plan](#17-data-migration-plan)
18. [Risk Assessment](#18-risk-assessment)
19. [Refined Phase B–E Task Breakdown](#19-refined-phase-be-task-breakdown)
20. [Session Structure Recommendation](#20-session-structure-recommendation)
21. [Website Admin Menu Recommendation](#21-website-admin-menu-recommendation)
22. [Homepage Management Recommendation](#22-homepage-management-recommendation)

---

## 1. Content Block System Inventory

### Database Table: `page_content_blocks`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| page_path | TEXT | NOT NULL | Route path, e.g., `/areas/torrance` |
| page_type | TEXT | NOT NULL | Context: `city_landing`, `service_detail`, `custom` |
| block_type | TEXT | NOT NULL, DEFAULT `rich_text` | CHECK constraint below |
| title | TEXT | NULLABLE | Optional section heading |
| content | TEXT | NOT NULL | Block-specific JSON or markdown |
| sort_order | INT | NOT NULL, DEFAULT 0 | Display order per page |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Visibility toggle |
| ai_generated | BOOLEAN | NOT NULL, DEFAULT false | Set when AI creates the block |
| ai_last_generated_at | TIMESTAMPTZ | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**CHECK constraint:** `block_type IN ('rich_text', 'faq', 'features_list', 'cta', 'testimonial_highlight')`

**TypeScript type** (in `src/lib/supabase/types.ts`):
```typescript
export type ContentBlockType = 'rich_text' | 'faq' | 'features_list' | 'cta' | 'testimonial_highlight';
```

### Existing Block Types

| Block Type | Content Format | Editor Component | Renderer Component | Has AI? |
|---|---|---|---|---|
| `rich_text` | Markdown string | `MarkdownEditor` | `RichTextBlock` — markdown→HTML | Yes (improve) |
| `faq` | JSON array `[{question, answer}]` | `FaqEditor` | `FaqBlock` — `<details>/<summary>` + FAQ schema.org | Yes (generate) |
| `features_list` | JSON array `[{title, description}]` | `FeaturesListEditor` | `FeaturesListBlock` — 2-col grid, CheckCircle icons | Yes (improve) |
| `cta` | JSON `{heading, description, button_text, button_url}` | `CtaEditor` | `CtaBlock` — gradient banner + button | No |
| `testimonial_highlight` | JSON `{quote, author, rating, source}` | `TestimonialEditor` | `TestimonialBlock` — blockquote + stars | No |

### Add Block Mechanism

- Button row at bottom of editor: `[Rich Text] [FAQ] [Features List] [CTA] [Testimonial]`
- POST `/api/admin/cms/content` with `page_path`, `page_type`, `block_type`
- API auto-calculates `sort_order = max(existing) + 1`
- New block auto-expands for immediate editing

### Remove Block Mechanism

- Trash icon in block header → confirmation dialog → DELETE `/api/admin/cms/content/{id}`
- Hard delete (no soft-delete)

### Reorder Mechanism

- Native HTML5 drag-and-drop on block rows (GripVertical handle)
- `dragstart` → `dragover` (splice/insert in local state) → `dragend` → PATCH `/api/admin/cms/content/reorder`
- Reorder payload: `{ pagePath, orderedIds: [...] }`
- Reverts on API error via `loadBlocks()` refetch

### Key Component Props

```
ContentBlockEditor: { pagePath, pageType, onClose? }
BlockRow: { block, isExpanded, isSaving, isAiLoading, isDragging, onToggleExpand, onUpdate, onDelete, onAiImprove, onAiGenerateFaq, onDrag* }
MarkdownEditor: { value, onChange, placeholder?, rows?, onAiImprove?, aiLoading? }
FaqEditor: { items: FaqItem[], onChange, onAiGenerate?, aiLoading? }
```

### AI Content Generation

- Endpoint: POST `/api/admin/cms/content/ai-generate`
- Service: `src/lib/services/ai-content-writer.ts`
- Model: `claude-sonnet-4-20250514` (4000 tokens)
- Modes: `full_page` (creates 6 blocks for city pages), `single_block`, `improve`, `batch_cities`
- Business context injected: name, phone, location, Google rating

### Files

| Purpose | File Path |
|---|---|
| Admin editor | `src/components/admin/content/content-block-editor.tsx` |
| Public renderer | `src/components/public/content-block-renderer.tsx` |
| HTML editor | `src/components/admin/content/page-html-editor.tsx` |
| FAQ editor | `src/components/admin/content/faq-editor.tsx` |
| Markdown editor | `src/components/admin/content/markdown-editor.tsx` |
| Data layer | `src/lib/data/page-content.ts` |
| AI writer | `src/lib/services/ai-content-writer.ts` |
| API CRUD | `src/app/api/admin/cms/content/route.ts` |
| API single | `src/app/api/admin/cms/content/[id]/route.ts` |
| API reorder | `src/app/api/admin/cms/content/reorder/route.ts` |
| API AI gen | `src/app/api/admin/cms/content/ai-generate/route.ts` |

---

## 2. About Page Inventory

### DB Storage

**Table:** `business_settings` (key-value JSONB store)

| Key | Type | Value Structure |
|-----|------|-----------------|
| `team_members` | JSONB array | `[{ name, role, bio, photo_url }]` |
| `credentials` | JSONB array | `[{ title, description, image_url }]` |
| `about_text` | JSONB string | Plain text (rendered with `whitespace-pre-line`) |

### Admin Form Fields

**File:** `src/app/admin/website/about/page.tsx`

| Section | Field | Type | Component | Required | Validation |
|---------|-------|------|-----------|----------|-----------|
| About | aboutText | string | `<textarea>` (4 rows) | No | None |
| Team | name | string | `<Input>` | No | None |
| Team | role | string | `<Input>` | No | None |
| Team | bio | string | `<textarea>` (2 rows) | No | None |
| Team | photo_url | string\|null | `<Input>` (URL text) | No | None |
| Credentials | title | string | `<Input>` | No | None |
| Credentials | image_url | string\|null | `<Input>` (URL text) | No | None |
| Credentials | description | string | `<Input>` | No | None |

**Reorder:** Team members have up/down arrows. Credentials have no reorder (add/delete only).
**Validation:** Zero validation on any field. Empty entries are allowed.

### API Shape

- GET `/api/admin/cms/about` → `{ team_members, credentials, about_text }`
- PATCH `/api/admin/cms/about` → `{ success }` (upserts to `business_settings`)
- Permission: `cms.about.manage`
- Cache tag: `cms-about`

### Data Layer

**File:** `src/lib/data/team.ts`

- `getTeamData()` → `{ members: TeamMember[], credentials: Credential[], aboutText: string }`
- Converts snake_case (DB) → camelCase (public): `photo_url` → `photoUrl`, `image_url` → `imageUrl`
- Wrapped with React `cache()` for request deduplication

### Public Frontend Rendering

**Rendered on:** Homepage (`src/app/(public)/page.tsx`, lines 179–271)
**Section title:** "Meet the Team" (hardcoded)
**No dedicated About page** — data only appears on the homepage.

- Team grid: 1/2/3 column responsive grid
- Each card: circular photo (128px) or initials fallback, name, role (lime), bio (2-line clamp)
- Credentials: flex row of badge images (80px) + title + description
- Only renders if `teamData.members.length > 0`

---

## 3. Terms Page Inventory

### DB Storage

**Table:** `business_settings`

| Key | Type | Value Structure |
|-----|------|-----------------|
| `terms_and_conditions` | JSONB array | `[{ title, content, is_active }]` |
| `terms_effective_date` | JSONB string | `YYYY-MM-DD` or empty |

### Admin Form Fields

**File:** `src/app/admin/website/terms/page.tsx`

| Section | Field | Type | Component | Required | Validation |
|---------|-------|------|-----------|----------|-----------|
| Header | effectiveDate | string | `<Input type="date">` | No | None |
| Sections | title | string | `<Input>` | No | None |
| Sections | content | string | `<textarea>` (4 rows) | No | None |
| Sections | is_active | boolean | `<Switch>` | No | None |

**Reorder:** Up/down chevron buttons. GripVertical icon is decorative only (no DnD).
**Validation:** Zero validation. Empty sections allowed.

### API Shape

- GET `/api/admin/cms/terms` → `{ sections, effectiveDate }`
- PATCH `/api/admin/cms/terms` → `{ success }` (upserts to `business_settings`)
- Permission: `cms.seo.manage` ← **BUG: Should be `cms.terms.manage` or similar**
- Cache tag: `cms-terms`

### Public Frontend Rendering

**File:** `src/app/(public)/terms/page.tsx`
**Route:** `/terms`
**Revalidate:** 3600 seconds (1 hour)

- Hero section with breadcrumbs + "Terms & Conditions" h1
- Effective date shown if present
- Only `is_active: true` sections rendered
- Numbered sections (1., 2., 3...) with title + content
- Footer note with contact info (email/phone linked)
- **Default fallback:** 9 built-in sections if no custom terms exist (Service Agreement, Payment Terms, Cancellation, SMS Consent, Email Communications, Photo Documentation, Warranty, Mobile Service, General Terms)

---

## 4. Cities/SEO Inventory

### Database Table: `city_landing_pages`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| city_name | TEXT | NOT NULL | e.g., "Torrance" |
| slug | TEXT | UNIQUE, NOT NULL | URL slug, e.g., `torrance` |
| state | TEXT | NOT NULL, DEFAULT `CA` | |
| distance_miles | DECIMAL | NULLABLE | Miles from home base |
| heading | TEXT | NULLABLE | Auto-generated if blank |
| intro_text | TEXT | NULLABLE | Auto-generated if blank |
| service_highlights | JSONB | NULLABLE | Unused in current UI |
| local_landmarks | TEXT | NULLABLE | Unused in current UI |
| meta_title | TEXT | NULLABLE | SEO |
| meta_description | TEXT | NULLABLE | SEO |
| focus_keywords | TEXT | NULLABLE | Comma-separated |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| body_content | TEXT | NULLABLE | Legacy, unused |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### Admin Form Fields

**File:** `src/app/admin/website/seo/cities/page.tsx`

| Field | Component | Required | Validation | Notes |
|-------|-----------|----------|-----------|-------|
| city_name | `<Input>` | Yes | None client-side | Auto-generates slug |
| state | `<Input>` (2 char) | Yes | None | Default `CA` |
| slug | `<Input>` | Yes | None | Auto-gen from city_name |
| distance_miles | `<Input>` (float) | No | None | |
| heading | `<Input>` | No | None | Auto-gen default |
| intro_text | `<textarea>` | No | None | |
| meta_title | `<Input>` | No | 60-char counter | |
| meta_description | `<textarea>` | No | 160-char counter | |
| focus_keywords | `<Input>` | No | None | |
| is_active | `<Switch>` | No | None | |

### Admin List View

Columns: City Name (link), Slug (`/areas/{slug}`), Distance, Content (opens ContentBlockEditor modal), Status toggle, Actions (preview/edit/delete)

### API Routes

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/api/admin/cms/seo/cities` | Auth only | All cities, ordered by sort_order |
| POST | `/api/admin/cms/seo/cities` | `cms.seo.manage` | Validates slug uniqueness |
| GET | `/api/admin/cms/seo/cities/[id]` | Auth only | Single city |
| PATCH | `/api/admin/cms/seo/cities/[id]` | `cms.seo.manage` | Duplicate slug check |
| DELETE | `/api/admin/cms/seo/cities/[id]` | `cms.seo.manage` | Hard delete |

Cache tag: `cms-seo`

### Data Layer

**File:** `src/lib/data/cities.ts`

- `getActiveCities()` — all active, ordered by sort_order (React `cache()`)
- `getCityBySlug(slug)` — single active city

### Public Frontend

**`/areas`** — City grid (3 columns desktop), hero + animated cards
**`/areas/[citySlug]`** — City landing page with hero, service highlights, ContentBlocks, reviews section, CTA

- Static params from `getActiveCities()` for build-time pre-rendering
- Uses `<ContentBlocks>` for city-specific AI-generated content
- Auto-generates heading/intro if not set in DB
- JSON-LD: LocalBusiness + breadcrumb schema

**Seeded cities (11):** Lomita, Torrance, Harbor City, Carson, Gardena, Wilmington, San Pedro, Redondo Beach, Palos Verdes Estates, Rolling Hills, Rancho Palos Verdes

---

## 5. Footer Drag-Drop Assessment

### Library

**Native HTML5 Drag-and-Drop API** — NO external library (no dnd-kit, no react-beautiful-dnd).

### Implementation Details

**File:** `src/app/admin/website/footer/page.tsx` (~1,800 lines)

| Aspect | Implementation |
|--------|---------------|
| Drag handle | `GripVertical` icon (lucide-react), `cursor-grab` / `active:cursor-grabbing` |
| Drag state | Local state: `dragColId`, `dragOverIndex` |
| Drop zone | Each column card is both draggable and drop target |
| Visual feedback | `ring-2 ring-blue-500 ring-offset-1` on hover target; `opacity-50` on dragged source |
| Overlay | None — default OS drag ghost image |
| Reorder callback | `handleColDrop()` → splice/insert → PATCH `/api/admin/footer/columns/reorder` |
| Rollback | Reverts state on API error |

### Data Structure

Array of `ColumnWithLinks` (extends `FooterColumn` with nested `links` array). Each column has `id`, `title`, `content_type`, `is_enabled`, `sort_order`, `section_id`, `config` (JSONB).

### Coupling Analysis

**Tightly coupled to footer:**
- Column-specific child components (`LinksEditor`, `BrandColumnEditor`, `HtmlEditor`)
- Reorder payload: `{ items: [{id, sort_order}] }` — footer-specific
- State hooks local to page

**Extractable logic:**
- Core algorithm: find indices → splice source → insert at target → reassign sort_order
- UI: drag handle icon, ring visual, cursor classes, opacity feedback
- Same pattern also exists in `MultiImageUpload` for product image reorder

### Extraction Effort: MODERATE (4–6 hours)

Create:
1. `useDragDropReorder(items, onReorder)` hook — handles index swapping, state, callback
2. `<DragDropItem>` wrapper — applies drag attrs, visual feedback via context/props
3. Footer page → pass sorted array + `onReorder` callback, receive `isDragged`/`isDragOver` per item

---

## 6. Image Upload Inventory

### Existing Upload Components

| Component | File | Storage Bucket | Use Case |
|-----------|------|---------------|----------|
| MultiImageUpload | `src/app/admin/catalog/components/multi-image-upload.tsx` | `product-images` | Product catalog (up to 6 per product) |
| HtmlImageManager | `src/components/admin/html-image-manager.tsx` | `cms-assets` | CMS page HTML editor + footer HTML columns |
| Content Image API | `src/app/api/admin/upload/content-image/route.ts` | `cms-assets` | Backend for HtmlImageManager |

### Upload Specifications

| Spec | Value |
|------|-------|
| Max file size | 5 MB |
| Accepted types | PNG, JPG, WebP, GIF, AVIF (products); +SVG (CMS) |
| URL format | `https://zwvahzymzardmxixyfim.supabase.co/storage/v1/object/public/{bucket}/{path}` |
| Path format (products) | `products/{productId}/{uuid}.{ext}` |
| Path format (CMS) | `content-images/{folder}/{timestamp}-{random}.{ext}` |
| Cache-Control | 1 year (`31536000`) for CMS images |

### MultiImageUpload Features (Products)

- Multi-file upload (max 6)
- Drag-to-reorder (native HTML5 DnD)
- Primary image badge + set primary
- Replace image in-place
- Remove image (deletes from storage + DB)
- Per-image loading spinner
- Callbacks: `onUpload`, `onRemove`, `onReplace`, `onSetPrimary`, `onReorder`

### HtmlImageManager Features (CMS)

- Single image selection per insertion
- Upload tab (drag-and-drop zone) + Browse Library tab (search existing images)
- Size controls: width input + presets (Thumb 80, Small 150, Medium 250, Large 400, Full 0)
- Alignment: Left / Center / Right
- Style options: Rounded corners, Border
- Alt text input
- Generates HTML `<img>` snippet with inline styles for editor insertion

### Missing: Standalone ImageUploadField

No reusable single-image upload component exists for form fields. Current URL-based image fields (team photos, credentials, OG images, hero slides, theme backgrounds) all use plain `<Input>` accepting text URLs.

**Needed:** `<ImageUploadField>` with `value` (current URL), `onChange` (new URL), preview, upload button, remove button, drag-drop. Should wrap the existing `/api/admin/upload/content-image/` API.

---

## 7. Form Validation Audit

### FormField Component

**File:** `src/components/ui/form-field.tsx`

| Prop | Type | Description |
|------|------|-------------|
| `label` | string | Field label text |
| `error` | string? | Error message to display |
| `description` | string? | Helper text below label |
| `required` | boolean? | Shows red asterisk `*` next to label |
| `className` | string? | Container wrapper classes |
| `labelClassName` | string? | Label element classes |
| `children` | ReactNode | Form input/control |
| `htmlFor` | string? | Label htmlFor attribute |

**Error behavior:**
- ✅ Accepts `error` prop
- ✅ Shows red error text below field (`text-xs text-red-500`)
- ❌ Does NOT render red border on the Input — that's the Input component's responsibility
- Error text replaces description text (mutually exclusive)

**Conclusion:** FormField already supports error display. Need to also pass error styling to `<Input>` children (red border class). Could extend with a `hasError` class injection or expect Input to accept an `error` boolean for `border-red-500`.

### Validation Gaps Across Website Admin

| File | What's Validated | What's Missing |
|------|-----------------|----------------|
| `/about/page.tsx` | Nothing | Team member name/role should be required |
| `/terms/page.tsx` | Nothing | Section title/content should be required when section exists |
| `/pages/[id]/page.tsx` | Title only (`toast.error('Title is required')`) | Slug validation (special chars, uniqueness) |
| `/pages/new/page.tsx` | Title only | Same as above |
| `/footer/page.tsx` | Column title on add | Missing content validation |
| `/navigation/page.tsx` | Page/route selection + label on add | None missing |
| `/hero/[id]/page.tsx` | Nothing client-side | Title should be required |
| `/themes/[id]/page.tsx` | Nothing client-side | Name/slug should be required |
| `/tickers/[id]/page.tsx` | Nothing client-side | Message should be required |
| `/seo/cities/page.tsx` | Nothing client-side | City name, state, slug should be required |

### `beforeunload` / Unsaved Changes

**None found** across any Website admin page. No `beforeunload` listener, no dirty-state tracking, no navigation prompt. Users can navigate away from edited forms with zero warning.

### `required` Attribute on Inputs

**None found.** No HTML `required` attributes used on any form inputs in Website admin pages.

---

## 8. Pages Editor Inventory

### Database Table: `website_pages`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| title | TEXT | NOT NULL | |
| slug | TEXT | UNIQUE, NOT NULL | Can contain `/` for hierarchy |
| page_template | TEXT | NOT NULL, DEFAULT `content` | CHECK: `content`, `landing`, `blank` |
| parent_id | UUID | FK → website_pages(id) ON DELETE SET NULL | Hierarchy support |
| content | TEXT | DEFAULT `''` | Main HTML content |
| is_published | BOOLEAN | NOT NULL, DEFAULT false | |
| show_in_nav | BOOLEAN | NOT NULL, DEFAULT false | Auto-creates header nav entry |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | |
| meta_title | TEXT | NULLABLE | SEO |
| meta_description | TEXT | NULLABLE | SEO |
| og_image_url | TEXT | NULLABLE | Social sharing image |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

### Page Templates

| Template | Rendering |
|----------|-----------|
| `content` | Container + prose styles (blog/about) |
| `landing` | Full-width layout |
| `blank` | Content blocks only, no built-in content area |

### Admin Form Fields

| Field | Component | Required | Validation | Notes |
|-------|-----------|----------|-----------|-------|
| Title | `<Input>` | Yes | `toast.error('Title is required')` | Only validation present |
| Slug | `<Input>` | Auto-gen | None | Auto-generated from title unless manually edited |
| Template | `<select>` | Yes | Default `content` | |
| Parent Page | `<select>` | No | | Only top-level pages shown |
| Content | `PageHtmlEditor` | No | | Hidden if template=`blank` |
| Meta Title | `<Input>` | No | 60-char counter (visual) | |
| Meta Description | `<textarea>` | No | 160-char counter (visual) | |
| OG Image URL | `<input type="url">` | No | None | **Needs ImageUploadField** |
| Published | `<Switch>` | No | Default false | |
| Show in Nav | `<Switch>` | No | Default false | Auto-creates/removes header nav entry |

### Admin List View

Columns: Title (link, indented for children with └), Slug (`/p/{slug}`), Template (color badge), Published (toggle), In Nav (toggle), Updated (date), Actions (preview/delete)

### API Routes

| Method | Route | Permission | Notes |
|--------|-------|-----------|-------|
| GET | `/api/admin/cms/pages` | `cms.pages.manage` | All pages, ordered by sort_order |
| POST | `/api/admin/cms/pages` | `cms.pages.manage` | Title required; auto-prefixes child slug with parent slug |
| GET | `/api/admin/cms/pages/[id]` | `cms.pages.manage` | Single page |
| PATCH | `/api/admin/cms/pages/[id]` | `cms.pages.manage` | Handles show_in_nav toggle (auto-creates/deletes nav entries) |
| DELETE | `/api/admin/cms/pages/[id]` | `cms.pages.manage` | Hard delete + linked nav entries |

Cache tags: `cms-pages`, `cms-navigation`

### Navigation Auto-Link

When `show_in_nav` toggled **on**: Inserts nav entry `{ placement: 'header', label: page.title, url: /p/{slug}, page_id: page.id, sort_order: 99 }`
When toggled **off**: Deletes all nav entries with matching `page_id`

### Data Layer

**File:** `src/lib/data/website-pages.ts`

- `getPageBySlug(slug)` — published page by slug (cached 300s, tag `cms-pages`)
- `getPublishedPages()` — all published (for sitemap)
- `getAllPages()` — admin function, no cache
- `getAllNavigationItems(placement)` — all nav items for admin
- `getFooterData()` — cached footer data (tag `footer-data`)

---

## 9. Toast Message Audit Table

| File | Type | Trigger | Message | Accurate? | Missing Validation? |
|------|------|---------|---------|-----------|---------------------|
| `about/page.tsx` | error | Load fail | "Failed to load about content" | Yes | — |
| `about/page.tsx` | success | Save OK | "About content saved" | Yes | No form validation at all |
| `about/page.tsx` | error | Save fail | "Failed to save" | Generic | No error detail |
| `pages/[id]/page.tsx` | error | Page not found | "Page not found" | Yes | — |
| `pages/[id]/page.tsx` | error | Load fail | "Failed to load page" | Generic | — |
| `pages/[id]/page.tsx` | error | SEO needs title | "Enter a page title first" | Yes | — |
| `pages/[id]/page.tsx` | success | SEO generated | "SEO fields generated" | Yes | — |
| `pages/[id]/page.tsx` | error | SEO fail | "Failed to generate SEO" | Generic | — |
| `pages/[id]/page.tsx` | error | Form validation | "Title is required" | Yes | Slug not validated |
| `pages/[id]/page.tsx` | success | Save OK | "Page saved" | Yes | — |
| `pages/[id]/page.tsx` | error | Save fail | json.error or "Failed to save page" | Yes | — |
| `pages/new/page.tsx` | error | SEO needs title | "Enter a page title first" | Yes | — |
| `pages/new/page.tsx` | success | SEO generated | "SEO fields generated" | Yes | — |
| `pages/new/page.tsx` | error | Form validation | "Title is required" | Yes | Slug not validated |
| `pages/new/page.tsx` | success | Create OK | "Page created" | Yes | — |
| `pages/new/page.tsx` | error | Create fail | json.error or "Failed to create page" | Yes | — |
| `terms/page.tsx` | error | Load fail | "Failed to load terms content" | Yes | — |
| `terms/page.tsx` | success | Save OK | "Terms saved" | Yes | No form validation |
| `terms/page.tsx` | error | Save fail | "Failed to save terms" | Generic | — |
| `hero/page.tsx` | error | Load fail | "Failed to load hero slides" | Yes | — |
| `hero/page.tsx` | error | Create fail | "Failed to create slide" | Generic | — |
| `hero/page.tsx` | error | Toggle fail | "Failed to update slide" | Generic | — |
| `hero/page.tsx` | success | Delete OK | "Slide deleted" | Yes | — |
| `hero/page.tsx` | error | Delete fail | "Failed to delete slide" | Generic | — |
| `hero/[id]/page.tsx` | error | Load fail | "Failed to load slide" | Generic | — |
| `hero/[id]/page.tsx` | success | Save OK | "Slide saved" | Yes | — |
| `hero/[id]/page.tsx` | error | Save fail | "Failed to save slide" | Generic | — |
| `themes/page.tsx` | error | Load fail | "Failed to load themes" | Generic | — |
| `themes/page.tsx` | error | Create fail | "Failed to create theme" | Generic | — |
| `themes/page.tsx` | success | Toggle OK | "Theme deactivated"/"Theme activated" | Yes | — |
| `themes/page.tsx` | error | Toggle fail | "Failed to update theme" | Generic | — |
| `themes/page.tsx` | success | Delete OK | "Theme deleted" | Yes | — |
| `themes/page.tsx` | error | Delete fail | "Failed to delete theme" | Generic | — |
| `themes/[id]/page.tsx` | error | Load fail | "Failed to load theme" | Generic | — |
| `themes/[id]/page.tsx` | success | Save OK | "Theme saved" | Yes | No name/slug validation |
| `themes/[id]/page.tsx` | error | Save fail | "Failed to save theme" | Generic | — |
| `footer/page.tsx` | error | Load fail | "Failed to load footer data" | Generic | — |
| `footer/page.tsx` | success | Toggle section | "{label} enabled/disabled" | Yes | — |
| `footer/page.tsx` | error | Toggle fail | "Failed to update section" | Generic | — |
| `footer/page.tsx` | error | Add validation | "Title is required" | Yes | — |
| `footer/page.tsx` | success | Add column | "Column added" | Yes | — |
| `footer/page.tsx` | error | Add fail | err.error or "Failed to add column" | Yes | — |
| `footer/page.tsx` | success | Delete column | "Column deleted" | Yes | — |
| `footer/page.tsx` | error | Delete fail | "Failed to delete column" | Generic | — |
| `footer/page.tsx` | error | Enable max | "Maximum {N} active columns..." | Yes | — |
| `footer/page.tsx` | error | Enable span | "Enabling this column..." (span validation) | Yes | — |
| `footer/page.tsx` | error | Enable fail | "Failed to update column" | Generic | — |
| `footer/page.tsx` | error | Config save | "Failed to save config" | Generic | — |
| `footer/page.tsx` | error | Reorder fail | "Failed to reorder" | Generic | — |
| `navigation/page.tsx` | error | Load fail | "Failed to load navigation" | Generic | — |
| `navigation/page.tsx` | error | Toggle fail | "Failed to update" | Generic | — |
| `navigation/page.tsx` | success | Delete OK | "Link removed" | Yes | — |
| `navigation/page.tsx` | error | Delete fail | "Failed to delete" | Generic | — |
| `navigation/page.tsx` | success | Edit OK | "Link updated" | Yes | — |
| `navigation/page.tsx` | error | Edit fail | "Failed to update" | Generic | — |
| `navigation/page.tsx` | error | Add validation | "Select a page" | Yes | — |
| `navigation/page.tsx` | error | Add validation | "Select a route" | Yes | — |
| `navigation/page.tsx` | error | Add validation | "Label is required" | Yes | — |
| `navigation/page.tsx` | success | Add OK | "Link added" | Yes | — |
| `navigation/page.tsx` | error | Add fail | "Failed to add link" | Generic | — |
| `navigation/page.tsx` | error | Reorder fail | "Failed to reorder" | Generic | — |
| `tickers/[id]/page.tsx` | error | Load fail | "Failed to load ticker" | Generic | — |
| `tickers/[id]/page.tsx` | success | Save OK | "Ticker saved" | Yes | No message validation |
| `tickers/[id]/page.tsx` | error | Save fail | "Failed to save ticker" | Generic | — |

### Summary

- **15 instances** of generic error messages with no API error detail parsed
- **3 pages** (About, Terms, Tickers) have zero client-side form validation
- **No toast** for successful load (correct — don't need one)
- **No misleading messages** found — but many are too vague to be helpful

---

## 10. URL Image Field Replacement Checklist

Every `<Input>` or `<input>` field currently accepting an image URL that needs `ImageUploadField`:

| File | Field Name | Label | Current Component |
|------|-----------|-------|-------------------|
| `about/page.tsx:243-251` | `photo_url` | "Photo URL (optional)" | `<Input>` |
| `about/page.tsx:306-313` | `image_url` | "Image URL (optional)" | `<Input>` |
| `pages/[id]/page.tsx:307-314` | `og_image_url` | "OG Image URL" | `<input type="url">` |
| `pages/new/page.tsx:265-273` | `og_image_url` | "OG Image URL" | `<input type="url">` |
| `hero/[id]/page.tsx:261-268` | `video_url` | "Video URL" | `<Input>` (not image — skip) |
| `themes/[id]/page.tsx:414-419` | `hero_bg_image_url` | "Hero Background Image URL" | `<Input>` |

**Total to replace: 5 fields** (4 image uploads + 1 OG image URL across 2 page files)

Note: `video_url` in hero editor is for YouTube/Vimeo embeds — not an image upload candidate.

---

## 11. Public Frontend Routing Map

| Route | Data Sources | CMS-Driven? | Hardcoded Elements |
|-------|-------------|-------------|-------------------|
| `/` (homepage) | hero_slides, business_settings (7 queries), team_members, google_reviews, service_categories, feature_flags | Partially | "Why Choose Us" differentiators array (3 items); Google place ID |
| `/terms` | business_settings (terms_and_conditions, terms_effective_date), business info | Fully | Default 9 sections as fallback |
| `/areas` | `getActiveCities()`, business info | Partially | Hero intro text |
| `/areas/[citySlug]` | city_landing_pages, service_categories, page_content_blocks, reviews | Yes | City intro text fallback |
| `/services` | service_categories | Yes (DB) | Hero intro text |
| `/services/[categorySlug]` | service_categories, services, ContentBlocks | Yes | — |
| `/products` | product_categories | Yes (DB) | Hero intro text |
| `/gallery` | job_photos (joined with jobs/vehicles) | Feature-flag gated | — |
| `/p/[...slug]` | website_pages, page_content_blocks | **Fully** | Template determines layout |

### Routes Affected by CMS Overhaul

| Route | Impact |
|-------|--------|
| `/terms` | Will read from new location (Pages system or redirect to `/p/terms`) |
| `/areas/[citySlug]` | City data source may change depending on migration approach |
| `/p/[...slug]` | Stays — gains new block types (team_grid, credentials, terms_sections, city_info) |
| Homepage "Meet the Team" | Will read from `team_members` table instead of business_settings JSON |

---

## 12. Homepage Composition Analysis

### Sections Rendered (in order)

| # | Section | Component | Data Source | CMS-Driven? |
|---|---------|-----------|-------------|-------------|
| 1 | JSON-LD schema | `<JsonLd>` | business info + reviews | N/A |
| 2 | Hero | `<HeroCarousel>` or `<HeroSection>` | hero_slides + business_settings.hero_carousel_config | **Yes** (toggle) |
| 3 | Ad zone | `<AdZone>` | ad_placements + feature_flag | **Yes** |
| 4 | Section ticker | `<SectionTickerSlot>` | announcement_tickers | **Yes** |
| 5 | Trust bar | `<TrustBar>` | N/A (static) | **No** |
| 6 | Services grid | Custom grid | service_categories | **Yes** |
| 7 | Ad zone | `<AdZone>` | ad_placements | **Yes** |
| 8 | "Why Choose Us" | Custom section | **Hardcoded** `differentiators[]` (lines 53-69) | **No** |
| 9 | "Meet the Team" | Custom section | `getTeamData()` → business_settings | **Yes** |
| 10 | Ad zone | `<AdZone>` | ad_placements | **Yes** |
| 11 | Google Reviews | Custom section | google_reviews table | **Yes** |
| 12 | Section ticker | `<SectionTickerSlot>` | announcement_tickers | **Yes** |
| 13 | Ad zone | `<AdZone>` | ad_placements | **Yes** |
| 14 | Section ticker | `<SectionTickerSlot>` | announcement_tickers | **Yes** |
| 15 | CTA section | `<CtaSection>` | Hardcoded before/after images | **Partially** |

### Hardcoded Business Data Issues

1. **Differentiators array** (lines 53-69): 3 items (Mobile Service, Ceramic Pro Certified, Eco-Friendly Products) — NOT in DB
2. **Google place ID** (line 319): Hardcoded `ChIJf7qNDhW1woAROX-FX8CScGE` — should be `business_settings.google_place_id`
3. **CTA before/after images** (lines 338-339): Static image URLs

### Recommendation

**Keep homepage separate from the Pages system.** Rationale:

1. The homepage is an **assembly of CMS widgets** (hero carousel, ad zones, tickers, service grid, reviews) — not a simple content page
2. The composition and ordering of sections is **intentional UX design** (reviews before CTA, trust bar after hero, etc.)
3. Converting to a generic Page would lose the per-section data source connections (each section queries different tables)
4. Only 3 items are hardcoded — these can be moved to `business_settings` keys without restructuring the page
5. The PageTemplate system (`content`/`landing`/`blank`) is designed for content-focused pages, not widget assemblies

**Action items for the homepage (optional, separate from CMS overhaul):**
- Move `differentiators` array to `business_settings.homepage_differentiators`
- Move Google place ID to `business_settings.google_place_id`
- These are low-priority and don't block Phase B–E

---

## 13. Seasonal Themes Assessment

### System Overview

Two distinct but related systems:

| System | Table | Purpose |
|--------|-------|---------|
| Base theme | `site_theme_settings` | Persistent customization (colors, fonts, buttons, spacing) — 50+ columns |
| Seasonal themes | `seasonal_themes` | Time-limited overlays (Christmas, Halloween, etc.) — color overrides, particles, ticker |

### Priority Chain

```
CSS defaults (:root in globals.css) → Site theme settings → Seasonal theme overrides (highest)
```

### Key Technical Pattern

**CSS variable indirection** (CRITICAL for Tailwind v4):
- ThemeProvider sets **raw** CSS variables (`--lime`, `--brand-dark`)
- `@theme inline` in Tailwind references them via `var(--lime)`
- Without this: Tailwind would inline values and runtime CSS overrides wouldn't cascade

### Activation/Deactivation

- **Manual:** One-click activate/deactivate in admin (mutually exclusive — only one active at a time)
- **Automatic:** CRON job `/api/cron/theme-activation` runs every 15 min
  - Checks `auto_activate=true` + `starts_at <= now` + `ends_at > now` → activates
  - Checks `auto_activate=true` + `is_active=true` + `ends_at <= now` → deactivates
- Activation auto-enables `seasonal_themes` feature flag
- Deactivation with no other active themes disables the flag

### Admin Pages

| Page | Purpose |
|------|---------|
| `/admin/website/themes` | List all seasonal themes, one-click toggle, presets (8 holidays/seasons) |
| `/admin/website/themes/[id]` | Edit: name, slug, color overrides (10 fields), particle effect, ticker, schedule, hero BG |
| `/admin/website/theme-settings` | Base theme: Colors, Typography, Buttons tabs, 4 preset themes |

### Self-Contained Assessment

**YES — this system is fully self-contained.** It does NOT need changes as part of the CMS overhaul. Reasons:
- Theme settings and seasonal themes have their own admin pages, API routes, DB tables, and frontend rendering
- No coupling to the About, Terms, or Cities systems being migrated
- ThemeProvider operates independently of page content
- The only shared element is the `HtmlEditorToolbar` component (used in both page editor and theme settings), which stays as-is

### Potential Phase B Benefit

The `hero_bg_image_url` field in the seasonal theme editor uses a plain `<Input>` for URL — this could benefit from the `ImageUploadField` extraction in Phase B (item already in replacement checklist above).

---

## 14. Dead Code Deletion Checklist

### Admin Pages to Remove After Migration

| File | Reason | Dependencies |
|------|--------|-------------|
| `src/app/admin/website/about/page.tsx` | Migrated to Pages system | About API route |
| `src/app/admin/website/terms/page.tsx` | Migrated to Pages system | Terms API route |

**Note:** City pages admin (`seo/cities/page.tsx`) should **remain** — cities have their own DB table with geo fields (distance, state, sort_order) that don't fit the generic Pages model. The admin UI should stay but gain integration with the unified content block system (which it already has via the ContentBlockEditor modal).

### API Routes to Remove

| File | Reason | External Consumers? |
|------|--------|-------------------|
| `src/app/api/admin/cms/about/route.ts` | Data migrated to team_members table + website_pages | None known |
| `src/app/api/admin/cms/terms/route.ts` | Data migrated to website_pages content block | None known |

### Data Access Files to Remove

| File | Reason | Current Consumers |
|------|--------|------------------|
| `src/lib/data/team.ts` | Replaced by team_members table queries in new data layer | Homepage (`page.tsx`) |

**Keep:** `src/lib/data/cities.ts` — cities table stays.

### Components Only Used by Removed Pages

None identified — the About and Terms pages use only standard UI components (`Input`, `Switch`, `textarea`, `PageHeader`) that are shared across the app.

### Import Chain Breaks

| File with Import | Import Target | Fix |
|-----------------|---------------|-----|
| `src/app/(public)/page.tsx` | `@/lib/data/team` (`getTeamData`) | Update to query `team_members` table directly |

### Admin Sidebar Config Updates

**File:** `src/lib/auth/roles.ts` (lines 137–206)

Remove these entries from `SIDEBAR_NAV` → Website children array:

```typescript
// REMOVE:
{ label: 'About & Team', href: '/admin/website/about', icon: 'Users' },
{ label: 'Terms & Conditions', href: '/admin/website/terms', icon: 'FileText' },
```

**Keep all others** — Hero, Navigation, Footer, Tickers, Ads, Theme & Styles, Seasonal Themes, Catalog Display, SEO, City Pages all remain as separate admin pages.

### `business_settings` Keys to Clean Up (After Migration Confirmed Stable)

| Key | Current Use | Action |
|-----|------------|--------|
| `team_members` | About page team data | Delete after migration to `team_members` table |
| `credentials` | About page credentials data | Delete after migration to content block |
| `about_text` | About page text | Delete after migration to page content |
| `terms_and_conditions` | Terms sections | Delete after migration to content block |
| `terms_effective_date` | Terms effective date | Delete after migration to content block metadata |

### n8n Workflows / External Consumers

No known external consumers reference `/api/admin/cms/about` or `/api/admin/cms/terms`. The voice agent API references services and quotes, not CMS routes.

---

## 15. DB Schema Excerpts

### `website_pages`

```sql
CREATE TABLE website_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  page_template TEXT NOT NULL DEFAULT 'content'
    CHECK (page_template IN ('content', 'landing', 'blank')),
  parent_id UUID REFERENCES website_pages(id) ON DELETE SET NULL,
  content TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  show_in_nav BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `page_content_blocks`

```sql
CREATE TABLE page_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path TEXT NOT NULL,
  page_type TEXT NOT NULL,
  block_type TEXT NOT NULL DEFAULT 'rich_text',
  title TEXT,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  ai_last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_block_type CHECK (block_type IN ('rich_text', 'faq', 'features_list', 'cta', 'testimonial_highlight'))
);
```

### `city_landing_pages`

```sql
CREATE TABLE city_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL DEFAULT 'CA',
  distance_miles DECIMAL,
  heading TEXT,
  intro_text TEXT,
  service_highlights JSONB,
  local_landmarks TEXT,
  meta_title TEXT,
  meta_description TEXT,
  focus_keywords TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  body_content TEXT,  -- legacy, unused
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `seasonal_themes`

```sql
CREATE TABLE seasonal_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color_overrides JSONB DEFAULT '{}',
  gradient_overrides JSONB DEFAULT '{}',
  particle_effect TEXT CHECK (particle_effect IN ('snowfall','fireworks','confetti','hearts','leaves','stars','sparkles')),
  particle_intensity INTEGER DEFAULT 50,
  particle_color TEXT,
  ticker_message TEXT,
  ticker_bg_color TEXT,
  ticker_text_color TEXT,
  themed_ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  hero_bg_image_url TEXT,
  body_bg_color TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  auto_activate BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `site_theme_settings`

```sql
CREATE TABLE site_theme_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Custom Theme',
  is_active BOOLEAN NOT NULL DEFAULT false,
  mode TEXT NOT NULL DEFAULT 'dark' CHECK (mode IN ('dark', 'light')),
  -- 50+ color, typography, button, spacing columns (all nullable TEXT)
  -- Colors: color_page_bg, color_card_bg, color_header_bg, color_footer_bg, color_section_alt_bg,
  --         color_text_primary, color_text_secondary, color_text_muted, color_text_on_primary,
  --         color_primary, color_primary_hover, color_accent, color_accent_hover,
  --         color_link, color_link_hover, color_border, color_border_light, color_divider,
  --         color_success, color_warning, color_error
  -- Typography: font_family, font_heading_family, font_base_size, font_h1-h3_size, font_body_size,
  --             font_small_size, font_line_height, font_heading_weight, font_body_weight
  -- Buttons: btn_primary_*, btn_secondary_*, btn_cta_*
  -- Borders: border_radius, border_card_radius, border_width
  -- Spacing: spacing_section_padding, spacing_card_padding, spacing_header_height
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `business_settings` (CMS-related keys)

| Key | Type | Used By |
|-----|------|---------|
| `team_members` | JSONB array | About page (to be migrated) |
| `credentials` | JSONB array | About page (to be migrated) |
| `about_text` | JSONB string | About page (to be migrated) |
| `terms_and_conditions` | JSONB array | Terms page (to be migrated) |
| `terms_effective_date` | JSONB string | Terms page (to be migrated) |
| `hero_carousel_config` | JSONB object | Hero carousel settings |
| `ticker_enabled` | JSONB boolean | Ticker master toggle |
| `ai_txt_content` | JSONB string | AI.txt content |

---

## 16. Component Dependency Map

### Content Block System

```
ContentBlockEditor
  ├── BlockRow (per block)
  │   ├── BlockContentEditor (switch by block_type)
  │   │   ├── MarkdownEditor (rich_text)
  │   │   ├── FaqEditor (faq)
  │   │   ├── FeaturesListEditor (features_list)
  │   │   ├── CtaEditor (cta)
  │   │   └── TestimonialEditor (testimonial_highlight)
  │   └── GripVertical (drag handle)
  └── API: /api/admin/cms/content/*

ContentBlockRenderer (public)
  ├── RichTextBlock → markdownToHtml()
  ├── FaqBlock → <details>/<summary> + FAQ schema
  ├── FeaturesListBlock → 2-col grid
  ├── CtaBlock → gradient banner
  └── TestimonialBlock → blockquote
```

### Page Editor

```
pages/[id]/page.tsx
  ├── PageHtmlEditor (main content)
  │   ├── HtmlEditorToolbar
  │   │   ├── toolbar-items/* (12 dialog components)
  │   │   └── HtmlImageManager (image insertion)
  │   └── textarea (HTML source)
  ├── ContentBlockEditor (blocks section)
  └── API: /api/admin/cms/pages/[id]
```

### About Page (to be removed)

```
about/page.tsx
  ├── Input (team name, role, photo_url)
  ├── textarea (about text, bio)
  ├── Switch (none — no toggles)
  └── API: /api/admin/cms/about

  Public rendering:
  (public)/page.tsx → getTeamData() → team section
```

### Terms Page (to be removed)

```
terms/page.tsx
  ├── Input (section title, effective date)
  ├── textarea (section content)
  ├── Switch (is_active toggle)
  └── API: /api/admin/cms/terms

  Public rendering:
  (public)/terms/page.tsx → business_settings
```

### Footer Page (drag-drop extraction target)

```
footer/page.tsx
  ├── Native HTML5 DnD (column reorder)
  ├── LinksEditor (per column)
  ├── BrandColumnEditor
  ├── HtmlEditorToolbar + HtmlImageManager
  └── API: /api/admin/footer/*
```

---

## 17. Data Migration Plan

### About Data

| Current Location | New Location | Migration Method |
|-----------------|-------------|-----------------|
| `business_settings.about_text` | `website_pages` row (slug=`about`, content field) | SQL INSERT + copy |
| `business_settings.team_members` | `team_members` table (new, one row per member) | SQL INSERT per array element |
| `business_settings.credentials` | `page_content_blocks` (`credentials` block on About page) | SQL INSERT (JSON stays as block content) |

### Terms Data

| Current Location | New Location | Migration Method |
|-----------------|-------------|-----------------|
| `business_settings.terms_and_conditions` | `page_content_blocks` (`terms_sections` block type on Terms page) | SQL INSERT (JSON stays as block content) |
| `business_settings.terms_effective_date` | Block metadata in `terms_sections` block content | Embed in block JSON |

### Cities Data

**No migration needed.** City landing pages already have their own `city_landing_pages` table and already integrate with the ContentBlockEditor. The city admin page stays in place.

### Public Route Changes

| Current Route | After Migration | Method |
|--------------|----------------|--------|
| Homepage team section | No change in route; data source changes from `getTeamData()` to `team_members` table query | Code update |
| `/terms` | Either redirect to `/p/terms` OR keep route and update data source | TBD — see risk assessment |
| `/areas/*` | No change | Already working |
| `/p/*` | Gains new block types | Code update |

---

## 18. Risk Assessment

### High Risk

1. **Homepage team section data source change** — The homepage server component directly calls `getTeamData()` from `src/lib/data/team.ts`. After migration to `team_members` table, this call must be updated. If the data shape changes (snake_case vs camelCase), the rendering code breaks silently.
   - **Mitigation:** Write the new data layer function first, verify shape matches, then swap the import.

2. **Terms page URL change** — If terms moves from `/terms` to `/p/terms`, existing links from booking confirmations, email footers, and the footer "Terms & Conditions" bottom link break.
   - **Mitigation:** Keep `/terms` route alive as a redirect OR render the new Terms page at the original `/terms` route instead of through the `/p/[...slug]` catch-all.

3. **Content block CHECK constraint** — Current DB constraint limits `block_type` to 5 values. New block types (`team_grid`, `credentials`, `terms_sections`, `city_info`, `gallery`) require an ALTER TABLE to expand the CHECK constraint.
   - **Mitigation:** Write the migration early in Phase C; test in development first.

### Medium Risk

4. **About page permission mismatch** — About uses `cms.about.manage`, Terms uses `cms.seo.manage` (bug). New unified pages use `cms.pages.manage`. Staff with `cms.about.manage` but not `cms.pages.manage` will lose access.
   - **Mitigation:** Audit current role grants before removing old permissions. Likely only admin/super_admin have these anyway.

5. **Default terms fallback** — Public `/terms` page has a `getDefaultSections()` fallback with 9 built-in sections. After migration, this fallback logic needs to move into the migration SQL (seed the content blocks) or be preserved in the new rendering path.
   - **Mitigation:** Include default sections in the migration SQL.

6. **SEO metadata preservation** — About page has no dedicated SEO fields. Terms page has minimal metadata. After migration to Pages, ensure `meta_title`, `meta_description` are populated.
   - **Mitigation:** Run AI SEO generation on newly created About and Terms pages post-migration.

### Low Risk

7. **Image URL format preservation** — Team member `photo_url` and credential `image_url` are external URLs (not Supabase storage). After migration, ensure these URLs are preserved as-is in the new `team_members` table and content blocks.

8. **Sort order preservation** — Team members and terms sections rely on array order in JSONB. Migration to table rows must preserve this via `sort_order` column.

9. **Naming convention mismatch** — `team.ts` uses camelCase (`photoUrl`), DB stores snake_case (`photo_url`). New data layer should be consistent.

---

## 19. Refined Phase B–E Task Breakdown

### Phase B — Shared Components (1–2 sessions)

| Task | Files to Create/Modify | Dependencies |
|------|----------------------|-------------|
| B.1 ImageUploadField | Create `src/components/admin/image-upload-field.tsx` | Uses existing `/api/admin/upload/content-image/` |
| B.2 DragDropReorder | Create `src/components/admin/drag-drop-reorder.tsx` or `src/lib/hooks/use-drag-drop-reorder.ts` | Extract from `footer/page.tsx` |
| B.3 InlineValidation | Extend `src/components/ui/form-field.tsx` (add border pass-through); Create `src/lib/hooks/use-form-validation.ts` | None |
| B.4 UnsavedChangesGuard | Create `src/lib/hooks/use-unsaved-changes.ts` | None |
| B.5 SlugAutoGenerator | Add to page editor (both new + edit) | None |
| B.6 Update Pages Editor | Modify `pages/[id]/page.tsx` + `pages/new/page.tsx` — add ImageUploadField, InlineValidation, UnsavedChangesGuard, SlugAutoGenerator | B.1–B.5 |

### Phase C — New Block Types + AI (2–3 sessions)

| Task | Files to Create/Modify | Dependencies |
|------|----------------------|-------------|
| C.0 Expand block_type CHECK | Migration: ALTER TABLE page_content_blocks DROP/ADD CONSTRAINT | None |
| C.1 team_grid block | Add to `content-block-editor.tsx` + `content-block-renderer.tsx` | B.1 (ImageUploadField), B.2 (DragDrop) |
| C.2 credentials block | Add to same files | B.1, B.2 |
| C.3 terms_sections block | Add to same files | B.2 |
| C.4 city_info block | Add to same files | Already partially exists via ContentBlockEditor on cities |
| C.5 gallery block | Add to same files | B.1, B.2 |
| C.6 CTA block enhancement | Already exists — verify/enhance | None |
| C.7 AI prompts | Extend `ai-content-writer.ts` with block-specific prompts | C.1–C.4 |
| C.8 TypeScript type update | Update `ContentBlockType` in `types.ts` | C.0 |

### Phase D — Migration + Cleanup (1–2 sessions)

| Task | Files to Create/Modify | Dependencies |
|------|----------------------|-------------|
| D.1 Create team_members table | Migration SQL + update `DB_SCHEMA.md` | None |
| D.2 Migrate About data | Migration SQL: business_settings → website_pages + team_members + content block | D.1, C.1, C.2 |
| D.3 Migrate Terms data | Migration SQL: business_settings → website_pages + content block | C.3 |
| D.4 Update homepage | Modify `(public)/page.tsx`: update `getTeamData()` to query team_members table | D.2 |
| D.5 Update terms route | Either redirect `/terms` → `/p/terms` OR keep route with new data source | D.3 |
| D.6 Create team detail page | Create `src/app/(public)/team/[memberSlug]/page.tsx` | D.1, D.2 |
| D.7 Remove old admin tabs | Delete `about/page.tsx`, `terms/page.tsx` | D.2, D.3, D.4, D.5 |
| D.8 Remove old API routes | Delete `about/route.ts`, `terms/route.ts` | D.7 |
| D.9 Update sidebar config | Modify `src/lib/auth/roles.ts` — remove About & Terms entries | D.7 |
| D.10 Clean up data layer | Delete `src/lib/data/team.ts`, update homepage imports | D.4 |
| D.11 Clean up business_settings | Remove 5 migrated keys (after stability confirmed) | D.2, D.3 |
| D.12 Regression testing | Test all public routes, admin editors, team detail pages | All above |

### Phase E — Deferred Enhancements (separate sessions)

| Task | Description | Independent? |
|------|-------------|-------------|
| E.1 Preview mode | `?preview=true&token=...` on public pages | Yes |
| E.2 Global blocks | `is_global` flag, many-to-many page references | Yes |
| E.3 Revision history | `cms_page_revisions` table, auto-save snapshots | Yes |
| E.4 Replace remaining URL fields | ImageUploadField on hero, themes hero_bg_image_url | Yes |

---

## 20. Session Structure Recommendation

### Phase B: 1 session (sequential)

All B tasks should be in one session since they build on each other:
1. B.1 ImageUploadField
2. B.2 DragDropReorder
3. B.3 InlineValidation
4. B.4 UnsavedChangesGuard
5. B.5 SlugAutoGenerator
6. B.6 Update Pages Editor (integrates all of the above)

### Phase C: 2 sessions (partially parallel)

**Session C1:** C.0 (DB migration) → C.1 (team_grid) → C.2 (credentials) → C.8 (TypeScript type update)
**Session C2:** C.3 (terms_sections) → C.4 (city_info enhancement) → C.5 (gallery) → C.7 (AI prompts)

Sessions C1 and C2 are independent after C.0 completes — they each add different block types to the same editor component but don't conflict.

### Phase D: 2 sessions (sequential)

**Session D1:** D.1 (team_members table) → D.2 (migrate About) → D.3 (migrate Terms) → D.4 (update homepage) → D.5 (update terms route)
**Session D2:** D.6 (team detail page) → D.7 (remove old tabs) → D.8 (remove old APIs) → D.9 (sidebar) → D.10 (data layer) → D.11 (business_settings cleanup) → D.12 (regression testing)

D1 must complete before D2.

### Total: 5–6 Claude Code sessions

---

## 21. Website Admin Menu Recommendation

### Current Sidebar (13 items under Website)

```
Website
├── Pages
├── Navigation
├── Footer
├── Hero
├── Tickers
├── Ads
├── Theme & Styles
├── Seasonal Themes
├── About & Team        ← TO BE REMOVED
├── Catalog Display
├── SEO
├── City Pages
└── Terms & Conditions  ← TO BE REMOVED
```

### After Migration (11 items)

```
Website
├── Pages
├── Navigation
├── Footer
├── Hero
├── Tickers
├── Ads
├── Theme & Styles
├── Seasonal Themes
├── Catalog Display
├── SEO
└── City Pages
```

### Recommendation: **Grouped sub-menus**

11 items in a flat list is still too many for quick scanning. Group by function:

```
Website
├── Content
│   ├── Pages
│   ├── City Pages
│   └── Catalog Display
├── Layout
│   ├── Navigation
│   ├── Footer
│   ├── Hero
│   └── Tickers
├── Appearance
│   ├── Theme & Styles
│   └── Seasonal Themes
├── Advertising
│   └── Ads
└── SEO
    └── SEO Settings
```

**Rationale:**
- "Content" groups what you **write** (pages, cities, catalog toggles)
- "Layout" groups what you **arrange** (nav, footer, hero, tickers)
- "Appearance" groups what you **style** (themes)
- "Advertising" and "SEO" are standalone

**Alternative (simpler):** Keep flat but reorder logically:

```
Website
├── Pages              ← Primary content creation
├── City Pages
├── Hero
├── Navigation
├── Footer
├── Tickers
├── Ads
├── Catalog Display
├── Theme & Styles
├── Seasonal Themes
└── SEO
```

This puts content-creation items first, followed by layout widgets, then appearance, then SEO.

**Decision deferred to owner preference.** Either approach works — the grouping is cleaner but adds indentation complexity to the sidebar component.

---

## 22. Homepage Management Recommendation

### Recommendation: **Keep separate** — do NOT convert homepage to a unified Page

### Rationale

1. **Widget assembly, not content page** — The homepage is a curated assembly of 7+ CMS widgets (hero carousel, ad zones, tickers, service grid, team, reviews, CTA). Each widget queries its own table. A generic Page can't express this composition.

2. **Section ordering is intentional UX** — Reviews before CTA, trust bar after hero, tickers between sections. This layout is designed, not arbitrary. Making it drag-and-droppable via content blocks would risk accidental disruption of conversion-optimized layout.

3. **Performance implications** — The homepage uses `Promise.all()` to parallel-fetch 7 data sources in one server render. Converting to content blocks would serialize these into sequential block-level fetches or require a complex custom rendering path.

4. **Only 3 hardcoded items** — The differentiators array and Google place ID can be moved to `business_settings` keys with minimal effort, without restructuring the entire page.

5. **Template system mismatch** — The `content`/`landing`/`blank` templates are designed for content-focused pages. The homepage is closer to a dashboard layout with embedded widgets.

### If the owner later wants homepage sections to be reorderable

A dedicated "Homepage Builder" with drag-and-drop section slots would be more appropriate than shoehorning it into the Pages system. This is out of scope for the current CMS overhaul.

---

*End of Phase A Audit*
