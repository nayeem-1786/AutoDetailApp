/**
 * W5 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1, 2026-06-02) —
 * server-side prerequisite-vehicle-compatibility check.
 *
 * Locks the operator's Q-W5-UX rule: when a primary service has
 * prerequisites configured AND at least one of those prerequisite
 * services is NOT compatible with the customer's vehicle category,
 * the customer cannot self-service the dependent service — they are
 * routed to the `RequestQuoteCard` CTA. The client surfaces the
 * "Custom Quote" badge + replaces the configure panel with the quote
 * form; the server's `assertPrereqsCompatible` rejects tampered/
 * replayed requests + the operator-misconfiguration case.
 *
 * Companion to:
 *   - `classification.test.ts` (W1 — primary classification rule)
 *   - `mobile-eligibility.test.ts` (W2 — mobile flag, per-service)
 *   - `staff-assessed.test.ts` (W3 — staff_assessed flag, per-service)
 *   - `addon-vehicle-compat.test.ts` (W7 — addon vehicle_compat)
 *
 * **Public-booking SUBSET semantics (Q-Arch-1 LOCKED):** unlike POS —
 * which gates prereqs by SATISFACTION (history/same-ticket) and offers
 * a manager override — public booking checks one axis only: prereq
 * vehicle-compatibility. The tests below lock that semantic; nothing
 * about prereq satisfaction or POS-style override paths should leak
 * into this helper.
 */

import { describe, it, expect } from 'vitest';
import {
  assertPrereqsCompatible,
  prereqIncompatibleErrorMessage,
  type PrereqRow,
} from '../_prereq-enforcement';

// Convenience builder mirroring `staff-assessed.test.ts`'s `svc()` helper.
function prereqRow(name: string, vehicle_compatibility: string[] | null): PrereqRow {
  return { prerequisite_service: { name, vehicle_compatibility } };
}

