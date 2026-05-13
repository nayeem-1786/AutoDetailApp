// Formatting utilities

// PHONE NUMBER UTILITIES
//
// Use these consistently across the codebase:
//
// - formatPhone(): for ALL human-facing display
//   (returns "(XXX) XXX-XXXX" or "" for null/unparseable)
//
// - formatPhoneInput(): for input onChange handlers
//   (live formats partial typing as user goes)
//
// - normalizePhone(): for storage/wire (returns E.164 or null)
//   (used by sendSms, sendMarketingSms, findOrCreateConversation,
//    and all DB write paths)
//
// - phoneToE164(): ONLY for tel: link hrefs and JSON-LD telephone
//   field (permissive — returns input unchanged if unparseable)
//
// ASSUMPTION: US/Canada phone numbers only (+1 country code).
// This codebase does not support international phone numbers.
// If business expands beyond US/Canada, these utilities need
// to be rebuilt with a library like libphonenumber-js.

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Format a phone number for human-facing display.
 *
 * Returns "(XXX) XXX-XXXX" for any parseable US/Canada phone (E.164 or
 * 10-digit). Returns "" for null, undefined, empty string, or any value
 * that cannot be parsed to a 10-digit number. Callers decide how to
 * present the empty case — e.g. `formatPhone(value) || "—"`.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (phone === null || phone === undefined || phone === '') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const area = digits.slice(1, 4);
    const prefix = digits.slice(4, 7);
    const line = digits.slice(7, 11);
    return `(${area}) ${prefix}-${line}`;
  }
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const prefix = digits.slice(3, 6);
    const line = digits.slice(6, 10);
    return `(${area}) ${prefix}-${line}`;
  }
  return '';
}

export function normalizePhone(input: string): string | null {
  // Remove all non-digit characters
  let digits = input.replace(/\D/g, '');

  if (digits.length === 10) {
    digits = '1' + digits;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Auto-format a phone input as (XXX) XXX-XXXX while typing.
 * Accepts any input — strips non-digits and builds the formatted string
 * progressively so partial input looks correct too.
 */
export function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '');

  // Strip leading country code "1" if user typed it
  if (digits.length > 10 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  // Cap at 10 digits
  digits = digits.slice(0, 10);

  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Convert any phone format to E.164 (+1XXXXXXXXXX) for tel: links and JSON-LD.
 * Returns the original string if it can't be parsed as a 10-digit US number.
 */
export function phoneToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Already E.164 or unparseable — return as-is
  return phone;
}

export function formatDate(date: string | Date): string {
  // Handle date-only strings (YYYY-MM-DD) to avoid timezone shift
  // When passed to new Date(), "2025-02-12" is interpreted as UTC midnight,
  // which shifts backwards in timezones behind UTC (e.g., Pacific)
  let d: Date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Parse as local date by splitting and using Date constructor
    const [year, month, day] = date.split('-').map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format a date/time for receipt display — always PST, always includes time.
 * Produces: "Apr 16, 2026, 4:18 PM"
 */
export function formatReceiptDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  });
}

/**
 * Title-case a free-text string: split on whitespace, capitalize the
 * first letter of each word, lowercase the rest, rejoin with single
 * spaces. Used by the composer's digital-platform label mapping
 * (Phase 1A.5) for free-text platform names.
 *
 * Examples:
 *   "cash app"       → "Cash App"
 *   "wise transfer"  → "Wise Transfer"
 *   "PAYPAL"         → "Paypal"
 *   "  bitcoin  "    → "Bitcoin"
 *   ""               → ""
 */
export function toTitleCase(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .trim()
    .split(/\s+/)
    .map((word) => (word.length === 0 ? '' : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .filter(Boolean)
    .join(' ');
}

/**
 * Compact PST date+time for per-payment-row timestamps on receipts.
 * Produces: "5/6/26 1:43 PM" (M/D/YY h:MM AM/PM, no leading zeros).
 *
 * Phase 1A LOCKED-6 formatting contract. Consumed by composer label
 * assembly and renderer inline label construction.
 */
export function formatReceiptDateTimeCompact(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  // Manual assembly because Intl en-US with year:'2-digit' still includes
  // weekday on some runtimes; toLocaleDateString numeric parts are
  // consistent across Node + browsers in LA tz.
  const datePart = d.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} ${timePart}`;
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Normalize a time string to 24-hour HH:MM format.
 * Handles: "09:00 AM", "2:00 PM", "12:00 AM", "12:00 PM", "13:00", "9:30"
 */
export function normalizeTimeTo24h(time: string): string {
  const trimmed = time.trim().toUpperCase();
  const hasAmPm = /[AP]M$/.test(trimmed);

  if (hasAmPm) {
    const isPm = trimmed.endsWith('PM');
    const timePart = trimmed.replace(/\s*[AP]M$/, '');
    const [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10) || 0;

    if (isPm && h !== 12) h += 12;   // 1 PM → 13, 11 PM → 23
    if (!isPm && h === 12) h = 0;    // 12 AM → 0 (midnight)

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Already 24-hour — just pad
  const [hStr, mStr] = trimmed.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatPoints(points: number): string {
  return new Intl.NumberFormat('en-US').format(points);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRelativeDate(date: string | Date): string {
  let d: Date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(date);
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }
  return formatDate(date);
}
