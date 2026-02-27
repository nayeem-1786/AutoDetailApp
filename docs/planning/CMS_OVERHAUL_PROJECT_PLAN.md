# CMS Content System Overhaul — Project Plan

> **Project:** Smart Details Auto Spa — Admin Website Section Restructure
> **Created:** 2026-02-26
> **Status:** Pre-Audit Planning Complete
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

| Block Type | What it renders | Replaces | Has AI? |
|---|---|---|---|
| `html` | Rich HTML content section | Already exists ✅ | ✅ |
| `faq` | FAQ accordion | Already exists ✅ | ✅ |
| `team_grid` | Team member cards (photo upload, name, role, bio, badges) | About page team section | ✅ per bio |
| `credentials` | Awards/certifications grid (image, title, description) | About page credentials section | ✅ per description |
| `terms_sections` | Numbered T&C sections with active toggles + effective date | Entire Terms editor | ✅ per section |
| `city_info` | City name, state, service area, local content | Cities page | ✅ |
| `gallery` | Photo gallery grid | Future use | ❌ |
| `cta` | Call-to-action banner with button | Future use | ✅ |

### Migration Map

| Current Location | Migrates To |
|---|---|
| Admin > Website > About (about text) | Page (`/p/about`) → main HTML content |
| Admin > Website > About (team members) | Page (`/p/about`) → `team_grid` content block |
| Admin > Website > About (credentials) | Page (`/p/about`) → `credentials` content block |
| Admin > Website > Terms | Page (`/p/terms`) → `terms_sections` content block |
| Admin > Website > SEO > Cities | Pages (`/p/areas/{city}`) → `city_info` content block each |

### What STAYS Separate (Appearance & Layout Widgets)

These are layout widgets, not pages. They remain as their own admin tabs:

- **Hero/Banner** — carousel slide management
- **Navigation** — menu structure and ordering
- **Footer** — column layout, links, brand section
- **Tickers** — announcement bar messages
- **Theme Settings** — colors, fonts, layout variables (dark/light mode)
- **Seasonal Themes** — time-based theme activations/deactivations (separate from base theme settings)
- **Ads** — promotional placements
- **Catalog Display** — service/product toggle settings

### Post-Audit Decisions (TBD)

These decisions are deferred until the Phase A audit provides full context:

- **Website admin menu structure** — flat list vs. grouped sub-menus (e.g., "Appearance" grouping for Hero/Tickers/Nav/Footer/Themes). Decide after audit reveals the full scope of remaining tabs.
- **Homepage management** — whether the homepage should join the Pages system or remain a separate composed layout of widgets. Depends on audit findings about how the homepage is currently built (hardcoded sections vs. CMS-driven content blocks).

---

## 3. Shared Components

### Components to Build or Extract

| Component | Source / Status | Used Where |
|---|---|---|
| **ImageUploadField** | Extract from Products image upload; uses existing `/api/admin/upload/content-image/` | Team photos, credential images, hero slides, OG images, ad creatives — ALL image fields |
| **DragDropReorder** | Extract from Footer editor (already has working drag-and-drop) | Content blocks, team members, credentials, terms sections, FAQ items, any ordered list |
| **InlineValidation** | New — extends existing `FormField` component if it supports error states | Every form field across all editors |
| **UnsavedChangesGuard** | New — `beforeunload` listener + navigation prompt | Every editor page |
| **SlugAutoGenerator** | New — title → kebab-case slug with manual override | Page editor settings card |

### Components to Reuse As-Is

| Component | Current Location | Already Used In |
|---|---|---|
| **PageHtmlEditor** | `src/components/admin/content/page-html-editor.tsx` | Pages editor |
| **HtmlEditorToolbar** | `src/components/admin/html-editor-toolbar.tsx` | Pages editor, Footer editor |
| **ContentBlockEditor** | `src/components/admin/content/content-block-editor.tsx` | Pages editor |
| **AI Content Writer** | `src/lib/services/ai-content-writer.ts` | Pages editor AI button |

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

> **Type:** Claude Code session(s)
> **Prerequisite:** Phase A audit complete
> **Output:** Reusable components ready for use in Phases C–D

### Task B.1 — ImageUploadField Component

