// Email block renderers — each produces TABLE-based HTML with inline styles
// Pure functions: (blockData, brandKit) → HTML string

import type {
  BrandKit,
  EmailBlock,
  TextBlockData,
  HeadingBlockData,
  ButtonBlockData,
  ImageBlockData,
  PhotoGalleryBlockData,
  CouponBlockData,
  DividerBlockData,
  SpacerBlockData,
  SocialLinksBlockData,
  TwoColumnBlockData,
  ResolvedColors,
} from './types';

// ─── Helpers ────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert markdown-like bold/italic/links in text blocks to HTML */
function inlineFormat(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:inherit;text-decoration:underline;">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

function alignAttr(align?: string): string {
  return align ? ` align="${align}"` : '';
}

// ─── Block Renderers ────────────────────────────────────────

function renderText(data: TextBlockData, colors: ResolvedColors): string {
  const formatted = inlineFormat(data.content);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td${alignAttr(data.align)} style="font-family:${colors.font_family};font-size:16px;line-height:24px;color:${colors.text_color};padding:0 0 16px;">
  ${formatted}
</td></tr>
</table>`;
}

function renderHeading(data: HeadingBlockData, colors: ResolvedColors): string {
  const sizes: Record<number, string> = { 1: '28px', 2: '22px', 3: '18px' };
  const size = sizes[data.level] || '22px';
  const tag = `h${data.level}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td${alignAttr(data.align)} style="font-family:${colors.font_family};font-size:${size};font-weight:bold;line-height:1.3;color:${colors.text_color};padding:0 0 12px;">
  <${tag} style="margin:0;font-size:${size};font-weight:bold;">${esc(data.text)}</${tag}>
</td></tr>
</table>`;
}

function renderButton(data: ButtonBlockData, colors: ResolvedColors): string {
  let bgColor: string;
  let textColor: string;
  if (data.color === 'primary') {
    bgColor = colors.primary_color;
    textColor = '#ffffff';
  } else if (data.color === 'accent') {
    bgColor = colors.accent_color;
    textColor = '#000000';
  } else {
    bgColor = data.color;
    textColor = '#ffffff';
  }

  // Bulletproof button pattern (Outlook-compatible)
  const buttonHtml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(data.url)}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" strokecolor="${bgColor}" fillcolor="${bgColor}">
<w:anchorlock/>
<center style="color:${textColor};font-family:${colors.font_family};font-size:16px;font-weight:bold;">${esc(data.text)}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${esc(data.url)}" style="display:inline-block;background-color:${bgColor};color:${textColor};font-family:${colors.font_family};font-size:16px;font-weight:bold;text-decoration:none;padding:12px 32px;border-radius:6px;line-height:20px;mso-hide:all;">${esc(data.text)}</a>
<!--<![endif]-->`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td${alignAttr(data.align || 'center')} style="padding:16px 0;">
  ${buttonHtml}
</td></tr>
</table>`;
}

function renderImage(data: ImageBlockData, _colors: ResolvedColors): string {
  const width = Math.min(data.width || 560, 560);
  const img = `<img src="${esc(data.src)}" alt="${esc(data.alt)}" width="${width}" style="display:block;max-width:100%;height:auto;border:0;outline:none;" />`;
  const content = data.link
    ? `<a href="${esc(data.link)}" style="text-decoration:none;">${img}</a>`
    : img;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:8px 0;">
  ${content}
</td></tr>
</table>`;
}

function renderPhotoGallery(data: PhotoGalleryBlockData, colors: ResolvedColors): string {
  const pairs = data.pairs || [];
  if (pairs.length === 0) {
    return '<!-- photo_gallery: no pairs to render -->';
  }

  const pairRows = pairs.map(pair => {
    const caption = pair.caption ? `<tr><td colspan="2" align="center" style="font-family:${colors.font_family};font-size:13px;color:${colors.text_color};padding:4px 0 16px;font-style:italic;">${esc(pair.caption)}</td></tr>` : '';

    return `<tr>
<td width="50%" align="center" valign="top" style="padding:4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="font-family:${colors.font_family};font-size:10px;font-weight:bold;text-transform:uppercase;color:#6b7280;letter-spacing:1px;padding-bottom:4px;">BEFORE</td></tr>
    <tr><td><img src="${esc(pair.before_url)}" alt="Before" width="260" style="display:block;max-width:100%;height:auto;border-radius:4px;border:1px solid #e5e7eb;" /></td></tr>
  </table>
</td>
<td width="50%" align="center" valign="top" style="padding:4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="font-family:${colors.font_family};font-size:10px;font-weight:bold;text-transform:uppercase;color:#6b7280;letter-spacing:1px;padding-bottom:4px;">AFTER</td></tr>
    <tr><td><img src="${esc(pair.after_url)}" alt="After" width="260" style="display:block;max-width:100%;height:auto;border-radius:4px;border:1px solid #e5e7eb;" /></td></tr>
  </table>
</td>
</tr>
${caption}`;
  }).join('');

  const galleryLink = data.gallery_link
    ? `<tr><td colspan="2" align="center" style="padding:8px 0 0;">
        <a href="{gallery_url}" style="font-family:${colors.font_family};font-size:14px;color:${colors.accent_color};text-decoration:underline;">View Full Gallery</a>
      </td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:8px 0;">
${pairRows}
${galleryLink}
</table>`;
}

function renderCoupon(data: CouponBlockData, colors: ResolvedColors): string {
  if (data.style === 'inline') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-family:${colors.font_family};font-size:16px;line-height:24px;color:${colors.text_color};padding:8px 0;">
  ${esc(data.description)}: <strong style="font-size:20px;color:${colors.accent_color};letter-spacing:2px;">${data.code_variable}</strong>
</td></tr>
</table>`;
  }

  if (data.style === 'banner') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
<tr><td align="center" style="background-color:${colors.accent_color};padding:20px 24px;border-radius:6px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="font-family:${colors.font_family};font-size:14px;font-weight:bold;text-transform:uppercase;color:#000000;letter-spacing:1px;padding-bottom:6px;">${esc(data.heading)}</td></tr>
    <tr><td align="center" style="font-family:'Courier New',monospace;font-size:28px;font-weight:bold;color:#000000;letter-spacing:3px;padding-bottom:6px;">${data.code_variable}</td></tr>
    <tr><td align="center" style="font-family:${colors.font_family};font-size:14px;color:#000000;">${esc(data.description)}</td></tr>
  </table>
</td></tr>
</table>`;
  }

  // Default: card style
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
<tr><td style="border:2px dashed ${colors.accent_color};border-radius:8px;padding:24px;text-align:center;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="font-family:${colors.font_family};font-size:14px;font-weight:bold;text-transform:uppercase;color:${colors.text_color};letter-spacing:1px;padding-bottom:8px;">${esc(data.heading)}</td></tr>
    <tr><td align="center" style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;color:${colors.accent_color};letter-spacing:3px;padding:12px 0;border-top:1px dashed #e5e7eb;border-bottom:1px dashed #e5e7eb;">${data.code_variable}</td></tr>
    <tr><td align="center" style="font-family:${colors.font_family};font-size:14px;color:${colors.text_color};padding-top:8px;">${esc(data.description)}</td></tr>
  </table>
</td></tr>
</table>`;
}

function renderDivider(data: DividerBlockData, _colors: ResolvedColors): string {
  const color = data.color || '#cccccc';
  const borderStyle = data.style || 'solid';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:8px 0;">
  <div style="border-top:1px ${borderStyle} ${color};font-size:1px;line-height:1px;">&nbsp;</div>
</td></tr>
</table>`;
}

