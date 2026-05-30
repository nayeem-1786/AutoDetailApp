/**
 * Options for the "Prerequisite Service" dropdown when EDITING an existing
 * prereq row. Includes the row's CURRENT `prerequisite_service_id` (so the
 * dropdown can render its selected option) PLUS every service not already in
 * use as a prereq for this parent. This mirrors the ADD-mode eligibility
 * filter (`prereqEligibleServices` at `page.tsx:1006-1008`) — which excludes
 * already-used prereqs to prevent UNIQUE-constraint collisions on
 * `(service_id, prerequisite_service_id)` — but preserves the current
 * selection, which the ADD filter would otherwise exclude in edit mode and
 * blank the dropdown.
 *
 * Replaces the prior `editingPrereq ? allServices : prereqEligibleServices`
 * ternary, which paired with `disabled={!!editingPrereq}` to lock the field
 * (Session #123 audit `docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md` —
 * classification (a) half-built convention).
 *
 * Pure function; unit-tested at `__tests__/prereq-helpers.test.ts`.
 */
export function getEditPrereqOptions<T extends { id: string }>(
  allServices: T[],
  prerequisites: ReadonlyArray<{ prerequisite_service_id: string }>,
  editingPrereqServiceId: string,
): T[] {
  return allServices.filter(
    (s) =>
      s.id === editingPrereqServiceId ||
      !prerequisites.some((p) => p.prerequisite_service_id === s.id),
  );
}
