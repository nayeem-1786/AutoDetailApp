# Catalog CRUD Wiring Audit (2026-05-27)

> Read-only diagnostic audit. No source/migration/test changes were made.
> Branch: `audit/catalog-services-products-tiers-addons-crud-wiring`
> Scope: services, products, service tiers (`service_pricing`), add-ons, categories — all CRUD operations and their UI ↔ backend ↔ DB wiring.

## Context

Operator-reported failure: in **Admin → Services → Add New**, filling the form and clicking **"Create Service"** produces a red toast **"Failed to create service"** on every attempt. The surface was rarely touched post-launch and was suspected to have shipped half-built. This audit root-causes that failure and then sweeps the rest of the catalog domain for the same class of "looks complete but isn't wired" defects.

Evidence was gathered three ways: (1) reading the UI/API/validation source on a clean `origin/main` worktree, (2) reading `docs/dev/DB_SCHEMA.md`, and (3) **live read-only SQL** against the production Supabase project via `supabase db query --linked` (SELECT only — no writes).

## TL;DR

**Root cause of "Failed to create service" — confirmed and deterministic.** The Add-New-Service form writes directly to the database through the **browser Supabase client** (`createClient()`) and its insert payload **never sets `slug`**. The `services.slug` column is `UNIQUE, NOT NULL` with no default and no slug-generating trigger (only an `updated_at` trigger exists — live-verified). So **every** insert is rejected by Postgres with a NOT-NULL violation. The form's `catch` block then masks the real error behind a generic `toast.error('Failed to create service')`. This is a structural omission across three layers: the Zod schema (`serviceCreateSchema`) defines no `slug` field, the form has no slug input or auto-generate effect, and the insert payload has no `slug` key. The sibling **product** create form does all three correctly, which is why product creation works and service creation does not. **It is not RLS, not permissions, not a 500 from a missing endpoint** — those were each checked and ruled out against the live database.

**Scope of other findings.** The catalog is, with one exception, in good operating shape: products CRUD, service editing, tier (`service_pricing`) CRUD, add-on suggestions, prerequisites, and category management are all wired to working backends, and the live data is clean (no orphans, no missing pricing, no real test data). The most important *secondary* finding is **architectural**: essentially the entire admin catalog (services + products + categories) performs its create/update/delete by calling the **browser Supabase client directly**, governed only by the `is_employee()` RLS write policy — it does **not** use the documented `createClient() (auth) → createAdminClient() (service role)` admin-API pattern, and there is **no `route.ts` create/update endpoint** for services or products at all. That pattern works today, but it concentrates correctness in RLS + client code and produces the second-most-important finding: **pervasive generic-toast error masking** that hid the slug bug for months and masks several latent constraint-violation traps.

**Severity summary.** 1 Critical (Create Service totally broken), 3 Significant (slug not maintained on rename → SEO drift; sale-price `CHECK` violation trap on price-lowering edits; generic-toast masking as a systemic UX defect), 5 Minor (category merge/reorder/restore gaps; scope/specialty duplicate `tier_name` risk; inconsistent permission gating; no products/services reorder UI; racy slug uniqueness pre-check), and a handful of Informational items (one suggestion pointing to a deactivated add-on; `pricing_model` immutable after creation; a referenced-but-nonexistent "reprice" mechanism).

---

## The reported failure (root cause)

**Reproduction:** Admin → Services → Add New → fill form → "Create Service" → `toast.error('Failed to create service')`.

**Trace:**

1. **UI surface / submit handler** — `src/app/admin/catalog/services/new/page.tsx`
   - Imports the **browser** client: `import { createClient } from '@/lib/supabase/client'` (line 7), instantiated at line 46.
   - `onSubmit` (lines 144–256) builds `servicePayload` (lines 148–176). The payload sets `name, description, category_id, pricing_model, classification, base_duration_minutes, mobile_eligible, online_bookable, staff_assessed, is_taxable, vehicle_compatibility, special_requirements, is_active, display_order` (+ conditional `flat_price`/`custom_starting_price`/`per_unit_*`). **It never sets `slug`.**
   - Insert: `supabase.from('services').insert(servicePayload).select().single()` (lines 179–183). There is **no API route involved** — the write is a direct browser-client insert.
   - On any error: `catch (err) { console.error('Failed to create service:', err); toast.error('Failed to create service'); }` (lines 250–252) — the real Postgres error is logged to the console but never surfaced to the operator.
   - The pricing-row inserts (lines 188–235) are effectively dead code: the parent `services` insert throws first, so they never execute.

