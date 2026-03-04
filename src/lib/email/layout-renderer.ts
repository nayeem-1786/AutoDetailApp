// Email layout renderer — full rendering pipeline
// Brand Kit + layout + blocks → complete HTML email

import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo } from '@/lib/data/business';
import { renderBlocks } from './block-renderers';
import { resolvePhotoPairs } from './photo-resolver';
import { renderTemplate } from '@/lib/utils/template';
import type {
  BrandKit,
  EmailBlock,
  EmailLayout,
  PhotoGalleryBlockData,
  ResolvedColors,
  RenderOptions,
  RenderedEmail,
} from './types';

// ─── Brand Kit fetching ─────────────────────────────────────

const BRAND_KIT_KEYS = [
  'email_brand_primary_color',
  'email_brand_accent_color',
  'email_brand_text_color',
  'email_brand_bg_color',
  'email_brand_font_family',
  'email_brand_logo_url',
  'email_brand_logo_width',
  'email_brand_social_google',
  'email_brand_social_yelp',
  'email_brand_social_instagram',
  'email_brand_social_facebook',
  'email_brand_footer_text',
  'receipt_config',
  'google_review_url',
  'yelp_review_url',
] as const;

function parseSettingStr(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  return fallback;
}

function parseSettingNum(val: unknown, fallback: number): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}

/**
 * Fetch Brand Kit settings from business_settings.
 * Falls back to defaults for any missing keys.
 */
export async function fetchBrandKit(): Promise<BrandKit> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', BRAND_KIT_KEYS as unknown as string[]);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  // Logo: email_brand_logo_url > receipt_config.logo_url
  let logoUrl = parseSettingStr(settings.email_brand_logo_url, '');
  if (!logoUrl && typeof settings.receipt_config === 'object' && settings.receipt_config !== null) {
    logoUrl = ((settings.receipt_config as Record<string, unknown>).logo_url as string) || '';
  }

  // Social: brand kit > review settings
  const socialGoogle = parseSettingStr(settings.email_brand_social_google, '') ||
    parseSettingStr(settings.google_review_url, '');
  const socialYelp = parseSettingStr(settings.email_brand_social_yelp, '') ||
    parseSettingStr(settings.yelp_review_url, '');

  return {
    primary_color: parseSettingStr(settings.email_brand_primary_color, '#1a1a2e'),
    accent_color: parseSettingStr(settings.email_brand_accent_color, '#CCFF00'),
    text_color: parseSettingStr(settings.email_brand_text_color, '#333333'),
    bg_color: parseSettingStr(settings.email_brand_bg_color, '#f5f5f5'),
    font_family: parseSettingStr(settings.email_brand_font_family, 'Arial, Helvetica, sans-serif'),
    logo_url: logoUrl,
    logo_width: parseSettingNum(settings.email_brand_logo_width, 200),
    social_google: socialGoogle,
    social_yelp: socialYelp,
    social_instagram: parseSettingStr(settings.email_brand_social_instagram, ''),
    social_facebook: parseSettingStr(settings.email_brand_social_facebook, ''),
    footer_text: parseSettingStr(settings.email_brand_footer_text, ''),
  };
}

// ─── Color resolution ───────────────────────────────────────

/**
 * Resolve colors: layout color_overrides > Brand Kit defaults
 */
export function resolveColors(brandKit: BrandKit, layoutOverrides: Record<string, string>): ResolvedColors {
  return {
    primary_color: layoutOverrides.primary_color || brandKit.primary_color,
    accent_color: layoutOverrides.accent_color || brandKit.accent_color,
    text_color: layoutOverrides.text_color || brandKit.text_color,
    bg_color: layoutOverrides.bg_color || brandKit.bg_color,
    font_family: layoutOverrides.font_family || brandKit.font_family,
  };
}

// ─── Logo HTML generation ───────────────────────────────────

function generateLogoHtml(brandKit: BrandKit): string {
  if (!brandKit.logo_url) return '';
  return `<img src="${brandKit.logo_url}" alt="Logo" width="${brandKit.logo_width}" style="display:block;max-width:100%;height:auto;border:0;" />`;
}

// ─── Social links HTML ──────────────────────────────────────

function generateSocialLinksHtml(brandKit: BrandKit, footerTextColor: string): string {
  const links: Array<{ label: string; url: string }> = [];
  if (brandKit.social_google) links.push({ label: 'Google', url: brandKit.social_google });
  if (brandKit.social_yelp) links.push({ label: 'Yelp', url: brandKit.social_yelp });
  if (brandKit.social_instagram) links.push({ label: 'Instagram', url: brandKit.social_instagram });
  if (brandKit.social_facebook) links.push({ label: 'Facebook', url: brandKit.social_facebook });

  if (links.length === 0) return '';

  const cells = links.map(l =>
    `<td align="center" style="padding:0 10px;">
      <a href="${l.url}" style="font-family:${brandKit.font_family};font-size:13px;color:${footerTextColor};text-decoration:none;">${l.label}</a>
    </td>`
  ).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
<tr>${cells}</tr>
</table>`;
}

// ─── Unsubscribe link HTML ──────────────────────────────────

function generateUnsubscribeHtml(url: string | undefined, fontFamily: string, textColor: string): string {
  if (!url) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding-top:12px;font-family:${fontFamily};font-size:11px;color:${textColor};">
  <a href="${url}" style="color:${textColor};text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>`;
}

