/**
 * W1 (Unit B audit, 2026-05-30) — primary-classification check.
 *
 * Locks the operator's Q-A rule: only services with classification IN
 * ('primary', 'both') may be booked as the standalone primary service
 * on Step 2 of public booking. Services with classification = 'addon_only'
 * must never appear as standalone options (they remain valid AS add-ons
 * — that's the whole point of the addon_only classification).
 *
 * Companion to `mobile-eligibility.test.ts` which locks the W2 rule;
 * both share the same two-layer defense-in-depth pattern (data-layer
 * filter via Supabase `.in()` + server validation via the helper).
 */

import { describe, it, expect } from 'vitest';
import {
  isPrimaryBookable,
  PRIMARY_BOOKABLE_CLASSIFICATIONS,
  checkPrimaryClassification,
  primaryClassificationErrorMessage,
  type ClassifiedService,
} from '../_classification';
import type { ServiceClassification } from '@/lib/supabase/types';

function svc(
  name: string,
  classification: ServiceClassification
): ClassifiedService {
  return { name, classification };
}

describe('isPrimaryBookable — canonical predicate', () => {
  it('"primary" classification is bookable as standalone', () => {
    expect(isPrimaryBookable('primary')).toBe(true);
  });

  it('"both" classification is bookable as standalone (Q-A locked: addon-AND-primary)', () => {
    // The schema's intent for "both" = usable in both surfaces;
    // Step 2 primary picker is one of those surfaces.
    expect(isPrimaryBookable('both')).toBe(true);
  });

  it('"addon_only" classification is NOT bookable as standalone', () => {
    expect(isPrimaryBookable('addon_only')).toBe(false);
  });
});

describe('PRIMARY_BOOKABLE_CLASSIFICATIONS — Supabase .in() constant', () => {
  it('contains exactly the two values the predicate returns true for', () => {
    expect(PRIMARY_BOOKABLE_CLASSIFICATIONS).toEqual(['primary', 'both']);
  });

  it('every value in the constant is bookable per the predicate (drift guard)', () => {
    for (const c of PRIMARY_BOOKABLE_CLASSIFICATIONS) {
      expect(isPrimaryBookable(c)).toBe(true);
    }
  });

  it('"addon_only" is NOT in the constant (drift guard)', () => {
    expect(PRIMARY_BOOKABLE_CLASSIFICATIONS).not.toContain('addon_only');
  });
});

describe('checkPrimaryClassification — server-side check', () => {
  it('returns { ok: true } for a "primary"-classified service', () => {
    const result = checkPrimaryClassification(svc('Express Wash', 'primary'));
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } for a "both"-classified service', () => {
    const result = checkPrimaryClassification(svc('Ceramic Coating', 'both'));
    expect(result).toEqual({ ok: true });
  });

  it('rejects "addon_only" with the service name', () => {
    const result = checkPrimaryClassification(
      svc('Headlight Restoration', 'addon_only')
    );
    expect(result).toEqual({ ok: false, serviceName: 'Headlight Restoration' });
  });
});

describe('primaryClassificationErrorMessage — wording lock', () => {
  it('produces the exact customer-facing message', () => {
    expect(primaryClassificationErrorMessage('Headlight Restoration')).toBe(
      'Headlight Restoration cannot be booked as a standalone service. Please select a different service.'
    );
  });

  it('handles service names with punctuation', () => {
    expect(primaryClassificationErrorMessage('1-Step Paint Correction')).toBe(
      '1-Step Paint Correction cannot be booked as a standalone service. Please select a different service.'
    );
  });
});