- [ ] Create `src/components/admin/image-upload-field.tsx`
- [ ] Wraps the existing upload API (`/api/admin/upload/content-image/`)
- [ ] Props: `value` (current URL), `onChange` (new URL), `label`, `placeholder`, `error`
- [ ] UI: shows current image preview if URL exists, upload button, remove button
- [ ] Handles file selection, upload progress indicator, error states
- [ ] Supports drag-and-drop file onto the component
- [ ] Replace OG Image URL field in Pages editor as first adoption (verify it works)

### Task B.2 — DragDropReorder Component

- [ ] Extract drag-and-drop logic from Footer editor into `src/components/admin/drag-drop-reorder.tsx`
- [ ] Generic wrapper: accepts children, provides drag handles, fires `onReorder(newOrder)` callback
- [ ] Must work for: content blocks, team members, credentials, terms sections, FAQ items
- [ ] Preserve the existing arrow-button fallback for accessibility
- [ ] Test with existing Footer to ensure no regression

### Task B.3 — InlineValidation System

- [ ] Audit `src/components/ui/form-field.tsx` for existing error support (from Phase A findings)
- [ ] If needed, extend FormField with `error?: string` prop → red border + error text below
- [ ] Create `src/lib/hooks/use-form-validation.ts` — hook that manages error state for complex forms
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
- [ ] Tracks dirty state (form values changed since last save/load)
- [ ] Adds `beforeunload` event listener when dirty
- [ ] Intercepts Next.js router navigation when dirty (shows confirm dialog)
- [ ] Resets dirty state on successful save
- [ ] Apply to Pages editor as first adoption

### Task B.5 — SlugAutoGenerator

