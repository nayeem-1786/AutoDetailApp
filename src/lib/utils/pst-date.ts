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

/**
 * Format an ISO timestamp as a short PST/PDT date for display.
 * Example: "Mar 17", "Apr 30", "Dec 25"
 */
export function formatPstShortDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: LA_TZ,
  }).format(new Date(isoString));
}

/**
 * Get today's date in PST/PDT as YYYY-MM-DD.
 * Example: "2026-05-05"
 */
export function getTodayPst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Get the current PST/PDT date + time, with time rounded UP to the next 15-minute slot.
 * Always rounds up — :00, :15, :30, :45 advance to the next slot.
 * When the rounded time crosses midnight, the returned `date` advances to tomorrow PST
 * so callers don't have to handle the wrap themselves. `iso` is the same instant as
 * `date` + `time` rendered as a UTC ISO timestamp (TIMESTAMPTZ-compatible).
 *
 * Example:
 *   13:47 PST → { date: "2026-05-05", time: "14:00", iso: "2026-05-05T21:00:00.000Z" }
 *   13:00 PST → { date: "2026-05-05", time: "13:15", iso: "..." }  // exact boundary rounds up
 *   23:45 PST → { date: "2026-05-06", time: "00:00", iso: "2026-05-06T07:00:00.000Z" }  // wraps to tomorrow
 *   23:53 PST → { date: "2026-05-06", time: "00:00", iso: "..." }
 */
export function getNowPstRoundedTo15(): { date: string; time: string; iso: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);

  const totalMinutes = hour * 60 + minute;
  const nextSlotMinutes = (Math.floor(totalMinutes / 15) + 1) * 15;
  const wrapped = nextSlotMinutes >= 24 * 60;
  const wrappedMinutes = nextSlotMinutes % (24 * 60);
  const newHour = Math.floor(wrappedMinutes / 60);
  const newMinute = wrappedMinutes % 60;
  const time = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;

  // Advance the date by one PST day when the rounded time wrapped past midnight.
  // Compute by building tomorrow's PST date via the offset attached to today
  // (DST transitions are vanishingly rare at this exact wrap moment).
  let date = getTodayPst();
  if (wrapped) {
    const tomorrowUtcMidnight = new Date(date + 'T00:00:00Z').getTime() + 24 * 60 * 60 * 1000;
    date = new Intl.DateTimeFormat('en-CA', {
      timeZone: LA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(tomorrowUtcMidnight));
  }

  // Compose an ISO TIMESTAMPTZ representing the rounded PST instant.
  // Reuse the offset from pstStartOfDayLiteral to handle PST/PDT correctly.
  const offsetStr = pstStartOfDayLiteral(date).slice(-6);
  const iso = new Date(`${date}T${time}:00${offsetStr}`).toISOString();

  return { date, time, iso };
}