2. **No slug anywhere upstream** — `src/lib/utils/validation.ts`
   - `serviceCreateSchema` (lines 158–178) defines **no `slug` field**. Compare `productCreateSchema` (around line 109) which includes `slug: slugSchema.optional()`.
   - The form has no slug `<input>` and no name→slug auto-generate `useEffect` (the product form has one at `products/new/page.tsx:73–83`).

3. **DB requires slug** — `services.slug`
   - `docs/dev/DB_SCHEMA.md:2428` — `slug | TEXT | UNIQUE, NOT NULL`.
   - **Live-verified:** `information_schema.columns` → `services.slug` `is_nullable = NO`, `column_default = null`.
   - **Live-verified:** the only trigger on `services` is `tr_services_updated_at` (`BEFORE UPDATE … update_updated_at()`). There is **no BEFORE INSERT trigger** and no slug generator. So the missing `slug` is not backfilled by the DB.

4. **Failure mode = NOT-NULL constraint violation (Postgres 23502)** on `services.slug`, returned to the browser client, caught at `new/page.tsx:250–252`, shown as the generic toast.

**Ruled out (with live evidence):**

- **RLS / 403** — `services` has RLS enabled with policy `services_write` (`cmd = ALL`, `roles = {authenticated}`, `with_check = is_employee()`). An authenticated employee **can** insert. (Identical to `products_write`, and product creation works.)
- **Permissions** — `services.edit` (the key the form gates on, `new/page.tsx:47`) is defined in `permission_definitions` and granted to `admin`, `cashier`, `detailer`, and `super_admin`; `super_admin` also bypasses all checks (`src/lib/auth/check-permission.ts:33–34`). The form renders and `onSubmit` runs — the failure is downstream at the insert.
- **Missing endpoint / 404 / 500** — there is no endpoint to 404 or 500; the write is a direct client insert. The failure is a DB constraint rejection, not a server error.

**Fix shape (for the remediation conversation, not done here):** mirror the product create form — add `slug` to `serviceCreateSchema`, add a slug input + name→slug auto-generate effect, pre-check uniqueness against `services.slug`, and include `slug` in the insert payload. Additionally surface the real error message in the catch (see Target 9). The same slug logic should be applied to the **edit** page's rename path (Target 1 / 7).

---

## Detailed findings per target

### Target 1 — Services CRUD wiring matrix

`services` has **no `deleted_at` column** (live-verified; DB_SCHEMA:2402–2436), so "delete" in this domain means setting `is_active = false`. All writes are browser-client unless noted.

| Operation | UI surface (file:line) | Persistence | Status |
|-----------|------------------------|-------------|--------|
| Create | `catalog/services/new/page.tsx:179–183` | browser-client `insert` | **BROKEN** — omits NOT-NULL `slug` (see root cause) |
| Read (list) | `catalog/services/page.tsx:57–68` | browser-client `select` (+ `service_categories` join) | Works |
| Read (search/filter) | `catalog/services/page.tsx:124–183` | client-side `useMemo` | Works |
| Read (detail) | `catalog/services/[id]/page.tsx` (load) | browser-client `select` | Works |
| Update (details) | `catalog/services/[id]/page.tsx:491–534` (`onSaveDetails`, update at 519–522) | browser-client `update` | Works, with caveats — **does not maintain `slug` on rename** (Significant; SEO drift) and **omits `pricing_model`** (immutable after create) |
| Delete | `catalog/services/[id]/page.tsx:419–438` (handler), `:1029` (button), `:1891` (confirm) | browser-client `update is_active=false` | Works (soft; "Delete" label = deactivate) |
| Activate (from list) | `catalog/services/page.tsx:94–122` (handler), `:295–306` (button) | browser-client `update is_active=true` | Works |
| Deactivate (edit toggle) | `catalog/services/[id]/page.tsx:402–416`, `:1213` | form value only; persists on next "Save Details" | Works (deferred persist) |
| `show_on_website` toggle | `catalog/services/[id]/page.tsx:1245–1259` | **API** `PATCH /api/admin/cms/catalog/services` | Works (only API-backed write on the page) |
| Reorder | — | — | **Not implemented** (display_order is editable per-service via a number field; no drag/move; list shows it read-only) |

