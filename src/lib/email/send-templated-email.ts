// High-level send function for the email template system
// Resolves template → renders → sends via Mailgun

import { sendEmail } from '@/lib/utils/email';
import { fetchBrandKit, renderEmail } from './layout-renderer';
import { resolveEmailTemplate, fetchDefaultLayout } from './template-resolver';
import type { CustomerAttributes, EmailBlock, RenderOptions, RenderedEmail } from './types';

interface SendTemplatedEmailOptions {
  /** Customer attributes for segment routing */
  customerAttributes?: CustomerAttributes;
  /** Mark as marketing email (adds unsubscribe link) */
  isMarketing?: boolean;
  /** Override unsubscribe URL */
  unsubscribeUrl?: string;
  /** Enable Mailgun open/click tracking */
  tracking?: boolean;
  /** Mailgun custom variables for webhook attribution */
  mailgunVars?: Record<string, string>;
}

interface SendTemplatedEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /** Whether the template system was used (vs fallback) */
  usedTemplate: boolean;
}

/**
 * Send an email using the template system.
 *
 * Flow:
 * 1. fetchBrandKit()
 * 2. resolveEmailTemplate(triggerKey, customerAttributes)
 * 3. renderEmail(template, layout, brandKit, variables)
 * 4. sendEmail(to, subject, text, html)
 *
 * Returns { usedTemplate: false } if no template found — caller should fall back to hardcoded.
 */
export async function sendTemplatedEmail(
  to: string,
  triggerKey: string,
  variables: Record<string, string | undefined>,
  options: SendTemplatedEmailOptions = {}
): Promise<SendTemplatedEmailResult> {
  try {
    // 1. Resolve template
    const resolved = await resolveEmailTemplate(triggerKey, options.customerAttributes);

    if (!resolved) {
      return { success: false, usedTemplate: false };
    }

    const { template, layout } = resolved;

    // Only use template system if template has been customized (for system templates)
    // or is a non-system template
    if (template.is_system && !template.is_customized) {
      return { success: false, usedTemplate: false };
    }

    // 2. Fetch brand kit
    const brandKit = await fetchBrandKit();

    // 3. Build render options
    const renderOptions: RenderOptions = {
      isMarketing: options.isMarketing,
      unsubscribeUrl: options.unsubscribeUrl,
    };

    // Add subject to variables for rendering
    const allVars = {
      ...variables,
      _subject: template.subject,
    };

    // 4. Render email
    const rendered = await renderEmail(
      template.body_blocks,
      layout,
      brandKit,
      allVars,
      renderOptions
    );

    // 5. Send via Mailgun
    const result = await sendEmail(
      to,
      rendered.subject,
      rendered.text,
      rendered.html,
      {
        variables: options.mailgunVars,
        tracking: options.tracking ?? options.isMarketing,
      }
    );

    if (result.success) {
      return { success: true, messageId: result.id, usedTemplate: true };
    }

    return { success: false, error: result.error, usedTemplate: true };
  } catch (err) {
    console.error('[sendTemplatedEmail] Error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      usedTemplate: true,
    };
  }
}

/**
 * Render an email from raw blocks + layout slug (for campaigns/previews).
 * Does NOT send — returns rendered HTML for preview or campaign send.
 */
export async function renderFromBlocks(
  blocks: EmailBlock[],
  layoutSlug: string,
  variables: Record<string, string | undefined>,
  options: RenderOptions = {}
): Promise<RenderedEmail | null> {
  const brandKit = await fetchBrandKit();

  // Resolve layout by slug, fall back to default
  const { fetchLayoutBySlug } = await import('./template-resolver');
  let layout = await fetchLayoutBySlug(layoutSlug);
  if (!layout) {
    layout = await fetchDefaultLayout();
  }
  if (!layout) return null;

  return renderEmail(blocks, layout, brandKit, variables, options);
}
