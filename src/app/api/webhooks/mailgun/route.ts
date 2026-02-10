// Mailgun Webhook Setup:
// 1. Go to Mailgun Dashboard -> Sending -> Webhooks
// 2. Add webhook URL: ${APP_URL}/api/webhooks/mailgun
// 3. Select events: Delivered, Permanent Failure, Clicked, Complained, Unsubscribed
// 4. Copy the Signing Key to MAILGUN_WEBHOOK_SIGNING_KEY env var

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyMailgunWebhook } from '@/lib/utils/mailgun-signature';
import { updateEmailConsent } from '@/lib/utils/email-consent';

/** Map Mailgun event names to our canonical event types */
function normalizeEvent(event: string): string {
  switch (event) {
    case 'delivered':
      return 'delivered';
    case 'failed':
    case 'permanent_fail':
      return 'failed';
    case 'bounced':
      return 'bounced';
    case 'clicked':
      return 'clicked';
    case 'complained':
      return 'complained';
    case 'unsubscribed':
      return 'unsubscribed';
    default:
      return event;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ---------------------------------------------------------------
    // Signature verification (skip in development for testing)
    // ---------------------------------------------------------------
    const sig = body.signature;
    if (!sig?.timestamp || !sig?.token || !sig?.signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const skipSignatureValidation = process.env.NODE_ENV === 'development';

    if (!skipSignatureValidation) {
      const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
      if (!signingKey) {
        console.error('[EMAIL_DELIVERY] MAILGUN_WEBHOOK_SIGNING_KEY not set');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
      }

      if (!verifyMailgunWebhook(signingKey, sig.timestamp, sig.token, sig.signature)) {
        console.error('[EMAIL_DELIVERY] Invalid Mailgun webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }

    // ---------------------------------------------------------------
    // Parse event data
    // ---------------------------------------------------------------
    const eventData = body['event-data'];
    if (!eventData) {
      return NextResponse.json({ message: 'No event data' }, { status: 200 });
    }

    const rawEvent = eventData.event;
    const event = normalizeEvent(rawEvent);
    const recipient = eventData.recipient || '';
    const headers = eventData.message?.headers || {};
    const messageId = headers['message-id'] || eventData.message?.headers?.['Message-Id'] || null;
    const fromEmail = headers.from || headers.From || '';
    const subject = headers.subject || headers.Subject || null;
    const clickUrl = event === 'clicked' ? (eventData.url || null) : null;

    // Extract error info for failed/bounced events
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    if (event === 'failed' || event === 'bounced') {
      const deliveryStatus = eventData['delivery-status'] || {};
      errorCode = deliveryStatus.code ? String(deliveryStatus.code) : null;
      errorMessage = deliveryStatus.message || deliveryStatus.description || null;
    }

    // Extract campaign_id from custom headers or user variables
    const userVars = eventData['user-variables'] || {};
    const campaignId =
      headers['X-Campaign-Id'] ||
      userVars.campaign_id ||
      null;
    const recipientId = userVars.recipient_id || null;

    // ---------------------------------------------------------------
    // Database operations
    // ---------------------------------------------------------------
    const admin = createAdminClient();

    // Look up customer by email
    let customerId: string | null = null;
    if (recipient) {
      const { data: customer } = await admin
        .from('customers')
        .select('id')
        .eq('email', recipient.toLowerCase())
        .limit(1)
        .single();

      if (customer) {
        customerId = customer.id;
      }
    }

    // Handle unsubscribed/complained events: revoke email consent
    if ((event === 'unsubscribed' || event === 'complained') && customerId) {
      await updateEmailConsent(customerId, false, 'mailgun_webhook');
      console.log(`[EMAIL_DELIVERY] ${event}: customer=${customerId} email=${recipient} — email consent revoked`);
    }

    // Insert into email_delivery_log
    const { error: insertError } = await admin
      .from('email_delivery_log')
      .insert({
        mailgun_message_id: messageId,
        to_email: recipient,
        from_email: fromEmail,
        subject,
        event,
        campaign_id: campaignId || null,
        customer_id: customerId,
        error_code: errorCode,
        error_message: errorMessage,
        click_url: clickUrl,
      });

    if (insertError) {
      console.error('[EMAIL_DELIVERY] Failed to insert log:', insertError);
    }

    console.log(
      `[EMAIL_DELIVERY] event=${event} to=${recipient} campaignId=${campaignId || 'none'} customerId=${customerId || 'unknown'}`
    );

    // ---------------------------------------------------------------
    // Update campaign_recipients tracking (opened/clicked events)
    // This preserves the existing campaign analytics functionality
    // ---------------------------------------------------------------
    if (campaignId && recipientId && (rawEvent === 'opened' || rawEvent === 'clicked')) {
      const { data: campaignRecipient } = await admin
        .from('campaign_recipients')
        .select('id, opened_at, clicked_at')
        .eq('id', recipientId)
        .eq('campaign_id', campaignId)
        .single();

      if (campaignRecipient) {
        const now = new Date().toISOString();

        if (rawEvent === 'opened' && !campaignRecipient.opened_at) {
          await admin
            .from('campaign_recipients')
            .update({ opened_at: now })
            .eq('id', recipientId);

          // Increment campaign opened_count
          const { data: campaign } = await admin
            .from('campaigns')
            .select('opened_count')
            .eq('id', campaignId)
            .single();

          if (campaign) {
            await admin
              .from('campaigns')
              .update({ opened_count: (campaign.opened_count || 0) + 1 })
              .eq('id', campaignId);
          }
        }

        if (rawEvent === 'clicked' && !campaignRecipient.clicked_at) {
          await admin
            .from('campaign_recipients')
            .update({ clicked_at: now })
            .eq('id', recipientId);

          // Increment campaign clicked_count
          const { data: campaign } = await admin
            .from('campaigns')
            .select('clicked_count')
            .eq('id', campaignId)
            .single();

          if (campaign) {
            await admin
              .from('campaigns')
              .update({ clicked_count: (campaign.clicked_count || 0) + 1 })
              .eq('id', campaignId);
          }
        }
      }
    }

    return NextResponse.json({ message: 'OK' }, { status: 200 });
  } catch (err) {
    console.error('[EMAIL_DELIVERY] Mailgun webhook error:', err);
    // Always return 200 to prevent Mailgun from retrying on application errors
    return NextResponse.json({ message: 'OK' }, { status: 200 });
  }
}
