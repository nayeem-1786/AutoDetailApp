// Default values for the theme settings form
// These mirror the DEFAULT_THEME from src/lib/utils/default-theme.ts
// and the CSS defaults in globals.css

export const THEME_DEFAULTS = {
  mode: 'dark' as const,

  // Colors - Backgrounds
  color_page_bg: '#000000',
  color_card_bg: '#1A1A1A',
  color_header_bg: '#000000',
  color_footer_bg: '#000000',
  color_section_alt_bg: '#0A0A0A',

  // Colors - Text
  color_text_primary: '#ffffff',
  color_text_secondary: '#D1D5DB',
  color_text_muted: '#9CA3AF',
  color_text_on_primary: '#000000',

  // Colors - Brand / Accent
  color_primary: '#CCFF00',
  color_primary_hover: '#DDFF4D',
  color_accent: '#B8E600',
  color_accent_hover: '#A3CC00',

  // Colors - Links
  color_link: '#CCFF00',
  color_link_hover: '#DDFF4D',

  // Colors - Borders
  color_border: 'rgba(255,255,255,0.1)',
  color_border_light: 'rgba(255,255,255,0.05)',
  color_divider: 'rgba(255,255,255,0.1)',

  // Colors - Status
  color_success: '#22C55E',
  color_warning: '#F59E0B',
  color_error: '#EF4444',

  // Typography
  font_family: "'DM Sans', system-ui, sans-serif",
  font_heading_family: "'Urbanist', system-ui, sans-serif",
  font_base_size: '16px',
  font_h1_size: '3.5rem',
  font_h2_size: '2.5rem',
  font_h3_size: '1.5rem',
  font_body_size: '1rem',
  font_small_size: '0.875rem',
  font_line_height: '1.7',
  font_heading_weight: '700',
  font_body_weight: '400',

  // Buttons - Primary
  btn_primary_bg: '#CCFF00',
  btn_primary_text: '#000000',
  btn_primary_hover_bg: '#DDFF4D',
  btn_primary_radius: '9999px',
  btn_primary_padding: '0.75rem 2rem',

  // Buttons - Secondary
  btn_secondary_bg: 'rgba(255,255,255,0.05)',
  btn_secondary_text: '#ffffff',
  btn_secondary_border: 'rgba(255,255,255,0.1)',
  btn_secondary_radius: '9999px',

  // Buttons - CTA
  btn_cta_bg: '#CCFF00',
  btn_cta_text: '#000000',
  btn_cta_hover_bg: '#DDFF4D',
  btn_cta_radius: '9999px',

  // Borders & Shapes
  border_radius: '0.5rem',
  border_card_radius: '1rem',
  border_width: '1px',

  // Spacing
  spacing_section_padding: '6rem',
  spacing_card_padding: '1.5rem',
  spacing_header_height: '4rem',
} as const;

