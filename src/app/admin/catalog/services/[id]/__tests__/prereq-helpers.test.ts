import { describe, it, expect } from 'vitest';
import { getEditPrereqOptions } from '../prereq-helpers';

/**
 * Session #123 — locks the substantive logic change behind the
 * prereq-service-dropdown un-disabling fix
 * (`docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md`). With the disable removed,
 * edit-mode options must (a) include the currently-selected prereq service
 * so the dropdown renders its value, and (b) exclude every OTHER already-used
 * prereq so the operator cannot pick one that would collide with UNIQUE
 * (service_id, prerequisite_service_id) at save time.
 *
 * Session #124 — `parentServiceId` parameter added for defense-in-depth
 * parent-self exclusion (CHECK service_id <> prerequisite_service_id). The
 * existing tests now pass a distinct sentinel ('PARENT') that does not appear
 * in their `allServices`; the new last case exercises the exclusion explicitly.
 */

type Service = { id: string; name: string };
const svc = (id: string, name = id): Service => ({ id, name });

describe('getEditPrereqOptions', () => {
  it('keeps the currently-edited prereq service in the options (so the dropdown can render it)', () => {
    const options = getEditPrereqOptions(
      [svc('A'), svc('B'), svc('C')],
      // 'A' is the editing row, 'B' is a sibling prereq already used.
      [{ prerequisite_service_id: 'A' }, { prerequisite_service_id: 'B' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).toContain('A');
  });

  it('excludes OTHER already-used prereqs (UNIQUE-collision guard)', () => {
    const options = getEditPrereqOptions(
      [svc('A'), svc('B'), svc('C')],
      [{ prerequisite_service_id: 'A' }, { prerequisite_service_id: 'B' }],
      'A',
      'PARENT',
    );
    // 'B' is already a prereq for this parent (on a different row) — picking
    // it would collide with (service_id, B) at DB save time.
    expect(options.map((o) => o.id)).not.toContain('B');
  });

  it('includes unused services (the legitimate alternative choices)', () => {
    const options = getEditPrereqOptions(
      [svc('A'), svc('B'), svc('C'), svc('D')],
      [{ prerequisite_service_id: 'A' }, { prerequisite_service_id: 'B' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'C', 'D']);
  });

  it('returns all services when nothing has been used yet (degenerate but valid)', () => {
    const options = getEditPrereqOptions(
      [svc('A'), svc('B')],
      [{ prerequisite_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'B']);
  });

  it('keeps the current value even when (defensively) it also appears in the prereqs list', () => {
    // Defensive: the editing-row prereq IS in `prerequisites` by construction
    // (the page loads it from the DB). The `s.id === editingPrereqServiceId`
    // clause must always take precedence over the exclusion clause.
    const options = getEditPrereqOptions(
      [svc('A')],
      [{ prerequisite_service_id: 'A' }, { prerequisite_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('A');
  });

  it('excludes the parent service itself (Session #124 — CHECK service_id <> prerequisite_service_id)', () => {
    // The operator must not be able to pick the parent as its own prereq.
    // The CHECK constraint would reject it at DB save; this guards at the UI
    // so describeSupabaseError is the safety net, not the primary defense.
    const options = getEditPrereqOptions(
      [svc('PARENT'), svc('A'), svc('B')],
      // 'A' is the editing row's current prereq. Parent is not (CHECK forbids).
      [{ prerequisite_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).not.toContain('PARENT');
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'B']);
  });
});
