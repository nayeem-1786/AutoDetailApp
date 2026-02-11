// Template engine for marketing messages

// ---- Variable Groups (used by UI for grouped chip rendering) ----

export const VARIABLE_GROUPS = {
  'Customer Info': {
    first_name: 'Customer first name',
    last_name: 'Customer last name',
  },
  'Business': {
    business_name: 'Your business name',
    business_phone: 'Your business phone number',
    business_address: 'Your business address',
  },
  'Links': {
    booking_url: 'Booking page link',
    book_url: 'Personalized booking link (pre-fills customer info)',
    offer_url: 'Smart offer link (service → booking, product → shop)',
    google_review_link: 'Google review short link',
    yelp_review_link: 'Yelp review short link',
  },
  'Loyalty & History': {
    loyalty_points: "Customer's loyalty point balance",
    loyalty_value: 'Dollar value of loyalty points',
    visit_count: 'Total number of visits',
    days_since_last_visit: 'Days since last service',
    lifetime_spend: 'Total amount spent',
  },
  'Coupons': {
    coupon_code: 'Unique coupon code (when coupon attached)',
  },
  'Event Context': {
    service_name: 'Service from the triggering event',
    vehicle_info: 'Vehicle year/make/model',
    appointment_date: 'Scheduled appointment date',
    appointment_time: 'Scheduled appointment time',
    amount_paid: 'Transaction total amount',
  },
} as const;

/** Variables available in campaigns (16 — excludes Event Context) */
export const CAMPAIGN_VARIABLES: Record<string, string> = {
  ...VARIABLE_GROUPS['Customer Info'],
  ...VARIABLE_GROUPS['Business'],
  ...VARIABLE_GROUPS['Links'],
  ...VARIABLE_GROUPS['Loyalty & History'],
  ...VARIABLE_GROUPS['Coupons'],
};

/** Variables only available in automations (have event-specific context) */
export const AUTOMATION_ONLY_VARIABLES: Record<string, string> = {
  ...VARIABLE_GROUPS['Event Context'],
};

/** Full set of all template variables (campaigns + automation-only) */
export const TEMPLATE_VARIABLES: Record<string, string> = {
  ...CAMPAIGN_VARIABLES,
  ...AUTOMATION_ONLY_VARIABLES,
};

/** Group names that apply to campaigns (exclude Event Context) */
export const CAMPAIGN_GROUPS = [
  'Customer Info',
  'Business',
  'Links',
  'Loyalty & History',
  'Coupons',
] as const;

/** All group names (campaigns + automation-only Event Context) */
export const ALL_GROUPS = [
  ...CAMPAIGN_GROUPS,
  'Event Context',
] as const;

/**
 * Replace template variables in a string.
 * Variables are delimited by curly braces: {first_name}, {coupon_code}, etc.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return vars[key] ?? match;
  });
}

/**
 * Extract variable names from a template string.
 * Returns an array of variable names found in {curly_braces}.
 */
export function getTemplateVariables(template: string): string[] {
  const matches = template.match(/\{(\w+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/**
 * Clean up lines with empty review links and other empty-variable artifacts
 * after template rendering.
 *
 * Handles:
 * - Lines like "⭐ Google: " or "⭐ Yelp: " where URL resolved to empty
 * - Inline patterns like "please leave us a review:  or " when both links empty
 * - Double/triple spaces from empty variable replacement
 * - Lines that end up as only whitespace/punctuation/connectors after replacement
 */
export function cleanEmptyReviewLines(message: string): string {
  return message
    .split('\n')
    .map((line) => {
      let cleaned = line;
      // Collapse multiple spaces into one
      cleaned = cleaned.replace(/ {2,}/g, ' ');
      // Remove orphaned connectors: " or " / " and " / " at " surrounded by space or line edges
      cleaned = cleaned.replace(/\s+\b(or|and|at)\b\s+/gi, ' ');
      // Remove trailing colon+space left by empty variables (e.g., "review: ")
      cleaned = cleaned.replace(/:\s+$/g, '');
      // Trim
      cleaned = cleaned.trim();
      return cleaned;
    })
    // Remove lines that are empty, or only punctuation/connectors
    .filter((line) => {
      if (line === '') return false;
      // Line with only punctuation, whitespace, or short connector words
      if (/^[\s:,;.!?\-–—]+$/.test(line)) return false;
      // Lines like "⭐ Google:" or "⭐ Yelp:" where URL was empty
      if (/^⭐\s*(Google|Yelp):?\s*$/.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Format a phone number for display: +13107564789 → "(310) 756-4789"
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Remove leading country code 1 if present
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
}

/**
 * Format a dollar amount: 2069.50 → "$2,069.50", 0 → "$0"
 */
export function formatDollar(amount: number): string {
  if (amount === 0) return '$0';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Format a number with commas: 2702 → "2,702"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