// ─── Dynamic photo resolution ───────────────────────────────

/**
 * Pre-process blocks: resolve dynamic photo_gallery blocks into manual mode
 * with concrete photo URLs before rendering.
 */
async function resolveBlockPhotos(
  blocks: EmailBlock[],
  variables: Record<string, string | undefined>
): Promise<EmailBlock[]> {
  const resolved: EmailBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'photo_gallery') {
      const data = block.data as PhotoGalleryBlockData;
      if (data.mode === 'dynamic') {
        const pairs = await resolvePhotoPairs(data, {
          customerId: variables.customer_id,
          serviceId: variables.service_id,
        });
        resolved.push({
          ...block,
          data: { ...data, mode: 'manual' as const, pairs },
        });
        continue;
      }
    }
    // Recursively handle two_column blocks
    if (block.type === 'two_column') {
      const tcData = block.data as { left: EmailBlock[]; right: EmailBlock[] };
      const [left, right] = await Promise.all([
        resolveBlockPhotos(tcData.left, variables),
        resolveBlockPhotos(tcData.right, variables),
      ]);
      resolved.push({ ...block, data: { left, right } });
      continue;
    }
    resolved.push(block);
  }

  return resolved;
}

// ─── Main render pipeline ───────────────────────────────────

/**
 * Full email rendering pipeline:
 * 1. Compile body_blocks → inner HTML
 * 2. Resolve dynamic photo_gallery blocks
 * 3. Replace {variables} in inner HTML
 * 4. Load layout structure_html
 * 5. Resolve colors: layout.color_overrides > Brand Kit defaults
 * 6. Inject resolved values into layout placeholders
 * 7. Generate plain text fallback
 */
export async function renderEmail(
  blocks: EmailBlock[],
  layout: EmailLayout,
  brandKit: BrandKit,
  variables: Record<string, string | undefined>,
  options: RenderOptions = {}
): Promise<RenderedEmail> {
  // 1. Resolve dynamic photo blocks
  const resolvedBlocks = await resolveBlockPhotos(blocks, variables);

  // 2. Resolve colors
  const colors = resolveColors(brandKit, layout.color_overrides);

  // 3. Compile blocks to inner HTML
  let bodyHtml = renderBlocks(resolvedBlocks, colors, brandKit);

  // 4. Replace {variables} in body HTML
  bodyHtml = renderTemplate(bodyHtml, variables as Record<string, string>);

  // 5. Build layout components
  const businessInfo = await getBusinessInfo();

  const logoHtml = generateLogoHtml(brandKit);
  const footerTextColor = layout.slug === 'promotional' ? '#ffffff' : '#6b7280';
  const socialHtml = layout.footer_config.show_social
    ? generateSocialLinksHtml(brandKit, footerTextColor)
    : '';

  const unsubscribeHtml = options.isMarketing
    ? generateUnsubscribeHtml(options.unsubscribeUrl || variables.unsubscribe_url, colors.font_family, footerTextColor)
    : '';

  // Footer content
  const footerParts = [
    businessInfo.name,
    businessInfo.address,
    businessInfo.phone,
  ];
  if (brandKit.footer_text) footerParts.push(brandKit.footer_text);
  const footerContent = footerParts.join('<br>');

  // 6. Inject into layout structure
  let html = layout.structure_html;

  // Replace layout placeholders
  const replacements: Record<string, string> = {
    '{{LOGO_HTML}}': logoHtml,
    '{{HEADER_CONTENT}}': '', // Used only by promotional for extra header content
    '{{BODY_CONTENT}}': bodyHtml,
    '{{FOOTER_CONTENT}}': footerContent,
    '{{SOCIAL_LINKS_HTML}}': socialHtml,
    '{{UNSUBSCRIBE_LINK}}': unsubscribeHtml,
    '{{PRIMARY_COLOR}}': colors.primary_color,
    '{{ACCENT_COLOR}}': colors.accent_color,
    '{{TEXT_COLOR}}': colors.text_color,
    '{{BG_COLOR}}': colors.bg_color,
    '{{FONT_FAMILY}}': colors.font_family,
    '{{BUSINESS_NAME}}': businessInfo.name,
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  // 7. Resolve any remaining {variables} in subject/html
  html = renderTemplate(html, variables as Record<string, string>);

  // 8. Generate plain text fallback
  const text = htmlToPlainText(bodyHtml);

  // 9. Resolve subject with variables
  const subject = renderTemplate(
    variables._subject || '',
    variables as Record<string, string>
  );

  return { html, text, subject };
}

/**
 * Strip HTML to plain text for email text fallback.
 * Preserves link URLs and basic structure.
 */
function htmlToPlainText(html: string): string {
  return html
    // Convert links to "text (url)" format
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    // Convert <br> and block elements to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|h[1-6])>/gi, '\n')
    .replace(/<(p|div|tr|h[1-6])[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
