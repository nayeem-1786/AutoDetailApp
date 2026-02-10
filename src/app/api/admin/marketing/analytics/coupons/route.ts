import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin, getPeriodDates } from '@/lib/utils/analytics-helpers';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin();
    if ('error' in auth) return auth.error;
    const { adminClient } = auth;

    const period = request.nextUrl.searchParams.get('period') || '30d';
    const { start, end } = getPeriodDates(period);

    // Get all coupons that have been used in campaigns or are active
    const { data: coupons } = await adminClient
      .from('coupons')
      .select('id, code, name, campaign_id, use_count, created_at')
      .order('created_at', { ascending: false });

    if (!coupons || coupons.length === 0) {
      return NextResponse.json({ coupons: [] });
    }

    const results = [];

    for (const coupon of coupons) {
      // Distributed: count of campaign_recipients with this coupon code
      let distributed = 0;

      if (coupon.campaign_id) {
        // Count recipients for the campaign this coupon is attached to
        const { count: recipientCount } = await adminClient
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', coupon.campaign_id)
          .gte('sent_at', start)
          .lte('sent_at', end);

        distributed = recipientCount ?? 0;
      }

      // Also count coupons distributed via coupon_code on campaign_recipients
      if (coupon.code) {
        const { count: directDistributed } = await adminClient
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('coupon_code', coupon.code)
          .gte('sent_at', start)
          .lte('sent_at', end);

        distributed = Math.max(distributed, directDistributed ?? 0);
      }

      // Redeemed: transactions with this coupon_id in the period
      const { count: redeemed } = await adminClient
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('status', 'completed')
        .gte('transaction_date', start)
        .lte('transaction_date', end);

      const redeemedCount = redeemed ?? 0;

      // Revenue from orders using this coupon
      const { data: couponTxns } = await adminClient
        .from('transactions')
        .select('total_amount, discount_amount')
        .eq('coupon_id', coupon.id)
        .eq('status', 'completed')
        .gte('transaction_date', start)
        .lte('transaction_date', end);

      let revenueFromOrders = 0;
      let discountGiven = 0;
      if (couponTxns) {
        couponTxns.forEach((txn: { total_amount: number; discount_amount: number }) => {
          revenueFromOrders += Number(txn.total_amount) || 0;
          discountGiven += Number(txn.discount_amount) || 0;
        });
      }

      // Only include coupons that have some activity (distributed or redeemed)
      if (distributed > 0 || redeemedCount > 0 || coupon.use_count > 0) {
        const effectiveDistributed = Math.max(distributed, coupon.use_count + redeemedCount);
        results.push({
          id: coupon.id,
          code: coupon.code,
          name: coupon.name,
          distributed: effectiveDistributed,
          redeemed: redeemedCount,
          redemptionRate: effectiveDistributed > 0
            ? Math.round((redeemedCount / effectiveDistributed) * 10000) / 100
            : 0,
          discountGiven: Math.round(discountGiven * 100) / 100,
          revenueFromOrders: Math.round(revenueFromOrders * 100) / 100,
        });
      }
    }

    return NextResponse.json({ coupons: results });
  } catch (err) {
    console.error('Marketing coupon analytics GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