Notes: There is **no `/api/admin/services/route.ts`** create/update endpoint. The only services API under `admin/` is `services/active/route.ts` (read) and `cms/catalog/services/route.ts`, and the latter only patches `show_on_website` / `is_featured` / `display_order` (`route.ts:31–79`) — not a full-service writer.

### Target 2 — Products CRUD wiring matrix

`products` is a fully separate concept from services (e-commerce inventory). Core CRUD is browser-client; specialized operations are API-backed. No `/api/admin/products/route.ts` or `[id]/route.ts` exists — that dir holds only `barcode-lookup/`, `group/`, `[id]/group/`, `[id]/variants/`.

| Operation | UI surface (file:line) | Persistence | Status |
|-----------|------------------------|-------------|--------|
| Create | `catalog/products/new/page.tsx:160–182` | browser-client `insert` | **Works** — generates+inserts `slug` (`:140–145, :164`), pre-checks uniqueness (`:148–157`) |
| Read (list/filter) | `catalog/products/page.tsx:132–177` | browser-client `select` | Works |
| Update | `catalog/products/[id]/page.tsx:463–485` | browser-client `update` | Works — slug preserved, uniqueness re-check (`:436–448`); `quantity_on_hand` intentionally excluded (routed through audited stock endpoint) |
| Delete | `catalog/products/[id]/page.tsx:570–589` | browser-client `update is_active=false` | Works (soft; list re-activate at `page.tsx:197–219`) |
| Sale pricing | `catalog/products/[id]/page.tsx:591–666` | browser-client `update` | Works — validates `sale_price < retail_price` (matches `chk_product_sale_price`) |
| Active toggle | `catalog/products/[id]/page.tsx:694–706` | browser-client `update` | Works |
| Website visibility | `catalog/products/[id]/page.tsx:741–745` | **API** `PATCH /api/admin/cms/catalog/products` | Works |
| Multi-image mgmt | `catalog/products/[id]/page.tsx:280–428` | browser-client storage + `product_images` | Works (upload/remove/replace/setPrimary/reorder) |
| Stock adjust | `catalog/products/page.tsx:243` + Quick-Edit drawer | **API** `/api/admin/stock-adjustments` | Works (audited by design) |
| Variant group create/remove | `catalog/products/[id]/page.tsx:1046, 1131` | **API** `/api/admin/products/group`, `[id]/group` | Works |
| Variant siblings | `catalog/products/[id]/page.tsx:233, 1139` | **API** `/api/admin/products/[id]/variants` | Works |
| Barcode lookup | `catalog/products/page.tsx:86` | **API** `/api/admin/products/barcode-lookup` | Works |
| AI enrichment | `catalog/products/[id]/page.tsx:1191–1318` | **API** `/api/admin/cms/products/ai-enrich*` | Works (submit → poll → results → apply) |
| Reorder | — | — | **Not implemented** (display_order read-only in list; no control on edit form) |

No missing-required-column risk found for products: create includes `slug` and all NOT-NULL columns are supplied or have DB defaults.

### Target 3 — Service tiers (`service_pricing`) CRUD wiring

All tier writes happen in `catalog/services/[id]/page.tsx` `onSavePricing` (lines 537–791), browser-client. Constraints in play: `service_pricing_service_id_tier_name_key` UNIQUE(service_id, tier_name); `chk_service_sale_price` CHECK(sale_price IS NULL OR sale_price < price).

