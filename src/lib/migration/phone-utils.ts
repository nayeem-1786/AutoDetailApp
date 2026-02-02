// Phone normalization and customer classification for Square data import

import type { CustomerTier } from './types';

/**
 * Normalize a raw phone string to E.164 format (+1XXXXXXXXXX).
 * Handles various formats: (XXX) XXX-XXXX, XXX-XXX-XXXX, '+1XXXXXXXXXX, etc.
 */
export function normalizePhoneForImport(raw: string): {
  normalized: string | null;
  original: string;
  valid: boolean;
} {
  const original = raw;

  if (!raw || raw.trim() === '') {
    return { normalized: null, original, valid: false };
  }

  // Remove all non-digit chars (Square sometimes has leading apostrophe)
  let digits = raw.replace(/[^\d]/g, '');

  // 10-digit US number: prepend country code
  if (digits.length === 10) {
    digits = '1' + digits;
  }

  // Valid US number: 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return { normalized: '+' + digits, original, valid: true };
  }

  return { normalized: null, original, valid: false };
}

/**
 * Classify a customer into tiers based on contact info and activity.
 *
 * Tier 1: Has phone + has visited (active with phone)
 * Tier 2: Has phone + no visits (prospect with phone)
 * Tier 3: No phone but has email (email only)
 * Tier 4: No contact info (exclude from import)
 */
export function classifyCustomerTier(row: {
  phone: string | null;
  email: string | null;
  visits: number;
}): CustomerTier {
  if (row.phone && row.visits > 0) return 1; // Active with phone
  if (row.phone && row.visits === 0) return 2; // Prospect with phone
  if (!row.phone && row.email) return 3; // Email only
  return 4; // No contact - exclude
}

/**
 * Map Square category names to Auto Detail category slugs.
 * These map to the product_categories table.
 */
export const CATEGORY_MAP: Record<string, string> = {
  'Accessories': 'accessories',
  'Paint Correction': 'paint-correction',
  'Brushes': 'brushes',
  'Microfibers': 'microfibers',
  'Paint Protection': 'paint-protection',
  'Cleaners': 'cleaners',
  'Tires & Trims': 'tires-trims',
  'Interior Care': 'interior-care',
  'Scents & Deodorizers': 'scents-deodorizers',
  'Soaps & Shampoos': 'soaps-shampoos',
  'Tools': 'tools',
  'Water': 'water',
};

/**
 * Map Square "Price Point Name" size labels to our vehicle size classes.
 * Square uses SMALL/MEDIUM/LARGE; we use sedan/truck_suv_2row/suv_3row_van.
 */
export const SIZE_CLASS_MAP: Record<string, 'sedan' | 'truck_suv_2row' | 'suv_3row_van'> = {
  'SMALL': 'sedan',
  'Small': 'sedan',
  'MEDIUM': 'truck_suv_2row',
  'Medium': 'truck_suv_2row',
  'LARGE': 'suv_3row_van',
  'Large': 'suv_3row_van',
};

export const SIZE_CLASS_LABELS: Record<string, string> = {
  'sedan': 'Sedan',
  'truck_suv_2row': 'Truck/SUV (2-Row)',
  'suv_3row_van': 'SUV (3-Row) / Van',
};

/**
 * SKUs to skip during product import.
 */
export const SKIP_SKUS = new Set(['305152J']); // CC fee item

/**
 * Items to skip by name pattern.
 */
export const SKIP_ITEM_NAMES = new Set(['Custom Amount']);

/**
 * Parse a dollar amount string from Square CSV (e.g., "$70.57" or "70.57").
 */
export function parseDollarAmount(value: string): number {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
