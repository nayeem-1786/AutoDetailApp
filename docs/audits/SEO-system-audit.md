# Audit: SEO System — Page Structure, Scoring, AI Generation, and Content Blocks

## Context

The admin SEO section shows 503 pages with most scoring 60 or below after AI-generated meta content. This audit maps the full SEO system before fixing the AI instructions.

---

## Part 1 — SEO Scoring System

### Scoring Algorithm

**File:** `src/app/admin/website/seo/page.tsx` (lines ~71-103)

The score is **calculated client-side in real-time** — never stored in the database. It recalculates on every page load and as fields are edited.

| Factor | Condition | Points |
|--------|-----------|--------|
| **SEO Title length** | 50-60 chars (ideal) | +20 |
| | 1-49 or 61-69 chars | +10 |
| | 0 or 70+ chars | 0 |
| **Meta Description length** | 150-160 chars (ideal) | +20 |
| | 1-149 or 161-199 chars | +10 |
| | 0 or 200+ chars | 0 |
| **Focus keyword in title** | Present (case-insensitive) | +20 |
| **Focus keyword in description** | Present (case-insensitive) | +15 |
| **Focus keyword in URL** | Slugified keyword appears in path | +10 |
| **OG Image** | URL present | +10 |
| **Internal links** | At least one configured | +5 |
| **Maximum** | | **100** |

### Score Thresholds

| Range | Label | Badge Color |
|-------|-------|------------|
| 80-100 | **Good** | Green |
| 50-79 | **Needs Work** | Amber |
| 0-49 | **Poor** | Red |

### Sample Score Breakdown for a ~60 Page

A typical page scoring 60 hits this pattern:

