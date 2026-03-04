// Extended variable definitions for the email template system
// Maps template categories → available variables

import { VARIABLE_GROUPS } from '@/lib/utils/template';

/** Variable definition with name, description, and sample value */
export interface VariableDefinition {
  key: string;
  description: string;
  sample: string;
}

// ─── Variable sets by category ──────────────────────────────

const CUSTOMER_VARS: VariableDefinition[] = [
  { key: 'first_name', description: 'Customer first name', sample: 'John' },
  { key: 'last_name', description: 'Customer last name', sample: 'Smith' },
  { key: 'customer_name', description: 'Full name', sample: 'John Smith' },
];

const BUSINESS_VARS: VariableDefinition[] = [
  { key: 'business_name', description: 'Business name', sample: 'Smart Detail Auto Spa' },
  { key: 'business_phone', description: 'Business phone', sample: '(310) 999-0000' },
  { key: 'business_address', description: 'Business address', sample: '2021 Lomita Blvd, Lomita, CA 90717' },
  { key: 'business_email', description: 'Business email', sample: 'info@smartdetails.com' },
  { key: 'business_website', description: 'Business website', sample: 'https://smartdetails.com' },
];

const LINK_VARS: VariableDefinition[] = [
  { key: 'booking_url', description: 'Booking page link', sample: 'https://smartdetails.com/book' },
  { key: 'google_review_link', description: 'Google review link', sample: 'https://g.page/r/review' },
  { key: 'yelp_review_link', description: 'Yelp review link', sample: 'https://yelp.com/biz/review' },
  { key: 'unsubscribe_url', description: 'Unsubscribe link', sample: '#' },
  { key: 'gallery_url', description: 'Photo gallery link', sample: 'https://smartdetails.com/gallery' },
];

const LOYALTY_VARS: VariableDefinition[] = [
  { key: 'loyalty_points', description: 'Loyalty point balance', sample: '500' },
  { key: 'loyalty_value', description: 'Dollar value of loyalty points', sample: '$5.00' },
  { key: 'visit_count', description: 'Total number of visits', sample: '12' },
  { key: 'days_since_last_visit', description: 'Days since last service', sample: '45' },
  { key: 'lifetime_spend', description: 'Total amount spent', sample: '$2,340' },
];

const COUPON_VARS: VariableDefinition[] = [
  { key: 'coupon_code', description: 'Coupon code', sample: 'SAVE15' },
];

const SERVICE_VARS: VariableDefinition[] = [
  { key: 'service_name', description: 'Service name', sample: 'Ceramic Coating' },
  { key: 'services_list', description: 'List of services', sample: 'Ceramic Coating, Interior Detail' },
  { key: 'vehicle_info', description: 'Vehicle year/make/model', sample: '2024 Tesla Model 3' },
  { key: 'timer_display', description: 'Job duration (e.g. 2h 15m)', sample: '2h 15m' },
];

const APPOINTMENT_VARS: VariableDefinition[] = [
  { key: 'appointment_date', description: 'Appointment date', sample: 'March 15, 2026' },
  { key: 'appointment_time', description: 'Appointment time', sample: '10:00 AM' },
  { key: 'appointment_total', description: 'Appointment total amount', sample: '$299.00' },
];

const ORDER_VARS: VariableDefinition[] = [
  { key: 'order_number', description: 'Order number', sample: 'ORD-001234' },
  { key: 'tracking_url', description: 'Tracking URL', sample: 'https://track.example.com/123' },
  { key: 'tracking_number', description: 'Tracking number', sample: '1Z999AA10123456784' },
  { key: 'shipping_carrier', description: 'Shipping carrier name', sample: 'UPS' },
  { key: 'refund_amount', description: 'Refund amount', sample: '$49.99' },
  { key: 'refund_type', description: 'Refund type (full or partial)', sample: 'full' },
  { key: 'items_table', description: 'Order items HTML table (pre-rendered)', sample: '<table>...</table>' },
];

