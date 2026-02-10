// Template engine for marketing messages

export const TEMPLATE_VARIABLES: Record<string, string> = {
  first_name: 'Customer first name',
  last_name: 'Customer last name',
  coupon_code: 'Unique coupon code',
  service_name: 'Service that was performed',
  vehicle_description: 'Vehicle year/make/model',
  vehicle_info: 'Vehicle year/make/model',
  business_name: 'Business name',
  booking_url: 'Online booking URL',
  book_url: 'Personalized booking link (pre-fills customer name, phone & email)',
  book_now_url: 'Booking URL with service, coupon & email pre-filled',
  google_review_link: 'Google review short link',
  yelp_review_link: 'Yelp review short link',
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
