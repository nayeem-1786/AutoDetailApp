// ---------------------------------------------------------------------------
// BUSINESS_DEFAULTS — single source of truth for fallback values.
// Used when business_settings keys are missing from the database.
// Update these if the business identity changes.
//
// This file is intentionally free of server-only imports so it can be
// imported by both server and client components.
// ---------------------------------------------------------------------------

export const BUSINESS_DEFAULTS = {
  name: 'Smart Detail Auto Spa & Supplies',
  phone: '+14242370913',
  phoneFormatted: '(424) 237-0913',
  address: { line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' },
} as const;