| Factor | Likely Status | Points |
|--------|--------------|--------|
| Title exists, ~40-49 or 61-69 chars | Partial | +10 |
| Description exists, ~120-149 or 161-199 chars | Partial | +10 |
| Focus keyword in title | Yes (AI does this) | +20 |
| Focus keyword in description | Yes (AI does this) | +15 |
| Focus keyword in URL | Sometimes | +0 to +10 |
| OG image | None (AI doesn't generate) | +0 |
| Internal links | None (AI doesn't generate) | +0 |
| **Typical total** | | **55-65** |

---

## Part 2 — Page Types and Structure

### Where the 503 Pages Come From

Pages are discovered by `src/lib/seo/known-pages.ts` which queries the DB:

| Page Type | Source | Example Path |
|-----------|--------|-------------|
| **Static** | Hardcoded (6 pages) | `/`, `/services`, `/products`, `/gallery`, `/book`, `/terms` |
| **Service categories** | `service_categories` (active) | `/services/ceramic-coatings` |
| **Service detail** | `services` (active + show_on_website) | `/services/ceramic-coatings/ceramic-pro` |
| **Product categories** | `product_categories` (active) | `/products/protection` |
| **Product detail** | `products` (active + show_on_website) | `/products/protection/ceramic-pro-bottle` |
| **City landing** | `city_landing_pages` (active, 11 seeded) | `/areas/torrance` |
| **CMS pages** | `website_pages` (published) | `/p/about-us` |

The 503 total = 6 static + all active services + service categories + products + product categories + 11 cities + CMS pages.

### `page_seo` Table Schema

**Migration:** `20260214000009_seo_engine.sql`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| page_path | TEXT UNIQUE NOT NULL | e.g. `/services/coatings/ceramic-coating` |
| page_type | TEXT | `homepage`, `service_category`, `service_detail`, `product_category`, `product_detail`, `gallery`, `booking`, `city_landing`, `custom` |
| seo_title | TEXT | Target: 50-60 chars |
| meta_description | TEXT | Target: 150-160 chars |
| meta_keywords | TEXT | Comma-separated |
| focus_keyword | TEXT | Primary keyword phrase |
| og_title | TEXT | Falls back to seo_title |
| og_description | TEXT | Falls back to meta_description |
| og_image_url | TEXT | Social preview image |
| canonical_url | TEXT | |
| robots_directive | TEXT | Default: `index,follow` |
| structured_data_overrides | JSONB | Custom JSON-LD overrides |
| internal_links | JSONB | Array of `{text, url}` objects |
| is_auto_generated | BOOLEAN | Default false |
| created_at / updated_at | TIMESTAMPTZ | |

### Content Blocks (`page_content_blocks` table)

**Migration:** `20260214000010_page_content_blocks.sql`

Content is stored as **individual rows per block**, not a single JSONB array. Each block has:
- `page_path` — which page it belongs to
- `block_type` — one of 9 types (see below)
- `content` — TEXT field, format depends on block type
- `sort_order` — display order
- `is_active`, `ai_generated`, `ai_last_generated_at`

**9 Block Types:**

| Type | Content Format | What It Renders |
|------|---------------|-----------------|
| `rich_text` | HTML string | Prose paragraphs, headings, formatted text |
| `faq` | JSON array of `{question, answer}` | Accordion with FAQPage schema |
| `features_list` | JSON array of `{title, description}` | 2-column grid with checkmarks |
| `cta` | JSON `{heading, description, button_text, button_url}` | Gradient CTA section |
| `testimonial_highlight` | JSON `{quote, author, rating, source}` | Styled blockquote with stars |
| `team_grid` | JSON config (pulls from `team_members` table) | Team member cards |
| `credentials` | JSON config (pulls from `credentials` table) | Certification badges |
| `terms_sections` | JSON `{effective_date, sections[]}` | Numbered legal sections |
| `gallery` | JSON `{images[]}` | Photo gallery with lightbox |

---

## Part 3 — AI Generation System

### AI Provider

**Claude Sonnet** (model: `claude-sonnet-4-20250514`) via direct Anthropic API call.

**File:** `src/lib/services/ai-seo.ts`

### System Prompt (lines 35-94)

Instructs Claude as "a seasoned SEO expert with 10+ years" with rules for:

- **Title:** 50-60 chars, keyword near beginning, business name/location, power separators (`|` or `—`)
- **Meta description:** 150-160 chars, CTA, power words (Professional, Expert, Certified, Premium, Trusted), USPs
- **Keywords:** 5-10 comma-separated, mix short/long-tail, location + "near me" variants
- **Focus keyword:** 2-4 word primary phrase, must appear in title/description
- **OG fields:** Slightly different from SEO title, optimized for social sharing
- **Suggestions:** 2-4 actionable improvement recommendations
- **Local SEO:** City/area names, "near me" intent, South Bay/LA area references, Google rating mentions

### Fields AI Generates

1. `seo_title`
2. `meta_description`
3. `meta_keywords`
4. `focus_keyword`
5. `og_title`
6. `og_description`
7. `suggestions[]` (improvement recommendations)

**The AI does NOT generate:** OG images, internal links, page body content, or content blocks.

### Context Provided to AI (User Prompt)

Built by `buildUserPrompt()` (lines 153-181):

- `PAGE PATH` — the URL
- `PAGE TYPE` — service_detail, city_landing, etc.
- `BUSINESS` — business name
- `LOCATION` — business address
- `PAGE CONTENT` — extracted via `page-content-extractor.ts` (see below)
- `CURRENT SEO` — existing title/description/keywords if any (for improvement mode)

### Page Content Extraction

**File:** `src/lib/services/page-content-extractor.ts`

Routes by URL pattern to type-specific extractors:

| Pattern | Extractor | Data Pulled |
|---------|-----------|-------------|
| `/services/{cat}/{svc}` | `extractServiceDetailContent()` | Name, description, pricing, duration, mobile eligibility, category |
| `/services/{cat}` | `extractServiceCategoryContent()` | Category name, list of services in category |
| `/services` | `extractServicesIndexContent()` | All categories and their services |
| `/products/{cat}/{prod}` | `extractProductDetailContent()` | Name, description, pricing, availability |
| `/products/{cat}` | `extractProductCategoryContent()` | Category name, products list |
| `/products` | `extractProductsIndexContent()` | All product categories |
| `/areas/{slug}` | `extractCityPageContent()` | City name, intro, service highlights, landmarks |
| `/` | `extractHomepageContent()` | Business context |
| `/gallery` | `extractGalleryContent()` | Basic business context |
| `/book` | `extractBookingContent()` | Basic business context |
| `/terms` | `extractTermsContent()` | Basic business context |

All extractors also include business context (name, phone, address, website) from `business_settings`.

### Bulk Operations

- **Single page:** "AI Optimize" button in page editor
- **All pages:** "AI Generate All" — batches 4 pages at a time with 15s delays for rate limits
- **Review modal:** Shows current vs. AI-generated side-by-side, admin picks which pages to apply
- **Selective apply:** Admin can edit AI output before applying

### AI Generation Endpoint

**File:** `src/app/api/admin/cms/seo/ai-generate/route.ts`

Three modes:
- `single` — one page path
- `global` — all known pages (only auto-generated/empty unless `overwriteExisting: true`)
- `batch` — specific page paths

Supports `dryRun` to preview targets without calling AI.

### AI Apply Endpoint

**File:** `src/app/api/admin/cms/seo/ai-apply/route.ts`

Accepts array of pages with partial SEO fields. Creates or updates `page_seo` entries, marking them as `is_auto_generated: false` once manually reviewed/applied.

---

## Part 4 — Content Analysis

### Content Blocks Are NOT AI-Generated by Default

The SEO AI only creates **meta fields**. Content blocks (page body) are managed separately through `ContentBlockEditor`. There IS a separate AI content generation system (`/api/admin/cms/content/ai-generate`) with modes `full_page`, `improve`, `single_block` — but it is independent of the SEO AI.

### Focus Keyword vs. Page Content Gap

**This is likely the #1 real-world SEO problem.** The scoring system checks if the focus keyword appears in the title and description, but does NOT check if the focus keyword appears in the actual page body content. This means:

- AI generates a focus keyword like "ceramic coating torrance"
- The meta title/description include it
- But the actual page content blocks may never mention it
- Search engines see a disconnect between meta promises and body content

### Word Count

The scoring system does **not** measure word count. There is no thin content penalty. Pages could have zero content blocks and still score 80+ if meta fields are well-optimized.

### Heading Hierarchy

Not checked by the scoring system. Content blocks render their own headings (FAQ titles, feature titles, etc.) but there is no H1 > H2 > H3 validation.

### Internal Links

The `page_seo.internal_links` JSONB field exists and earns +5 points, but the AI does NOT generate internal links. They must be manually added. Most pages likely have zero.

### Images with Alt Text

Product images have `image_alt` fields. OG images are checked (+10 points) but alt text on body images is not part of the score.

### JSON-LD Structured Data

**File:** `src/lib/seo/json-ld.ts`

Generated automatically per page type (not stored in `page_seo`):

| Schema | Where |
|--------|-------|
| `LocalBusiness` (AutoRepair) | All pages — name, URL, phone, address, area served, reviews, price range |
| `Service` | Service detail pages — name, description, category, provider, offers |
| `Product` | Product pages — name, description, SKU, brand, offer, availability |
| `FAQPage` | Pages with FAQ content blocks — question/answer pairs |
| `BreadcrumbList` | Category and detail pages |

Service offers are intelligently built: flat pricing gets a single Offer, tiered pricing (vehicle_size, scope, specialty) gets AggregateOffer with low/high price.

This is a **strength** — structured data coverage is solid.

---

## Part 5 — Score Factor Analysis Across All Pages

### Why Most Pages Score ~60

The realistic ceiling with only AI-generated meta fields is **~65-75** because OG image (+10) and internal links (+5) require manual work that AI can't do.

### Top 5 Score Deduction Reasons (by likely frequency)

| # | Factor | Points Lost | Affected Pages |
|---|--------|------------|----------------|
| 1 | **No OG image** | -10 | Nearly all (~500) |
| 2 | **No internal links** | -5 | Nearly all (~500) |
| 3 | **Title not exactly 50-60 chars** | -10 (partial) | Many (~300+) |
| 4 | **Description not exactly 150-160 chars** | -10 (partial) | Many (~300+) |
| 5 | **Focus keyword not in URL** | -10 | Many (~200+) |

### Page Type Scoring Patterns

- **City landing pages** — likely score highest. Keyword ("torrance auto detailing") naturally appears in URL slug `/areas/torrance`
- **Service detail pages** — moderate. Keyword may or may not match the URL slug
- **Product pages** — likely score lower. Product names rarely match SEO focus keywords
- **Static pages** (homepage, gallery, booking) — likely score lowest. Generic URLs don't contain keywords

---

## Part 6 — SEO Infrastructure

### Sitemap

**File:** `src/app/sitemap.xml/route.ts`

Dynamic XML sitemap including:
- All static pages
- All service categories + individual services (ceramic coatings get priority 1.0)
- All product categories + individual products
- All active city landing pages
- All published CMS pages
- Image metadata in sitemap entries
- 1-hour cache (`s-maxage=3600`)

### Robots.txt

**File:** `src/app/robots.txt/route.ts`

- **Allows:** `/`, `/services`, `/products`, `/areas`
- **Disallows:** `/admin`, `/api/`, `/pos`, `/account`, `/login`
- Points to `/sitemap.xml` and `/ai.txt`
- 24-hour cache

### ai.txt

**File:** `src/app/ai.txt/route.ts`

Admin-configurable AI crawler policies. Default blocks AI bots from admin/API/POS paths, allows public content. Editable from SEO admin > ai.txt tab.

### Canonical URLs

Set via `page_seo.canonical_url` field. Also auto-generated in `src/lib/seo/metadata.ts` by `generateServiceMetadata()`, `generateProductMetadata()`, and `generateCategoryMetadata()`. Admin overrides via `page_seo` take priority.

### SEO Data Merge

**File:** `src/lib/seo/page-seo.ts`

`mergeMetadata()` combines auto-generated Next.js Metadata with admin SEO overrides from `page_seo`. Admin overrides take priority when present, auto-generated values are fallbacks. Cached for 300s with `cms-seo` tag.

---

## Summary of Root Causes for Low Scores

| Issue | Impact | Fix Complexity |
|-------|--------|---------------|
| **AI doesn't generate OG images** | -10 pts on every page | Medium (batch assign default image) |
| **AI doesn't generate internal links** | -5 pts on every page | Medium (AI could suggest links) |
| **Title char count misses 50-60 range** | -10 pts on many pages | Easy (tighten AI prompt with stricter enforcement) |
| **Description char count misses 150-160 range** | -10 pts on many pages | Easy (tighten AI prompt with stricter enforcement) |
| **Focus keyword doesn't match URL slug** | -10 pts on many pages | Hard (URL slugs are fixed from service/product names) |
| **Scoring doesn't check body content** | Missed signal entirely | Medium (add content scoring factors) |
| **No word count / thin content check** | Missed signal | Easy (add to scoring) |
| **No heading hierarchy check** | Missed signal | Easy (add to scoring) |

### Key Files Reference

| File | Purpose |
|------|---------|
| `src/app/admin/website/seo/page.tsx` | SEO admin dashboard, scoring logic, page editor |
| `src/lib/services/ai-seo.ts` | AI SEO generation (system prompt, API call, user prompt) |
| `src/lib/seo/known-pages.ts` | Discovers all 503 indexable pages |
| `src/lib/seo/page-seo.ts` | SEO data retrieval + metadata merge |
| `src/lib/seo/metadata.ts` | Auto-generated metadata for service/product/category pages |
| `src/lib/seo/json-ld.ts` | JSON-LD structured data generators |
| `src/lib/services/page-content-extractor.ts` | Extracts page content for AI context |
| `src/lib/data/website-pages.ts` | Navigation and page queries |
| `src/components/public/content-block-renderer.tsx` | Renders content blocks on public pages |
| `src/components/admin/content/content-block-editor.tsx` | Content block CRUD and AI features |
| `src/app/api/admin/cms/seo/ai-generate/route.ts` | AI generation endpoint (single/global/batch) |
| `src/app/api/admin/cms/seo/ai-apply/route.ts` | Apply AI-generated SEO to pages |
| `src/app/api/admin/cms/seo/pages/route.ts` | List/auto-populate SEO pages |
| `src/app/api/admin/cms/seo/pages/[encodedPath]/route.ts` | Get/update single page SEO |
| `src/app/sitemap.xml/route.ts` | Dynamic sitemap generation |
| `src/app/robots.txt/route.ts` | Robots.txt |
| `supabase/migrations/20260214000009_seo_engine.sql` | page_seo table + city landing pages |
| `supabase/migrations/20260214000010_page_content_blocks.sql` | page_content_blocks table |
