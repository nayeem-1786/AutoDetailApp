import type { IssueType } from '@/lib/supabase/types';

/**
 * Predefined issue types for the flag flow.
 * Each issue describes what the detailer FOUND (the problem).
 */
export const ISSUE_TYPES: {
  key: IssueType;
  label: string;
  description: string;
  humanReadable: string;
}[] = [
  {
    key: 'scratches',
    label: 'Scratches',
    description: 'Surface scratches, swirl marks, scuff marks',
    humanReadable: 'some scratches and swirl marks',
  },
  {
    key: 'water_spots',
    label: 'Water Spots',
    description: 'Mineral deposits, hard water stains',
    humanReadable: 'water spots and mineral deposits',
  },
  {
    key: 'paint_damage',
    label: 'Paint Damage',
    description: 'Chips, peeling, oxidation, fading',
    humanReadable: 'some paint damage',
  },
  {
    key: 'pet_hair_stains',
    label: 'Pet Hair / Stains',
    description: 'Hair embedded in upholstery, pet odor',
    humanReadable: 'pet hair and stains in the upholstery',
  },
  {
    key: 'interior_stains',
    label: 'Interior Stains',
    description: 'Food/drink stains, ink, dye transfer',
    humanReadable: 'some interior stains',
  },
  {
    key: 'odor',
    label: 'Odor',
    description: 'Smoke, mildew, pet, food',
    humanReadable: 'an odor that needs attention',
  },
  {
    key: 'headlight_haze',
    label: 'Headlight Haze',
    description: 'Yellowed, cloudy, oxidized headlights',
    humanReadable: 'hazy/oxidized headlights',
  },
  {
    key: 'wheel_damage',
    label: 'Wheel Damage',
    description: 'Curb rash, brake dust buildup',
    humanReadable: 'wheel damage and brake dust buildup',
  },
  {
    key: 'tar_sap_overspray',
    label: 'Tar / Sap / Overspray',
    description: 'Contaminants on paint surface',
    humanReadable: 'tar, sap, or overspray on the paint',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Describe the issue manually',
    humanReadable: 'an issue',
  },
];

/**
 * Get human-readable text for an issue type (for SMS/customer-facing pages).
 */
export function getIssueHumanReadable(issueType: IssueType | null, issueDescription?: string | null): string {
  if (!issueType) return 'an issue';
  if (issueType === 'other' && issueDescription) {
    return issueDescription.toLowerCase();
  }
  const found = ISSUE_TYPES.find((t) => t.key === issueType);
  return found?.humanReadable ?? 'an issue';
}

/**
 * Get the display label for an issue type.
 */
export function getIssueLabel(issueType: IssueType | null): string {
  if (!issueType) return 'Issue';
  const found = ISSUE_TYPES.find((t) => t.key === issueType);
  return found?.label ?? 'Issue';
}

/**
 * Build a friendly, conversational service description from a service name.
 * "Paint Correction Stage 1" → "a paint correction service"
 * "Hot Shampoo Extraction" → "a deep shampoo extraction"
 * "Headlight Restoration" → "a headlight restoration"
 */
export function friendlyServiceName(serviceName: string): string {
  if (!serviceName) return 'an additional service';
  const lower = serviceName.toLowerCase().trim();

  // Specific mappings for common services
  const mappings: Record<string, string> = {
    'paint correction stage 1': 'a paint correction service',
    'paint correction stage 2': 'a two-stage paint correction',
    'paint correction stage 3': 'a full paint correction',
    'hot shampoo extraction': 'a deep shampoo extraction',
    'headlight restoration': 'a headlight restoration',
    'water spot removal': 'a water spot removal treatment',
    'scratch repair': 'a scratch repair service',
    'ceramic coating': 'a ceramic coating application',
    'pet hair removal': 'a pet hair removal service',
    'odor elimination': 'an odor elimination treatment',
    'engine bay detail': 'an engine bay detail',
    'clay bar treatment': 'a clay bar treatment',
  };

  // Check exact matches first
  if (mappings[lower]) return mappings[lower];

  // Check partial matches
  for (const [key, value] of Object.entries(mappings)) {
    if (lower.includes(key)) return value;
  }

  // Default: add article and lowercase
  const article = /^[aeiou]/i.test(lower) ? 'an' : 'a';
  return `${article} ${lower}`;
}
