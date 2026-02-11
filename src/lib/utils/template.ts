// Template engine for marketing messages

/** Variables available in campaigns and automations */
export const CAMPAIGN_VARIABLES: Record<string, string> = {
  first_name: 'Customer first name',
  last_name: 'Customer last name',
  coupon_code: 'Unique coupon code',
  vehicle_info: 'Vehicle year/make/model',
  business_name: 'Business name',
  booking_url: 'Online booking URL',
  book_url: 'Personalized booking link (pre-fills customer name, phone & email)',
  book_now_url: 'Booking URL with service, coupon & email pre-filled',
  google_review_link: 'Google review short link',
  yelp_review_link: 'Yelp review short link',
};

/** Variables only available in automations (have event-specific context) */
export const AUTOMATION_ONLY_VARIABLES: Record<string, string> = {
  service_name: 'Service that was performed',
};

/** Full set of all template variables (campaigns + automation-only) */
export const TEMPLATE_VARIABLES: Record<string, string> = {
  ...CAMPAIGN_VARIABLES,
  ...AUTOMATION_ONLY_VARIABLES,
};

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
 * Clean up lines with empty review links after template rendering.
 * Removes lines like "⭐ Google: " or "⭐ Yelp: " where the URL resolved to empty.
 * Collapses triple+ newlines into double newlines.
 */
export function cleanEmptyReviewLines(message: string): string {
  return message
    .split('\n')
    .filter((line) => !/^⭐\s*(Google|Yelp):\s*$/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
