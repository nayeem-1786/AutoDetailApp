# CMS Content System Overhaul — Project Plan

> **Project:** Smart Details Auto Spa — Admin Website Section Restructure
> **Created:** 2026-02-26
> **Updated:** 2026-02-28 (Phase E.1 Preview Mode complete)
> **Status:** Phase E.1 Complete — Token-based preview mode for unpublished pages
> **Audit:** `docs/planning/CMS_OVERHAUL_AUDIT.md`
> **Owner:** Nayeem (121 Media)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Decision](#2-architecture-decision)
3. [Shared Components](#3-shared-components)
4. [Three-Layer Validation System](#4-three-layer-validation-system)
5. [AI Content Generation — Per Block](#5-ai-content-generation--per-block)
6. [Phase A — Audit](#6-phase-a--audit)
7. [Phase B — Shared Components](#7-phase-b--shared-components)
8. [Phase C — New Block Types + AI](#8-phase-c--new-block-types--ai)
9. [Phase D — Migration + Cleanup](#9-phase-d--migration--cleanup)
10. [Phase E — Deferred Enhancements](#10-phase-e--deferred-enhancements)
11. [Key Files Reference](#11-key-files-reference)
12. [Original Bug Reports](#12-original-bug-reports)
13. [Design Decisions Log](#13-design-decisions-log)
14. [Out of Scope](#14-out-of-scope)

---

## 1. Problem Statement

The Admin > Website section grew organically. Each new content type (About, Terms, Cities) got its own admin tab, API, editor components, and validation patterns — despite all being "content pages." The result:

- **No standardization** between editors (About uses plain textarea, Pages uses HTML editor + AI, Terms uses custom section system, Footer has its own HTML editor with drag-and-drop)
- **Duplicated patterns** — team member reordering, section management, and content editing are all reimplemented differently in each tab
- **Missing features on standalone pages** — About/Terms lack HTML editor, AI assistance, SEO panel, publish controls, content blocks
- **Inconsistent validation** — Pages has one toast check, About has zero validation, Terms has zero validation
- **Image handling fragmented** — some places use proper upload component (Products), most use raw URL text inputs
- **Bugs caused by fragmentation** — hardcoded headlines, broken photo display, missing detail pages

### The Solution

Extend the existing Pages system (which already works well) with new Content Block types. Migrate About/Terms/Cities into Pages. Remove standalone tabs. One system, one editor, flexible blocks.

---

## 2. Architecture Decision

### What We're NOT Doing

- ❌ No new page editor component
- ❌ No template system
- ❌ No page types/categories
- ❌ No ground-up CMS rebuild

### What We ARE Doing

- ✅ Extending the existing `ContentBlockEditor` with new block types
- ✅ Extracting shared components from existing code
- ✅ Migrating standalone content into the Pages system
- ✅ Removing redundant admin tabs after migration

### Unified Page Editor Structure

Every page uses the same editor. The editor has:

```
┌─ Page Editor (same for ALL pages) ─────────────────┐
│                                                      │
│  PAGE SETTINGS CARD                                  │
│  [Title] [Slug (auto-generated)] [Parent Page]       │
│  [Template ▾: content | landing | blank]             │
│                                                      │
│  MAIN HTML CONTENT CARD (if template ≠ blank)        │
│  ┌────────────────────────────────────────────────┐  │
│  │ PageHtmlEditor + AI Button                     │  │
│  │ (rich HTML toolbar + AI content generation)    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  CONTENT BLOCKS CARD                                 │
│  [+ Add Block ▾]                                     │
│  ┌─ Block 1: team_grid ─────── [drag] [delete] ──┐  │
│  │  Team member cards with photo upload + AI bio  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ Block 2: credentials ───── [drag] [delete] ──┐  │
│  │  Awards/certs with image upload + AI desc      │  │
│  └────────────────────────────────────────────────┘  │
│  ┌─ Block 3: faq ───────────── [drag] [delete] ──┐  │
│  │  FAQ accordion with AI answer generation       │  │
│  └────────────────────────────────────────────────┘  │
│  (any number of blocks, any combination)             │
│                                                      │
│  SEO PANEL CARD (collapsible)                        │
│  [Meta Title] [Meta Description] [OG Image Upload]   │
│  [AI Generate SEO ✨]                                │
│                                                      │
│  PUBLISHING CARD                                     │
│  [Published toggle] [Show in Navigation toggle]      │
│                                                      │
│  [Cancel] [Save Page]                                │
└──────────────────────────────────────────────────────┘
```

### Content Block Types

**Existing (from audit):**

| Block Type | Content Format | Editor | Renderer | Has AI? |
|---|---|---|---|---|
| `rich_text` | Markdown string | `MarkdownEditor` | `RichTextBlock` (md→HTML) | ✅ (improve) |
| `faq` | JSON array `[{question, answer}]` | `FaqEditor` | `FaqBlock` (details/summary + FAQ schema) | ✅ (generate) |
| `features_list` | JSON array `[{title, description}]` | `FeaturesListEditor` | `FeaturesListBlock` (2-col grid) | ✅ (improve) |
| `cta` | JSON `{heading, description, button_text, button_url}` | `CtaEditor` | `CtaBlock` (gradient banner) | ❌ |
| `testimonial_highlight` | JSON `{quote, author, rating, source}` | `TestimonialEditor` | `TestimonialBlock` (blockquote + stars) | ❌ |

**New block types to add (Phase C):**

| Block Type | What it renders | Replaces | Has AI? |
|---|---|---|---|
| `team_grid` | **Display widget** — links to /admin/website/team. Config: columns, show_certifications, show_excerpt, max_members. Data from `team_members` table | About page team section | N/A (widget) |
| `credentials` | **Display widget** — links to /admin/website/credentials. Config: layout (grid/list), show_descriptions, max_items. Data from `credentials` table | About page credentials section | N/A (widget) |
| `terms_sections` | Numbered T&C sections with active toggles + effective date | Entire Terms editor | ✅ per section |
| `gallery` | Photo gallery grid | Future use | ❌ |

**DB constraint requires migration:** Current CHECK constraint limits `block_type` to 5 values. ALTER TABLE needed before new block types can be added (Phase C.0).

### ⚠️ DECISION: HTML Editor Standardization

**All content blocks will migrate from MarkdownEditor to PageHtmlEditor (HTML editor).** Rationale:

- One editor component everywhere = consistent behavior, one rendering path, one set of bugs
- HTML editor already has toolbar, image insertion (HtmlImageManager), and AI generation
- Business users shouldn't need to learn Markdown syntax for SEO content
- Removes the markdown-to-HTML conversion step on the public renderer
- Existing markdown content in `rich_text` and `features_list` blocks must be migrated to HTML as part of Phase C

**Affected components:**
- `src/components/admin/content/markdown-editor.tsx` — to be replaced/removed
- `src/components/public/content-block-renderer.tsx` — `RichTextBlock` no longer needs `markdownToHtml()`, renders HTML directly
- All existing `rich_text` block content in DB needs one-time markdown→HTML conversion

### Migration Map

| Current Location | Migrates To |
|---|---|
| Admin > Website > About (about text) | Page (`/p/about`) → main HTML content |
| Admin > Website > About (team members) | Page (`/p/about`) → `team_grid` content block |
| Admin > Website > About (credentials) | Page (`/p/about`) → `credentials` content block |
| Admin > Website > Terms | Page (`/p/terms`) → `terms_sections` content block |
| Homepage team data source | `getTeamData()` → new `team_members` table query (same rendering, new data source) |

**NOT migrating:**
- **City pages** — STAY in `city_landing_pages` table with their own admin page. Already integrate with ContentBlockEditor. Geo fields (distance, state, sort_order) don't fit generic Pages model. Content blocks on city pages will benefit from the enhanced block types and keyword-aware AI generation.
- **Homepage** — STAYS as a separate widget assembly. Only action: update team data source from `business_settings` JSON to `team_members` table. Optionally move 3 hardcoded items to `business_settings` later.

### What STAYS Separate (Appearance & Layout Widgets)

These are layout widgets, not pages. They remain as their own admin tabs:

- **Hero/Banner** — carousel slide management
- **Navigation** — menu structure and ordering
- **Footer** — column layout, links, brand section
- **Tickers** — announcement bar messages
- **Theme Settings** — colors, fonts, layout variables (dark/light mode)
- **Seasonal Themes** — time-based theme activations/deactivations (fully self-contained per audit)
- **Ads** — promotional placements
- **Catalog Display** — service/product toggle settings
- **City Pages** — own DB table, geo fields, already uses ContentBlockEditor

### Post-Audit Decisions (Resolved)

| Decision | Outcome | Rationale |
|---|---|---|
| Homepage management | **Keep separate** | Widget assembly (15 sections, 12 CMS-driven), not a content page. Only 3 hardcoded items — move to `business_settings` later |
| Website admin menu | **Flat list, reorder logically** — Pages first, remove About & Terms | 11 items after cleanup. Owner to decide on grouping later if desired |
| City pages | **Stay separate** | Own DB table with geo fields, already uses ContentBlockEditor. Enhanced with keyword-aware AI |
| Editor standardization | **HTML editor everywhere** | Remove MarkdownEditor from content blocks. One editor, one rendering path |
| `/p/` prefix | **Keep** | Safety from route collisions. Important pages get dedicated route files (e.g., `/terms`, `/about`) |
| `/terms` route | **Keep alive, change data source** | High risk of breaking existing links. Route reads from Pages system instead of `business_settings` |
| Seasonal Themes | **No changes needed** | Fully self-contained per audit. Only benefit: ImageUploadField for `hero_bg_image_url` (Phase E) |

---

## 3. Shared Components

### Components to Build or Extract

| Component | Source / Status | Used Where |
|---|---|---|
| **ImageUploadField** | New — wraps existing `/api/admin/upload/content-image/` API. Reference `MultiImageUpload` for upload logic, but this is a single-image component | Team photos, credential images, OG images — 5 URL fields to replace (see audit §10) |
| **DragDropReorder** | Extract from `footer/page.tsx` — native HTML5 DnD, moderate effort (~4-6 hrs). Create `useDragDropReorder` hook + `<DragDropItem>` wrapper | Content blocks, team members, credentials, terms sections, FAQ items |
| **InlineValidation** | `FormField` already supports `error` prop (✅ confirmed by audit). Need to: pass `border-red-500` to Input children, create `use-form-validation` hook | Every form field across all editors |
| **UnsavedChangesGuard** | New — zero `beforeunload` handling exists anywhere (confirmed by audit) | Every editor page |
| **SlugAutoGenerator** | Pages editor already auto-generates slug from title. Verify edge cases (special chars, dupes) | Page editor settings card |

### Components to Reuse As-Is

| Component | Current Location | Already Used In |
|---|---|---|
| **PageHtmlEditor** | `src/components/admin/content/page-html-editor.tsx` | Pages editor — will become THE editor for all content blocks |
| **HtmlEditorToolbar** | `src/components/admin/html-editor-toolbar.tsx` | Pages editor, Footer editor |
| **ContentBlockEditor** | `src/components/admin/content/content-block-editor.tsx` | Pages editor, City pages (via modal) |
| **AI Content Writer** | `src/lib/services/ai-content-writer.ts` | Pages editor, City pages (4 modes: full_page, single_block, improve, batch_cities) |
| **HtmlImageManager** | `src/components/admin/html-image-manager.tsx` | HTML editor image insertion (upload + library browse) |

### Components to Remove (Phase C/D)

| Component | Current Location | Replaced By |
|---|---|---|
| **MarkdownEditor** | `src/components/admin/content/markdown-editor.tsx` | PageHtmlEditor in all content blocks |

---

## 4. Three-Layer Validation System

### Layer 1 — Inline Field Errors (immediate feedback)

- Red border (`border-red-500`) on the invalid field
- Small red error text directly below the field (e.g., "Name is required")
- Triggered on **blur** (real-time as user tabs through fields) AND on **save attempt**
- Field stays highlighted until corrected
- Must work inside nested forms (e.g., team member cards within a block)

### Layer 2 — Section-Level Error Indicator

- If a card/section contains errors inside it, show a red badge on the section header
- Example: "Team Members 🔴 2 errors" or a red dot next to the card title
- Visible at a glance without scrolling into the section
- Critical for content blocks where errors may be buried in collapsed or scrolled-away blocks

### Layer 3 — Toast Summary on Save Attempt

- When Save is clicked and validation errors exist: **one** toast message
- Format: "Please fix N errors before saving"
- **Auto-scrolls** the viewport to the first error field
- Toast is the notification; inline errors are the explanation
- No save request is made to the API until all errors are resolved

### Validation Rules by Field Type

| Field | Rule | Error Message |
|---|---|---|
| Page title | Required, non-empty | "Page title is required" |
| Page slug | Required, valid URL characters | "Slug is required" / "Slug contains invalid characters" |
| Team member name | Required if member exists | "Team member name is required" |
| Team member role | Required if member exists | "Role is required" |
| Terms section title | Required if section exists | "Section title is required" |
| Terms section content | Required if section exists | "Section content is required" |
| Image upload | Valid URL if provided | "Invalid image URL" |
| Meta title | Max 60 chars (warning, not error) | Char count turns red |
| Meta description | Max 160 chars (warning, not error) | Char count turns red |

### Implementation Notes

- Audit existing `FormField` component (`src/components/ui/form-field.tsx`) to check if it supports error states
- If yes → adopt universally with error prop
- If no → extend it with `error?: string` prop that renders red border + error text
- Create a `useFormValidation` hook or validation utility to manage error state across complex forms

---

## 5. AI Content Generation — Per Block

Every block type with text/HTML content gets its own AI assistant button, using the existing `ai-content-writer.ts` service with block-type-specific prompts.

| Content Area | AI Action | Prompt Context |
|---|---|---|
| Main page content | "AI Draft Content" | Page title, template, business info |
| HTML block | "AI Draft Content" | Page title, block position |
| Team member bio | "AI Generate Bio" | Member name, role, business info |
| Credential description | "AI Generate Description" | Credential title, business info |
| Terms section content | "AI Generate Section" | Section title, business type |
| City info content | "AI Generate City Content" | City name, services offered |
| CTA block copy | "AI Generate CTA" | Page title, target action |
| FAQ answer | "AI Generate Answer" | Question text, business info |

---

## 6. Phase A — Audit

> **Type:** Claude Code session (read-only, no code changes)
> **Prerequisite:** None
> **Output:** Audit report + refined task list for Phases B–E

### Task A.1 — Inventory Existing Content Block System

- [ ] Read `src/components/admin/content/content-block-editor.tsx` — document what block types exist, how blocks are added/removed/reordered, what the data schema looks like
- [ ] Read `src/components/public/content-block-renderer.tsx` — document how blocks render on the frontend
- [ ] Read `src/components/admin/content/page-html-editor.tsx` — document the HTML editor + AI integration
- [ ] Read `src/components/admin/content/faq-editor.tsx` — document the FAQ block pattern as reference for new blocks
- [ ] Read `src/components/admin/content/markdown-editor.tsx` — check if relevant or deprecated
- [ ] Check DB schema for `cms_page_content_blocks` table — document all columns and types

### Task A.2 — Inventory About Page System

- [ ] Read `src/app/admin/website/about/page.tsx` — document all fields, components, state management
- [ ] Read `src/app/api/admin/cms/about/route.ts` — document API shape, what DB table(s) it reads/writes
- [ ] Check `business_settings` table for about-related JSON fields — document exact schema of `team_members`, `credentials`, `about_text`
- [ ] Read `src/lib/data/team.ts` — document data access layer for team data
- [ ] Check if any public frontend page renders the About data and how (look for team rendering in `(public)/` routes)

### Task A.3 — Inventory Terms Page System

- [ ] Read `src/app/admin/website/terms/page.tsx` — document all fields, components (already reviewed, but check for additional files)
- [ ] Read `src/app/api/admin/cms/terms/route.ts` — document API shape, DB storage
- [ ] Read `src/app/(public)/terms/page.tsx` — document public rendering
- [ ] Check if terms data lives in `business_settings` or its own table

### Task A.4 — Inventory Cities/SEO Page System

- [ ] Read `src/app/admin/website/seo/cities/page.tsx` — document all fields, components
- [ ] Read `src/app/api/admin/cms/seo/cities/route.ts` and `cities/[id]/route.ts` — document API shape
- [ ] Read `src/app/(public)/areas/page.tsx` and `areas/[citySlug]/page.tsx` — document public rendering
- [ ] Check DB schema for `seo_cities` or equivalent table
- [ ] Read `src/lib/data/cities.ts` — document data access

### Task A.5 — Inventory Footer Drag-and-Drop Component

- [ ] Read `src/app/admin/website/footer/page.tsx` — find the drag-and-drop reorder implementation
- [ ] Document which library is used (if any) or if it's custom
- [ ] Assess extractability into a shared `DragDropReorder` component
- [ ] Note any Footer-specific coupling that would need to be abstracted

### Task A.6 — Inventory Image Upload Component

- [ ] Find the image upload component used in Admin > Products > Catalog > Product Images
- [ ] Read `src/app/api/admin/upload/content-image/route.ts` — document the upload API
- [ ] Read `src/components/admin/html-image-manager.tsx` — check if this is the upload component or something else
- [ ] Document: what storage backend (Supabase storage?), what file types accepted, what URL format returned
- [ ] List ALL places across Website admin tabs that use raw URL text inputs for images (to be replaced)

### Task A.7 — Inventory Form Validation Patterns

- [ ] Read `src/components/ui/form-field.tsx` — check if it supports error states (error prop, red border, error text)
- [ ] Search across all Website admin pages for existing validation patterns — document what exists
- [ ] Check for any existing `beforeunload` / unsaved changes handling anywhere in the admin
- [ ] Document the current toast notification patterns and any inconsistencies

### Task A.8 — Inventory Pages Editor (Current State)

- [ ] Read `src/app/admin/website/pages/[id]/page.tsx` — already reviewed, but cross-reference with DB
- [ ] Read `src/app/admin/website/pages/new/page.tsx` — document the "new page" flow
- [ ] Read `src/app/admin/website/pages/page.tsx` — document the pages list view
- [ ] Read `src/app/api/admin/cms/pages/route.ts` and `pages/[id]/route.ts` — document API
- [ ] Check DB schema for `cms_pages` table — document ALL columns
- [ ] Read `src/lib/data/website-pages.ts` — document data access layer

### Task A.9 — Audit All URL Text Input Image Fields

- [ ] Scan every admin page under `src/app/admin/website/` for `<Input>` or `<input>` fields that accept URLs for images
- [ ] Include: team member photo_url, credential image_url, hero slide images, OG image URL, ad creative images
- [ ] For each: document the file path, field name, and current component used
- [ ] This becomes the checklist for ImageUploadField replacement in Phase B

### Task A.10 — Verify Toast Messages

- [ ] Scan all admin Website pages for `toast.error()` and `toast.success()` calls
- [ ] Document each: what triggers it, what message is shown, whether it accurately describes the situation
- [ ] Flag any misleading or missing toast messages
- [ ] Note where validation is completely absent (save without any checks)

### Task A.11 — Document Public Frontend Rendering Paths

- [ ] Map which public routes render content from which data sources
- [ ] Document the `/p/[...slug]` catch-all and its template rendering logic
- [ ] Identify any public routes that would need updating after migration (e.g., `/terms`, `/areas/[city]`)
- [ ] Check for hardcoded strings on public pages (like "Meet the Team") that should come from CMS

### Task A.12 — Audit Homepage Composition

- [ ] Read `src/app/(public)/page.tsx` — document exactly how the homepage is built
- [ ] Identify every data source the homepage pulls from (hero, tickers, business_settings, content blocks, hardcoded sections, etc.)
- [ ] Determine: is it an assembly of CMS widgets, hardcoded sections, content blocks, or a mix?
- [ ] List each section of the homepage and classify: CMS-driven vs. hardcoded
- [ ] Assess: should the homepage become a Page in the unified system, or remain a separate composed layout?
- [ ] Document recommendation with rationale

### Task A.13 — Audit Seasonal Themes System

- [ ] Find the Seasonal Themes admin page (check `src/app/admin/website/themes/` directory — may be `themes/page.tsx` or a separate route)
- [ ] Read the seasonal themes editor — document all fields, components, state management
- [ ] Read the corresponding API routes (`/api/admin/cms/themes/*`)
- [ ] Document: how seasonal themes relate to the base theme settings, how activation/deactivation works, what DB tables are used
- [ ] Check `src/app/api/cron/theme-activation/route.ts` — document the cron-based activation logic
- [ ] Assess: does this system need changes as part of the CMS overhaul, or is it self-contained and working?
- [ ] Note any shared components or patterns that could benefit from the shared component extraction in Phase B

### Task A.14 — Dead Code & Orphan Scan

- [ ] After documenting all systems above, identify files that will become orphaned after migration:
  - Admin pages to be removed (about, terms, city CRUD)
  - API routes to be deprecated/removed
  - Data access files to be replaced (`team.ts`, `cities.ts`, etc.)
  - Components only used by removed pages
- [ ] Check for imports referencing files that will be deleted — map the dependency chain
- [ ] Check for dead CSS/styles only used by removed components
- [ ] Check admin sidebar config file for menu entries that will need updating
- [ ] Check for any external consumers of the API routes to be deprecated (webhooks, n8n workflows, etc.)
- [ ] Produce a complete deletion checklist for Phase D with file paths and dependency notes

### Audit Output

Create `docs/planning/CMS_OVERHAUL_AUDIT.md` containing:

1. Complete inventory tables for each system audited
2. DB schema excerpts for all relevant tables
3. Component dependency map (what uses what)
4. Data migration plan (current table/field → new location)
5. Homepage composition analysis and recommendation
6. Seasonal themes assessment
7. Dead code deletion checklist with dependency notes
8. Identified risks or complications
9. Refined task breakdown for Phases B–E with specific file paths
10. Recommended session structure (which tasks can run in parallel)
11. Recommendation for Website admin menu structure (flat vs. grouped)
12. Recommendation for homepage management approach

---

## 7. Phase B — Shared Components

> **Type:** 1 Claude Code session (sequential — each task builds on previous)
> **Prerequisite:** Phase A audit complete ✅
> **Output:** Reusable components integrated into the existing Pages editor

### Task B.1 — ImageUploadField Component

- [ ] Create `src/components/admin/image-upload-field.tsx`
- [ ] Reference `MultiImageUpload` (`src/app/admin/catalog/components/multi-image-upload.tsx`) for upload logic patterns
- [ ] Reference `HtmlImageManager` (`src/components/admin/html-image-manager.tsx`) for the `cms-assets` bucket upload
- [ ] Wraps the existing upload API (`/api/admin/upload/content-image/`)
- [ ] Props: `value` (current URL), `onChange` (new URL), `label`, `placeholder`, `error`, `folder` (storage path prefix)
- [ ] UI: shows current image preview if URL exists, upload button, remove button
- [ ] Handles file selection, upload progress indicator, error states
- [ ] Supports drag-and-drop file onto the component
- [ ] Storage: `cms-assets` bucket, path format `content-images/{folder}/{timestamp}-{random}.{ext}`
- [ ] Accepted types: PNG, JPG, WebP, GIF, AVIF, SVG. Max 5MB.
- [ ] Replace OG Image URL field in Pages editor as first adoption (verify it works)

### Task B.2 — DragDropReorder Hook + Wrapper

- [ ] Extract drag-and-drop logic from `src/app/admin/website/footer/page.tsx` (native HTML5 DnD, no external library)
- [ ] Create `src/lib/hooks/use-drag-drop-reorder.ts` — handles index swapping, state management, `onReorder` callback
- [ ] Create `src/components/admin/drag-drop-reorder.tsx` — `<DragDropItem>` wrapper that applies drag attrs, visual feedback (ring-2 ring-blue-500, opacity-50 on source, cursor-grab/grabbing)
- [ ] Must work for: content blocks, team members, credentials, terms sections, FAQ items
- [ ] Preserve the existing arrow-button fallback for accessibility
- [ ] Update Footer editor to use the new shared hook/wrapper — verify no regression
- [ ] Update ContentBlockEditor to use new hook/wrapper (it already has native DnD — swap implementation)

### Task B.3 — InlineValidation System

- [ ] `FormField` already supports `error` prop (confirmed by audit: shows red `text-xs text-red-500` text below field)
- [ ] BUT: `FormField` does NOT pass red border to Input children — need to add `border-red-500` class injection when `error` is set
- [ ] Option A: Extend FormField to clone children with `className` including `border-red-500` when error exists
- [ ] Option B: Add `error` boolean prop to `Input` component for red border styling
- [ ] Create `src/lib/hooks/use-form-validation.ts` — hook for complex forms:
  - `setFieldError(fieldPath, message)` — set error on a specific field
  - `clearFieldError(fieldPath)` — clear error when field is corrected
  - `validateAll(rules)` — run all validations, return boolean, set all errors
  - `getFieldError(fieldPath)` — get error message for a field
  - `getSectionErrors(sectionPrefix)` — get count of errors in a section (for Layer 2 badges)
  - `scrollToFirstError()` — auto-scroll to first error field
  - `hasErrors` — boolean for save button guard
- [ ] Create section-level error badge component (red dot/count on card headers)
- [ ] Integrate toast Layer 3: "Please fix N errors before saving" + auto-scroll on save attempt

### Task B.4 — UnsavedChangesGuard

- [ ] Create `src/lib/hooks/use-unsaved-changes.ts`
- [ ] Zero `beforeunload` handling exists anywhere in admin (confirmed by audit) — this is brand new
- [ ] Tracks dirty state (form values changed since last save/load)
- [ ] Adds `beforeunload` event listener when dirty
- [ ] Intercepts Next.js router navigation when dirty (shows confirm dialog)
- [ ] Resets dirty state on successful save
- [ ] Apply to Pages editor as first adoption

### Task B.5 — SlugAutoGenerator Verification

- [ ] Pages editor already auto-generates slug from title (confirmed by audit)
- [ ] Verify edge cases: special characters, multiple spaces, leading/trailing dashes, slug uniqueness
- [ ] Verify the `slugManuallyEdited` flag behavior — once user edits slug field directly, stop auto-generating
- [ ] Verify both "new page" and "edit page" flows (new pages auto-generate, existing pages don't override)
- [ ] Fix any issues found

### Task B.6 — Update Existing Pages Editor with New Components

- [ ] Replace OG Image URL text input → ImageUploadField (both `pages/[id]/page.tsx` and `pages/new/page.tsx`)
- [ ] Add InlineValidation to all required fields (title, slug) — replace current toast-only validation
- [ ] Add UnsavedChangesGuard
- [ ] Verify SlugAutoGenerator works correctly
- [ ] Verify all existing functionality still works (save, load, publish toggle, show in nav toggle, content blocks, AI generation)
- [ ] Fix generic error toast messages to include API error details where available
- [ ] Add SlugAutoGenerator
- [ ] Verify all existing functionality still works
- [ ] Fix any toast messages that don't accurately describe the situation

### Post-Phase B Checkpoint

- [ ] All shared components working in the existing Pages editor
- [ ] No regressions in current Pages functionality
- [ ] Components are generic enough for Phase C block types
- [ ] Update CHANGELOG.md and CLAUDE.md
- [ ] `git add -A && git commit && git push && rm -rf .next`

---

## 8. Phase C — New Block Types + Editor Standardization

> **Type:** 2 Claude Code sessions (partially parallel after C.0)
> **Prerequisite:** Phase B shared components complete
> **Output:** All new content block types, HTML editor standardized, AI prompts updated
>
> **Session C1:** C.0 → C.1 (team_grid) → C.2 (credentials) → C.6 (TypeScript types)
> **Session C2:** C.3 (terms_sections) → C.4 (gallery) → C.5 (AI prompts) → C.7 (markdown→HTML migration)

### Task C.0 — DB Migration: Expand block_type CHECK + TypeScript

- [ ] ALTER TABLE `page_content_blocks` DROP existing CHECK constraint on `block_type`
- [ ] ADD new CHECK constraint allowing: `rich_text`, `faq`, `features_list`, `cta`, `testimonial_highlight`, `team_grid`, `credentials`, `terms_sections`, `gallery`
- [ ] Update `ContentBlockType` in `src/lib/supabase/types.ts` to include new types
- [ ] Update the add-block button row in `content-block-editor.tsx` to include new block type options
- [ ] Write as a proper SQL migration file

### Task C.1 — Team Grid Block

**Admin Editor:**
- [ ] Create `team_grid` block type in ContentBlockEditor
- [ ] Each team member card: ImageUploadField for photo, name (required), role (required), bio (PageHtmlEditor with AI "Generate Bio" button)
- [ ] Add fields: `years_of_service` (number), `certifications` (text array for badge labels)
- [ ] DragDropReorder for member ordering within the block
- [ ] InlineValidation on name and role fields
- [ ] "Add Member" button, "Remove Member" with confirm
- [ ] Auto-generate `memberSlug` from name (kebab-case)

**Public Renderer:**
- [ ] Team member cards in responsive grid (1 col mobile, 2 col tablet, 3-4 col desktop)
- [ ] Each card: photo (or initials fallback like current homepage), name, role, truncated bio, certification badges
- [ ] Each card links to detail page: `/team/{memberSlug}`

**Team Member Detail Page:**
- [ ] Create route: `src/app/(public)/team/[memberSlug]/page.tsx` (dedicated route outside /p/ catch-all)
- [ ] Full bio (rendered HTML), large photo, years of service, certification badges
- [ ] Back link to parent About page
- [ ] SEO metadata (auto-generated from member name + role + business name)
- [ ] JSON-LD Person schema

### Task C.2 — Credentials Block

**Admin Editor:**
- [ ] Create `credentials` block type in ContentBlockEditor
- [ ] Each credential card: ImageUploadField for badge/logo, title (required), description (PageHtmlEditor with AI "Generate Description")
- [ ] DragDropReorder for credential ordering
- [ ] InlineValidation on title field

**Public Renderer:**
- [ ] Credentials/awards in responsive grid with image (80px like current) + title + description
- [ ] Match current homepage credential rendering style

### Task C.3 — Terms Sections Block

**Admin Editor:**
- [ ] Create `terms_sections` block type in ContentBlockEditor
- [ ] Block-level field: effective date (date picker)
- [ ] Each section: title (required), content (PageHtmlEditor with AI "Generate Section"), active toggle (`<Switch>`)
- [ ] DragDropReorder for section ordering
- [ ] Numbered sections (auto-numbered in display order)
- [ ] InlineValidation on title and content
- [ ] Include the 9 default sections from current fallback logic as a "Generate Default Sections" button

**Public Renderer:**
- [ ] Numbered sections with titles
- [ ] Effective date displayed at top
- [ ] Inactive sections hidden from public view
- [ ] Footer note with contact info (preserve current pattern)
- [ ] Clean legal document styling

### Task C.4 — Gallery Block

**Admin Editor:**
- [ ] Create `gallery` block type in ContentBlockEditor
- [ ] Multi-image upload using ImageUploadField (add multiple)
- [ ] Caption per image (optional), alt text per image
- [ ] DragDropReorder for image ordering

**Public Renderer:**
- [ ] Responsive photo grid with lightbox on click
- [ ] Captions displayed below images

### Task C.5 — AI Prompts for All Block Types

- [ ] Extend `src/lib/services/ai-content-writer.ts` with block-type-specific prompt templates
- [ ] Each prompt includes: business name, business type, relevant context (member name/role for bios, city name + focus_keywords for city content)
- [ ] Add AI button to `cta` and `testimonial_highlight` blocks (currently have none per audit)
- [ ] Test AI generation for each block type
- [ ] Ensure AI button UX is consistent across all blocks (same Sparkles icon, same loading state)

### Task C.6 — TypeScript Type Updates

- [ ] Verify `ContentBlockType` union in `src/lib/supabase/types.ts` matches the new CHECK constraint
- [ ] Update any type guards or switch statements that match on `block_type`
- [ ] Update public `content-block-renderer.tsx` to handle all new block types
- [ ] Ensure no `default` case silently swallows unknown block types

### Task C.7 — Markdown → HTML Editor Migration

- [ ] Replace `MarkdownEditor` with `PageHtmlEditor` in the `rich_text` block editor within `content-block-editor.tsx`
- [ ] Replace `MarkdownEditor` with `PageHtmlEditor` in `features_list` block editor (for description fields)
- [ ] Write a one-time data migration script: convert all existing markdown content in `page_content_blocks` (where `block_type = 'rich_text'` or `'features_list'`) from markdown to HTML
  - Use a markdown→HTML conversion library (e.g., `marked` or `markdown-it`) in the migration script
  - Preserve all formatting: headings, bold, italic, links, lists, images
  - Run in dry-run mode first to verify output
- [ ] Update `content-block-renderer.tsx`: `RichTextBlock` no longer needs `markdownToHtml()` — render HTML directly via `dangerouslySetInnerHTML` (same as other HTML content)
- [ ] Remove `MarkdownEditor` component (`src/components/admin/content/markdown-editor.tsx`) after all references are eliminated
- [ ] Remove any markdown parsing dependencies if no longer used elsewhere
- [ ] Verify all existing content blocks render correctly after migration

### Post-Phase C Checkpoint

- [ ] All new block types working in the content block editor
- [ ] All block types rendering correctly on public frontend
- [ ] All content blocks use HTML editor (no more MarkdownEditor)
- [ ] Existing markdown content migrated to HTML with no rendering regressions
- [ ] AI generation working for each block type
- [ ] Team member detail page working at `/team/[memberSlug]`
- [ ] Validation working on all new block type fields
- [ ] Update CHANGELOG.md, CLAUDE.md, FILE_TREE.md
- [ ] `git add -A && git commit && git push && rm -rf .next`

---

## 9. Phase D — Migration + Cleanup + UX Fixes

> **Type:** 2 Claude Code sessions (sequential — D1 must complete before D2)
> **Prerequisite:** Phase C complete, markdown migration run
> **Output:** All content migrated, old tabs removed, public frontend updated, UX bugs fixed
>
> **Session D1:** D.1 → D.2 → D.3 → D.4 → D.5 → D.6 → D.7
> **Session D2:** D.8 → D.9 → D.10 → D.11 → D.12 → D.13 → D.14 → D.15

### Task D.1 — Create Team Members Table

- [ ] Create migration: `team_members` table
  - `id` (uuid, PK)
  - `name` (text, NOT NULL)
  - `slug` (text, UNIQUE, NOT NULL — auto-generated from name, kebab-case)
  - `role` (text, NOT NULL)
  - `bio` (text — HTML content)
  - `photo_url` (text, nullable — existing URLs will be preserved as-is)
  - `years_of_service` (integer, nullable)
  - `certifications` (jsonb — array of strings for badge labels)
  - `sort_order` (integer, NOT NULL, DEFAULT 0)
  - `is_active` (boolean, NOT NULL, DEFAULT true)
  - `created_at`, `updated_at` timestamps
- [ ] Add RLS policies (match existing patterns)
- [ ] Add to `docs/dev/DB_SCHEMA.md`

### Task D.2 — Migrate About Page Data

- [ ] Create a page record in `website_pages`: title="About Us", slug="about", page_template="content", is_published=true
- [ ] Migrate `about_text` from `business_settings` → page's `content` field (convert plain text → HTML: wrap paragraphs in `<p>` tags, preserve `whitespace-pre-line` formatting)
- [ ] Migrate `team_members` JSON array from `business_settings` → `team_members` table rows (one row per member, preserve sort order from array index)
- [ ] Migrate `credentials` JSON array from `business_settings` → `credentials` content block on the About page (store as block content JSON)
- [ ] Create `team_grid` content block on the About page (content JSON references team_members table data)
- [ ] Write migration SQL that preserves all existing data including photo URLs and image URLs
- [ ] Handle naming: `business_settings` stores `photo_url` (snake_case), `team.ts` converts to `photoUrl` (camelCase) — new table uses snake_case consistently

### Task D.3 — Migrate Terms Page Data

- [ ] Create a page record in `website_pages`: title="Terms & Conditions", slug="terms", page_template="content", is_published=true
- [ ] Migrate `terms_and_conditions` JSON array from `business_settings` → `terms_sections` content block on the Terms page
- [ ] Migrate `terms_effective_date` from `business_settings` → embed in block content JSON metadata
- [ ] Convert terms section `content` from plain text to HTML (wrap in `<p>` tags)
- [ ] Include the 9 default fallback sections in the migration if no custom terms exist
- [ ] Write migration SQL

### Task D.4 — Update Homepage Team Data Source

- [ ] Update `src/app/(public)/page.tsx`: replace `getTeamData()` import from `@/lib/data/team` with new query to `team_members` table
- [ ] Create new data layer function (e.g., in `src/lib/data/team-members.ts`): `getActiveTeamMembers()` — queries `team_members` table, returns active members ordered by `sort_order`
- [ ] Ensure data shape matches what the homepage rendering expects (or update rendering to match new shape)
- [ ] Verify: circular photo (128px) or initials fallback, name, role (lime), bio (2-line clamp) — all still work
- [ ] Verify: credentials rendering still works (now coming from content block on About page, but homepage may need separate query)

### Task D.5 — Update Public `/terms` Route

- [ ] Keep `src/app/(public)/terms/page.tsx` at `/terms` — do NOT redirect to `/p/terms`
- [ ] Change data source: instead of reading `terms_and_conditions` + `terms_effective_date` from `business_settings`, read from the `terms_sections` content block on the Terms page in `website_pages`
- [ ] Create data layer function: query `website_pages` where slug="terms", then query `page_content_blocks` where page references that page
- [ ] Preserve existing rendering: numbered sections, effective date at top, inactive hidden, footer note with contact info
- [ ] Remove the `getDefaultSections()` fallback (default sections should have been seeded in migration D.3)
- [ ] Verify SEO metadata is populated (from `website_pages.meta_title` / `meta_description`)

### Task D.6 — Update Team Detail Page Data Source

- [ ] Update `src/app/(public)/team/[memberSlug]/page.tsx` (created in Phase C1)
- [ ] Change data source: instead of searching through content block JSON, query `team_members` table directly by slug
- [ ] `getActiveTeamMembers()` for `generateStaticParams()`
- [ ] `getTeamMemberBySlug(slug)` for page data
- [ ] Render: full bio (HTML), large photo, years of service, certification badges
- [ ] Back link to About page
- [ ] SEO metadata (auto-generated from member name + role + business name)
- [ ] JSON-LD Person schema
- [ ] 404 handling for invalid slugs

### Task D.7 — Remove Old Admin Tabs & Update Sidebar

- [ ] Delete `src/app/admin/website/about/page.tsx`
- [ ] Delete `src/app/admin/website/terms/page.tsx`
- [ ] Update `src/lib/auth/roles.ts` (lines 137-206) — remove from `SIDEBAR_NAV` Website children:
  ```
  { label: 'About & Team', href: '/admin/website/about', icon: 'Users' }
  { label: 'Terms & Conditions', href: '/admin/website/terms', icon: 'FileText' }
  ```
- [ ] Reorder remaining items: Pages first, then layout widgets, then themes, then SEO

### Task D.8 — Remove Old API Routes & Data Layer

- [ ] Delete `src/app/api/admin/cms/about/route.ts`
- [ ] Delete `src/app/api/admin/cms/terms/route.ts`
- [ ] Delete `src/lib/data/team.ts` (replaced by `src/lib/data/team-members.ts`)
- [ ] Verify no external consumers (n8n workflows, webhooks) reference these routes — audit confirmed none known
- [ ] Update any remaining imports that reference deleted files

### Task D.9 — Dead Code Cleanup

> Use audit §14 deletion checklist as guide

- [ ] Delete `src/components/admin/content/markdown-editor.tsx` (if not already removed in C.7)
- [ ] Remove any markdown parsing dependencies (`marked`, `markdown-it`, etc.) if no longer used anywhere (keep `marked` if still used by the migrate-markdown endpoint)
- [ ] Clean up orphaned imports across codebase (grep for imports referencing deleted files)
- [ ] Run full build (`next build`) to catch any broken imports or references
- [ ] Fix the Terms permission bug: current route uses `cms.seo.manage` — new Terms page in Pages system uses `cms.pages.manage` (audit §3)

### Task D.10 — Clean Up business_settings Keys

> Only after confirming all migrations are stable and public frontend renders correctly

- [ ] Remove `business_settings` key: `team_members`
- [ ] Remove `business_settings` key: `credentials`
- [ ] Remove `business_settings` key: `about_text`
- [ ] Remove `business_settings` key: `terms_and_conditions`
- [ ] Remove `business_settings` key: `terms_effective_date`
- [ ] Write SQL migration for cleanup

### Task D.11 — Fix AI Content Generation Context

The AI content generator for `single_block` and `improve` modes currently assumes city page context ("Unknown City" filler, outputs markdown). Fix to be context-aware.

- [ ] Read `src/lib/services/ai-content-writer.ts` and `src/app/api/admin/cms/content/ai-generate/route.ts`
- [ ] Update the AI generate API route: when called from a page (not a city), pass the page's title, meta_description, and a summary of existing block content as context
- [ ] Update `single_block` and `improve` prompts:
  - Auto-inject page title + meta description + existing content as context
  - If page title is empty/generic AND no meta description exists → show a dialog/toast asking the user to provide a topic before generating. The API should return a `{ needsContext: true }` response, and the frontend should prompt the user for a topic/keywords before retrying.
  - Output **HTML**, not markdown
- [ ] Update city-specific AI modes (`full_page`, `batch_cities`) to remain city-focused — these should still pull city name + focus_keywords
- [ ] Ensure all AI responses return HTML content that works with PageHtmlEditor
- [ ] Test: create a new page "FAQ", add a rich_text block, click AI → should generate FAQ-related HTML content using the page title as context, NOT "Unknown City" filler

### Task D.12 — Increase Image Upload Limit to 10MB

- [ ] Update `src/app/api/admin/upload/content-image/route.ts`: change max file size from 5MB to 10MB
- [ ] Update `src/components/admin/image-upload-field.tsx`: change the 5MB validation check and error message to 10MB
- [ ] Update any hardcoded "5MB" strings in error messages or comments
- [ ] Verify upload of a 7MB image succeeds

### Task D.13 — Auto-Draft Page Creation

Currently, `/admin/website/pages/new` requires saving the page before the Content Blocks card appears. Fix: auto-create a draft page on load.

- [ ] Read `src/app/admin/website/pages/new/page.tsx`
- [ ] On component mount (useEffect), immediately POST to the pages API to create a draft record:
  - `title`: "Untitled Page"
  - `slug`: auto-generated unique slug (e.g., `untitled-{timestamp}` or `untitled-{uuid-prefix}`)
  - `is_published`: false
  - `page_template`: "content" (default)
- [ ] After creation, redirect to `/admin/website/pages/{id}` (the edit page) — this already shows all cards including Content Blocks
- [ ] The edit page (`pages/[id]/page.tsx`) already handles everything: title editing, slug editing, publishing, content blocks. No changes needed there.
- [ ] Handle cleanup: add a scheduled cleanup or a cleanup on page load that deletes draft pages older than 24 hours that still have title "Untitled Page" and no content blocks. Implement as a check in the pages list API or a utility function.
- [ ] The "New Page" button in the pages list should trigger this flow — click → create draft → redirect to edit page
- [ ] Remove `src/app/admin/website/pages/new/page.tsx` after migration (all "new" flows redirect to edit page with auto-created draft)

### Task D.14 — Fix Button type="button" in Block Editors

Action buttons inside block editors (like "Add Feature", "Add FAQ Item") trigger form submit instead of their click handler because they lack `type="button"`.

- [ ] Search all block editor components for `<button` and `<Button` elements that are NOT submit buttons
- [ ] Add `type="button"` to every action button inside:
  - `content-block-editor.tsx` — any add/remove/expand/collapse buttons
  - `team-grid-editor.tsx` — Add Member, Remove Member, Add Certification, Remove Certification
  - `credentials-editor.tsx` — Add Credential, Remove Credential
  - `terms-sections-editor.tsx` — Add Section, Remove Section, Generate Default Sections
  - `gallery-editor.tsx` — Add Image, Remove Image
  - `faq-editor.tsx` — Add FAQ Item, Remove FAQ Item (pre-existing bug)
  - Any other editor with action buttons
- [ ] Also check `features-list-editor` (if it exists as a separate component)
- [ ] Verify: clicking "Add Feature" in a Features List block creates a new feature entry, does NOT trigger page save
- [ ] Verify: clicking "Add FAQ" in a FAQ block creates a new FAQ item, does NOT trigger page save

### Task D.15 — Final Validation & Regression Testing

- [ ] Test creating a new page → should auto-create draft and redirect to edit page with all cards visible
- [ ] Test creating a new page with each block type
- [ ] Test editing the migrated About page (team_grid + credentials blocks)
- [ ] Test editing the migrated Terms page (terms_sections block)
- [ ] Test homepage: team section renders correctly from new `team_members` table
- [ ] Test `/terms`: renders correctly from new data source
- [ ] Test `/team/[memberSlug]`: detail pages work with data from `team_members` table
- [ ] Test AI generation on a non-city page → should produce relevant HTML content using page context, NOT "Unknown City" markdown
- [ ] Test AI generation on a city page → should still use city-specific context
- [ ] Test image upload with a 7MB file → should succeed
- [ ] Test "Add Feature"/"Add FAQ" buttons → should add items, not trigger page save
- [ ] Test validation on all forms (Layer 1, 2, 3)
- [ ] Test unsaved changes warning
- [ ] Test drag-and-drop reorder on all sortable lists
- [ ] Verify no broken links or missing images on public site
- [ ] Verify admin sidebar: About & Terms entries removed, remaining items ordered correctly

### Post-Phase D Checkpoint

- [ ] All content migrated successfully
- [ ] Old admin tabs deleted
- [ ] Old API routes deleted
- [ ] Public frontend renders correctly from new data sources
- [ ] AI generates context-aware HTML content (not markdown, not "Unknown City")
- [ ] Image upload accepts up to 10MB
- [ ] New page creation auto-drafts with all cards visible
- [ ] Action buttons in block editors don't trigger form submit
- [ ] No regressions in existing functionality
- [ ] All `business_settings` migration keys cleaned up
- [ ] Update CHANGELOG.md, CLAUDE.md, FILE_TREE.md, DB_SCHEMA.md
- [ ] `git add -A && git commit && git push && rm -rf .next`

---

## 10. Phase E — Deferred Enhancements

> **Type:** Future Claude Code sessions (independent of each other)
> **Prerequisite:** Phase D complete and stable
> **Note:** Each can be done as a standalone session.

### E.1 — Preview Mode ✅ COMPLETE (2026-02-28)

- [x] Add `?preview=true&token={previewToken}` query parameter support to public page renderer
- [x] Generate preview tokens per page (short-lived, admin-only)
- [x] Add "Preview" button to page editor (opens new tab with preview URL)
- [x] Preview renders draft/unpublished pages with a "Preview Mode" banner
- [x] Preview token expires after 1 hour or on publish

### E.2 — Shared / Global Reusable Blocks

- [ ] Add `is_global` flag to content blocks
- [ ] Global blocks can be referenced by multiple pages (many-to-many relationship)
- [ ] Editing a global block updates it everywhere it's used
- [ ] "Insert Global Block" option in the content block dropdown
- [ ] List of global blocks with usage count in a management view

### E.3 — Revision History

- [ ] Create `cms_page_revisions` table storing snapshots of page data (JSON)
- [ ] Auto-save revision on every publish or save (configurable)
- [ ] Store last N revisions per page (default: 20)
- [ ] "Revision History" panel in page editor showing timestamps and diff summary
- [ ] "Restore" button to roll back to a previous version
- [ ] Optionally store who made the change (employee ID)

### E.4 — ImageUploadField on Remaining URL Fields

- [ ] Replace `hero_bg_image_url` URL input in seasonal theme editor (`themes/[id]/page.tsx`) → ImageUploadField
- [ ] Replace hero slide image URL fields if still using text inputs
- [ ] Audit for any other remaining URL text input image fields not caught in Phase B

### E.5 — Homepage Hardcoded Items

- [ ] Move `differentiators` array (3 items: Mobile Service, Ceramic Pro Certified, Eco-Friendly Products) to `business_settings.homepage_differentiators`
- [ ] Move hardcoded Google place ID to `business_settings.google_place_id`
- [ ] Move CTA before/after image URLs to `business_settings`
- [ ] Add admin UI for editing these in a "Homepage" section or within existing settings

### E.6 — City Pages SEO Enhancement

- [ ] Wire up unused `service_highlights` (JSONB) and `local_landmarks` (TEXT) fields in city admin UI
- [ ] Make AI content generator keyword-aware: pull `focus_keywords` from city record, use in prompts
- [ ] Add content structure guidance per city (different cities can emphasize different services/neighborhoods)
- [ ] Consider adding local review integration per city
- [ ] **This is the SEO value play — separate planning session recommended**

### E.7 — Theme System Overhaul

- [ ] Audit current Theme Settings schema and `site-theme` API
- [ ] Audit Seasonal Themes system — activation/deactivation cron, override behavior
- [ ] Review CSS variable indirection pattern (critical for Tailwind v4)
- [ ] Design swappable theme system: create/delete themes, preview before activating
- [ ] Review relationship between base Theme Settings and Seasonal Themes — simplify if redundant
- [ ] Dark/light mode consistency across all public pages
- [ ] Theme import/export capability
- [ ] **This is a separate project scope — do not bundle with Phases A–D**

### E.8 — Pages Editor Cleanup + Navigation Sync

**Pages editor changes:**
- [ ] Remove "Parent Page" dropdown from `pages/[id]/page.tsx` and `pages/new/page.tsx` — the field saves to DB but nothing reads it (no URL effect, no nav effect)
- [ ] Move Published toggle and Show in Navigation toggle **side by side** into the space freed by removing Parent Page dropdown. Both toggles fit in the same row.
- [ ] Wire "Show in Navigation" as a sync shortcut:
  - Toggle ON → auto-create a nav item in `website_nav_items` with `placement: 'header'`, `label: page.title`, `url: /p/{slug}`, `page_id: page.id`
  - Toggle OFF → delete the associated nav item where `page_id = page.id`
  - If a nav item already exists for this page (created manually via Navigation page), toggling reflects its current state
- [ ] Remove `parent_id` column from `website_pages` if no other code references it (or leave column, just remove UI)

**Navigation page enhancements:**
- [ ] Drag-to-indent: drag an item slightly right onto another to nest it as a child (visual indent zone)
- [ ] Support recursive nesting beyond 1 level if needed (update `getChildren` to be recursive, update render)
- [ ] Visual tree connector lines instead of just `└` character
- [ ] "Add All Published Pages" bulk button — creates nav items for all published pages not yet in nav
- [ ] Refactor to use shared `useDragDropReorder` hook from Phase B

**Architectural notes:**
- Navigation system already supports: parent_id nesting, placement tabs (header/footer), 3 link types (custom/page/builtin), inline editing, active toggle, drag reorder
- URLs stay flat — nesting is for nav dropdown menu structure only, NOT URL paths
- `/p/{slug}` always resolves to just the slug, regardless of nav hierarchy

---

## 11. Key Files Reference

> **CRITICAL:** Always read `CLAUDE.md` and `docs/dev/FILE_TREE.md` before any session. Never guess paths.

### Admin Pages (Website Section)

```
src/app/admin/website/page.tsx               — Website Dashboard (cleaned up — dead links removed, sidebar entry added)
src/app/admin/website/pages/page.tsx         — Pages list
src/app/admin/website/pages/new/page.tsx     — New page (auto-creates draft, redirects to edit)
src/app/admin/website/pages/[id]/page.tsx    — Edit page (THE FOUNDATION)
src/app/admin/website/seo/cities/page.tsx    — Cities editor (STAYS — enhanced with keyword-aware AI in Phase E.6)
src/app/admin/website/footer/page.tsx        — Footer editor (~1800 lines, HAS DRAG-DROP TO EXTRACT)
src/app/admin/website/hero/page.tsx          — Hero carousel list
src/app/admin/website/hero/[id]/page.tsx     — Hero slide editor
src/app/admin/website/navigation/page.tsx    — Navigation editor
src/app/admin/website/tickers/page.tsx       — Ticker list
src/app/admin/website/tickers/[id]/page.tsx  — Ticker editor
src/app/admin/website/ads/page.tsx           — Ads manager
src/app/admin/website/team/page.tsx           — Team Members admin page (CRUD, drag-drop reorder, AI bio generation)
src/app/admin/website/credentials/page.tsx   — Credentials admin page (CRUD, drag-drop reorder, AI description)
src/app/admin/website/catalog/page.tsx       — Catalog display settings
src/app/admin/website/theme-settings/page.tsx — Theme settings (base theme — 50+ color/typography/button columns)
src/app/admin/website/themes/page.tsx        — Seasonal themes manager (8 holiday presets)
src/app/admin/website/themes/[id]/page.tsx   — Seasonal theme editor (colors, particles, schedule)
```

### Key Components

```
src/components/admin/content/page-html-editor.tsx    — Rich HTML editor + AI (BECOMES THE universal editor)
src/components/admin/content/content-block-editor.tsx — Content block system (native HTML5 DnD)
src/components/admin/content/team-grid-editor.tsx     — Display-only config widget (links to /admin/website/team)
src/components/admin/content/credentials-editor.tsx   — Display-only config widget (links to /admin/website/credentials)
src/components/admin/content/faq-editor.tsx           — FAQ block editor
src/components/admin/content/markdown-editor.tsx      — Markdown editor (TO BE REMOVED — Phase C.7)
src/components/admin/html-editor-toolbar.tsx          — HTML editor toolbar (12 dialog components)
src/components/admin/html-image-manager.tsx           — Image insertion: upload + library browse (cms-assets bucket)
src/components/public/content-block-renderer.tsx      — Public block rendering (5 block types → expanding to 9)
src/components/ui/form-field.tsx                      — Form field (HAS error prop ✅, needs border pass-through)
src/app/admin/catalog/components/multi-image-upload.tsx — Product image upload (reference for ImageUploadField)
```

### API Routes (CMS)

```
src/app/api/admin/cms/about/route.ts         — About CRUD (TO BE DELETED — Phase D.8)
src/app/api/admin/cms/terms/route.ts         — Terms CRUD (TO BE DELETED — Phase D.8)
src/app/api/admin/cms/pages/route.ts         — Pages CRUD (THE FOUNDATION) — permission: cms.pages.manage
src/app/api/admin/cms/pages/[id]/route.ts    — Single page CRUD — handles show_in_nav toggle
src/app/api/admin/cms/content/route.ts       — Content blocks CRUD — auto-calculates sort_order
src/app/api/admin/cms/content/[id]/route.ts  — Single block CRUD
src/app/api/admin/cms/content/reorder/route.ts — Block reorder — payload: { pagePath, orderedIds }
src/app/api/admin/cms/content/ai-generate/route.ts — AI content — modes: full_page, single_block, improve, batch_cities
src/app/api/admin/credentials/route.ts       — Credentials list + create
src/app/api/admin/credentials/[id]/route.ts  — Credentials single CRUD
src/app/api/admin/credentials/reorder/route.ts — Credentials reorder
src/app/api/admin/cms/seo/cities/route.ts    — Cities CRUD (STAYS)
src/app/api/admin/cms/seo/cities/[id]/route.ts — Single city CRUD (STAYS)
src/app/api/admin/cms/themes/route.ts        — Seasonal themes list/create
src/app/api/admin/cms/themes/[id]/route.ts   — Seasonal theme CRUD
src/app/api/admin/cms/themes/[id]/activate/route.ts  — Manual activate (mutually exclusive)
src/app/api/admin/cms/themes/[id]/deactivate/route.ts — Manual deactivate
src/app/api/admin/cms/site-theme/route.ts    — Base theme settings
src/app/api/admin/upload/content-image/route.ts — Image upload — bucket: cms-assets, max 5MB
src/app/api/cron/theme-activation/route.ts   — Cron: every 15 min, auto activate/deactivate seasonal themes
```

### Data Access

```
src/lib/data/website-pages.ts    — Page data: getPageBySlug, getPublishedPages, getAllPages, getFooterData
src/lib/data/page-content.ts     — Content block data functions
src/lib/data/team-members.ts     — Team member data: getActiveTeamMembers, getAllTeamMembers, getTeamMemberBySlug, getTeamSectionTitle, getCredentialsSectionTitle
src/lib/data/credentials.ts      — Credentials data: getActiveCredentials, getAllCredentials
src/lib/data/cities.ts           — Cities data: getActiveCities, getCityBySlug (STAYS)
src/lib/services/ai-content-writer.ts — AI: Claude Sonnet, 4000 tokens, business context injected
src/lib/supabase/types.ts        — ContentBlockType union (EXPAND in Phase C.0)
```

### Public Pages

```
src/app/(public)/page.tsx                          — Homepage (widget assembly — STAYS SEPARATE)
src/app/(public)/terms/page.tsx                    — Terms public page (STAYS at /terms, data source changes — Phase D.5)
src/app/(public)/areas/page.tsx                    — Service areas listing (STAYS)
src/app/(public)/areas/[citySlug]/page.tsx         — City landing page (STAYS)
src/app/(public)/services/page.tsx                 — Service category listing
src/app/(public)/products/page.tsx                 — Product category listing
src/app/(public)/gallery/page.tsx                  — Photo gallery (feature-flag gated)
src/app/p/[...slug]/page.tsx                       — CMS dynamic pages (THE FOUNDATION — /p/ prefix KEPT)
src/app/(public)/team/[memberSlug]/page.tsx        — Team detail page (NEW — Phase D.6)
```

### DB Tables (from audit)

```
website_pages              — CMS pages (NOT cms_pages)
page_content_blocks        — Content blocks (NOT cms_page_content_blocks)
city_landing_pages         — City landing pages (STAYS)
team_members               — Team members (Phase D.1 — managed via /admin/website/team)
credentials                — Credentials & awards (NEW — managed via /admin/website/credentials, migrated from block JSON)
seasonal_themes            — Seasonal theme overlays
site_theme_settings        — Base theme (50+ columns)
business_settings          — Key-value JSONB store (5 keys to be cleaned up — Phase D.10)
```

### Sidebar Config

```
src/lib/auth/roles.ts      — SIDEBAR_NAV definition (lines 137-206) — remove About & Terms entries
```

---

## 12. Original Bug Reports

These bugs prompted this overhaul. All will be resolved by the architecture changes:

| Bug | Root Cause | Resolved By |
|---|---|---|
| About page headline says "About the Business" in admin but "Meet the Team" on frontend — no way to edit headline | Hardcoded string on frontend; no headline field in CMS | Phase C: main HTML content on About page includes editable headline. Phase D: frontend reads from CMS |
| Team member Photo URL field doesn't display images | Raw URL text input, no image preview, possible URL issues | Phase B: ImageUploadField replaces all URL inputs. Phase C: team_grid block uses ImageUploadField |
| No team member detail page exists | Never built — no route for individual staff profiles | Phase C: `/team/[memberSlug]` route with full bio, photo, badges |
| Content editors are inconsistent — some have HTML editor + AI, others have plain textarea | Each page was built independently without shared components | Phase B: shared components. Phase C: all blocks use same editor patterns |
| AI generates "Unknown City" markdown for non-city pages | `single_block` and `improve` modes assume city page context. Output format is markdown not HTML | Phase D.11: AI context fix — auto-inject page title/meta, output HTML |
| "Add Feature" / "Add FAQ" buttons trigger page save instead of adding items | Buttons lack `type="button"`, defaulting to `type="submit"` which fires parent form handler | **RESOLVED** Phase D.14 + Post-D sweep: all buttons verified with `type="button"` |
| New page requires save before Content Blocks card appears | Content blocks live in separate table, need page record to exist first. Architecture limitation. | Phase D.13: auto-draft page creation on `/pages/new` load |
| Parent Page dropdown has no effect | Saves `parent_id` to DB but nothing reads it — no URL effect, no nav effect | Phase E.8: remove dropdown, navigation owns hierarchy |

---

## 13. Design Decisions Log

| Decision | Rationale | Date |
|---|---|---|
| Extend Pages system, don't rebuild | Pages already has HTML editor + AI + content blocks + SEO + publishing. Minimizes risk | 2026-02-26 |
| Content blocks over page templates | Blocks give full flexibility — any combination of content types on any page | 2026-02-26 |
| Team members in own DB table (not JSON in content block) | Enables detail page routing by slug, querying, future features. Proper relational data | 2026-02-26 |
| Team detail pages at `/team/[slug]` (dedicated route) | Cleaner URL, independent of /p/ catch-all, avoids slug collision | 2026-02-26 |
| Extract drag-and-drop from Footer (not build new) | Footer has working native HTML5 DnD. Reuse > rebuild | 2026-02-26 |
| Three-layer validation (inline + section badge + toast) | Toast-only fails on complex forms. Users need to see exactly which field is wrong | 2026-02-26 |
| AI button per block (not just main content) | Granular context = better generation quality | 2026-02-26 |
| Defer theme overhaul to Phase E | Different scope, different risk profile | 2026-02-26 |
| Defer preview mode, shared blocks, revision history to Phase E | High value but not blocking. Architecture supports adding later | 2026-02-26 |
| Desktop-only admin editing | Mobile/tablet admin out of scope | 2026-02-26 |
| **HTML editor everywhere (remove MarkdownEditor)** | One editor = one rendering path, one set of bugs. Business users shouldn't learn Markdown for SEO content. Existing md content migrated to HTML | 2026-02-27 |
| **Keep /p/ prefix for CMS pages** | Safety from route collisions. Important pages get dedicated route files (e.g., `/terms` stays at `/terms`) | 2026-02-27 |
| **Keep /terms route alive, change data source** | High risk of breaking existing links (booking confirmations, email footers, footer link). Route reads from Pages system | 2026-02-27 |
| **Cities STAY separate (don't migrate to Pages)** | Own DB table with geo fields (distance, state, sort_order, focus_keywords). Already uses ContentBlockEditor. Enhanced with keyword-aware AI in Phase E | 2026-02-27 |
| **Homepage stays separate** | Widget assembly (15 sections, 12 CMS-driven). Not a content page. Only 3 hardcoded items — optional Phase E fix | 2026-02-27 |
| **Seasonal Themes: no changes needed** | Fully self-contained per audit. Only benefit: ImageUploadField for hero_bg_image_url (Phase E.4) | 2026-02-27 |
| **Website admin menu: flat reorder, remove About & Terms** | 11 items after cleanup. Flat list reordered logically (Pages first). Owner can revisit grouping later | 2026-02-27 |
| **AI context: auto-inject page context, ask if insufficient** | AI should use page title + meta + existing content as context. Only prompt user if page is empty with no title. Output HTML, not markdown | 2026-02-27 |
| **Image upload: 10MB limit** | 5MB too restrictive for high-res photos. 10MB covers most use cases without server strain | 2026-02-27 |
| **Auto-draft on new page** | Create draft record on `/pages/new` load so all cards (including Content Blocks) are immediately visible. Orphan cleanup for abandoned drafts. Best UX pattern (WordPress/Notion style) | 2026-02-27 |
| **Remove Parent Page from Pages editor** | Field saves to DB but nothing reads it — no URL effect, no nav effect. Dead feature. Remove UI, keep column for now | 2026-02-27 |
| **Keep Show in Nav as sync shortcut** | Toggle ON auto-creates header nav item, OFF removes it. Convenience shortcut that syncs with Navigation page | 2026-02-27 |
| **Flat URLs — nesting is nav-only** | Nesting in Navigation creates dropdown menus, NOT nested URL paths. `/p/{slug}` always resolves by slug alone. No redirect maintenance burden | 2026-02-27 |
| **Navigation enhancement deferred to Phase E** | Nav page already 80% built (parent nesting, placements, 3 link types, drag reorder). Drag-to-indent and sync improvements are UX polish, not blocking | 2026-02-27 |
| **~~team_grid editor uses team_members API directly~~** | ~~Block content stores `{ source: "team_members_table" }` marker.~~ **SUPERSEDED:** team_grid and credentials blocks are now display-only config widgets. Data managed via dedicated admin pages at `/admin/website/team` and `/admin/website/credentials` | 2026-02-27 |
| **useConfirmDialog hook replaces all confirm() calls** | Browser `confirm()` looks jarring. Reusable hook wraps existing ConfirmDialog component. 18 admin files updated | 2026-02-27 |
| **Team/Credentials: dedicated admin pages, blocks are display-only widgets (WordPress pattern)** | Data management (CRUD, reorder, AI generation) belongs in dedicated admin pages with proper UX. Content blocks become config widgets that link to admin pages and control display settings (columns, layout, max items). Follows WordPress pattern: manage data in one place, display it in many | 2026-02-27 |
| **Credentials in own DB table (not JSON in content block)** | Same rationale as team_members — proper relational data enables querying, homepage rendering, future features. Existing block JSON migrated to `credentials` table via SQL migration | 2026-02-27 |

---

## 14. Out of Scope

These items are explicitly excluded from Phases B–D:

- Mobile/tablet admin editing optimization
- Bulk content block actions (bulk delete, bulk reorder)
- Any changes to non-Website admin sections (POS, Marketing, Jobs, etc.)
- Any functional changes to existing APIs beyond what's needed for migration
- City page migration to Pages system (cities stay in `city_landing_pages` table)
- Homepage conversion to a Page (stays as widget assembly)
- City SEO content enhancement (deferred to Phase E.6)
- Theme system overhaul (Phase E.7)
- Drag-and-drop page reordering in the pages list (only within-page block reordering)
- Multi-language / i18n support
- Scheduled publishing (publish at future date)
- Content workflow / approval system
- Website admin menu grouping (flat reorder only — grouping deferred)
- Navigation page drag-to-indent enhancement (Phase E.8)
- Nested URL paths based on parent pages (URLs stay flat, nesting is nav-only)
- Pages editor "Parent Page" dropdown removal (Phase E.8)
- Preview mode (Phase E.1)

---

## Agent Handoff Notes

When picking up this project:

1. **Always read `CLAUDE.md` and `docs/dev/FILE_TREE.md` first** — never guess file paths
2. **Check `docs/dev/DB_SCHEMA.md`** before creating new DB fields/tables — reuse existing fields first
3. **Phase A audit is complete** — see `docs/planning/CMS_OVERHAUL_AUDIT.md` for detailed findings
4. **Phase B + C complete** — shared components built, all 9 block types have editors + renderers, markdown migrated to HTML, MarkdownEditor deleted
5. **All architecture decisions are finalized** — see Post-Audit Decisions table and Design Decisions Log
6. **Correct table names:** `website_pages` (not cms_pages), `page_content_blocks` (not cms_page_content_blocks), `city_landing_pages` (not seo_cities)
7. **HTML editor everywhere** — all content blocks use PageHtmlEditor, not MarkdownEditor. Markdown content already migrated to HTML.
8. **Each phase has a checkpoint** — do not start the next phase until the checkpoint is verified
9. **Session end:** update CHANGELOG.md, CLAUDE.md (if structure changed), and FILE_TREE.md (if new routes/pages/lib/components/migrations created), then `git add -A && git commit && git push && rm -rf .next`. After commit print: `⚠️ Session complete. Run: npm run dev`
10. **All cron/scheduling is internal** — never suggest n8n, Vercel Cron, or external schedulers
11. **Timezone is PST** — `America/Los_Angeles`, not UTC
12. **Deployed on Hostinger** — not Vercel. Never reference Vercel
13. **Never provide patch code or quick fixes** — always provide fully thought-out solutions considering all scenarios and edge cases
14. **Button type="button"** — all non-submit buttons in forms must have `type="button"` to prevent accidental form submission
15. **team_grid editor uses team_members API directly** — NOT block content JSON. The block's `content` field stores `{ "source": "team_members_table" }` as a marker. Editor is self-managing with auto-save.
16. **useConfirmDialog** — import from `@/components/ui/confirm-dialog`. All admin pages now use this hook instead of browser `confirm()`. Pattern: `const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog()` + render `<ConfirmDialog {...dialogProps} />`
