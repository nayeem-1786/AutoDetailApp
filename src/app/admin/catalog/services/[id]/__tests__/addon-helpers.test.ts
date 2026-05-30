import { describe, it, expect } from 'vitest';
import { getEditAddonOptions } from '../addon-helpers';

/**
 * Session #124 — locks the substantive logic change behind the
 * add-on-service-dropdown un-disabling fix (sibling to #123, see
 * `docs/dev/PREREQ_SERVICE_DROPDOWN_AUDIT.md` Target 4).
 *
 * With the `disabled={!!editingAddon}` removed, edit-mode options must
 * (a) include the currently-selected add-on service so the dropdown can
 * render it; (b) exclude every OTHER already-used add-on (UNIQUE
 * collision on `(primary_service_id, addon_service_id)`); (c) exclude
 * any service classified `primary` (semantic — primaries aren't
 * suggested as add-ons); and (d) exclude the parent service itself
 * (CHECK violation `primary_service_id <> addon_service_id`).
 *
 * Mirrors `prereq-helpers.test.ts` plus the addon-specific
 * classification clause.
 */

type Service = { id: string; name: string; classification?: 'primary' | 'addon_only' | 'both' | null };
const svc = (
  id: string,
  classification: Service['classification'] = 'addon_only',
): Service => ({ id, name: id, classification });

describe('getEditAddonOptions', () => {
  it('keeps the currently-edited add-on service in the options (so the dropdown can render it)', () => {
    const options = getEditAddonOptions(
      [svc('A'), svc('B'), svc('C')],
      [{ addon_service_id: 'A' }, { addon_service_id: 'B' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).toContain('A');
  });

  it('excludes OTHER already-used add-ons (UNIQUE-collision guard)', () => {
    const options = getEditAddonOptions(
      [svc('A'), svc('B'), svc('C')],
      [{ addon_service_id: 'A' }, { addon_service_id: 'B' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).not.toContain('B');
  });

  it('excludes services classified `primary` (semantic — primaries are not add-ons)', () => {
    const options = getEditAddonOptions(
      [svc('A'), svc('PRIME', 'primary'), svc('C')],
      [{ addon_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).not.toContain('PRIME');
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'C']);
  });

  it('includes unused non-primary services (the legitimate alternative choices)', () => {
    const options = getEditAddonOptions(
      [svc('A'), svc('B'), svc('C'), svc('D')],
      [{ addon_service_id: 'A' }, { addon_service_id: 'B' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'C', 'D']);
  });

  it('excludes the parent service itself (CHECK primary_service_id <> addon_service_id)', () => {
    const options = getEditAddonOptions(
      [svc('PARENT'), svc('A'), svc('B')],
      [{ addon_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options.map((o) => o.id)).not.toContain('PARENT');
    expect(options.map((o) => o.id).sort()).toEqual(['A', 'B']);
  });

  it('keeps the current value even when (defensively) it is also `primary`-classified', () => {
    // Defensive: the editing-row add-on IS in the DB; if it somehow carries a
    // `primary` classification (data anomaly), the dropdown must still render
    // its current selection — the `s.id === editingAddonServiceId` clause
    // takes precedence over the classification exclusion.
    const options = getEditAddonOptions(
      [svc('A', 'primary')],
      [{ addon_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('A');
  });

  it('keeps the current value even when it also appears in the addons list multiple times (defensive)', () => {
    const options = getEditAddonOptions(
      [svc('A')],
      [{ addon_service_id: 'A' }, { addon_service_id: 'A' }],
      'A',
      'PARENT',
    );
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe('A');
  });
});