// Font family options
export const FONT_OPTIONS = [
  { label: 'DM Sans', value: "'DM Sans', system-ui, sans-serif" },
  { label: 'Urbanist', value: "'Urbanist', system-ui, sans-serif" },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Roboto', value: "'Roboto', system-ui, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', system-ui, sans-serif" },
  { label: 'Lato', value: "'Lato', system-ui, sans-serif" },
  { label: 'Poppins', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', system-ui, sans-serif" },
  { label: 'System UI', value: 'system-ui, sans-serif' },
];

// Weight options
export const WEIGHT_OPTIONS = [
  { label: '300 (Light)', value: '300' },
  { label: '400 (Regular)', value: '400' },
  { label: '500 (Medium)', value: '500' },
  { label: '600 (Semi-Bold)', value: '600' },
  { label: '700 (Bold)', value: '700' },
  { label: '800 (Extra Bold)', value: '800' },
  { label: '900 (Black)', value: '900' },
];

// Border radius options
export const RADIUS_OPTIONS = [
  { label: 'Sharp (0)', value: '0' },
  { label: 'Slight (4px)', value: '0.25rem' },
  { label: 'Rounded (8px)', value: '0.5rem' },
  { label: 'More (12px)', value: '0.75rem' },
  { label: 'Large (16px)', value: '1rem' },
  { label: 'Pill (9999px)', value: '9999px' },
];

// Spacing options
export const PADDING_OPTIONS = [
  { label: 'Compact', value: '0.5rem 1.5rem' },
  { label: 'Normal', value: '0.75rem 2rem' },
  { label: 'Spacious', value: '1rem 2.5rem' },
];

// Theme presets
export interface ThemePresetConfig {
  name: string;
  description: string;
  values: Partial<Record<string, string | null>>;
}

export const SITE_THEME_PRESETS: ThemePresetConfig[] = [
  {
    name: 'Default Dark',
    description: 'Dark theme with lime accents — the original look',
    values: {
      mode: 'dark',
      // All null = use CSS defaults (the lime/dark design)
    },
  },
  {
    name: 'Clean Light',
    description: 'Light mode with neutral grays',
    values: {
      mode: 'light',
      color_page_bg: '#ffffff',
      color_card_bg: '#f9fafb',
      color_header_bg: '#ffffff',
      color_footer_bg: '#111827',
      color_section_alt_bg: '#f3f4f6',
      color_text_primary: '#111827',
      color_text_secondary: '#4B5563',
      color_text_muted: '#9CA3AF',
      color_text_on_primary: '#ffffff',
      color_primary: '#2563EB',
      color_primary_hover: '#1D4ED8',
      color_accent: '#3B82F6',
      color_accent_hover: '#2563EB',
      color_link: '#2563EB',
      color_link_hover: '#1D4ED8',
      color_border: '#E5E7EB',
      color_border_light: '#F3F4F6',
      color_divider: '#E5E7EB',
      btn_primary_bg: '#2563EB',
      btn_primary_text: '#ffffff',
      btn_primary_hover_bg: '#1D4ED8',
      btn_primary_radius: '0.5rem',
      btn_cta_bg: '#2563EB',
      btn_cta_text: '#ffffff',
      btn_cta_hover_bg: '#1D4ED8',
      btn_cta_radius: '0.5rem',
      btn_secondary_bg: '#ffffff',
      btn_secondary_text: '#374151',
      btn_secondary_border: '#D1D5DB',
    },
  },
  {
    name: 'Midnight Blue',
    description: 'Dark with deep blue tones and electric accents',
    values: {
      mode: 'dark',
      color_page_bg: '#0B1120',
      color_card_bg: '#152038',
      color_header_bg: '#0B1120',
      color_footer_bg: '#070D1A',
      color_section_alt_bg: '#0F1830',
      color_primary: '#38BDF8',
      color_primary_hover: '#7DD3FC',
      color_accent: '#0EA5E9',
      color_accent_hover: '#0284C7',
      color_link: '#38BDF8',
      color_link_hover: '#7DD3FC',
      color_border: 'rgba(56,189,248,0.15)',
      color_border_light: 'rgba(56,189,248,0.08)',
      btn_primary_bg: '#38BDF8',
      btn_primary_text: '#0B1120',
      btn_primary_hover_bg: '#7DD3FC',
      btn_cta_bg: '#38BDF8',
      btn_cta_text: '#0B1120',
      btn_cta_hover_bg: '#7DD3FC',
    },
  },
  {
    name: 'Warm Dark',
    description: 'Dark with amber and orange accents',
    values: {
      mode: 'dark',
      color_page_bg: '#120E08',
      color_card_bg: '#1C1710',
      color_header_bg: '#120E08',
      color_footer_bg: '#0A0806',
      color_section_alt_bg: '#16120C',
      color_primary: '#F59E0B',
      color_primary_hover: '#FBBF24',
      color_accent: '#D97706',
      color_accent_hover: '#B45309',
      color_link: '#F59E0B',
      color_link_hover: '#FBBF24',
      color_border: 'rgba(245,158,11,0.15)',
      color_border_light: 'rgba(245,158,11,0.08)',
      btn_primary_bg: '#F59E0B',
      btn_primary_text: '#120E08',
      btn_primary_hover_bg: '#FBBF24',
      btn_cta_bg: '#F59E0B',
      btn_cta_text: '#120E08',
      btn_cta_hover_bg: '#FBBF24',
    },
  },
  {
    name: 'Professional',
    description: 'Light with navy blue accents — clean corporate look',
    values: {
      mode: 'light',
      color_page_bg: '#ffffff',
      color_card_bg: '#f8fafc',
      color_header_bg: '#0F172A',
      color_footer_bg: '#0F172A',
      color_section_alt_bg: '#F1F5F9',
      color_text_primary: '#0F172A',
      color_text_secondary: '#475569',
      color_text_muted: '#94A3B8',
      color_text_on_primary: '#ffffff',
      color_primary: '#1E40AF',
      color_primary_hover: '#1E3A8A',
      color_accent: '#2563EB',
      color_accent_hover: '#1D4ED8',
      color_link: '#1E40AF',
      color_link_hover: '#1E3A8A',
      color_border: '#CBD5E1',
      color_border_light: '#E2E8F0',
      color_divider: '#CBD5E1',
      btn_primary_bg: '#1E40AF',
      btn_primary_text: '#ffffff',
      btn_primary_hover_bg: '#1E3A8A',
      btn_primary_radius: '0.375rem',
      btn_cta_bg: '#1E40AF',
      btn_cta_text: '#ffffff',
      btn_cta_hover_bg: '#1E3A8A',
      btn_cta_radius: '0.375rem',
      btn_secondary_bg: '#ffffff',
      btn_secondary_text: '#334155',
      btn_secondary_border: '#CBD5E1',
      btn_secondary_radius: '0.375rem',
    },
  },
];
