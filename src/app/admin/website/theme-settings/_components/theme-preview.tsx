'use client';

import { useMemo } from 'react';
import type { SiteThemeSettings } from '@/lib/supabase/types';
import { THEME_DEFAULTS } from './theme-defaults';

interface ThemePreviewProps {
  formData: Partial<SiteThemeSettings>;
}

export function ThemePreview({ formData }: ThemePreviewProps) {
  const styles = useMemo(() => {
    const get = (key: keyof typeof THEME_DEFAULTS) =>
      (formData as Record<string, string | null>)[key] ?? THEME_DEFAULTS[key];

    return {
      pageBg: get('color_page_bg'),
      cardBg: get('color_card_bg'),
      headerBg: get('color_header_bg'),
      sectionBg: get('color_section_alt_bg'),
      textPrimary: get('color_text_primary'),
      textSecondary: get('color_text_secondary'),
      textMuted: get('color_text_muted'),
      primary: get('color_primary'),
      primaryHover: get('color_primary_hover'),
      accent: get('color_accent'),
      link: get('color_link'),
      border: get('color_border'),
      btnPrimaryBg: get('btn_primary_bg'),
      btnPrimaryText: get('btn_primary_text'),
      btnPrimaryRadius: get('btn_primary_radius'),
      btnSecondaryBg: get('btn_secondary_bg'),
      btnSecondaryText: get('btn_secondary_text'),
      btnSecondaryBorder: get('btn_secondary_border'),
      btnSecondaryRadius: get('btn_secondary_radius'),
      btnCtaBg: get('btn_cta_bg'),
      btnCtaText: get('btn_cta_text'),
      btnCtaRadius: get('btn_cta_radius'),
      borderRadius: get('border_radius'),
      cardRadius: get('border_card_radius'),
      fontFamily: get('font_family'),
      headingFamily: get('font_heading_family'),
      headingWeight: get('font_heading_weight'),
      bodyWeight: get('font_body_weight'),
    };
  }, [formData]);

  return (
    <div
      className="rounded-lg border border-gray-200 overflow-hidden"
      style={{
        backgroundColor: styles.pageBg,
        fontFamily: styles.fontFamily,
        color: styles.textPrimary,
      }}
    >
      {/* Header Preview */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: styles.headerBg, borderBottom: `1px solid ${styles.border}` }}
      >
        <span
          className="text-sm font-bold"
          style={{ fontFamily: styles.headingFamily, color: styles.primary }}
        >
          SMART DETAILS
        </span>
        <div className="flex gap-3 text-xs" style={{ color: styles.textSecondary }}>
          <span>Services</span>
          <span>About</span>
          <span style={{ color: styles.link }}>Book Now</span>
        </div>
      </div>

      {/* Hero Preview */}
      <div className="px-4 py-6 text-center" style={{ backgroundColor: styles.sectionBg }}>
        <h2
          className="text-lg mb-1"
          style={{
            fontFamily: styles.headingFamily,
            fontWeight: styles.headingWeight,
            color: styles.textPrimary,
          }}
        >
          Premium Auto Detailing
        </h2>
        <p className="text-xs mb-3" style={{ color: styles.textSecondary }}>
          Professional mobile detailing at your door
        </p>
        <button
          className="text-xs px-4 py-1.5 font-medium"
          style={{
            backgroundColor: styles.btnCtaBg,
            color: styles.btnCtaText,
            borderRadius: styles.btnCtaRadius,
          }}
        >
          Book Now
        </button>
      </div>

      {/* Card Preview */}
      <div className="px-4 py-4">
        <div
          className="p-3"
          style={{
            backgroundColor: styles.cardBg,
            borderRadius: styles.cardRadius,
            border: `1px solid ${styles.border}`,
          }}
        >
          <h3
            className="text-sm mb-1"
            style={{
              fontFamily: styles.headingFamily,
              fontWeight: styles.headingWeight,
              color: styles.textPrimary,
            }}
          >
            Ceramic Coating
          </h3>
          <p className="text-xs mb-2" style={{ color: styles.textMuted }}>
            Long-lasting protection and showroom shine
          </p>
          <div className="flex gap-2">
            <button
              className="text-[10px] px-3 py-1 font-medium"
              style={{
                backgroundColor: styles.btnPrimaryBg,
                color: styles.btnPrimaryText,
                borderRadius: styles.btnPrimaryRadius,
              }}
            >
              Learn More
            </button>
            <button
              className="text-[10px] px-3 py-1 font-medium"
              style={{
                backgroundColor: styles.btnSecondaryBg,
                color: styles.btnSecondaryText,
                border: `1px solid ${styles.btnSecondaryBorder}`,
                borderRadius: styles.btnSecondaryRadius,
              }}
            >
              View Pricing
            </button>
          </div>
        </div>
      </div>

      {/* Links & Text Preview */}
      <div
        className="px-4 py-3 text-xs"
        style={{
          borderTop: `1px solid ${styles.border}`,
          color: styles.textMuted,
        }}
      >
        <span style={{ color: styles.link }}>Contact us</span>
        {' '}for a free quote. Serving the South Bay area.
      </div>
    </div>
  );
}
