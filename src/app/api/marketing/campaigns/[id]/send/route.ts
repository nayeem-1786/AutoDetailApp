import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildAudienceQuery } from '@/lib/utils/audience';
import { renderTemplate } from '@/lib/utils/template';
import { sendMarketingSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { fireWebhook } from '@/lib/utils/webhook';
import { getBusinessInfo } from '@/lib/data/business';
import { splitRecipients } from '@/lib/campaigns/ab-testing';
import type { CampaignChannel, CampaignVariant } from '@/lib/supabase/types';
import crypto from 'crypto';

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

    const businessInfo = await getBusinessInfo();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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

    // --- A/B Testing: check for variants ---
    const { data: variants } = await adminClient
      .from('campaign_variants')
      .select('*')
      .eq('campaign_id', id)
      .order('variant_label');

    const isABTest = variants && variants.length > 0;

    // Build customer → variant assignment map for A/B tests
    let customerVariantMap: Map<string, CampaignVariant> | null = null;
    if (isABTest) {
      const recipientAssignments = splitRecipients(
        customerIds.map(cid => ({ customerId: cid })),
        variants.map(v => ({ id: v.id, splitPercentage: v.split_percentage }))
      );

      // Reverse the map: variantId → customerIds[] → customerId → variant
      customerVariantMap = new Map();
      for (const variant of variants) {
        const assignedCustomerIds = recipientAssignments.get(variant.id) ?? [];
        for (const cid of assignedCustomerIds) {
          customerVariantMap.set(cid, variant as CampaignVariant);
        }
      }

      console.log(
        `[Campaign ${id}] A/B test with ${variants.length} variants:`,
        variants.map(v => `${v.variant_label} (${v.split_percentage}%)`).join(', ')
      );
    }

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

    // Look up target service slug for book-now deep link
    let serviceSlug: string | null = null;
    if (couponTemplate?.coupon_rewards?.length > 0) {
      const targetServiceId = couponTemplate.coupon_rewards[0].target_service_id;
      if (targetServiceId) {
        const { data: svc } = await adminClient
          .from('services').select('slug').eq('id', targetServiceId).single();
        serviceSlug = svc?.slug ?? null;
      }
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

      // Build book-now deep link with service, coupon & email
      const bookNowParams = new URLSearchParams();
      if (serviceSlug) bookNowParams.set('service', serviceSlug);
      if (couponCode) bookNowParams.set('coupon', couponCode);
      if (customer.email) bookNowParams.set('email', customer.email);
      const bookNowUrl = `${appUrl}/book${bookNowParams.toString() ? '?' + bookNowParams.toString() : ''}`;

      // Build personalized booking link with customer info pre-filled
      const bookUrlParams = new URLSearchParams();
      const fullName = `${customer.first_name} ${customer.last_name}`.trim();
      if (fullName) bookUrlParams.set('name', fullName);
      if (customer.phone) bookUrlParams.set('phone', customer.phone);
      if (customer.email) bookUrlParams.set('email', customer.email);
      if (couponCode) bookUrlParams.set('coupon', couponCode);
      const bookUrl = `${appUrl}/book${bookUrlParams.toString() ? '?' + bookUrlParams.toString() : ''}`;

      const templateVars: Record<string, string> = {
        first_name: customer.first_name,
        last_name: customer.last_name,
        coupon_code: couponCode,
        business_name: businessInfo.name,
        booking_url: `${appUrl}/book`,
        book_url: bookUrl,
        book_now_url: bookNowUrl,
      };

      // Resolve message templates: use variant overrides for A/B tests
      const variant = customerVariantMap?.get(customer.id) ?? null;
      const smsTemplate = variant?.message_body ?? campaign.sms_template;
      const emailSubjectTemplate = variant?.email_subject ?? campaign.email_subject;
      const emailBodyTemplate = variant?.message_body ?? campaign.email_template;

      let smsDelivered = false;
      let emailDelivered = false;
      let mailgunMessageId: string | null = null;

      // Pre-generate recipient ID so we can pass it to Mailgun as a custom variable
      const recipientId = crypto.randomUUID();

      // Send SMS
      if (
        (campaign.channel === 'sms' || campaign.channel === 'both') &&
        customer.sms_consent &&
        customer.phone &&
        smsTemplate
      ) {
        const smsBody = renderTemplate(smsTemplate, templateVars);
        const result = await sendMarketingSms(customer.phone, smsBody, customer.id, {
          campaignId: id,
          variantId: variant?.id ?? undefined,
          source: 'campaign',
        });
        smsDelivered = result.success;
      }

      // Send email
      if (
        (campaign.channel === 'email' || campaign.channel === 'both') &&
        customer.email_consent &&
        customer.email &&
        emailSubjectTemplate &&
        emailBodyTemplate
      ) {
        const emailSubject = renderTemplate(emailSubjectTemplate, templateVars);
        const emailBody = renderTemplate(emailBodyTemplate, templateVars);
        const bodyParagraphs = emailBody.split('\n').map((p: string) => `<p>${p}</p>`).join('');
        const ctaButton = `<div style="text-align:center;margin:24px 0;"><a href="${bookNowUrl}" style="display:inline-block;padding:14px 32px;background-color:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Book Now</a></div>`;
        const emailHtml = `<html><body>${bodyParagraphs}${ctaButton}</body></html>`;
        const result = await sendEmail(customer.email, emailSubject, emailBody, emailHtml, {
          variables: { campaign_id: id, recipient_id: recipientId },
          tracking: true,
        });
        emailDelivered = result.success;
        if (result.success) {
          mailgunMessageId = result.id;
        }
      }

      const delivered = smsDelivered || emailDelivered;
      if (delivered) deliveredCount++;

      // Record recipient with pre-generated ID + variant assignment
      await adminClient.from('campaign_recipients').insert({
        id: recipientId,
        campaign_id: id,
        customer_id: customer.id,
        channel: campaign.channel,
        coupon_code: couponCode || null,
        delivered,
        mailgun_message_id: mailgunMessageId,
        variant_id: variant?.id ?? null,
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

    // Log A/B auto-select-winner info for future cron processing
    if (isABTest && campaign.auto_select_winner) {
      console.log(
        `[Campaign ${id}] A/B test sent — auto_select_winner enabled` +
        (campaign.auto_select_after_hours
          ? `, winner selection in ${campaign.auto_select_after_hours}h`
          : '')
      );
      // TODO: Schedule winner determination via cron or delayed job.
      // For now, winner can be determined manually via determineWinner(campaignId)
      // or via a future cron that checks campaigns with auto_select_winner=true
      // and sent_at + auto_select_after_hours < now().
    }

    // Fire webhook
    fireWebhook('campaign_send', {
      campaign_id: id,
      name: campaign.name,
      channel: campaign.channel,
      recipient_count: customers?.length ?? 0,
      delivered_count: deliveredCount,
      is_ab_test: isABTest,
    });

    return NextResponse.json({
      data: {
        status: 'sent',
        recipient_count: customers?.length ?? 0,
        delivered_count: deliveredCount,
        is_ab_test: isABTest,
        variant_count: isABTest ? variants!.length : 0,
      },
    });
  } catch (err) {
    console.error('Send campaign error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