| Tier operation | file:line | Mechanism | Status |
|----------------|-----------|-----------|--------|
| vehicle_size standard tiers (sedan/truck/suv) | `:607–611, 648–652` | `.upsert(onConflict: 'service_id,tier_name')` | Works |
| vehicle_size exotic/classic add | `:621–637, 648–652` | upsert when price>0 | Works |
| vehicle_size exotic/classic remove | `:639–646` | `.delete().in('tier_name', …)` then upsert | Works |
| scope tiers update / insert / delete | `:674–698 / :700–723 / :661–672` | per-row update / insert / delete via `originalPricingIds` diff | Works |
| specialty tiers update / insert / delete | `:727–780` | same pattern | Works |
| vehicle-size-aware columns on scope tiers | `:687–691, 711–715` | written on update+insert, nulled when flag off | Works |
| per-tier `sale_price` | `:608–610, 630, 692, 716, 757, 774` | written inline | Works (with CHECK risk below) |
| sale date window (`sale_starts_at/ends_at`) | `:592–596` | PST start/end-of-day helpers (null-safe) | Works |
| Clear all sale prices | `:961–989` | N+1 `update({sale_price:null})` per row | Works |
| `pricing_model` change (edit) | display-only at `:1021, :1324`; omitted from `onSaveDetails` payload | — | **Not implemented** — model is immutable after creation |
| `repriceFailed` / reprice flow | — | — | **Does not exist** anywhere in the surface (grep-confirmed) |

Pricing math: these pages persist raw price columns and do **not** compute a price, so CLAUDE.md rule 22 (canonical engine) is **not violated** here — the `resolveServicePrice*` exports are simply unused on these pages.

**Latent constraint traps (masked by generic toasts):**
- *Sale-price CHECK violation on simultaneous lower-price edit.* The pre-save validation loop (`:557–571`) compares `salePrices[tier]` against the **stale DB-loaded** `row.price`, not the newly-edited price in `pricingValue.data`. Lowering a tier's base price below an existing sale price in the same save passes validation, then the upsert writes the new lower `price` + the now-too-high `sale_price` → DB rejects with `chk_service_sale_price` → only a generic `toast.error('Failed to update pricing')` (`:786–787`). The vehicle_size path does no `< price` re-check at all.
- *Duplicate `tier_name` UNIQUE risk.* Scope/specialty tier names are free-text with no client-side dedupe; two tiers with the same name violate `service_pricing_service_id_tier_name_key` on insert, again masked by the generic toast.

### Target 4 — Add-ons CRUD wiring

There is **no `addons` or `service_addons` table** (live-verified). "Add-on" has three distinct meanings:

1. **Catalog add-on = a service with `classification ≠ 'primary'`.** `services.classification` is an enum (`primary | addon_only | both`, DB_SCHEMA:2411). No dedicated add-on management page — classification is set on service create (`services/new/page.tsx:316–321`) and edited on the service edit page (`services/[id]/page.tsx:1083–1084`).
2. **Add-on suggestions + prerequisites** — managed on the **service edit page**, not a standalone UI, backed by two tables.
3. **Job-level add-on (`job_addons`)** — a runtime POS upsell with SMS/email authorization, entirely separate from catalog config (`src/app/api/pos/jobs/[id]/addons/route.ts`, `src/lib/services/job-addons.ts`).

| Operation | file:line | Mechanism | Status |
|-----------|-----------|-----------|--------|
| Define add-on (set classification) | create `services/new/page.tsx:153` / edit `[id]/page.tsx:505` | browser-client | create **broken** (slug bug), edit Works |
| Add-on suggestion create/edit/delete | `[id]/page.tsx:847–849 / :840–843 / :867–870` | browser-client (`service_addon_suggestions`); delete is hard-delete | Works; gated `services.manage_addons` (`:1588, :1623`) |
| Prerequisite create/edit/delete | `[id]/page.tsx:926–928 / :919–922 / :946–949` | browser-client (`service_prerequisites`); hard-delete | Works; gated `services.edit` (`:1646, :1678`) |
| Prerequisite enforcement (read) | `api/pos/services/check-prerequisites/route.ts:53–186` | **API** (admin-client); OR-logic, satisfied if ANY prereq met (`:180`) | Works |
| Prerequisite override (POS) | `pos/components/prerequisite-warning-dialog.tsx:101–124` | Manager-PIN via `pos.override_prerequisites` | Works |
| Job add-on create/list/expire | `api/pos/jobs/[id]/addons/route.ts:134–156` | **API** (HMAC) | Works |
| Job add-on resend | `api/pos/jobs/[id]/addons/[addonId]/resend/route.ts` | **API** | Works |
| Job add-on single cancel | — | — | **No API** — only `resend` exists; cancellation relies on customer decline or cron expiry (Minor) |

