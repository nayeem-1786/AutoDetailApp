# Admin Services Edit — Prerequisite-Service Dropdown Disabled-Field Audit (2026-05-29)

> Read-only audit. Conditional in-session fix triggered (Target 5 = case (a) half-built).
> Branch: `audit/admin-services-edit-prereq-service-dropdown`. Isolated `git worktree` off `origin/main` (`060c63d8`, the Track A corrective merge).

## Context

Operator-reported: on **Admin → Services → Edit → Prerequisites** tab, clicking the pencil on an existing prereq row opens the edit dialog. The enforcement type and warning message can be changed, but the "which service is the prerequisite" dropdown is rendered greyed-out and un-interactive. Currently no clue WHY — no inline comment, no tooltip.

## TL;DR

**Classification: (a) half-built UX shortcut.** The disable is a **convention from the initial bulk Phase 1 admin platform commit** (`846ece126`, 2026-02-01), authored in the same line-range that introduced the prereq UI as part of "build everything." **No documented rationale.** The schema, runtime, and save-handler all permit changing `prerequisite_service_id` on an existing row:

- **Schema reality (Target 2):** the only constraints on `service_prerequisites` are PK on `id`, `UNIQUE (service_id, prerequisite_service_id)`, and `CHECK (service_id <> prerequisite_service_id)`. UPDATE that changes `prerequisite_service_id` is a valid operation provided the new value doesn't collide with another existing pair for the same parent. **No constraint forbids the change.**
- **No FK depends on prereq.id.** `grep -rn "service_prerequisites\|prerequisite_id" supabase/migrations/` finds **zero** `FOREIGN KEY ... REFERENCES service_prerequisites`. Runtime code (`/api/pos/services/check-prerequisites/route.ts:54`, `/api/voice-agent/services/route.ts:119`) queries by parent `service_id`, not by prereq row identity. **Row identity isn't depended upon elsewhere.**
- **Save handler already supports it.** `savePrereq()` (`page.tsx:903-941`) builds a single payload **including** `prerequisite_service_id` and dispatches it on both INSERT and UPDATE (`page.tsx:912/921`). The DB layer would accept and apply the change today if the UI were enabled.
- **Workaround exists:** delete the wrong row + add a new one with the right service. Functionally equivalent (no FK depends on the lost `id`), but 2 extra clicks. So the disable doesn't block the operator — it just adds friction.

