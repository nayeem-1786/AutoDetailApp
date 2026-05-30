/**
 * Options for the "Add-On Service" dropdown when EDITING an existing add-on
 * suggestion row. Includes the row's CURRENT `addon_service_id` (so the
 * dropdown can render its selected option) PLUS every service that's
 * NOT already in use as an add-on for this parent, NOT classified as
 * `primary` (an add-on must be addon-only or both), and NOT the parent
 * service itself.
 *
 * Mirrors the ADD-mode eligibility filter (`addonEligibleServices` at
 * `page.tsx`) — which excludes already-used add-ons (UNIQUE collision on
 * `(primary_service_id, addon_service_id)`), primary-classified services
 * (semantic — primaries aren't suggested add-ons), and the parent itself
 * (CHECK violation `primary_service_id <> addon_service_id`) — but
 * preserves the current selection, which the ADD filter would otherwise
 * exclude in edit mode and blank the dropdown.
 *
 * Replaces the prior
 * `editingAddon ? allServices.filter((s) => s.classification !== 'primary') : addonEligibleServices`
 * ternary, which paired with `disabled={!!editingAddon}` to lock the field
 * (Session #123 audit `docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md` Target 4
 * — same half-built convention as the prereq dropdown, same bulk Phase 1
 * commit `846ece126`, same lack of inline rationale; Session #124 closes it).
 *
 * Pure function; unit-tested at `__tests__/addon-helpers.test.ts`.
 */
export function getEditAddonOptions<
  T extends { id: string; classification?: string | null },
>(
  allServices: T[],
  addons: ReadonlyArray<{ addon_service_id: string }>,
  editingAddonServiceId: string,
  parentServiceId: string,
): T[] {
  return allServices.filter(
    (s) =>
      s.id === editingAddonServiceId ||
      (s.id !== parentServiceId &&
        s.classification !== 'primary' &&
        !addons.some((a) => a.addon_service_id === s.id)),
  );
}
