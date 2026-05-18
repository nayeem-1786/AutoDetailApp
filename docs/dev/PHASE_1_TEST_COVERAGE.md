# Item 15f Phase 1 — Test Coverage Matrix

**Document version:** v1.0 (2026-05-17 — Layer 8f)
**Authoritative scope:** Item 15f Phase 1 only — Layers 8a + 8b + 8c + 8d + 8d-bis + 8e + 8f.
**Maintained by:** updated when new tests land that pin a Phase 1 contract.

> This file is an honest accounting of what's covered and what isn't. If a
> Phase 1 surface isn't listed here, treat that as a gap. If a row claims
> coverage, you can `git grep` the cited test file to verify.

---

## 1. Coverage matrix — by Phase 1 surface

| # | Surface | Test type | Coverage state | File(s) |
|---|---|---|---|---|
| **Layer 8a — Backend cascade endpoint extraction** | | | | |
| 1.1 | `editAppointmentServices` helper — structured `ServiceEditError` (INVALID_INPUT / NOT_FOUND / INVALID_STATUS / UNKNOWN_SERVICE / INACTIVE_SERVICE) | unit | ✅ Full | `src/lib/appointments/__tests__/service-edit.test.ts` |
| 1.2 | Source discriminator threads `admin`/`pos` → audit row | unit | ✅ Full | same |
| 1.3 | Return shape (`cascadedToJobId` null vs id) | unit | ✅ Full | same |
| 1.4 | Modifier preservation (Layer 15g-iii) — per-modifier columns never written when services-only | unit | ✅ Full | same |
| 1.5 | Legacy fallback to combined `discount_amount` when per-modifier columns are null | unit | ✅ Full | same |
| 1.6 | Admin route — auth + cascade behavior + audit (21 pre-existing tests) | route | ✅ Full | `src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts` |
| 1.7 | POS route — 401, 403, 400 (invalid/completed/cancelled/no_show/unknown/inactive), 404, cascade parity, audit `source=pos`, notification suppression (no SMS/email/webhook), modifier preservation, idempotency | route | ✅ Full | `src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts` |
| **Layer 8b — Frontend state extensions + load endpoint** | | | | |
| 2.1 | `<TicketContext>` reducer — `ENTER_EDIT_MODE` / `EXIT_EDIT_MODE` / `CLEAR_TICKET` resets / `RESTORE_TICKET` strips edit-mode | unit | ✅ Full | `src/app/pos/context/__tests__/ticket-reducer-edit-mode.test.ts` |
| 2.2 | `MARK_EDIT_INITIAL_STATE` — no-op outside editMode, captures items+customer+vehicle+modifiers, snapshot frozen at MARK time | unit | ✅ Full | same |
| 2.3 | `initialTicketState` defaults — `source='new'`, `sourceId/returnTo/editInitialSnapshot` null, `editMode=false` | unit | ✅ Full | same |
| 2.4 | `isUuid` validator — UUID-v4 shape acceptance + rejection | unit | ✅ Full | `src/app/pos/hooks/__tests__/use-edit-mode-drain.test.ts` |
| 2.5 | `isSafeInternalPath` — open-redirect defense (5 attack vectors: absolute URL, protocol-relative, dangerous schemes incl. `javascript:` / `data:` / `vbscript:` / `file:` / `about:`, backslash bypass, non-leading-slash) | unit | ✅ Full | same |
| 2.6 | `buildTicketStateFromLoad` — item mapping, is_addon naming, modifier zeroing on output, deposit + prior-payments math | unit | ✅ Full | same |
| 2.7 | `runEditModeDrain` — endpoint selection by source (`/load` vs `/checkout-items`) | unit | ✅ Full | same |
| 2.8 | `runEditModeDrain` — Option G4: source=job sourceId resolved from `response.appointment_id` (not URL `id`); refuses when null | unit | ✅ Full | same |
| 2.9 | `runEditModeDrain` — modifier dispatches (SET_LOYALTY_REDEEM, APPLY_MANUAL_DISCOUNT, coupon revalidate + SET_COUPON) + `MARK_EDIT_INITIAL_STATE` LAST | unit | ✅ Full | same |
| 2.10 | `runEditModeDrain` — error paths (403, 404, network throw, malformed payload) all return `ok:false` with NO dispatch | unit | ✅ Full | same |
| 2.11 | Load endpoint `/api/pos/appointments/[id]/load` — auth (401/403), 404 on missing, 400 on completed/cancelled/no_show, happy-path shape (customer/vehicle/items/modifier snapshot), nulls surface for unset modifiers, mobile_fee synthesis, deposit lookup | route | ✅ Full | `src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts` |
| 2.12 | jobs/checkout-items returns `appointment_id` field (Option G4 wiring) | route | ✅ Full (covered upstream by 1.7 + integration tests) | `src/app/api/pos/jobs/[id]/checkout-items/__tests__/coupon-fallback.test.ts` + integration |
| **Layer 8c — POS Sale-tab edit-mode UX + modifier-editable cascade** | | | | |
| 3.1 | Cascade endpoint accepts 6 optional modifier fields (coupon_code, coupon_discount, loyalty_points_to_redeem, loyalty_discount, manual_discount_value, manual_discount_label); three-state encoding (omit/null/value) | unit | ✅ Full | `src/lib/appointments/__tests__/service-edit.test.ts` (Layer 8c section) |
| 3.2 | `superRefine` mirrors `appointments_manual_discount_coherent` DB CHECK | unit | ✅ Full | same |
| 3.3 | Loyalty `null → 0` mapping (NOT NULL DEFAULT 0 columns) | unit | ✅ Full | same |
| 3.4 | Audit `details.field` flips to `services_and_modifiers` with before/after diff when modifiers touched; stays `services` for services-only | unit | ✅ Full | same |
| 3.5 | `<EditModeBanner>` — render gating, label hierarchy (customer+date / customer-only / date-only / UUID safety net), dirty badge, `buildEditLabel` pure tests | unit | ✅ Full | `src/app/pos/components/__tests__/edit-mode-banner.test.tsx` |
| 3.6 | `<TicketActions>` edit-mode — Save Changes / Cancel button swap (no Hold, no Checkout) | unit | ✅ Full | `src/app/pos/components/__tests__/ticket-actions-edit-mode.test.tsx` |
| 3.7 | Save Changes — POST to `/api/pos/appointments/${sourceId}/services` with services + 6 modifier fields | unit | ✅ Full | same |
| 3.8 | Save Changes — percent manual discount client-resolved to dollar before POST | unit | ✅ Full | same |
| 3.9 | Save success → EXIT_EDIT_MODE + CLEAR_TICKET + `router.push(returnTo)` | unit | ✅ Full | same |
| 3.10 | Save error (500) → NO navigation, NO EXIT_EDIT_MODE | unit | ✅ Full | same |
| 3.11 | Cancel without dirty → EXIT + nav; Cancel dirty → confirmation modal; Keep keeps; Discard EXIT + nav | unit | ✅ Full | same |
| **Layer 8d / 8d-bis — Source-side affordances + polish** | | | | |
| 4.1 | Jobs card deep-link URL contract — source=job, JOB UUID in `id`, returnTo encoded with embedded `?` | unit | ✅ Full | `src/app/pos/jobs/components/__tests__/edit-services-deep-link.test.ts` |
| 4.2 | Admin Appointment dialog "Edit in POS" button — renders enabled, `router.push` URL contract | unit | ✅ Full | `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` |
| 4.3 | Products tab gating in edit mode — interactive when editMode=false, disabled + toast on click when editMode=true | unit | ✅ Full | `src/app/pos/components/__tests__/pos-workspace-products-gating.test.tsx` |
| 4.4 | Barcode-scanner gate in edit mode — blocks lookup, surfaces toast, never hits API | unit | ✅ Full (Layer 8f addition) | same |
| 4.5 | Global-search filteredProducts gate — ProductGrid never renders when editMode=true (catalog populated) | unit | ✅ Full (Layer 8f addition) | same |
| 4.6 | Register-tab favorite-grid product gate (4th surface) — product fav rejected with toast + greyed styling; service fav NOT gated | unit | ✅ Full | `src/app/pos/components/__tests__/register-tab-favorites-gating.test.tsx` |
| 4.7 | EditModeBanner label revamp — customer+date format, 4-tier fallback (Layer 8d) | unit | ✅ Full | `src/app/pos/components/__tests__/edit-mode-banner.test.tsx` |
| 4.8 | `no_show` lockstep refusal (load endpoint + cascade) — Audit Finding #5 | unit + route | ✅ Full | `service-edit.test.ts` + both route test files + load route test |
| **Layer 8e — Dead modal deletion + walk-in time precision** | | | | |
| 5.1 | Walk-in path writes `scheduled_start_time` / `scheduled_end_time` at HH:MM:00 (no seconds) | route | ✅ Full | `src/app/api/pos/jobs/__tests__/walk-in-modifier-persistence.test.ts` |
| 5.2 | Admin dialog `toTimeInputValue` helper truncates HH:MM:SS → HH:MM for HTML5 `<input type="time">` | unit | ✅ Full | `src/app/admin/appointments/components/__tests__/time-input-truncation.test.tsx` |
| 5.3 | Minute-precise input passes through unchanged | unit | ✅ Full | same |
| 5.4 | Dead modal mounts (`<EditServicesModal>` + `<EditServicesDialog>`) removed; orphan test files deleted; mount points clean | static | ✅ Full (grep) | `git log -p 35ccd6c9` |
| **Layer 8f — Cross-layer integration + ESLint regression** | | | | |
| 6.1 | End-to-end source=appointment: load → drain → ENTER_EDIT_MODE → cascade save | integration | ✅ Full | `src/lib/appointments/__tests__/edit-flow.integration.test.ts` |
| 6.2 | End-to-end source=job (Option G4): URL.id=JOB, sourceId=APPT from response | integration | ✅ Full | same |
| 6.3 | source=job null appointment_id → drain refuses (defense in depth) | integration | ✅ Full | same |
| 6.4 | Modifier-only edit — coupon added / cleared, totals recompute | integration | ✅ Full | same |
| 6.5 | Combined edit (services + modifiers in one PUT) — atomic write, canonical combined discount | integration | ✅ Full | same |
| 6.6 | All-services-removed save rejected (INVALID_INPUT) | integration | ✅ Full | same |
| 6.7 | Bogus UUID — load 404 + cascade NOT_FOUND | integration | ✅ Full | same |
| 6.8 | Status guard lockstep — `completed` / `cancelled` / `no_show` refused on cascade | integration | ✅ Full | same |
| 6.9 | Drain ↔ cascade pricing parity (mobile_fee synthesis on drain matches cascade's stored mobile_surcharge) | integration | ✅ Full | same |
| 6.10 | ESLint `services/no-bespoke-pricing` at `'error'`; zero disable comments in `src/` | static | ✅ Full (grep + config check) | `eslint.config.mjs:76` + `grep -rn eslint-disable.*services/no-bespoke-pricing src/` returns empty |

---

## 2. Intentional gaps — known and accepted

| # | Surface | Why not covered | Acceptable because |
|---|---|---|---|
| G1 | `pos-shell.tsx` F2 keyboard shortcut gated on `!editMode` | The shortcut handler lives inside `useEffect` on `<PosShell>`, which has heavy ancestor mounting requirements (POS providers, Stripe Terminal hook, idle-timeout hook). Isolating it for a unit test would require either lifting the handler to a pure function or building a full provider tree mock. | The gate is a 3-line `if (!ticket.editMode && ...)` — visually inspectable. Behavior covered by manual UAT (Layer 8c shipped + verified). Pre-Phase-2 candidate to lift the handler into a testable hook. |
| G2 | `handleOpenEditServices` in `job-detail.tsx` — null appointment_id refusal toast | The Jobs-card detail view has ~30 dependencies (timer, addons, photos, mobile picker, payment-mismatch banner). The click handler's refusal path is a 3-line if-statement. | The deeper drain-side defense in depth (Layer 8d-bis) IS tested at `use-edit-mode-drain.test.ts:'refuses the drain when source=job and response.appointment_id is null'`. The UI-side refusal is belt-and-suspenders for legacy walk-ins (Layer 8d roadmap notes 10 such rows exist). |
| G3 | Concurrent edit (two operators editing the same appointment) | Item 15a's cascade endpoint has no optimistic concurrency control (no `updated_at` ETag). Adding OCC was scoped out per `QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` §4.3 ("acceptable for the 1-3 detailer + 1 cashier operator pool"). | Last-write-wins is the accepted semantics. Adding a regression test would pin a behavior we intentionally don't enforce. |
| G4 | Full E2E through the React useEffect chain in `useEditModeDrain` (the hook wrapper, not `runEditModeDrain`) | The hook wraps `runEditModeDrain` with `useEffect` + `window.location.search` parsing + `history.replaceState` cleanup. Testing the hook itself would require jsdom URL manipulation + provider tree. | The pure-function `runEditModeDrain` is exhaustively unit-tested (15 cases). The hook's only added logic is param parsing + validation gates + URL strip, each of which is trivial and visually inspectable. |
| G5 | Search-bar input → filteredProducts → ProductGrid render integration (the SearchBar mock above is sentinel-only) | SearchBar has its own complex state. We've pinned: (a) tab gating prevents reaching Products tab; (b) catalog filteredProducts useMemo returns [] when editMode=true (verified via grid never mounts even with catalog populated). | The intermediate hop (search query → filter result) is verified by the useMemo's editMode short-circuit — provable by inspecting `pos-workspace.tsx:173`. Adding SearchBar render coverage would test SearchBar's own logic, not the gate. |
| G6 | `useEditModeDrain` URL param stripping via `history.replaceState` | jsdom's `history.replaceState` doesn't trigger Next.js navigation hooks; the test environment can't exercise the post-drain URL state. | The stripping is defensive (prevents re-drain on refresh); the drain itself sets `firedRef.current = true` to short-circuit re-mount. The defense is double-belt, single failure mode (URL retains params after refresh) wouldn't break the cart hydration. |
| G7 | Test 4 (banner A-XXXXX appointment numbering format) | Deferred to post-Phase-1 engine-unification per Layer 8d-bis notes. Current banner uses customer+date — interim and tested. | Documented deferral. The 4-tier fallback IS tested (`buildEditLabel` pure tests). |
| G8 | Test 6 (10 legacy jobs with `appointment_id IS NULL`) | Backfill candidate for Item 16 (data migration / launch prep). Click-handler refusal toast + drain refusal are tested. | The refusal path is tested at both the URL click-handler level (G2) and the drain level. Backfilling 10 rows is a one-shot SQL migration, not a code-level regression target. |
| G9 | Voice-agent / SMS auto-responder integration with the cascade endpoint | Out of scope — voice agent only creates appointments at `pending`; it never edits services. SMS auto-responder is read-only on pricing. | Phase 1 is scoped to operator-driven edits (Admin dialog + POS Jobs card). Voice/SMS pricing was migrated in Layer 3d (separate test file). |

---

## 3. File-to-test mapping (alphabetical, for future maintenance)

| Production file (key Phase 1 file) | Test file pinning its contract |
|---|---|
| `src/app/admin/appointments/components/appointment-detail-dialog.tsx` (Edit in POS button) | `src/app/admin/appointments/components/__tests__/edit-services-disabled.test.tsx` |
| `src/app/admin/appointments/components/appointment-detail-dialog.tsx` (`toTimeInputValue` helper) | `src/app/admin/appointments/components/__tests__/time-input-truncation.test.tsx` |
| `src/app/api/pos/appointments/[id]/load/route.ts` | `src/app/api/pos/appointments/[id]/load/__tests__/route.test.ts` |
| `src/app/api/pos/appointments/[id]/services/route.ts` | `src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts` |
| `src/app/api/admin/appointments/[id]/services/route.ts` | `src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts` |
| `src/app/api/pos/jobs/route.ts` (walk-in time precision) | `src/app/api/pos/jobs/__tests__/walk-in-modifier-persistence.test.ts` |
| `src/app/pos/components/edit-mode-banner.tsx` (incl. `buildEditLabel`) | `src/app/pos/components/__tests__/edit-mode-banner.test.tsx` |
| `src/app/pos/components/pos-workspace.tsx` (Products tab + scanner + filteredProducts gates) | `src/app/pos/components/__tests__/pos-workspace-products-gating.test.tsx` |
| `src/app/pos/components/register-tab.tsx` (favorite-grid product gate) | `src/app/pos/components/__tests__/register-tab-favorites-gating.test.tsx` |
| `src/app/pos/components/ticket-actions.tsx` (Save Changes + Cancel edit-mode branch) | `src/app/pos/components/__tests__/ticket-actions-edit-mode.test.tsx` |
| `src/app/pos/context/ticket-reducer.ts` (ENTER/EXIT/MARK + restore guards) | `src/app/pos/context/__tests__/ticket-reducer-edit-mode.test.ts` |
| `src/app/pos/hooks/use-edit-mode-drain.ts` (validators + buildTicketStateFromLoad + runEditModeDrain) | `src/app/pos/hooks/__tests__/use-edit-mode-drain.test.ts` |
| `src/app/pos/jobs/components/job-detail.tsx` (Jobs card deep-link URL) | `src/app/pos/jobs/components/__tests__/edit-services-deep-link.test.ts` |
| `src/lib/appointments/edit-services.ts` (Zod schema + helpers) | covered transitively by `service-edit.test.ts` + route tests |
| `src/lib/appointments/service-edit.ts` (`editAppointmentServices` + `ServiceEditError`) | `src/lib/appointments/__tests__/service-edit.test.ts` |
| **end-to-end cross-layer joins** | `src/lib/appointments/__tests__/edit-flow.integration.test.ts` |

---

## 4. Hand-off notes for future maintainers

- **If a Phase 1 surface gets a behavior change**, update the cited test file AND this matrix in the same commit. The matrix is the contract; the tests are the enforcement.
- **If a new "edit-via-POS" surface is added** (e.g., Item 15e's POS Appointments modal), extend the integration test file (`edit-flow.integration.test.ts`) with a new `describe` block — the cross-layer joins it pins are the same.
- **The ESLint rule (`services/no-bespoke-pricing`) is the architectural watchdog** for Rule 22. If a future PR adds an `eslint-disable services/no-bespoke-pricing` comment, the reviewer should treat it as a smell — Layer 8e established zero disable comments in `src/` as the baseline.
- **Run `npx vitest run` after any Phase 1 file edit.** The relevant test files are listed in section 3 — failures should be specific enough to point to the regression.

---

*Last updated: 2026-05-17 with Layer 8f. Phase 1 COMPLETE. Item 15f COMPLETE.*
