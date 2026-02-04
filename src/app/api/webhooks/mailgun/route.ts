import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import crypto from 'crypto';

function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return false;

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(timestamp + token);
  const expected = hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const sig = body.signature;
    if (!sig?.timestamp || !sig?.token || !sig?.signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    if (!verifyMailgunSignature(sig.timestamp, sig.token, sig.signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const eventData = body['event-data'];
    if (!eventData) {
      return NextResponse.json({ message: 'No event data' }, { status: 200 });
    }

    const eventType = eventData.event;
    if (eventType !== 'opened' && eventType !== 'clicked') {
      return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
    }

    const userVars = eventData['user-variables'] || {};
    const campaignId = userVars.campaign_id;
    const recipientId = userVars.recipient_id;

    if (!campaignId || !recipientId) {
      return NextResponse.json({ message: 'No campaign tracking vars' }, { status: 200 });
    }

    const adminClient = createAdminClient();

    // Look up the recipient row
    const { data: recipient } = await adminClient
      .from('campaign_recipients')
      .select('id, opened_at, clicked_at')
      .eq('id', recipientId)
      .eq('campaign_id', campaignId)
      .single();

    if (!recipient) {
      return NextResponse.json({ message: 'Recipient not found' }, { status: 200 });
    }

    const now = new Date().toISOString();

    if (eventType === 'opened' && !recipient.opened_at) {
      await adminClient
        .from('campaign_recipients')
        .update({ opened_at: now })
        .eq('id', recipientId);

      // Increment campaign opened_count
      const { data: campaign } = await adminClient
        .from('campaigns')
        .select('opened_count')
        .eq('id', campaignId)
        .single();

      if (campaign) {
        await adminClient
          .from('campaigns')
          .update({ opened_count: (campaign.opened_count || 0) + 1 })
          .eq('id', campaignId);
      }
    }

    if (eventType === 'clicked' && !recipient.clicked_at) {
      await adminClient
        .from('campaign_recipients')
        .update({ clicked_at: now })
        .eq('id', recipientId);

      // Increment campaign clicked_count
      const { data: campaign } = await adminClient
        .from('campaigns')
        .select('clicked_count')
        .eq('id', campaignId)
        .single();

      if (campaign) {
        await adminClient
          .from('campaigns')
          .update({ clicked_count: (campaign.clicked_count || 0) + 1 })
          .eq('id', campaignId);
      }
    }

    return NextResponse.json({ message: 'OK' }, { status: 200 });
  } catch (err) {
    console.error('Mailgun webhook error:', err);
    return NextResponse.json({ message: 'OK' }, { status: 200 });
  }
}
