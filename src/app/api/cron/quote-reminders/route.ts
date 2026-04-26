import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMarketingSms } from '@/lib/utils/sms';
import { createShortLink } from '@/lib/utils/short-link';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';
import { findOrCreateConversation } from '@/lib/utils/conversation-helpers';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';

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

  // Find quotes that were sent 24+ hours ago, never viewed, not deleted.
  // Session 2C: SELECT expanded with quote_number/total_amount/valid_until/sent_at
  // and joined vehicle + quote_items. None of these are consumed by today's
  // {first_name, short_url} chip pass — they're loaded into local scope so
  // Session 2F (potential quote_reminder/quote_viewed_followup contract
  // expansion) and Session 3D (voice-info-quote chip-driven migration) have
  // the data available without per-callsite round-trips.
  // Note: validity_days is NOT a column on quotes; valid_until (TIMESTAMPTZ)
  // is the per-quote source of truth. business_settings.quote_validity_days
  // holds the global default and is not needed at render time.
  const { data: quotes, error: queryError } = await admin
    .from('quotes')
    .select(`
      id,
      access_token,
      customer_id,
      quote_number,
      total_amount,
      valid_until,
      sent_at,
      customer:customers!inner(id, first_name, last_name, email, phone, sms_consent),
      vehicle:vehicles(year, make, model),
      items:quote_items(item_name)
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

    const customer = quote.customer as unknown as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; sms_consent: boolean };
    if (!customer?.phone || !customer.sms_consent || !quote.access_token) continue;

    // Session 2C: locals composed for Session 2F / 3D chip-wiring.
    // Chip pass to renderSmsTemplate below is unchanged (still {first_name, short_url}).
    const vehicle = quote.vehicle as unknown as { year: number | null; make: string | null; model: string | null } | null;
    const vehicleDescription = vehicle ? cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model }) || undefined : undefined;
    const items = quote.items as unknown as { item_name: string }[] | null;
    const servicesList = (items ?? []).map((i) => i.item_name).filter(Boolean).join(', ') || undefined;

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const shortUrl = await createShortLink(`${appUrl}/quote/${quote.access_token}`);

      const firstName = customer.first_name || 'there';
      const fallbackMsg = `Hey ${firstName}! Just checking if you had a chance to look at your quote: ${shortUrl}`;
      const rendered = await renderSmsTemplate('quote_reminder', {
        first_name: firstName,
        short_url: shortUrl,
      }, fallbackMsg);
      void vehicleDescription; void servicesList; // Loaded for 2F / 3D; unused at this callsite today.

      if (!rendered.isActive) continue;
      const message = rendered.body;

      const result = await sendMarketingSms(customer.phone, message, quote.customer_id);

      // Log in quote_communications (includes "reminder" in message for dedup)
      await admin.from('quote_communications').insert({
        quote_id: quote.id,
        channel: 'sms',
        sent_to: customer.phone,
        status: result.success ? 'sent' : 'failed',
        error_message: result.success ? null : result.error,
        message: `[reminder] ${message}`,
      });

      // Log to conversation thread for AI reply context
      if (result.success) {
        try {
          const convId = await findOrCreateConversation(admin, customer.phone, quote.customer_id);
          if (convId) {
            await admin.from('messages').insert({
              conversation_id: convId,
              direction: 'outbound',
              body: message,
              sender_type: 'system',
              status: 'sent',
              channel: 'sms',
              metadata: { notificationType: 'quote_reminder', contextId: quote.id },
            });
            await admin.from('conversations').update({
              last_message_at: new Date().toISOString(),
              last_message_preview: message.substring(0, 200),
              last_notification_type: 'quote_reminder',
              last_notification_at: new Date().toISOString(),
            }).eq('id', convId);
          }
        } catch (logErr) {
          console.error(`[QuoteReminder] Conversation log failed for quote ${quote.id}:`, logErr);
        }
      }

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

  // ── Phase 2: Viewed-but-not-accepted follow-up (48h after view) ──────────
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Session 2C: same SELECT expansion as the L29 query — see comment there.
  const { data: viewedQuotes, error: viewedError } = await admin
    .from('quotes')
    .select(`
      id,
      access_token,
      customer_id,
      quote_number,
      total_amount,
      valid_until,
      sent_at,
      customer:customers!inner(id, first_name, last_name, email, phone, sms_consent),
      vehicle:vehicles(year, make, model),
      items:quote_items(item_name)
    `)
    .eq('status', 'viewed')
    .lt('viewed_at', fortyEightHoursAgo)
    .is('deleted_at', null);

  if (viewedError) {
    console.error('Viewed-quote follow-up query error:', viewedError);
    return NextResponse.json({ sent, errors, viewed_sent: 0, viewed_errors: 0 });
  }

  let viewedSent = 0;
  let viewedErrors = 0;

  if (viewedQuotes && viewedQuotes.length > 0) {
    // Dedup: check for existing viewed-followup communications
    const viewedIds = viewedQuotes.map((q) => q.id);
    const { data: existingFollowups } = await admin
      .from('quote_communications')
      .select('quote_id')
      .in('quote_id', viewedIds)
      .eq('channel', 'sms')
      .ilike('message', '%viewed-followup%');

    const alreadyFollowedUp = new Set(existingFollowups?.map((r) => r.quote_id) || []);

    for (const quote of viewedQuotes) {
      if (alreadyFollowedUp.has(quote.id)) continue;

      const customer = quote.customer as unknown as { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; sms_consent: boolean };
      if (!customer?.phone || !customer.sms_consent || !quote.access_token) continue;

      // Session 2C: locals composed for Session 2F / 3D chip-wiring.
      // Chip pass to renderSmsTemplate below is unchanged (still {first_name, short_url}).
      const vehicle = quote.vehicle as unknown as { year: number | null; make: string | null; model: string | null } | null;
      const vehicleDescription = vehicle ? cleanVehicleDescription({ year: vehicle.year, make: vehicle.make, model: vehicle.model }) || undefined : undefined;
      const items = quote.items as unknown as { item_name: string }[] | null;
      const servicesList = (items ?? []).map((i) => i.item_name).filter(Boolean).join(', ') || undefined;

      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const shortUrl = await createShortLink(`${appUrl}/quote/${quote.access_token}`);

        const firstName = customer.first_name || 'there';
        const fallbackMsg = `Hi ${firstName}! You checked out your estimate — ready to book? Any questions, just reply here or call us. ${shortUrl}`;
        const rendered = await renderSmsTemplate('quote_viewed_followup', {
          first_name: firstName,
          short_url: shortUrl,
        }, fallbackMsg);
        void vehicleDescription; void servicesList; // Loaded for 2F / 3D; unused at this callsite today.

        if (!rendered.isActive) continue;
        const message = rendered.body;

        const result = await sendMarketingSms(customer.phone, message, quote.customer_id);

        await admin.from('quote_communications').insert({
          quote_id: quote.id,
          channel: 'sms',
          sent_to: customer.phone,
          status: result.success ? 'sent' : 'failed',
          error_message: result.success ? null : result.error,
          message: `[viewed-followup] ${message}`,
        });

        // Log to conversation thread for AI reply context
        if (result.success) {
          try {
            const convId = await findOrCreateConversation(admin, customer.phone, quote.customer_id);
            if (convId) {
              await admin.from('messages').insert({
                conversation_id: convId,
                direction: 'outbound',
                body: message,
                sender_type: 'system',
                status: 'sent',
                channel: 'sms',
                metadata: { notificationType: 'quote_viewed_followup', contextId: quote.id },
              });
              await admin.from('conversations').update({
                last_message_at: new Date().toISOString(),
                last_message_preview: message.substring(0, 200),
                last_notification_type: 'quote_viewed_followup',
                last_notification_at: new Date().toISOString(),
              }).eq('id', convId);
            }
          } catch (logErr) {
            console.error(`[QuoteReminder] Conversation log failed for viewed-followup ${quote.id}:`, logErr);
          }
        }

        if (result.success) viewedSent++;
        else viewedErrors++;
      } catch (err) {
        console.error(`Failed to send viewed-followup for quote ${quote.id}:`, err);
        viewedErrors++;
      }
    }
  }

  return NextResponse.json({ sent, errors, viewed_sent: viewedSent, viewed_errors: viewedErrors });
}