`service_addon_suggestions` carries `combo_price`, `auto_suggest`, `is_seasonal`/`seasonal_start`/`seasonal_end` (DB_SCHEMA:2288). `service_prerequisites` carries `enforcement` (`required_same_ticket | required_history | recommended`), `history_window_days` (default 30, nulled unless `required_history`), `warning_message` (DB_SCHEMA:2341).

### Target 5 — Service categories / groupings

Single page `catalog/categories/page.tsx` manages **all three** taxonomies via a Tabs UI (`:491–502`): Product, Service, Vehicle. Product + service categories share one create/edit dialog and one `onSubmit`/`handleDelete` switched by `dialogType`/`deleteTarget.type`. The whole page is gated by `services.edit` (`:47`) — including **product** categories.

| Operation | Applies to | file:line | Persistence | Status |
|-----------|------------|-----------|-------------|--------|
| Create | product + service | `:240` (slug auto `:97–105`) | browser-client | Works |
| Rename / edit | product + service | `:233–236` | browser-client | Works |
| Delete | product + service | `:268–271` (`is_active=false`) | browser-client | Works (soft; **blocked if linked items > 0**, `:207–215`) |
| Reorder | product + service | — | — | **Not implemented** (display_order number field only, `:771–773`; no drag) |
| Re-activate | product + service | — | — | **Not implemented** — once soft-deleted there is no UI path back to `is_active=true` (products have one; categories don't) |
| Merge | product + service | — | — | **Not implemented** |
| Assign item → category | product/service | on the item edit pages via `category_id` dropdown | browser-client | Works |
| Vehicle category edit/image | vehicle (fixed 5) | `:306` PATCH, `:350` image POST, `:375` image DELETE | **API** `/api/admin/vehicle-categories/*` | Works |

CLAUDE.md rule 14 states the admin "already supports full category CRUD (create, rename, merge, reorder)." **That claim is inaccurate:** create/rename/soft-delete exist, but **merge, drag-reorder, and re-activation are absent.**

### Target 6 — Cross-cutting UI claims

Both the services and products surfaces were swept button-by-button. **No decorative or dead-handler buttons were found** — every visible button, toggle, pencil, and trash icon is wired to a handler that calls a real backend. The gaps are *missing* affordances (no reorder, no merge, no category restore), not *fake* ones. The one genuinely broken affordance is **"Create Service"** (Target 1). Informational banners ("missing images", low-stock) are correctly derived and read-only.

### Target 7 — Frontend ↔ backend type contracts

The root-cause bug is a textbook contract mismatch: **the DB requires `slug` (NOT NULL) but the frontend never sends it** because `serviceCreateSchema` (`validation.ts:158–178`) has no `slug` field and the form builds no `slug` into the payload. The contrast with `productCreateSchema` (`validation.ts:~109`, includes `slug`) makes this an isolated omission in the services path, not a systemic schema problem. A related contract gap: the edit page's update contract omits both `slug` (so renames drift) and `pricing_model` (so it can't be changed) — the UI implies these are editable/maintained but the persisted contract doesn't carry them.

### Target 8 — Permission gating

Healthy. All catalog permission keys exist in `permission_definitions` (`services.view/edit/delete/set_pricing/manage_addons`, `products.view/edit/delete`, `inventory.*`) and are granted (`granted = true`) to `admin`, `cashier`, `detailer`, and `super_admin` in the `permissions` table; `super_admin` additionally bypasses all checks (`check-permission.ts:33–34`). There is no separate `services.create`/`products.create` key — create reuses `*.edit`, which is consistent with the forms. **Permissions are conclusively not the cause of the create failure.**

