import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/utils/sms';
import { createShortLink } from '@/lib/utils/short-link';

/**
 * Quote follow-up reminder cron endpoint.
 *
 * Sends a one-time SMS reminder for quotes that were sent but never viewed
 * after 24 hours. Designed to be called on a schedule (e.g., every hour)
 * by an external scheduler or Vercel Cron with the API key in the
 * x-api-key header.
 *
 * Example: curl -H "x-api-key: YOUR_KEY" https://domain.com/api/cron/quote-reminders
 */
export async function GET(request: NextRequest) {
  // Authenticate via API key
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find quotes that were sent 24+ hours ago, never viewed, not deleted
  const { data: quotes, error: queryError } = await admin
    .from('quotes')
    .select(`
      id,
      access_token,
      customer_id,
      customer:customers!inner(first_name, phone)
    `)
    .eq('status', 'sent')
    .lt('sent_at', twentyFourHoursAgo)
    .is('viewed_at', null)
    .is('deleted_at', null);

  if (queryError) {
    console.error('Quote reminder query error:', queryError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!quotes || quotes.length === 0) {
    return NextResponse.json({ sent: 0, errors: 0 });
  }

  // Check which quotes already have a reminder sent
  const quoteIds = quotes.map((q) => q.id);
  const { data: existingReminders } = await admin
    .from('quote_communications')
    .select('quote_id')
    .in('quote_id', quoteIds)
    .eq('channel', 'sms')
    .ilike('message', '%reminder%');

  const alreadyReminded = new Set(existingReminders?.map((r) => r.quote_id) || []);

  let sent = 0;
  let errors = 0;

  for (const quote of quotes) {
    // Skip if reminder already sent
    if (alreadyReminded.has(quote.id)) continue;

    const customer = quote.customer as unknown as { first_name: string; phone: string | null };
    if (!customer?.phone || !quote.access_token) continue;

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const shortUrl = await createShortLink(`${appUrl}/quote/${quote.access_token}`);

      const firstName = customer.first_name || 'there';
      const message = `Hey ${firstName}! Just checking if you had a chance to look at your quote: ${shortUrl}`;

      const result = await sendSms(customer.phone, message);

      // Log in quote_communications (includes "reminder" in message for dedup)
      await admin.from('quote_communications').insert({
        quote_id: quote.id,
        channel: 'sms',
        sent_to: customer.phone,
        status: result.success ? 'sent' : 'failed',
        error_message: result.success ? null : result.error,
        message: `[reminder] ${message}`,
      });

      if (result.success) {
        sent++;
      } else {
        errors++;
      }
    } catch (err) {
      console.error(`Failed to send reminder for quote ${quote.id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({ sent, errors });
}
