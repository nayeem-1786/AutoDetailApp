import type { VariableDefinition } from '@/lib/email/variables';

// ---------------------------------------------------------------------------
// SMS template variable definitions (per slug)
// Used by the admin UI to render variable inserter chips
// ---------------------------------------------------------------------------

export const SMS_TEMPLATE_VARIABLES: Record<string, VariableDefinition[]> = {
  appointment_confirmed: [
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'appointment_date', description: 'Appointment date (e.g. Monday, March 28, 2026)', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time (e.g. 10:30 AM)', sample: '10:30 AM' },
    { key: 'service_name', description: 'Service name', sample: 'Ceramic Coating' },
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_total', description: 'Service total amount', sample: '$299.00' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
  appointment_confirmed_postcall: [
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
  ],
  booking_confirmed: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'services', description: 'Comma-separated service names', sample: 'Ceramic Coating, Interior Detail' },
    { key: 'vehicle_description', description: 'Vehicle year/make/model', sample: '2024 Tesla Model 3' },
    { key: 'service_total', description: 'Total amount', sample: '$499.00' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
  appointment_cancelled: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_accepted_single: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'item_name', description: 'Service/item name', sample: 'Ceramic Coating' },
  ],
  quote_accepted_multi: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
  ],
  quote_accepted_staff_notify: [
    { key: 'customer_name', description: 'Customer full name', sample: 'John Smith' },
    { key: 'quote_number', description: 'Quote number', sample: 'Q-001234' },
    { key: 'service_total', description: 'Quote total amount', sample: '$492.19' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating, Interior Detail' },
  ],
  booking_reminder: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Primary service name', sample: 'Ceramic Coating' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
  ],
  quote_reminder: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'short_url', description: 'Short link to quote', sample: 'https://sdas.co/q1234' },
  ],
  quote_viewed_followup: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'short_url', description: 'Short link to quote', sample: 'https://sdas.co/q1234' },
  ],
  job_complete: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'vehicle_description', description: 'Vehicle make/model', sample: 'Tesla Model 3' },
    { key: 'gallery_link', description: 'Photo gallery link', sample: 'https://sdas.co/g5678' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
    { key: 'business_address', description: 'Business address', sample: '[From Settings]' },
    { key: 'business_phone', description: 'Business phone number', sample: '[From Settings]' },
    { key: 'hours_line', description: "Today's business hours", sample: 'Open today until 6:00 PM' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
  addon_approved: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Add-on service/product name', sample: 'Paint Correction' },
  ],
  addon_declined: [
    { key: 'first_name', description: 'Customer first name', sample: 'John' },
    { key: 'service_name', description: 'Add-on service/product name', sample: 'Paint Correction' },
  ],
  booking_staff_notify: [
    { key: 'customer_name', description: 'Customer full name', sample: 'John Smith' },
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating, Interior Detail' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'deposit_info', description: 'Deposit status', sample: 'Deposit paid.' },
  ],
  staff_notification: [
    { key: 'customer_name', description: 'Customer name from the call', sample: 'John Smith' },
    { key: 'customer_phone', description: 'Customer phone (formatted)', sample: '(310) 555-1234' },
    { key: 'reason_label', description: 'Escalation reason', sample: 'Custom Quote Needed' },
    { key: 'reason_code', description: 'Reason code', sample: 'custom_quote' },
    { key: 'details', description: 'Details from agent', sample: 'Customer wants ceramic coating for a fleet of 5 vehicles' },
    { key: 'business_name', description: 'Business name', sample: '[From Settings]' },
  ],
  detailer_job_assigned: [
    { key: 'services', description: 'Service names', sample: 'Ceramic Coating' },
    { key: 'vehicle_description', description: 'Vehicle year/make/model', sample: '2024 Tesla Model 3' },
    { key: 'appointment_date', description: 'Appointment date', sample: 'Monday, March 28, 2026' },
    { key: 'appointment_time', description: 'Appointment time', sample: '10:30 AM' },
    { key: 'address', description: 'Mobile service address', sample: '123 Main St, Torrance, CA' },
    { key: 'service_total', description: 'Total amount', sample: '$299.00' },
    { key: 'detailer_first_name', description: "Assigned detailer's first name", sample: 'Mike' },
  ],
};

// ---------------------------------------------------------------------------
// Unsafe templates — these stay hardcoded, no DB rows
// Documentary only — listed here so the admin UI can reference them
// ---------------------------------------------------------------------------

export const UNSAFE_SMS_TEMPLATES = [
  'addon_authorization',        // src/app/api/pos/jobs/[id]/addons/route.ts — HMAC crypto token URL
  'addon_authorization_resend', // src/app/api/pos/jobs/[id]/addons/[addonId]/resend/route.ts — fresh token + MMS photo
  'addon_authorization_expired', // src/app/api/webhooks/twilio/inbound/route.ts:819,831 — static "authorization expired" (2 identical sends, zero variables)
  'quote_sms_admin',            // src/lib/quotes/send-service.ts — short link + optional MMS PDF attachment
  'quote_sms_postcall',         // src/lib/services/voice-post-call.ts — short link
  'quote_sms_midcall',          // src/app/api/voice-agent/send-quote-sms/route.ts — short link + service list
  'receipt_sms',                // src/app/api/pos/receipts/sms/route.ts — 160-char limit with truncation logic + short link
] as const;