One consistency nit (Minor): add-on suggestions require `services.manage_addons` while prerequisites — arguably higher-impact, since they can block POS checkout — require only `services.edit`; and product categories are gated behind `services.edit` rather than a products permission.

### Target 9 — Validation errors vs server errors

The reported toast is **inaccurate by omission**: the server (DB) returns a specific, actionable error (NOT-NULL on `slug`), but the UI shows a fixed generic string for any non-success. This masking is **systemic**, not isolated — every browser-client mutation in the catalog catches the error, `console.error`s it, and shows a constant toast:

`services/new:252`, `services/[id]:433, 530, 787, 858, 877, 937, 956, 985`, `services/page:72, 86, 116`, `products/new:216`, `products/[id]:564, 583, 638, 661`. The **categories page is the only surface** that inspects the error message (to special-case the unique-slug collision, `categories/page.tsx:252–253`). This masking is precisely what kept the slug bug invisible. Recommendation: surface the DB error message (at minimum the Postgres constraint name / `message`) in catch blocks, and add field-level validation feedback.

### Target 10 — Database integrity check (live)

Clean. Live counts and checks:

- **Services:** 31 total (30 active, 1 inactive). By model (active): vehicle_size 8, specialty 7, flat 11, scope 1, per_unit 1, custom 1.
- **`service_pricing`:** 64 rows. **Zero** active tier-based services (vehicle_size/scope/specialty) with no pricing rows. **Zero** active flat/custom/per_unit services with a NULL price column.
- **Orphans:** 0 orphaned `service_pricing`, 0 orphaned `service_addon_suggestions` (either side), 0 orphaned `service_prerequisites` (either side).
- **CHECK integrity:** 0 `service_pricing` rows with `sale_price >= price`.
- **Linkage counts:** 30 `service_addon_suggestions`, 6 `service_prerequisites`, 6 `service_categories`, 13 `product_categories`.
- **Products:** 432 total, all active.
- **Test/seed data:** none in the catalog. (The only regex hit, product "MEGANAUGHT / XXXL", is a false positive — a size suffix, not test data.)
- **One minor hygiene item:** 1 add-on suggestion points to a deactivated add-on — "Signature Complete Detail" still suggests "Paint Decontamination & Ceramic Protection" (the single inactive service). At runtime this should be filtered by the active-add-on query, but the stale link is worth cleaning.

### Target 11 — Half-built features

- **Create Service** — UI complete, backend contract broken by the missing `slug`. (Critical)
- **`pricing_model` change on edit** — create page has the model selector; edit page renders it read-only and never persists it → model is immutable after creation. (Informational/coherence)
- **Category merge / drag-reorder / re-activation** — implied by CLAUDE.md rule 14 but not built. (Minor)
- **"Reprice" / `repriceFailed`** — referenced in the audit brief but **no such mechanism exists** in the catalog surface; nothing to verify. (Informational)
- **`cms/catalog/services` & `cms/catalog/products` API routes** — exist but only patch website flags (`show_on_website` / `is_featured` / `display_order`); they are *not* the full create/update endpoints one might assume from the path. The full create/update has no API route — it's all browser-client. (Architectural note)
- **Single `job_addons` cancel API** — only `resend` exists. (Minor)

### Target 12 — Severity-ranked fix list