const QUOTE_VARS: VariableDefinition[] = [
  { key: 'quote_number', description: 'Quote/estimate number', sample: 'Q-001234' },
  { key: 'quote_link', description: 'Link to view quote online', sample: 'https://smartdetails.com/quote/abc123' },
  { key: 'quote_subtotal', description: 'Quote subtotal', sample: '$450.00' },
  { key: 'quote_tax', description: 'Quote tax amount', sample: '$42.19' },
  { key: 'quote_total', description: 'Quote total amount', sample: '$492.19' },
  { key: 'validity_days', description: 'Quote validity in days', sample: '10' },
];

const NOTIFICATION_VARS: VariableDefinition[] = [
  { key: 'products_table', description: 'Stock alert products HTML table (pre-rendered)', sample: '<table>...</table>' },
  { key: 'admin_products_url', description: 'Admin products page link', sample: 'https://smartdetails.com/admin/catalog/products?stock=low-stock' },
  { key: 'low_stock_count', description: 'Number of low-stock products', sample: '3' },
  { key: 'out_of_stock_count', description: 'Number of out-of-stock products', sample: '1' },
  { key: 'total_count', description: 'Total products needing attention', sample: '4' },
];

// ─── Category → variable mapping ────────────────────────────

export type TemplateVariableCategory =
  | 'transactional'
  | 'review'
  | 'marketing'
  | 'notification';

/** Get available variables for a template category */
export function getVariablesForCategory(category: TemplateVariableCategory): VariableDefinition[] {
  const base = [...CUSTOMER_VARS, ...BUSINESS_VARS, ...LINK_VARS];

  switch (category) {
    case 'transactional':
      return [...base, ...APPOINTMENT_VARS, ...SERVICE_VARS, ...ORDER_VARS, ...QUOTE_VARS, ...COUPON_VARS];
    case 'review':
      return [...base, ...SERVICE_VARS, ...LOYALTY_VARS];
    case 'marketing':
      return [...base, ...LOYALTY_VARS, ...COUPON_VARS, ...SERVICE_VARS];
    case 'notification':
      return [...base, ...ORDER_VARS, ...NOTIFICATION_VARS];
    default:
      return base;
  }
}

/** Get sample variable values for preview rendering */
export function getSampleVariables(): Record<string, string> {
  const all = [
    ...CUSTOMER_VARS,
    ...BUSINESS_VARS,
    ...LINK_VARS,
    ...LOYALTY_VARS,
    ...COUPON_VARS,
    ...SERVICE_VARS,
    ...APPOINTMENT_VARS,
    ...ORDER_VARS,
    ...QUOTE_VARS,
    ...NOTIFICATION_VARS,
  ];

  const result: Record<string, string> = {};
  for (const v of all) {
    result[v.key] = v.sample;
  }
  return result;
}

/** Existing VARIABLE_GROUPS re-exported with new email-specific additions */
export const EMAIL_VARIABLE_GROUPS = {
  ...VARIABLE_GROUPS,
  'Order Details': {
    order_number: 'Order number',
    tracking_url: 'Package tracking URL',
    tracking_number: 'Tracking number',
    shipping_carrier: 'Shipping carrier name',
    refund_amount: 'Refund amount',
    refund_type: 'Refund type (full or partial)',
    items_table: 'Order items table (pre-rendered HTML)',
  },
  'Quote Details': {
    quote_number: 'Quote/estimate number',
    quote_link: 'Link to view quote online',
    quote_subtotal: 'Quote subtotal',
    quote_tax: 'Quote tax amount',
    quote_total: 'Quote total amount',
    validity_days: 'Quote validity in days',
  },
  'Appointment Details': {
    appointment_date: 'Appointment date',
    appointment_time: 'Appointment time',
    appointment_total: 'Appointment total amount',
    timer_display: 'Job duration (e.g. 2h 15m)',
  },
  'Notification': {
    products_table: 'Stock alert products table (pre-rendered HTML)',
    admin_products_url: 'Admin products page link',
    low_stock_count: 'Number of low-stock products',
    out_of_stock_count: 'Number of out-of-stock products',
    total_count: 'Total products needing attention',
  },
  'Email Links': {
    unsubscribe_url: 'Unsubscribe link',
    gallery_url: 'Photo gallery link',
  },
} as const;
