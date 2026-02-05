// Formatting utilities

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatPhone(phone: string): string {
  // Convert E.164 (+1XXXXXXXXXX) to (XXX) XXX-XXXX
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
  return phone;
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
  let digits = phone.replace(/\D/g, '');

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

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

export function formatPoints(points: number): string {
  return new Intl.NumberFormat('en-US').format(points);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
