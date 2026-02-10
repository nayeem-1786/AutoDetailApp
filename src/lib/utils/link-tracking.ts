import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

interface TrackedLinkOptions {
  customerId?: string;
  campaignId?: string;
  lifecycleExecutionId?: string;
  source: string;
}

/**
 * Create a tracked short link that records clicks.
 * Returns a URL like `${APP_URL}/api/t/{shortCode}`.
 */
export async function createTrackedLink(
  originalUrl: string,
  opts: TrackedLinkOptions
): Promise<string> {
  const supabase = createAdminClient();
  const shortCode = crypto.randomBytes(3).toString('hex'); // 6-char hex code

  const { error } = await supabase.from('tracked_links').insert({
    short_code: shortCode,
    original_url: originalUrl,
    customer_id: opts.customerId || null,
    campaign_id: opts.campaignId || null,
    lifecycle_execution_id: opts.lifecycleExecutionId || null,
    source: opts.source,
  });

  if (error) {
    console.error('[LinkTracking] Failed to create tracked link:', error);
    // Fall back to original URL if tracking insert fails
    return originalUrl;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return `${appUrl}/api/t/${shortCode}`;
}

/**
 * Replace all URLs in a message body with tracked short links.
 * Skips URLs that are already tracked (our own /api/t/ URLs).
 */
export async function wrapUrlsInMessage(
  messageBody: string,
  opts: TrackedLinkOptions
): Promise<string> {
  // Find all http/https URLs in the message
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = messageBody.match(urlRegex);

  if (!urls) return messageBody;

  let wrappedBody = messageBody;

  for (const url of urls) {
    // Skip URLs that are already tracked (our own tracking URLs)
    if (url.includes('/api/t/')) continue;

    const trackedUrl = await createTrackedLink(url, opts);
    wrappedBody = wrappedBody.replace(url, trackedUrl);
  }

  return wrappedBody;
}
