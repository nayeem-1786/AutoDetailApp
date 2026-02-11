import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/utils/analytics-helpers';
import { getAttributedRevenue } from '@/lib/utils/attribution';
import { getVariantStats } from '@/lib/campaigns/ab-testing';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const { id } = await params;
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1');
    const perPage = parseInt(searchParams.get('per_page') || '25');
    const filter = searchParams.get('filter') || '';
    const sort = searchParams.get('sort') || 'sent_at';
    const order = searchParams.get('order') || 'desc';

    // ---- Campaign ----
    const { data: campaign, error: campErr } = await adminClient
      .from('campaigns')
      .select('id, name, channel, status, sent_at, sms_template, email_subject, recipient_count, delivered_count')
      .eq('id', id)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // ---- Recipients base query (for counts) ----
    const { data: allRecipients } = await adminClient
      .from('campaign_recipients')
      .select('id, customer_id, delivered, clicked_at, sent_at, variant_id, coupon_code')
      .eq('campaign_id', id);

    const recipients = allRecipients ?? [];
    const totalRecipients = recipients.length;
    const customerIds = recipients.map(r => r.customer_id).filter(Boolean);

    // ---- SMS delivery stats ----
    const { data: smsLogs } = await adminClient
      .from('sms_delivery_log')
      .select('customer_id, status')
      .eq('campaign_id', id);

    const smsDelivered = (smsLogs ?? []).filter(l => l.status === 'delivered').length;
    const smsFailed = (smsLogs ?? []).filter(l => l.status === 'failed' || l.status === 'undelivered').length;

    // ---- Email delivery stats ----
    const { data: emailLogs } = await adminClient
      .from('email_delivery_log')
      .select('customer_id, event')
      .eq('campaign_id', id);

    const emailDelivered = (emailLogs ?? []).filter(l => l.event === 'delivered').length;
    const emailFailed = (emailLogs ?? []).filter(l => l.event === 'failed' || l.event === 'permanent_fail').length;

    const totalDelivered = smsDelivered + emailDelivered;
    const totalFailed = smsFailed + emailFailed;
    const deliveryRate = totalRecipients > 0 ? Math.round((totalDelivered / totalRecipients) * 1000) / 10 : 0;

    // ---- Click stats ----
    const { data: clickRows } = await adminClient
      .from('link_clicks')
      .select('customer_id, clicked_at, short_code, original_url, ip_address, user_agent')
      .eq('campaign_id', id)
      .order('clicked_at', { ascending: false });

    const clicks = clickRows ?? [];
    const totalClicks = clicks.length;
    const uniqueClickCustomers = new Set(clicks.map(c => c.customer_id).filter(Boolean));
    const uniqueClicks = uniqueClickCustomers.size;
    const clickThroughRate = totalDelivered > 0 ? Math.round((uniqueClicks / totalDelivered) * 1000) / 10 : 0;

    // ---- Opt-out stats ----
    let totalOptedOut = 0;
    if (customerIds.length > 0 && campaign.sent_at) {
      const { count } = await adminClient
        .from('sms_consent_log')
        .select('id', { count: 'exact', head: true })
        .in('customer_id', customerIds)
        .eq('action', 'opt_out')
        .gte('created_at', campaign.sent_at);
      totalOptedOut = count ?? 0;
    }

    // ---- Attribution ----
    let attributedRevenue = 0;
    let attributedTransactions = 0;
    let attributedCustomers = 0;
    if (campaign.sent_at) {
      const periodEnd = new Date(
        new Date(campaign.sent_at).getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const attribution = await getAttributedRevenue({
        campaignId: id,
        periodStart: campaign.sent_at,
        periodEnd,
        windowDays: 7,
      });
      attributedRevenue = attribution.totalRevenue;
      attributedTransactions = attribution.transactionCount;
      attributedCustomers = attribution.uniqueCustomers;
    }

    // ---- Summary ----
    const summary = {
      totalRecipients,
      totalDelivered,
      totalFailed,
      deliveryRate,
      totalClicks,
      uniqueClicks,
      clickThroughRate,
      totalOptedOut,
      attributedRevenue,
      attributedTransactions,
      attributedCustomers,
    };

    // ---- Funnel ----
    const funnel = [
      { stage: 'sent', count: totalRecipients },
      { stage: 'delivered', count: totalDelivered },
      { stage: 'clicked', count: uniqueClicks },
      { stage: 'converted', count: attributedCustomers },
    ];

    // ---- Variants ----
    const variants = await getVariantStats(id);

    // ---- Click details ----
    // Group by URL
    const urlMap = new Map<string, { clicks: number; customers: Set<string> }>();
    for (const c of clicks) {
      const url = c.original_url;
      if (!urlMap.has(url)) urlMap.set(url, { clicks: 0, customers: new Set() });
      const entry = urlMap.get(url)!;
      entry.clicks++;
      if (c.customer_id) entry.customers.add(c.customer_id);
    }
    const byUrl = Array.from(urlMap.entries()).map(([url, data]) => ({
      url,
      clicks: data.clicks,
      uniqueClicks: data.customers.size,
    })).sort((a, b) => b.clicks - a.clicks);

    // Recent clicks — enrich with customer names
    const recentClicks = clicks.slice(0, 20);
    const recentCustomerIds = [...new Set(recentClicks.map(c => c.customer_id).filter(Boolean))];
    const customerNameMap = new Map<string, string>();
    if (recentCustomerIds.length > 0) {
      const { data: customers } = await adminClient
        .from('customers')
        .select('id, first_name, last_name')
        .in('id', recentCustomerIds);
      (customers ?? []).forEach((c: { id: string; first_name: string; last_name: string }) => {
        customerNameMap.set(c.id, `${c.first_name} ${c.last_name}`);
      });
    }
    const recentClickDetails = recentClicks.map(c => ({
      clickedAt: c.clicked_at,
      customerName: c.customer_id ? (customerNameMap.get(c.customer_id) ?? 'Unknown') : 'Unknown',
      url: c.original_url,
    }));

    const clickDetails = { byUrl, recent: recentClickDetails };

    // ---- Timeline (hourly for 72h after send) ----
    const timeline: { hour: number; deliveries: number; clicks: number }[] = [];
    if (campaign.sent_at) {
      const sentTime = new Date(campaign.sent_at).getTime();
      for (let h = 0; h < 72; h++) {
        const bucketStart = sentTime + h * 3600_000;
        const bucketEnd = bucketStart + 3600_000;

        const deliveries = (smsLogs ?? []).filter(l => {
          if (l.status !== 'delivered') return false;
          // sms_delivery_log doesn't have a precise delivered_at, use created_at via updated_at pattern
          // We approximate using the log existence within the campaign
          return true; // All deliveries counted in hour 0 since we don't have per-hour delivery timestamps
        }).length;

        const hourClicks = clicks.filter(c => {
          const t = new Date(c.clicked_at).getTime();
          return t >= bucketStart && t < bucketEnd;
        }).length;

        timeline.push({ hour: h, deliveries: h === 0 ? totalDelivered : 0, clicks: hourClicks });
      }
    }

    // ---- Paginated recipients ----
    // Build full recipient data for filtering, then paginate
    // Get customer info
    const allCustomerIds = [...new Set(recipients.map(r => r.customer_id).filter(Boolean))];
    const custMap = new Map<string, { first_name: string; last_name: string; phone: string | null; email: string | null }>();
    if (allCustomerIds.length > 0) {
      // Batch fetch
      for (let i = 0; i < allCustomerIds.length; i += 100) {
        const batch = allCustomerIds.slice(i, i + 100);
        const { data: custs } = await adminClient
          .from('customers')
          .select('id, first_name, last_name, phone, email')
          .in('id', batch);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (custs ?? []).forEach((c: any) => custMap.set(c.id, c));
      }
    }

    // Get delivery status per customer
    const smsStatusMap = new Map<string, string>();
    (smsLogs ?? []).forEach(l => { if (l.customer_id) smsStatusMap.set(l.customer_id, l.status); });
    const emailStatusMap = new Map<string, string>();
    (emailLogs ?? []).forEach(l => { if (l.customer_id) emailStatusMap.set(l.customer_id, l.event); });

    // Get click counts per customer
    const clickCountMap = new Map<string, number>();
    clicks.forEach(c => {
      if (c.customer_id) clickCountMap.set(c.customer_id, (clickCountMap.get(c.customer_id) ?? 0) + 1);
    });

    // Get opt-out customer IDs
    const optOutSet = new Set<string>();
    if (customerIds.length > 0 && campaign.sent_at) {
      const { data: optOuts } = await adminClient
        .from('sms_consent_log')
        .select('customer_id')
        .in('customer_id', customerIds)
        .eq('action', 'opt_out')
        .gte('created_at', campaign.sent_at);
      (optOuts ?? []).forEach(o => optOutSet.add(o.customer_id));
    }

    // Get converted customers (those with transactions in attribution window)
    const convertedSet = new Set<string>();
    const revenueMap = new Map<string, number>();
    if (campaign.sent_at && allCustomerIds.length > 0) {
      const sentMs = new Date(campaign.sent_at).getTime();
      const windowMs = 7 * 24 * 60 * 60 * 1000;
      for (let i = 0; i < allCustomerIds.length; i += 100) {
        const batch = allCustomerIds.slice(i, i + 100);
        const { data: txns } = await adminClient
          .from('transactions')
          .select('customer_id, total_amount, transaction_date')
          .in('customer_id', batch)
          .eq('status', 'completed');
        (txns ?? []).forEach((t: { customer_id: string | null; total_amount: number; transaction_date: string }) => {
          if (!t.customer_id) return;
          const txnTime = new Date(t.transaction_date).getTime();
          if (txnTime >= sentMs && txnTime <= sentMs + windowMs) {
            convertedSet.add(t.customer_id);
            revenueMap.set(t.customer_id, (revenueMap.get(t.customer_id) ?? 0) + Number(t.total_amount));
          }
        });
      }
    }

    // Get variant labels
    const variantLabelMap = new Map<string, string>();
    if (variants.length > 0) {
      variants.forEach(v => variantLabelMap.set(v.variantId, v.label));
    }

    // Build recipient rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recipientRows: any[] = recipients.map(r => {
      const cust = r.customer_id ? custMap.get(r.customer_id) : null;
      const deliveryStatus = r.customer_id
        ? (smsStatusMap.get(r.customer_id) ?? emailStatusMap.get(r.customer_id) ?? (r.delivered ? 'delivered' : 'pending'))
        : (r.delivered ? 'delivered' : 'pending');

      return {
        customerId: r.customer_id,
        firstName: cust?.first_name ?? '',
        lastName: cust?.last_name ?? '',
        phone: cust?.phone ?? null,
        email: cust?.email ?? null,
        variantLabel: r.variant_id ? (variantLabelMap.get(r.variant_id) ?? null) : null,
        deliveryStatus,
        clicked: !!r.clicked_at,
        clickCount: r.customer_id ? (clickCountMap.get(r.customer_id) ?? 0) : 0,
        optedOut: r.customer_id ? optOutSet.has(r.customer_id) : false,
        converted: r.customer_id ? convertedSet.has(r.customer_id) : false,
        revenueAttributed: r.customer_id ? (revenueMap.get(r.customer_id) ?? 0) : 0,
        sentAt: r.sent_at,
        couponCode: r.coupon_code,
      };
    });

    // Apply filter
    if (filter === 'clicked') {
      recipientRows = recipientRows.filter(r => r.clicked);
    } else if (filter === 'converted') {
      recipientRows = recipientRows.filter(r => r.converted);
    } else if (filter === 'failed') {
      recipientRows = recipientRows.filter(r => r.deliveryStatus === 'failed' || r.deliveryStatus === 'undelivered');
    } else if (filter === 'opted_out') {
      recipientRows = recipientRows.filter(r => r.optedOut);
    } else if (filter === 'delivered') {
      recipientRows = recipientRows.filter(r => r.deliveryStatus === 'delivered');
    }

    // Sort
    const sortAsc = order === 'asc';
    recipientRows.sort((a, b) => {
      let aVal: string | number | boolean;
      let bVal: string | number | boolean;
      switch (sort) {
        case 'name': aVal = `${a.firstName} ${a.lastName}`.toLowerCase(); bVal = `${b.firstName} ${b.lastName}`.toLowerCase(); break;
        case 'status': aVal = a.deliveryStatus; bVal = b.deliveryStatus; break;
        case 'clicked': aVal = a.clickCount; bVal = b.clickCount; break;
        case 'converted': aVal = a.converted ? 1 : 0; bVal = b.converted ? 1 : 0; break;
        case 'revenue': aVal = a.revenueAttributed; bVal = b.revenueAttributed; break;
        default: aVal = a.sentAt ?? ''; bVal = b.sentAt ?? '';
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

    const recipientTotal = recipientRows.length;
    const offset = (page - 1) * perPage;
    const paginatedRecipients = recipientRows.slice(offset, offset + perPage);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        status: campaign.status,
        sentAt: campaign.sent_at,
        smsTemplate: campaign.sms_template,
        emailSubject: campaign.email_subject,
      },
      summary,
      funnel,
      variants,
      clickDetails,
      timeline,
      recipients: {
        data: paginatedRecipients,
        total: recipientTotal,
        page,
        perPage,
      },
    });
  } catch (err) {
    console.error('Campaign analytics detail GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
