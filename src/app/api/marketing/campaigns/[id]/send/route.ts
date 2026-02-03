import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildAudienceQuery } from '@/lib/utils/audience';
import { renderTemplate } from '@/lib/utils/template';
import { sendMarketingSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { fireWebhook } from '@/lib/utils/webhook';
import { BUSINESS } from '@/lib/utils/constants';
import { SITE_URL } from '@/lib/utils/constants';
import type { CampaignChannel } from '@/lib/supabase/types';

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get campaign
    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      return NextResponse.json(
        { error: 'Campaign has already been sent or cancelled' },
        { status: 400 }
      );
    }

    // Check for scheduling
    const body = await request.json().catch(() => ({}));
    if (body.schedule_at) {
      await supabase
        .from('campaigns')
        .update({ status: 'scheduled', scheduled_at: body.schedule_at })
        .eq('id', id);
      return NextResponse.json({ data: { status: 'scheduled', scheduled_at: body.schedule_at } });
    }

    // Mark as sending
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', id);

    // Build audience
    const filters = campaign.audience_filters || {};
    const { customerIds } = await buildAudienceQuery(
      adminClient,
      filters,
      campaign.channel as CampaignChannel
    );

    // Get coupon template (with rewards) if attached
    let couponTemplate: any = null;
    if (campaign.coupon_id) {
      const { data: coupon } = await adminClient
        .from('coupons')
        .select('*, coupon_rewards(*)')
        .eq('id', campaign.coupon_id)
        .single();
      couponTemplate = coupon;
    }

    // Get customer details
    const { data: customers } = await adminClient
      .from('customers')
      .select('id, first_name, last_name, phone, email, sms_consent, email_consent')
      .in('id', customerIds.length > 0 ? customerIds : ['__none__']);

    let deliveredCount = 0;

    for (const customer of customers ?? []) {
      const couponCode = couponTemplate ? generateCouponCode() : '';

      // Create unique coupon for this recipient if needed
      if (couponTemplate && couponCode) {
        const { data: newCoupon } = await adminClient.from('coupons').insert({
          code: couponCode,
          name: couponTemplate.name,
          auto_apply: false,
          min_purchase: couponTemplate.min_purchase,
          is_single_use: true,
          max_uses: 1,
          expires_at: couponTemplate.expires_at,
          campaign_id: id,
          customer_id: customer.id,
          status: 'active',
        }).select().single();

        // Clone rewards from template coupon to new coupon
        if (newCoupon && couponTemplate.coupon_rewards) {
          const rewards = couponTemplate.coupon_rewards.map((r: any) => ({
            coupon_id: newCoupon.id,
            applies_to: r.applies_to,
            discount_type: r.discount_type,
            discount_value: r.discount_value,
            max_discount: r.max_discount,
            target_product_id: r.target_product_id,
            target_service_id: r.target_service_id,
            target_product_category_id: r.target_product_category_id,
            target_service_category_id: r.target_service_category_id,
          }));
          await adminClient.from('coupon_rewards').insert(rewards);
        }
      }

      const templateVars: Record<string, string> = {
        first_name: customer.first_name,
        last_name: customer.last_name,
        coupon_code: couponCode,
        business_name: BUSINESS.NAME,
        booking_url: `${SITE_URL}/booking`,
      };

      let smsDelivered = false;
      let emailDelivered = false;

      // Send SMS
      if (
        (campaign.channel === 'sms' || campaign.channel === 'both') &&
        customer.sms_consent &&
        customer.phone &&
        campaign.sms_template
      ) {
        const smsBody = renderTemplate(campaign.sms_template, templateVars);
        const result = await sendMarketingSms(customer.phone, smsBody);
        smsDelivered = result.success;
      }

      // Send email
      if (
        (campaign.channel === 'email' || campaign.channel === 'both') &&
        customer.email_consent &&
        customer.email &&
        campaign.email_subject &&
        campaign.email_template
      ) {
        const emailSubject = renderTemplate(campaign.email_subject, templateVars);
        const emailBody = renderTemplate(campaign.email_template, templateVars);
        const result = await sendEmail(customer.email, emailSubject, emailBody);
        emailDelivered = result.success;
      }

      const delivered = smsDelivered || emailDelivered;
      if (delivered) deliveredCount++;

      // Record recipient
      await adminClient.from('campaign_recipients').insert({
        campaign_id: id,
        customer_id: customer.id,
        channel: campaign.channel,
        coupon_code: couponCode || null,
        delivered,
        sent_at: new Date().toISOString(),
      });
    }

    // Update campaign stats
    await supabase
      .from('campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipient_count: customers?.length ?? 0,
        delivered_count: deliveredCount,
      })
      .eq('id', id);

    // Fire webhook
    fireWebhook('campaign_send', {
      campaign_id: id,
      name: campaign.name,
      channel: campaign.channel,
      recipient_count: customers?.length ?? 0,
      delivered_count: deliveredCount,
    });

    return NextResponse.json({
      data: {
        status: 'sent',
        recipient_count: customers?.length ?? 0,
        delivered_count: deliveredCount,
      },
    });
  } catch (err) {
    console.error('Send campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
