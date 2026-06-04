/**
 * POS Schedule entry-filter predicate — N+2 (Session #149).
 *
 * Pure logic: given a fetched `PosScheduleEntry` row + the active
 * status/detailer/search filters, returns whether the row passes ALL
 * active dimensions. Empty/null filter values for a dimension mean
 * "no constraint" — that dimension passes.
 *
 * AND across categories (status AND detailer AND search must all
 * pass). OR within search (first/last name, phone, vehicle
 * make/model — any field hits = pass).
 *
 * Client-side filter per audit D.6/D.7 (matches the admin >
 * appointments page pattern: server fetches the date window, client
 * trims by the other dimensions). Volume range is bounded (30-day
 * Schedule window) so the per-render scan is negligible.
 *
 * Phone search semantics: strip non-digits from BOTH the query and
 * the stored phone, then substring match. This lets "555-1234"
 * match the stored E.164 "+15551234" without re-normalizing the
 * query (which would fail validation for partial input like 7
 * digits — see normalizePhone at format.ts:110-123).
 */

import type { PosScheduleEntry } from '@/app/pos/jobs/components/schedule-types';

export interface ScheduleEntryFilters {
  /** Free-text search query (raw — caller debounces). Empty = no constraint. */
  search: string;
  /** Appointment status enum value, e.g. 'pending'. Empty/null = no constraint. */
  status: string | null;
  /** Detailer employee_id, or 'unassigned' sentinel. Empty/null = no constraint. */
  detailerId: string | null;
}

/** Strip non-digits — used by phone matching only. */
function digits(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\D/g, '');
}

function searchMatches(entry: PosScheduleEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const c = entry.customer;
  const v = entry.vehicle;

  // Text fields — case-insensitive substring.
  if (c?.first_name && c.first_name.toLowerCase().includes(q)) return true;
  if (c?.last_name && c.last_name.toLowerCase().includes(q)) return true;
  if (v?.make && v.make.toLowerCase().includes(q)) return true;
  if (v?.model && v.model.toLowerCase().includes(q)) return true;

  // Phone — digit-substring (handles "(555) 123-4567" query against
  // stored "+15551234567" by stripping both sides to digits).
  const qDigits = digits(query);
  if (qDigits && c?.phone) {
    if (digits(c.phone).includes(qDigits)) return true;
  }

  return false;
}

function statusMatches(entry: PosScheduleEntry, status: string | null): boolean {
  if (!status) return true;
  return entry.status === status;
}

function detailerMatches(entry: PosScheduleEntry, detailerId: string | null): boolean {
  if (!detailerId) return true;
  if (detailerId === 'unassigned') return !entry.detailer;
  return entry.detailer?.id === detailerId;
}

/**
 * Predicate — true iff the entry passes EVERY active filter dimension.
 * Use inside the host's `useMemo` over `scheduleEntries`.
 */
export function entryMatchesFilters(
  entry: PosScheduleEntry,
  filters: ScheduleEntryFilters
): boolean {
  return (
    statusMatches(entry, filters.status) &&
    detailerMatches(entry, filters.detailerId) &&
    searchMatches(entry, filters.search)
  );
}
