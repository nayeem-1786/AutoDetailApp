/**
 * PST/PDT-aware date helpers.
 *
 * All scheduling and time displays use America/Los_Angeles (CLAUDE.md rule #1).
 * These helpers replace hardcoded `-08:00` offsets that break during DST.
 */

const LA_TZ = 'America/Los_Angeles';

/**
 * Get the current PST/PDT offset string (e.g. "-08:00" or "-07:00")
 * for a given date (defaults to now).
 */
function getPstOffset(date: Date = new Date()): string {
  // Intl gives us the offset in minutes; we format it as ±HH:MM
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TZ,
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const tzPart = parts.find((p) => p.type === 'timeZoneName');
  // Format: "GMT-08:00" or "GMT-07:00"
  return tzPart?.value?.replace('GMT', '') || '-08:00';
}

/**
 * Convert a date string (YYYY-MM-DD) to an ISO timestamp at the start of that day in PST/PDT.
 * Returns null if dateStr is empty/falsy.
 *
 * Example: "2026-03-20" → "2026-03-20T08:00:00.000Z" (during PST)
 *                       → "2026-03-20T07:00:00.000Z" (during PDT)
 */
export function dateToPstStartOfDay(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const offset = getPstOffset(new Date(dateStr + 'T12:00:00'));
  return new Date(dateStr + 'T00:00:00' + offset).toISOString();
}

/**
 * Convert a date string (YYYY-MM-DD) to an ISO timestamp at end of that day in PST/PDT.
 * Returns null if dateStr is empty/falsy.
 *
 * Example: "2026-03-20" → "2026-03-21T07:59:59.000Z" (during PST)
 *                       → "2026-03-21T06:59:59.000Z" (during PDT)
 */
export function dateToPstEndOfDay(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const offset = getPstOffset(new Date(dateStr + 'T12:00:00'));
  return new Date(dateStr + 'T23:59:59' + offset).toISOString();
}

/**
 * Extract YYYY-MM-DD from a timestamp, interpreting it in PST/PDT.
 * Returns '' if dateValue is empty/falsy.
 *
 * This replaces the buggy pattern:
 *   new Date(value).toISOString().split('T')[0]
 * which extracts the UTC date (off by 1 day for late-night PST timestamps).
 */
export function timestampToPstDate(dateValue: string | null | undefined): string {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleDateString('en-CA', { timeZone: LA_TZ });
}

/**
 * Build a PST/PDT-aware end-of-day timestamp string for Supabase range queries.
 * Returns the string directly (not wrapped in toISOString).
 *
 * Example: "2026-03-20" → "2026-03-20T23:59:59.999-08:00" (PST)
 *                       → "2026-03-20T23:59:59.999-07:00" (PDT)
 */
export function pstEndOfDayLiteral(dateStr: string): string {
  const offset = getPstOffset(new Date(dateStr + 'T12:00:00'));
  return `${dateStr}T23:59:59.999${offset}`;
}

/**
 * Build a PST/PDT-aware start-of-day timestamp string for Supabase range queries.
 */
export function pstStartOfDayLiteral(dateStr: string): string {
  const offset = getPstOffset(new Date(dateStr + 'T12:00:00'));
  return `${dateStr}T00:00:00${offset}`;
}
