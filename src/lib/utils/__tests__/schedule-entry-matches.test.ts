import { describe, it, expect } from 'vitest';
import { entryMatchesFilters, type ScheduleEntryFilters } from '../schedule-entry-matches';
import type { PosScheduleEntry } from '@/app/pos/jobs/components/schedule-types';

// ─────────────────────────────────────────────────────────────────────────────
// Contract tests for the POS Schedule entry-filter predicate (N+2).
//
// Pure logic — no React, no fetches. Locks the AND-across-categories +
// OR-within-search semantics; the X2 status restriction is enforced by the UI
// dropdown options (only 3 values exposed) so this helper accepts any string
// for `status` and just compares equality.
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<PosScheduleEntry> = {}): PosScheduleEntry {
  return {
    id: 'apt-1',
    scheduled_date: '2026-06-10',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    status: 'pending',
    channel: 'online',
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+14245551234',
      email: null,
    },
    vehicle: {
      id: 'veh-1',
      year: 2021,
      make: 'Honda',
      model: 'Civic',
      color: 'Red',
    },
    detailer: { id: 'emp-1', first_name: 'Sam', last_name: 'Staff' },
    appointment_services: [],
    total_amount: 120,
    deposit_amount: null,
    scope: 'schedule',
    ...overrides,
  };
}

const NO_FILTERS: ScheduleEntryFilters = { search: '', status: null, detailerId: null };

describe('entryMatchesFilters — empty filters', () => {
  it('returns true for any entry when ALL filters are empty/null', () => {
    expect(entryMatchesFilters(makeEntry(), NO_FILTERS)).toBe(true);
  });
});

describe('entryMatchesFilters — status', () => {
  it('matches when status equals filter', () => {
    expect(entryMatchesFilters(makeEntry({ status: 'confirmed' }), { ...NO_FILTERS, status: 'confirmed' })).toBe(true);
  });

  it('rejects when status differs', () => {
    expect(entryMatchesFilters(makeEntry({ status: 'pending' }), { ...NO_FILTERS, status: 'confirmed' })).toBe(false);
  });

  it('null status passes any entry status', () => {
    expect(entryMatchesFilters(makeEntry({ status: 'pending' }), NO_FILTERS)).toBe(true);
    expect(entryMatchesFilters(makeEntry({ status: 'in_progress' }), NO_FILTERS)).toBe(true);
  });
});

describe('entryMatchesFilters — detailer', () => {
  it('matches when detailer.id equals filter', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, detailerId: 'emp-1' })).toBe(true);
  });

  it('rejects when detailer differs', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, detailerId: 'emp-2' })).toBe(false);
  });

  it('"unassigned" sentinel matches entries with detailer: null', () => {
    expect(entryMatchesFilters(makeEntry({ detailer: null }), { ...NO_FILTERS, detailerId: 'unassigned' })).toBe(true);
  });

  it('"unassigned" sentinel rejects entries WITH a detailer', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, detailerId: 'unassigned' })).toBe(false);
  });

  it('null detailerId passes any assignment state', () => {
    expect(entryMatchesFilters(makeEntry({ detailer: null }), NO_FILTERS)).toBe(true);
    expect(entryMatchesFilters(makeEntry(), NO_FILTERS)).toBe(true);
  });
});

describe('entryMatchesFilters — search (text fields)', () => {
  it('matches first name (case-insensitive, partial)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'jan' })).toBe(true);
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'JAN' })).toBe(true);
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'Jane' })).toBe(true);
  });

  it('matches last name (case-insensitive, partial)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'doe' })).toBe(true);
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'do' })).toBe(true);
  });

  it('matches vehicle make (case-insensitive, partial)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'hon' })).toBe(true);
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'HONDA' })).toBe(true);
  });

  it('matches vehicle model (case-insensitive, partial)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'civ' })).toBe(true);
  });

  it('rejects when no text field contains the query', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: 'tesla' })).toBe(false);
  });

  it('whitespace-only search is treated as empty (passes any entry)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '   ' })).toBe(true);
  });

  it('null/empty customer + vehicle does NOT throw — just no match contribution', () => {
    const bare = makeEntry({ customer: null, vehicle: null });
    expect(entryMatchesFilters(bare, { ...NO_FILTERS, search: 'jane' })).toBe(false);
    expect(entryMatchesFilters(bare, NO_FILTERS)).toBe(true);
  });
});

describe('entryMatchesFilters — search (phone)', () => {
  it('matches phone via digit-substring against stored E.164', () => {
    // Stored "+14245551234"; query "5551234" → digit-match "+14245551234".
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '5551234' })).toBe(true);
  });

  it('matches phone with formatting characters (parens, dashes, spaces)', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '(555) 123-4567' })).toBe(false);
    // Stored "+14245551234"; partial format "555-1234" → digits "5551234" → matches.
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '555-1234' })).toBe(true);
    // Area code prefix matches.
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '(424)' })).toBe(true);
  });

  it('rejects when phone digits do not contain the query digits', () => {
    expect(entryMatchesFilters(makeEntry(), { ...NO_FILTERS, search: '9999999' })).toBe(false);
  });

  it('entry with null phone does NOT throw on phone-style query', () => {
    const noPhone = makeEntry({
      customer: { id: 'c', first_name: 'X', last_name: 'Y', phone: null, email: null },
    });
    expect(entryMatchesFilters(noPhone, { ...NO_FILTERS, search: '5551234' })).toBe(false);
  });
});

describe('entryMatchesFilters — AND across categories', () => {
  it('all three filters match → pass', () => {
    expect(
      entryMatchesFilters(makeEntry(), {
        search: 'jane',
        status: 'pending',
        detailerId: 'emp-1',
      })
    ).toBe(true);
  });

  it('status mismatch → reject (even when search + detailer pass)', () => {
    expect(
      entryMatchesFilters(makeEntry(), {
        search: 'jane',
        status: 'confirmed',
        detailerId: 'emp-1',
      })
    ).toBe(false);
  });

  it('detailer mismatch → reject (even when search + status pass)', () => {
    expect(
      entryMatchesFilters(makeEntry(), {
        search: 'jane',
        status: 'pending',
        detailerId: 'emp-2',
      })
    ).toBe(false);
  });

  it('search mismatch → reject (even when status + detailer pass)', () => {
    expect(
      entryMatchesFilters(makeEntry(), {
        search: 'tesla',
        status: 'pending',
        detailerId: 'emp-1',
      })
    ).toBe(false);
  });
});

describe('entryMatchesFilters — search OR within', () => {
  // Verifies that ANY single field-hit is enough — locks the OR-within
  // semantics distinct from AND-across-categories.
  it('only first_name hits → pass', () => {
    const e = makeEntry({
      vehicle: { id: 'v', year: 2020, make: 'Tesla', model: 'Model 3', color: null },
    });
    expect(entryMatchesFilters(e, { ...NO_FILTERS, search: 'jane' })).toBe(true);
  });

  it('only vehicle.make hits → pass', () => {
    const e = makeEntry({
      customer: { id: 'c', first_name: 'Bob', last_name: 'Smith', phone: null, email: null },
    });
    expect(entryMatchesFilters(e, { ...NO_FILTERS, search: 'honda' })).toBe(true);
  });

  it('only phone hits → pass', () => {
    const e = makeEntry({
      customer: { id: 'c', first_name: 'Bob', last_name: 'Smith', phone: '+14245559999', email: null },
      vehicle: { id: 'v', year: 2020, make: 'Tesla', model: 'Model 3', color: null },
    });
    expect(entryMatchesFilters(e, { ...NO_FILTERS, search: '5559999' })).toBe(true);
  });
});