function renderSpacer(data: SpacerBlockData, _colors: ResolvedColors): string {
  const height = data.height || 20;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:${height}px;font-size:${height}px;line-height:${height}px;">&nbsp;</td></tr>
</table>`;
}

function renderSocialLinks(data: SocialLinksBlockData, brandKit: BrandKit): string {
  const links: Array<{ platform: string; url: string }> = [];

  if (data.use_brand_kit) {
    if (brandKit.social_google) links.push({ platform: 'Google', url: brandKit.social_google });
    if (brandKit.social_yelp) links.push({ platform: 'Yelp', url: brandKit.social_yelp });
    if (brandKit.social_instagram) links.push({ platform: 'Instagram', url: brandKit.social_instagram });
    if (brandKit.social_facebook) links.push({ platform: 'Facebook', url: brandKit.social_facebook });
  } else if (data.custom_links) {
    links.push(...data.custom_links);
  }

  if (links.length === 0) return '';

  const cells = links.map(link =>
    `<td align="center" style="padding:0 8px;">
      <a href="${esc(link.url)}" style="font-family:${brandKit.font_family};font-size:12px;color:#6b7280;text-decoration:none;">${esc(link.platform)}</a>
    </td>`
  ).join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr>${cells}</tr>
</table>`;
}

function renderTwoColumn(data: TwoColumnBlockData, colors: ResolvedColors, brandKit: BrandKit): string {
  const leftHtml = data.left.map(b => renderBlock(b, colors, brandKit)).join('');
  const rightHtml = data.right.map(b => renderBlock(b, colors, brandKit)).join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="50%" valign="top" style="padding-right:8px;">
  ${leftHtml}
</td>
<td width="50%" valign="top" style="padding-left:8px;">
  ${rightHtml}
</td>
</tr>
</table>`;
}

// ─── Main dispatcher ────────────────────────────────────────

export function renderBlock(block: EmailBlock, colors: ResolvedColors, brandKit: BrandKit): string {
  switch (block.type) {
    case 'text':
      return renderText(block.data as TextBlockData, colors);
    case 'heading':
      return renderHeading(block.data as HeadingBlockData, colors);
    case 'button':
      return renderButton(block.data as ButtonBlockData, colors);
    case 'image':
      return renderImage(block.data as ImageBlockData, colors);
    case 'photo_gallery':
      return renderPhotoGallery(block.data as PhotoGalleryBlockData, colors);
    case 'coupon':
      return renderCoupon(block.data as CouponBlockData, colors);
    case 'divider':
      return renderDivider(block.data as DividerBlockData, colors);
    case 'spacer':
      return renderSpacer(block.data as SpacerBlockData, colors);
    case 'social_links':
      return renderSocialLinks(block.data as SocialLinksBlockData, brandKit);
    case 'two_column':
      return renderTwoColumn(block.data as TwoColumnBlockData, colors, brandKit);
    default:
      return `<!-- unknown block type: ${(block as EmailBlock).type} -->`;
  }
}

/**
 * Render all blocks to a single HTML string
 */
export function renderBlocks(blocks: EmailBlock[], colors: ResolvedColors, brandKit: BrandKit): string {
  return blocks.map(block => renderBlock(block, colors, brandKit)).join('\n');
}
