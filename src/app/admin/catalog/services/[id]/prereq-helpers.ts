/**
 * Options for the "Prerequisite Service" dropdown when EDITING an existing
 * prereq row. Includes the row's CURRENT `prerequisite_service_id` (so the
 * dropdown can render its selected option) PLUS every service not already in
 * use as a prereq for this parent AND not the parent itself. Mirrors the
 * ADD-mode eligibility filter (`prereqEligibleServices` at `page.tsx`) —
 * which excludes already-used prereqs (UNIQUE collision on
 * `(service_id, prerequisite_service_id)`) and excludes the parent service
 * (CHECK violation `service_id <> prerequisite_service_id`) — but preserves
 * the current selection, which the ADD filter would otherwise exclude in
 * edit mode and blank the dropdown.
 *
 * Replaces the prior `editingPrereq ? allServices : prereqEligibleServices`
 * ternary, which paired with `disabled={!!editingPrereq}` to lock the field
 * (Session #123 audit `docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md` —
 * classification (a) half-built convention).
 *
 * Session #124 — added `parentServiceId` parameter for defense-in-depth
 * parent-self exclusion (sibling to the change applied to `addonEligibleServices`
 * and `getEditAddonOptions` in the same session). The current selection is
 * still always preserved — by construction (CHECK constraint) the editing
 * row's prereq cannot be the parent, so the "include current" clause never
 * accidentally re-introduces it.
 *
 * Pure function; unit-tested at `__tests__/prereq-helpers.test.ts`.
 */
export function getEditPrereqOptions<T extends { id: string }>(
  allServices: T[],
  prerequisites: ReadonlyArray<{ prerequisite_service_id: string }>,
  editingPrereqServiceId: string,
  parentServiceId: string,
): T[] {
  return allServices.filter(
    (s) =>
      s.id === editingPrereqServiceId ||
      (s.id !== parentServiceId &&
        !prerequisites.some((p) => p.prerequisite_service_id === s.id)),
  );
}