**Recommendation: apply minimal in-session fix.** Remove the disable, swap the options filter in edit mode to include the current value + unused services (the existing `prereqEligibleServices` filter excludes already-used prereqs, which would orphan the current selection in edit mode), and improve the catch block with `describeSupabaseError` (C1/S3 Session #111) so UNIQUE/CHECK collisions surface as actionable text instead of "Failed to save prerequisite." **Scope: 2 production files, ~15 lines.**

**Target 4 — sibling gap surfaced:** the **add-on edit dialog** (same page, line 1708) carries the **identical `disabled={!!editingAddon}` pattern**, paired with the same `(editingAddon ? allServices.filter(...) : addonEligibleServices)` options fallback, from the same bulk commit. Same root cause, same schema reality. **Intentionally out of scope for this session** (per prompt) — recommend a sibling follow-up session that applies the equivalent fix to add-ons.

**Target 4 — pre-existing latent bug also surfaced:** the eligibility filters (`prereqEligibleServices` at `page.tsx:1006-1008`, `addonEligibleServices` at `:1002-1004`) do **not** exclude the parent service itself, so the operator can pick "this service" as its own prereq/add-on → `CHECK (service_id <> prerequisite_service_id)` violation → today a generic toast (after this fix, a `describeSupabaseError`-derived message). Out of scope.

## Target 1 — Why is the field disabled? (file:line + classification)

**The exact disabling line:** `src/app/admin/catalog/services/[id]/page.tsx:1807`

```tsx
<Select
  value={prereqForm.prerequisite_service_id}
  onChange={(e) => setPrereqForm({ ...prereqForm, prerequisite_service_id: e.target.value })}
  disabled={!!editingPrereq}        // ← line 1807, the disable
>
  <option value="">Select a service...</option>
  {(editingPrereq ? allServices : prereqEligibleServices).map((s) => ( // ← line 1810
    <option key={s.id} value={s.id}>{s.name}</option>
  ))}
</Select>
```

The disable is **deliberately paired** with the options-source ternary on line 1810: in edit mode the options fall back to `allServices` (so the currently-selected service can be displayed at all) but the control is locked. In add mode the dropdown is enabled and uses `prereqEligibleServices` (which excludes already-used prereqs to prevent duplicates).

**Classification: (a) half-built convention.** No inline comment explains intent. `git blame -L 1805,1812` shows both lines were authored by the same commit `846ece126` — the **initial bulk Phase 1 commit** ("Phase 1: Complete admin platform with database, auth, RBAC, and all CRUD modules") — which introduced the entire admin platform in one shot with no design discussion of this specific UX choice. The most plausible reading: the developer treated `prerequisite_service_id` as "row identity" for UI simplicity (so they wouldn't need to handle the UNIQUE-collision case if the operator picked an already-used prereq mid-edit), without considering that the operator might legitimately want to change "which service is the prereq" on an existing row. **Not (b) schema-forced** (the schema permits UPDATE, see Target 2); **not (c) data-integrity** (no FK depends on prereq.id, see Target 2); **not (d) permissions** (the disable is `!!editingPrereq` — state-based, not role-based; the surrounding `canEditService` gate at line 1681 already covers role).

## Target 2 — Schema reality

`service_prerequisites` (`docs/dev/DB_SCHEMA.md`, verified):
- **PK:** `id` (single-column, see `service_prerequisites_pkey`).
- **UNIQUE:** `(service_id, prerequisite_service_id)` → `service_prerequisites_service_id_prerequisite_service_id_key`.
- **CHECK:** `service_prerequisites_check`: `CHECK ((service_id <> prerequisite_service_id))`.
- **Indexes:** PK + UNIQUE + `idx_prerequisites_service` on `(service_id)`.
- **FKs into the table:** **none.** `grep` across `supabase/migrations/` returns no `FOREIGN KEY ... REFERENCES service_prerequisites`.

**Implications:**
- Changing `prerequisite_service_id` on an existing row IS a valid `UPDATE`. The UNIQUE constraint only fails if the new pair `(service_id, new_prerequisite_service_id)` already exists on a different row.
- Self-reference is forbidden by `CHECK`.
- Because no FK references `service_prerequisites.id`, the delete+insert workaround is also fully equivalent — nothing else identifies the row.

**Runtime read paths** (all by parent `service_id`, never by prereq row id):
- `src/app/api/pos/services/check-prerequisites/route.ts:54` — POS prereq check.
- `src/app/api/voice-agent/services/route.ts:119` — voice agent service info.

→ Schema permits the UPDATE; no consumer depends on the row's identity. Classification (b) ruled out; (c) ruled out.

## Target 3 — Sibling UX surface (add + delete on the same page)

| Affordance | Location | Wiring | Verdict |
|---|---|---|---|
| **Add Prerequisite** button | `page.tsx:1649` | opens `openPrereqDialog()` w/ no arg → reset form, dialog opens in ADD mode | ✓ exists, works |
| **Edit** (pencil) | `page.tsx:1681` | `openPrereqDialog(prereq)` → loads row into form, dialog opens in EDIT mode | ✓ exists, partial work (this audit's subject — prereq-service field disabled) |
| **Delete** (trash icon) | `page.tsx:1684` | `setDeletePrereqId(prereq.id)` → confirm dialog → `deletePrereq()` → `.from('service_prerequisites').delete().eq('id', id)` | ✓ exists, works |
| `canEditService` role gate | wraps edit + delete buttons at `:1680-1687` | both pencil and trash are hidden for read-only roles | ✓ correct |

→ **The operator's workaround today (delete the wrong row + add a new one with the right service) is fully supported by the UI.** That's why the disabled-in-edit field is a friction issue, not a functional blocker. The fix is additive (single-click edit replaces 2-click delete-and-add); nothing currently broken in the surface.

## Target 4 — Other disabled fields on the same page

`grep -nE "disabled=\{!!editing" src/app/admin/catalog/services/[id]/page.tsx` returns **two** hits:

| Line | Field | Pattern | Classification |
|---|---|---|---|
| **1807** | Prereq-service dropdown (this audit's subject) | `disabled={!!editingPrereq}` + `(editingPrereq ? allServices : prereqEligibleServices)` | (a) half-built — fix in this session |
| **1708** | **Add-on service dropdown** (Edit Add-On dialog) | `disabled={!!editingAddon}` + `(editingAddon ? allServices.filter(s => s.classification !== 'primary') : addonEligibleServices)` | (a) half-built — **sibling gap, out of scope, follow-up session** |

The add-on dialog (lines 1700-1790, mounted from the Add-Ons tab) is structurally identical to the prereq dialog: same author, same commit, same paired disable+allServices-fallback pattern, same lack of inline rationale. The underlying `service_addon_suggestions` table has the same shape (PK on `id`, UNIQUE on the parent+suggested pair, no FK back into the row). **Recommend a sibling session that applies the equivalent fix to the add-on dropdown** so the catalog edit page reaches full edit parity in one arc.

**Pre-existing latent bug (also out of scope, surfacing for the record):** the ADD-mode eligibility filters do not exclude the **parent service** itself, so an operator can pick `service_id === prerequisite_service_id` (or `addon_service_id`) → DB rejects with the `CHECK` violation → today a generic "Failed to save prerequisite" / "Failed to save add-on" toast. After this fix's `describeSupabaseError` wiring (F5), the prereq path will at least surface a 23514 message; the add-on path stays on the generic toast until the sibling session.

## Target 5 — Fix recommendation

**Case (a) → apply the conditional in-session fix.** Scope (per the prompt's F1-F5):

1. **F1 — enable the field:** remove `disabled={!!editingPrereq}` on `page.tsx:1807`. The control becomes editable in edit mode.
2. **F2 — validation schema:** no change needed. `prerequisiteSchema` (`src/lib/utils/validation.ts:209-220`) already accepts `prerequisite_service_id: z.string().uuid()`. (Note: this page writes the supabase client directly — it does not even route through that Zod schema today, so there's nothing to extend.)
3. **F3 — update payload:** no change needed. `savePrereq()` (`page.tsx:910-922`) already includes `prerequisite_service_id` in the payload it dispatches for both INSERT and UPDATE.
4. **F2′ — options filter (the substantive change):** swap the edit-mode options expression on line 1810 to include the current value PLUS every unused service. Today `editingPrereq ? allServices : prereqEligibleServices` shows ALL services (incl. already-used ones, which would collide with the UNIQUE constraint if picked); the corrected expression preserves the current selection and constrains the rest to unused services. Extracted to a tiny pure helper for unit-testability: `getEditPrereqOptions(allServices, prerequisites, editingPrereq.prerequisite_service_id)`.
5. **F5 — error surfacing:** wire `describeSupabaseError` (`src/lib/utils/supabase-error.ts`) into the `savePrereq()` catch so UNIQUE / CHECK collisions surface as actionable text. Today the generic toast hides constraint violations behind "Failed to save prerequisite" (the same masking pattern S3 documented for the C1 missing-slug bug).
6. **F4 — test:** unit-test the extracted helper (the substantive logic change). Mirrors the #119 precedent: a full admin-page render harness for this ~2150-line component is disproportionate to a ~15-line wiring fix; a focused unit test on the pure helper is the right granularity. Manual verification covers the wiring (`disabled` removal + describeSupabaseError integration are tsc-visible).

**Explicitly NOT in scope (per the prompt's F6):**
- Add-on dropdown (Target 4 sibling gap) — separate session.
- Parent-self-reference exclusion in either ADD or EDIT filters (Target 4 pre-existing) — separate session.
- Migrations, new permission keys, gate-enforcement logic.
- Touching add/delete prereq UX (both work today).

## Applied fix (in-session, this branch)

✅ **Fix landed in the same branch as this audit.** See the `Session #123` row in `docs/dev/ROADMAP-13-ITEMS.md` and the corresponding entry in `docs/CHANGELOG.md` for the full diff summary. Surface:

- New: `src/app/admin/catalog/services/[id]/prereq-helpers.ts` — `getEditPrereqOptions()`. Pure, unit-tested.
- Modified: `src/app/admin/catalog/services/[id]/page.tsx` — removed the disable on line 1807, swapped the edit-mode options expression on line 1810 to call the helper, replaced the generic toast in `savePrereq()` catch with `describeSupabaseError(err, 'Failed to save prerequisite')`.
- New: `src/app/admin/catalog/services/[id]/__tests__/prereq-helpers.test.ts` — locks the helper's three invariants (current value always included; unused services included; already-used non-current prereqs excluded).
- Net: **2 production files** (1 modified + 1 new), 1 test file, ~25 production lines net. Within Memory #8.

The add-on dropdown sibling gap at `page.tsx:1708` is **deliberately untouched** in this session. The pre-existing parent-self filter gap (`prereqEligibleServices`/`addonEligibleServices` not excluding the parent) is **deliberately untouched** — it'll surface via the `describeSupabaseError` 23514 path now, which is materially better than the prior generic toast.

## Open questions for the operator

1. **Sibling session priority:** apply the equivalent fix to the **add-on edit dropdown** (`page.tsx:1708`) next, or defer until the parent-self filter is also being scoped? (Recommend: next session — symmetric, same shape, ~15 more lines.)
2. **Parent-self exclusion (pre-existing latent):** add an explicit "exclude parent service" clause to both `prereqEligibleServices` and `addonEligibleServices`, or leave as-is (the `CHECK` violation now surfaces via `describeSupabaseError`)? (Recommend: add the filter — defense in depth, ~2 lines, satisfies "fail-safe at the UI before the DB").
3. **UNIQUE-constraint specificity:** add a named-constraint entry to `CONSTRAINT_MESSAGES` in `supabase-error.ts` for `service_prerequisites_service_id_prerequisite_service_id_key` ("That prerequisite is already configured for this service. Pick a different one.") — friendlier than the generic 23505 wording? (Out of scope for this session, ~3 lines if approved.)

## Verification of audit hard rules

- ✅ Audit phase was read-only; fix phase only triggered after classification = (a) was established with file:line evidence.
- ✅ file:line citation for every claim.
- ✅ Schema reality verified (PK / UNIQUE / CHECK / FK absence) against `docs/dev/DB_SCHEMA.md` + `grep` of `supabase/migrations/`.
- ✅ Save handler reviewed; payload already supports the field.
- ✅ Worktree isolation off `origin/main` (`060c63d8`).