| Severity | Definition | Issues |
|----------|------------|--------|
| **Critical** | Blocks a real, current operator workflow | **(C1)** Create Service is 100% broken — missing NOT-NULL `slug` in the insert (`services/new/page.tsx` + `validation.ts:158`). |
| **Significant** | Breaks features the operator may need within weeks | **(S1)** Service rename does not maintain `slug` → public SEO URL drifts from the name (`services/[id]/page.tsx:501–517`); SEO is the #1 business priority. **(S2)** Sale-price `CHECK` violation trap when lowering a tier price that has an existing sale price in the same save (`services/[id]/page.tsx:557–571`), masked by a generic toast. **(S3)** Systemic generic-toast error masking (Target 9) — a UX defect that hides real DB errors and hid C1. |
| **Minor** | UI claims that don't work but operator hasn't needed | **(M1)** Category merge/drag-reorder/re-activation absent vs rule 14. **(M2)** Scope/specialty duplicate `tier_name` UNIQUE risk (no client dedupe). **(M3)** Inconsistent permission gating (prereqs `services.edit` vs add-ons `services.manage_addons`; product categories behind `services.edit`). **(M4)** No reorder UI for products or services (display_order edit only). **(M5)** Racy slug-uniqueness pre-check (TOCTOU) in products create/edit. **(M6)** No single-`job_addons` cancel API. |
| **Informational** | Inconsistencies, non-breaking | **(I1)** 1 add-on suggestion points to a deactivated add-on (data hygiene). **(I2)** `pricing_model` immutable after creation (no edit-page selector). **(I3)** Whole catalog uses browser-client writes governed by RLS rather than the documented admin-API/service-role pattern; "reprice" mechanism referenced in brief does not exist. |

---

## Recommended remediation sequence

This is the audit's lean; the operator decides scope.

1. **Fix C1 (Create Service).** Smallest, highest-value change. Mirror the product create flow: add `slug` to `serviceCreateSchema`, add a slug input + name→slug auto-generate effect + uniqueness pre-check, include `slug` in the insert. Verify end-to-end against the live RLS write policy (an authenticated employee session, not service-role).
2. **Fix S1 (slug on rename) in the same change set.** Maintain/regenerate `slug` (with uniqueness handling) in the edit page's `onSaveDetails`, or deliberately decouple slug from name with an explicit slug field. Do this together with C1 so slug handling is consistent across create and edit.
3. **Fix S3 (error masking) as a cross-cutting pass**, at least for create/update of services/products/pricing: surface the Postgres `message`/constraint name in the toast (or map known constraints to friendly text). This directly de-risks S2/M2 by making future constraint failures visible instead of silent.
4. **Address S2 (sale-price CHECK trap)**: validate sale prices against the *edited* prices in `pricingValue.data`, not the stale DB rows, and add a `< price` re-check on the vehicle_size path.
5. **Decide on the architectural direction (I3)** before adding more catalog write surfaces: keep browser-client + RLS (document it as the intended pattern and add error surfacing), or migrate catalog writes to admin API routes using the `createAdminClient()` service-role pattern as documented in CLAUDE.md. This decision shapes how M1/M4 (merge/reorder) should be built.
6. **Backlog the Minor/Informational items** (M1–M6, I1–I3) and reconcile CLAUDE.md rule 14's "full category CRUD" claim with reality (either build merge/reorder/restore or amend the doc).

## Open operator decisions

1. **Architecture:** keep catalog writes on the browser-client+RLS pattern, or migrate to admin API routes (service-role)? (Drives steps 3–5.)
2. **Slug-on-rename policy:** auto-regenerate slug from name (with redirect handling for SEO), or make slug an explicit, manually-edited field that's decoupled from the display name? (SEO implications either way.)
3. **Category management scope:** build merge/drag-reorder/re-activation to match rule 14, or amend rule 14 to match the current (create/rename/soft-delete) reality?
4. **`pricing_model` mutability:** should operators be able to change a service's pricing model after creation, or is immutability intended (in which case document it)?

## Verification of audit hard rules

- ✅ **No source changes in `src/`** — read-only throughout.
- ✅ **No migrations, no test changes.**
- ✅ **No DB writes** — all live queries were `SELECT`/catalog introspection only.
- ✅ **New files** = this audit doc + the 3 standard doc updates (CHANGELOG, ROADMAP-13-ITEMS, FILE_TREE).
- ✅ **Evidence captured** — file:line citations throughout; root cause confirmed against the live schema (column nullability, triggers, RLS policies, permission grants) rather than inferred.
- ✅ **Worktree isolation** — audit performed in an isolated `git worktree` (`/Users/nayeem/Claude/SmartDetails/.catalog-audit-wt`) on a clean `origin/main` base, to avoid disturbing the parallel β-2 code session's uncommitted working tree.