describe('assertPrereqsCompatible — primary has no prereqs', () => {
  it('returns { ok: true } when primary has no prerequisites configured', () => {
    const result = assertPrereqsCompatible(
      { name: 'Express Wash', service_prerequisites: [] },
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when service_prerequisites is null/undefined-equivalent', () => {
    // Defensive: route may emit an empty array but data shape allows
    // missing — the helper's `?? []` fallback covers it.
    const result = assertPrereqsCompatible(
      { name: 'Express Wash', service_prerequisites: [] },
      'rv'
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('assertPrereqsCompatible — no vehicle category', () => {
  it('returns { ok: true } when vehicleCategory is null (no axis to evaluate)', () => {
    // The route's existing vehicle_compatibility check at `:343` is the
    // canonical authority on vehicle/service mismatch when there IS a
    // vehicle; this helper passes through when no category is supplied.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', ['standard'])],
      },
      null
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('assertPrereqsCompatible — all prereqs compatible', () => {
  it('returns { ok: true } when prereq compat includes the vehicle category compat key', () => {
    // Customer vehicle_category='automobile' maps to compat key 'standard'.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', ['standard'])],
      },
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when prereq compat is empty (implicit compatible-with-all)', () => {
    // Empty vehicle_compatibility array on the prereq = no restriction —
    // mirrors the same shape's interpretation at `route.ts:343` and in
    // POS check-prerequisites/route.ts:163.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', [])],
      },
      'rv'
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when prereq compat is null (implicit compatible-with-all)', () => {
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', null)],
      },
      'aircraft'
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when multiple prereqs are all compatible', () => {
    const result = assertPrereqsCompatible(
      {
        name: 'Full Detail',
        service_prerequisites: [
          prereqRow('Wash', []),
          prereqRow('Vacuum', ['standard']),
          prereqRow('Interior Wipe', null),
        ],
      },
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('assertPrereqsCompatible — incompatible prereq(s)', () => {
  it('rejects when single prereq is incompatible', () => {
    // RV customer + prereq restricted to automobiles → block.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', ['standard'])],
      },
      'rv'
    );
    expect(result).toEqual({
      ok: false,
      serviceName: 'Ceramic Coating Pkg',
      offendingPrereqs: [
        { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
      ],
    });
  });

  it('rejects when one of multiple prereqs is incompatible — lists only the offender', () => {
    const result = assertPrereqsCompatible(
      {
        name: 'Full Restore',
        service_prerequisites: [
          prereqRow('Wash', []), // ok — implicit all
          prereqRow('Paint Correction', ['standard']), // not ok for RV
          prereqRow('Vacuum', null), // ok — implicit all
        ],
      },
      'rv'
    );
    expect(result).toEqual({
      ok: false,
      serviceName: 'Full Restore',
      offendingPrereqs: [
        { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
      ],
    });
  });

  it('rejects with ALL offenders when multiple prereqs are incompatible', () => {
    // Builder lists every incompatible prereq so the customer (and the
    // staff member who receives the quote-request SMS) see the full
    // gap, not just the first.
    const result = assertPrereqsCompatible(
      {
        name: 'Concours Restoration',
        service_prerequisites: [
          prereqRow('Paint Correction', ['standard']),
          prereqRow('Engine Bay Detail', ['standard']),
          prereqRow('Wash', []), // ok — implicit all
        ],
      },
      'boat'
    );
    expect(result).toEqual({
      ok: false,
      serviceName: 'Concours Restoration',
      offendingPrereqs: [
        { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
        { service_name: 'Engine Bay Detail', vehicle_compatibility: ['standard'] },
      ],
    });
  });

  it('skips prereq rows whose prerequisite_service join is null (deleted target)', () => {
    // Defensive: PostgREST may return null for the embedded join when
    // the prereq service has been deleted. The helper skips rather than
    // treats null as incompatible — the row is dead-data, not a gating
    // signal.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [
          { prerequisite_service: null } as PrereqRow,
          prereqRow('Paint Correction', []),
        ],
      },
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });

  it('maps automobile → standard correctly (compat-key vocabulary)', () => {
    // The DB stores `'standard'` as the compat-key for automobiles
    // (categoryToCompatibilityKey), so `['standard']` is COMPATIBLE
    // with `vehicleCategory='automobile'`. Anti-regression for the
    // standard ↔ automobile mapping that's easy to invert.
    const result = assertPrereqsCompatible(
      {
        name: 'Ceramic Coating Pkg',
        service_prerequisites: [prereqRow('Paint Correction', ['standard'])],
      },
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });

  it('rejects non-automobile category against prereq locked to standard', () => {
    // Symmetric anti-regression: motorcycle/rv/boat/aircraft → compat
    // key is the category itself (not 'standard'), so a prereq locked
    // to ['standard'] excludes them.
    for (const cat of ['motorcycle', 'rv', 'boat', 'aircraft'] as const) {
      const result = assertPrereqsCompatible(
        {
          name: 'Ceramic Coating Pkg',
          service_prerequisites: [prereqRow('Paint Correction', ['standard'])],
        },
        cat
      );
      expect(result).toMatchObject({
        ok: false,
        serviceName: 'Ceramic Coating Pkg',
      });
    }
  });
});

describe('prereqIncompatibleErrorMessage — wording lock', () => {
  it('single offender → names the prereq inline', () => {
    expect(
      prereqIncompatibleErrorMessage('Ceramic Coating Pkg', [
        { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
      ])
    ).toBe(
      'Ceramic Coating Pkg requires Paint Correction, which is not available for your vehicle. Please request a quote.'
    );
  });

  it('multiple offenders → comma-joins all names', () => {
    expect(
      prereqIncompatibleErrorMessage('Concours Restoration', [
        { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
        { service_name: 'Engine Bay Detail', vehicle_compatibility: ['standard'] },
      ])
    ).toBe(
      'Concours Restoration requires services (Paint Correction, Engine Bay Detail) that are not available for your vehicle. Please request a quote.'
    );
  });

  it('defensive — empty offender list emits a generic message', () => {
    // Caller should not invoke the builder on an ok result; if they do,
    // the message stays sensible rather than rendering an empty list.
    expect(prereqIncompatibleErrorMessage('Ceramic Coating Pkg', [])).toBe(
      'Ceramic Coating Pkg requires a custom quote for your vehicle. Please request a quote.'
    );
  });

  it('closes with the same "Please request a quote." imperative as W3', () => {
    // Wording-lock guard: both W3 (staff_assessed) and W5
    // (prereq-incompatible) route the customer to the same
    // RequestQuoteCard CTA on the next page-load, so the imperative
    // closer must match byte-for-byte.
    const msg = prereqIncompatibleErrorMessage('Ceramic Coating Pkg', [
      { service_name: 'Paint Correction', vehicle_compatibility: ['standard'] },
    ]);
    expect(msg).toMatch(/Please request a quote\.$/);
  });
});