- [ ] Add auto-slug logic to Pages editor: on title change, if slug hasn't been manually edited, auto-generate kebab-case slug
- [ ] Use a `slugManuallyEdited` flag — once user edits slug field directly, stop auto-generating
- [ ] Handle edge cases: special characters, multiple spaces, leading/trailing dashes
- [ ] Apply to both "new page" and "edit page" flows (new pages auto-generate, existing pages don't override)

### Task B.6 — Update Existing Pages Editor with New Components

- [ ] Replace OG Image URL text input → ImageUploadField
- [ ] Add InlineValidation to all required fields (title, slug)
- [ ] Add UnsavedChangesGuard
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

## 8. Phase C — New Block Types + AI

> **Type:** Claude Code session(s) — may be parallelizable
> **Prerequisite:** Phase B shared components complete
> **Output:** All new content block types with admin editors, public renderers, and AI

### Task C.1 — Team Grid Block

**Admin Editor:**
- [ ] Create `team_grid` block type in ContentBlockEditor
- [ ] Each team member card: ImageUploadField for photo, name (required), role (required), bio (HtmlContentEditor with AI "Generate Bio" button)
- [ ] Add fields: `years_of_service` (number), `certifications` (text array for badge icons)
- [ ] DragDropReorder for member ordering within the block
- [ ] InlineValidation on name and role fields
- [ ] "Add Member" button, "Remove Member" with confirm

**Public Renderer:**
- [ ] Team member cards in responsive grid (1 col mobile, 2 col tablet, 3-4 col desktop)
- [ ] Each card: photo, name, role, truncated bio, badges
- [ ] Each card links to detail page: `/team/{memberSlug}`
- [ ] Auto-generate memberSlug from name (kebab-case)

**Team Member Detail Page:**
- [ ] Create route: `/team/[memberSlug]/page.tsx` (dedicated route outside /p/ catch-all)
- [ ] Full bio (rendered HTML), large photo, years of service, certification badges
- [ ] Back link to parent About page
- [ ] SEO metadata (auto-generated from member name + role + business name)

### Task C.2 — Credentials Block

**Admin Editor:**
- [ ] Create `credentials` block type in ContentBlockEditor
- [ ] Each credential card: ImageUploadField for badge/logo, title (required), description (with AI "Generate Description" button)
- [ ] DragDropReorder for credential ordering
- [ ] InlineValidation on title field

**Public Renderer:**
- [ ] Credentials/awards in responsive grid with image + title + description
- [ ] Clean card layout matching site theme

### Task C.3 — Terms Sections Block

**Admin Editor:**
- [ ] Create `terms_sections` block type in ContentBlockEditor
- [ ] Block-level field: effective date (date picker)
- [ ] Each section: title (required), content (HtmlContentEditor with AI "Generate Section" button), active toggle
- [ ] DragDropReorder for section ordering
- [ ] Numbered sections (auto-numbered in display order)
- [ ] InlineValidation on title and content

**Public Renderer:**
- [ ] Numbered sections with titles
- [ ] Effective date displayed at top
- [ ] Inactive sections hidden from public view
- [ ] Clean legal document styling

### Task C.4 — City Info Block

**Admin Editor:**
- [ ] Create `city_info` block type in ContentBlockEditor
- [ ] Fields: city name, state, service area description (HtmlContentEditor with AI "Generate City Content")
- [ ] Optional: service radius, map embed
- [ ] InlineValidation on city name

**Public Renderer:**
- [ ] City name as heading
- [ ] Service area content rendered as HTML
- [ ] Consistent with other city/area pages

### Task C.5 — Gallery Block

**Admin Editor:**
- [ ] Create `gallery` block type in ContentBlockEditor
- [ ] Multi-image upload using ImageUploadField (add multiple)
- [ ] Caption per image (optional)
- [ ] DragDropReorder for image ordering

**Public Renderer:**
- [ ] Responsive photo grid with lightbox on click
- [ ] Captions displayed below images

### Task C.6 — CTA Block

**Admin Editor:**
- [ ] Create `cta` block type in ContentBlockEditor
- [ ] Fields: headline, body text (HtmlContentEditor with AI "Generate CTA"), button text, button URL, background style
- [ ] InlineValidation on headline and button text

**Public Renderer:**
- [ ] Full-width banner with headline, body, and CTA button
- [ ] Styled according to site theme

### Task C.7 — AI Prompts for All Block Types

- [ ] Create block-type-specific prompt templates in `ai-content-writer.ts` (or new file)
- [ ] Each prompt includes: business name, business type, relevant context (member name, city name, etc.)
- [ ] Test AI generation for each block type
- [ ] Ensure AI button UX is consistent across all blocks (same Sparkles icon, same loading state)

### Post-Phase C Checkpoint

- [ ] All block types working in the content block editor
- [ ] All block types rendering correctly on public frontend
- [ ] AI generation working for each block type
- [ ] Team member detail page working at `/team/[memberSlug]`
- [ ] Validation working on all new block type fields
- [ ] Update CHANGELOG.md, CLAUDE.md, FILE_TREE.md
- [ ] `git add -A && git commit && git push && rm -rf .next`

---

## 9. Phase D — Migration + Cleanup

> **Type:** Claude Code session(s)
> **Prerequisite:** Phase C complete
> **Output:** All content migrated, old tabs removed, public frontend updated

### Task D.1 — Create Team Members Table

- [ ] Create migration: `team_members` table with proper relational schema
  - `id` (uuid, PK)
  - `name` (text, required)
  - `slug` (text, unique, auto-generated from name)
  - `role` (text, required)
  - `bio` (text — HTML content)
  - `photo_url` (text, nullable)
  - `years_of_service` (integer, nullable)
  - `certifications` (jsonb — array of badge objects)
  - `sort_order` (integer)
  - `is_active` (boolean, default true)
  - `created_at`, `updated_at` timestamps
- [ ] Add RLS policies
- [ ] Add to DB_SCHEMA.md

### Task D.2 — Migrate About Page Data

- [ ] Create a page record in `cms_pages`: title="About", slug="about", published=true
- [ ] Migrate `about_text` from `business_settings` → page's main HTML content field
- [ ] Migrate `team_members` JSON from `business_settings` → `team_members` table rows
- [ ] Migrate `credentials` JSON from `business_settings` → `credentials` content block on the page
- [ ] Create `team_grid` content block on the page (references team_members table)
- [ ] Write migration SQL that preserves existing data
- [ ] Verify public rendering matches current output

### Task D.3 — Migrate Terms Page Data

- [ ] Create a page record in `cms_pages`: title="Terms & Conditions", slug="terms", published=true
- [ ] Migrate terms sections data → `terms_sections` content block on the page
- [ ] Migrate effective date → block-level metadata
- [ ] Write migration SQL
- [ ] Update public `/terms` route to read from new location (or redirect to `/p/terms`)

### Task D.4 — Migrate City Pages Data

- [ ] For each existing city: create a page record in `cms_pages` with slug=`areas/{city-slug}`
- [ ] Migrate city-specific content → `city_info` content block on each page
- [ ] Write migration SQL
- [ ] Update public `/areas/[citySlug]` route to read from new location (or redirect to `/p/areas/{slug}`)

### Task D.5 — Update Public Frontend Routing

- [ ] Ensure `/p/about` renders correctly with team grid + credentials blocks
- [ ] Ensure `/p/terms` renders correctly with terms sections block
- [ ] Ensure `/p/areas/{city}` renders correctly with city info block
- [ ] Set up redirects from old routes (`/terms` → `/p/terms`, etc.) if URL structure changes
- [ ] Fix any hardcoded strings on public pages (e.g., "Meet the Team" → use page title/headline from CMS)
- [ ] Verify team member detail pages work at `/team/[memberSlug]`

### Task D.6 — Remove Old Admin Tabs & Update Sidebar

- [ ] Remove `src/app/admin/website/about/page.tsx` (or redirect to the migrated page in Pages)
- [ ] Remove `src/app/admin/website/terms/page.tsx` (or redirect to the migrated page in Pages)
- [ ] Remove city page CRUD from SEO section (keep SEO settings, remove city page management)
- [ ] Update admin sidebar navigation config to remove old entries
- [ ] Update admin sidebar to reflect final menu structure decided post-audit
- [ ] Add redirects from old admin URLs to new Pages locations (in case of bookmarks)

### Task D.7 — Deprecate & Remove Old API Routes

- [ ] Remove `/api/admin/cms/about` route and handler
- [ ] Remove `/api/admin/cms/terms` route and handler
- [ ] Remove `/api/admin/cms/seo/cities` CRUD routes (keep SEO-only endpoints if still needed)
- [ ] Verify no external consumers (n8n workflows, webhooks) depend on these routes before deletion
- [ ] Remove corresponding data access files if fully replaced

### Task D.8 — Dead Code Cleanup

> Use the deletion checklist from Phase A Task A.14 as the guide

- [ ] Delete all admin page files identified as orphaned
- [ ] Delete all API route files identified as orphaned
- [ ] Delete all data access files identified as orphaned (`src/lib/data/team.ts`, `src/lib/data/cities.ts`, etc.)
- [ ] Delete all components only used by removed pages
- [ ] Remove dead CSS/styles only used by removed components
- [ ] Clean up any orphaned imports across the codebase (search for imports referencing deleted files)
- [ ] Remove old data from `business_settings` JSON (about_text, team_members, credentials) after confirming migration is complete and stable
- [ ] Run a full build to catch any broken imports or references
- [ ] Grep the codebase for any remaining references to deleted file paths

### Task D.9 — Final Validation & Regression Testing

- [ ] Test creating a new page with each block type
- [ ] Test editing existing migrated pages (About, Terms, Cities)
- [ ] Test all public rendering paths
- [ ] Test team member detail pages
- [ ] Test AI generation on all block types
- [ ] Test validation on all forms (Layer 1, 2, 3)
- [ ] Test unsaved changes warning
- [ ] Test image upload on all ImageUploadField instances
- [ ] Test drag-and-drop reorder on all sortable lists
- [ ] Verify no broken links or missing images on public site

### Post-Phase D Checkpoint

- [ ] All content migrated successfully
- [ ] Old admin tabs removed or redirected
- [ ] Public frontend renders correctly from new data sources
- [ ] No regressions in existing functionality
- [ ] Update CHANGELOG.md, CLAUDE.md, FILE_TREE.md, DB_SCHEMA.md
- [ ] `git add -A && git commit && git push && rm -rf .next`

---

## 10. Phase E — Deferred Enhancements

> **Type:** Future Claude Code sessions (independent of each other)
> **Prerequisite:** Phase D complete and stable
> **Note:** These are designed into the architecture but deferred from the initial build. Each can be done as a standalone session.

### E.1 — Preview Mode

- [ ] Add `?preview=true&token={previewToken}` query parameter support to public page renderer
- [ ] Generate preview tokens per page (short-lived, admin-only)
- [ ] Add "Preview" button to page editor (opens new tab with preview URL)
- [ ] Preview renders draft/unpublished pages with a "Preview Mode" banner
- [ ] Preview token expires after 1 hour or on publish

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

### E.4 — Theme System Overhaul

- [ ] Audit current Theme Settings schema and `site-theme` API
- [ ] Audit Seasonal Themes system — activation/deactivation cron, override behavior
- [ ] Design swappable theme system: create/delete themes, preview before activating
- [ ] Ensure every public component reads from centralized theme variables
- [ ] Review CSS variable structure and Tailwind integration
- [ ] Review relationship between base Theme Settings and Seasonal Themes — simplify if redundant
- [ ] Dark/light mode consistency across all public pages
- [ ] Theme import/export capability
- [ ] **This is a separate project scope — do not bundle with Phases A–D**

---

## 11. Key Files Reference

> **CRITICAL:** Always read `CLAUDE.md` and `docs/dev/FILE_TREE.md` before any session. Never guess paths.

### Admin Pages (Website Section)

```
src/app/admin/website/page.tsx               — Website section landing
src/app/admin/website/about/page.tsx         — About & Team editor (TO BE MIGRATED)
src/app/admin/website/pages/page.tsx         — Pages list
src/app/admin/website/pages/new/page.tsx     — New page
src/app/admin/website/pages/[id]/page.tsx    — Edit page (THE FOUNDATION)
src/app/admin/website/terms/page.tsx         — Terms editor (TO BE MIGRATED)
src/app/admin/website/seo/cities/page.tsx    — Cities editor (TO BE MIGRATED)
src/app/admin/website/footer/page.tsx        — Footer editor (HAS DRAG-DROP TO EXTRACT)
src/app/admin/website/hero/page.tsx          — Hero carousel
src/app/admin/website/hero/[id]/page.tsx     — Hero slide editor
src/app/admin/website/navigation/page.tsx    — Navigation editor
src/app/admin/website/tickers/page.tsx       — Ticker list
src/app/admin/website/tickers/[id]/page.tsx  — Ticker editor
src/app/admin/website/ads/page.tsx           — Ads manager
src/app/admin/website/catalog/page.tsx       — Catalog display settings
src/app/admin/website/theme-settings/page.tsx — Theme settings (base theme)
src/app/admin/website/themes/page.tsx        — Seasonal themes manager
src/app/admin/website/themes/[id]/page.tsx   — Seasonal theme editor
```

### Key Components

```
src/components/admin/content/page-html-editor.tsx    — Rich HTML editor + AI
src/components/admin/content/content-block-editor.tsx — Content block system
src/components/admin/content/faq-editor.tsx           — FAQ block (reference pattern)
src/components/admin/html-editor-toolbar.tsx          — HTML editor toolbar
src/components/admin/html-image-manager.tsx           — Image management in editor
src/components/public/content-block-renderer.tsx      — Public block rendering
src/components/ui/form-field.tsx                      — Form field (check for error support)
```

### API Routes (CMS)

```
src/app/api/admin/cms/about/route.ts         — About CRUD (TO BE DEPRECATED)
src/app/api/admin/cms/terms/route.ts         — Terms CRUD (TO BE DEPRECATED)
src/app/api/admin/cms/pages/route.ts         — Pages CRUD (THE FOUNDATION)
src/app/api/admin/cms/pages/[id]/route.ts    — Single page CRUD
src/app/api/admin/cms/content/route.ts       — Content blocks CRUD
src/app/api/admin/cms/content/[id]/route.ts  — Single block CRUD
src/app/api/admin/cms/seo/cities/route.ts    — Cities CRUD (TO BE DEPRECATED)
src/app/api/admin/cms/themes/route.ts        — Seasonal themes list/create
src/app/api/admin/cms/themes/[id]/route.ts   — Seasonal theme CRUD
src/app/api/admin/cms/themes/[id]/activate/route.ts  — Activate theme
src/app/api/admin/cms/themes/[id]/deactivate/route.ts — Deactivate theme
src/app/api/admin/cms/site-theme/route.ts    — Base theme settings
src/app/api/admin/upload/content-image/route.ts — Image upload endpoint
src/app/api/cron/theme-activation/route.ts   — Cron: scheduled theme activation
```

### Data Access

```
src/lib/data/website-pages.ts    — Page data functions
src/lib/data/page-content.ts     — Content block data functions
src/lib/data/team.ts             — Team data functions (TO BE REPLACED)
src/lib/data/cities.ts           — Cities data functions (TO BE REPLACED)
src/lib/data/cms.ts              — CMS data functions (check for homepage/theme data)
src/lib/services/ai-content-writer.ts — AI content generation
```

### Public Pages

```
src/app/(public)/page.tsx                          — Homepage (AUDIT: hardcoded vs CMS?)
src/app/(public)/terms/page.tsx                    — Terms public page (TO BE REDIRECTED)
src/app/(public)/areas/page.tsx                    — Service areas listing
src/app/(public)/areas/[citySlug]/page.tsx         — City landing page (TO BE REDIRECTED)
src/app/(public)/services/page.tsx                 — Service category listing
src/app/(public)/products/page.tsx                 — Product category listing
src/app/(public)/gallery/page.tsx                  — Photo gallery
src/app/p/[...slug]/page.tsx                       — CMS dynamic pages (THE FOUNDATION)
```

### DB Schema

```
docs/dev/DB_SCHEMA.md            — Full database schema reference
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

---

## 13. Design Decisions Log

| Decision | Rationale | Date |
|---|---|---|
| Extend Pages system, don't rebuild | Pages already has HTML editor + AI + content blocks + SEO + publishing. Building on existing working system minimizes risk | 2026-02-26 |
| Content blocks over page templates | Templates are rigid. Blocks give full flexibility — add any combination of content types to any page | 2026-02-26 |
| Team members in own DB table (not JSON in content block) | Enables detail page routing by slug, querying, future features (scheduling, assignments). Proper relational data | 2026-02-26 |
| Team detail pages at `/team/[slug]` (dedicated route) | Cleaner URL, independent of /p/ catch-all, avoids slug collision with page system | 2026-02-26 |
| Extract drag-and-drop from Footer (not build new) | Footer already has working implementation. Reuse > rebuild | 2026-02-26 |
| Three-layer validation (inline + section badge + toast) | Toast-only validation fails on complex forms. Users need to see exactly which field is wrong and where | 2026-02-26 |
| AI button per block (not just main content) | Each content area has different context and needs different prompts. Granular AI = better generation quality | 2026-02-26 |
| Defer theme overhaul to Phase E | Theme is a design system change, not a content management change. Different scope, different risk profile | 2026-02-26 |
| Defer preview mode, shared blocks, revision history to Phase E | High value but not blocking. Architecture supports adding them later without rework | 2026-02-26 |
| Desktop-only admin editing | Mobile/tablet admin is out of scope. No responsive optimization needed for admin editors | 2026-02-26 |
| Seasonal Themes is a separate system from Theme Settings | Theme Settings = base colors/fonts/dark-light. Seasonal Themes = time-based theme overrides with cron activation. Both stay as separate admin tabs; audit will confirm they're self-contained | 2026-02-26 |
| Homepage management — DEFERRED TO POST-AUDIT | Need audit to determine if homepage is hardcoded assembly or CMS-driven before deciding whether it joins Pages | 2026-02-26 |
| Website admin menu structure — DEFERRED TO POST-AUDIT | Need full picture of remaining tabs after migration before deciding flat vs. grouped layout | 2026-02-26 |

---

## 14. Out of Scope

These items are explicitly excluded from all phases:

- Mobile/tablet admin editing optimization
- Bulk content block actions (bulk delete, bulk reorder)
- Any changes to non-Website admin sections (POS, Marketing, Jobs, etc.)
- Any functional changes to existing APIs beyond what's needed for migration
- Theme system overhaul (handled separately in Phase E.4)
- Drag-and-drop page reordering in the pages list (only within-page block reordering)
- Multi-language / i18n support
- Scheduled publishing (publish at future date)
- Content workflow / approval system

---

## Agent Handoff Notes

When picking up this project:

1. **Always read `CLAUDE.md` and `docs/dev/FILE_TREE.md` first** — never guess file paths
2. **Check `docs/dev/DB_SCHEMA.md`** before creating new DB fields/tables — reuse existing fields first
3. **This plan is PRE-AUDIT** — Phase A must complete before Phases B–E are finalized. The audit may reveal complications that change the task breakdown
4. **After the audit**, update this document with refined tasks, specific file paths, and any new findings
5. **Each phase has a checkpoint** — do not start the next phase until the checkpoint is verified
6. **Session prompts must end with:** update CHANGELOG.md, CLAUDE.md, and FILE_TREE.md (if new routes/pages/lib/components/migrations created), then `git add -A && git commit && git push && rm -rf .next`
7. **All cron/scheduling is internal** — never suggest n8n, Vercel Cron, or external schedulers
8. **Timezone is PST** — `America/Los_Angeles`, not UTC
9. **Deployed on Hostinger** — not Vercel. Never reference Vercel
10. **Never provide patch code or quick fixes** — always provide fully thought-out solutions considering all scenarios and edge cases
