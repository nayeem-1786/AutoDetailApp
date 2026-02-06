import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildAudienceQuery } from '@/lib/utils/audience';
import { renderTemplate } from '@/lib/utils/template';
import { sendMarketingSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { fireWebhook } from '@/lib/utils/webhook';
import { getBusinessInfo } from '@/lib/data/business';
import { SITE_URL } from '@/lib/utils/constants';
import type { CampaignChannel } from '@/lib/supabase/types';
import crypto from 'crypto';

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Process scheduled campaigns that are due.
 * Trigger this via cron (Vercel Cron, n8n, or any scheduler).
 *
 * Authorization: Bearer <CRON_SECRET> or admin session.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: accept either CRON_SECRET or admin session
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Authorized via cron secret
    } else {
      // Fall back to admin session auth
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
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
    }

    const adminClient = createAdminClient();
    const businessInfo = await getBusinessInfo();

    // Find all scheduled campaigns that are due
    const { data: campaigns, error: queryError } = await adminClient
      .from('campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString());

    if (queryError) throw queryError;
    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ data: { processed: 0 } });
    }

    const results = [];

    for (const campaign of campaigns) {
      // Mark as sending
      await adminClient
        .from('campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id);

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

        if (couponTemplate && couponCode) {
          const { data: newCoupon } = await adminClient.from('coupons').insert({
            code: couponCode,
            name: couponTemplate.name,
            auto_apply: false,
            min_purchase: couponTemplate.min_purchase,
            is_single_use: true,
            max_uses: 1,
            expires_at: couponTemplate.expires_at,
            campaign_id: campaign.id,
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
        const bookNowUrl = `${SITE_URL}/book${bookNowParams.toString() ? '?' + bookNowParams.toString() : ''}`;

        const templateVars: Record<string, string> = {
          first_name: customer.first_name,
          last_name: customer.last_name,
          coupon_code: couponCode,
          business_name: businessInfo.name,
          booking_url: `${SITE_URL}/book`,
          book_now_url: bookNowUrl,
        };

        let smsDelivered = false;
        let emailDelivered = false;
        let mailgunMessageId: string | null = null;

        // Pre-generate recipient ID so we can pass it to Mailgun as a custom variable
        const recipientId = crypto.randomUUID();

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

        if (
          (campaign.channel === 'email' || campaign.channel === 'both') &&
          customer.email_consent &&
          customer.email &&
          campaign.email_subject &&
          campaign.email_template
        ) {
          const subj = renderTemplate(campaign.email_subject, templateVars);
          const emailBody = renderTemplate(campaign.email_template, templateVars);
          const bodyParagraphs = emailBody.split('\n').map((p: string) => `<p>${p}</p>`).join('');
          const ctaButton = `<div style="text-align:center;margin:24px 0;"><a href="${bookNowUrl}" style="display:inline-block;padding:14px 32px;background-color:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:16px;">Book Now</a></div>`;
          const emailHtml = `<html><body>${bodyParagraphs}${ctaButton}</body></html>`;
          const result = await sendEmail(customer.email, subj, emailBody, emailHtml, {
            variables: { campaign_id: campaign.id, recipient_id: recipientId },
            tracking: true,
          });
          emailDelivered = result.success;
          if (result.success) {
            mailgunMessageId = result.id;
          }
        }

        const delivered = smsDelivered || emailDelivered;
        if (delivered) deliveredCount++;

        await adminClient.from('campaign_recipients').insert({
          id: recipientId,
          campaign_id: campaign.id,
          customer_id: customer.id,
          channel: campaign.channel,
          coupon_code: couponCode || null,
          delivered,
          mailgun_message_id: mailgunMessageId,
          sent_at: new Date().toISOString(),
        });
      }

      await adminClient
        .from('campaigns')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          recipient_count: customers?.length ?? 0,
          delivered_count: deliveredCount,
        })
        .eq('id', campaign.id);

      fireWebhook('campaign_send', {
        campaign_id: campaign.id,
        name: campaign.name,
        channel: campaign.channel,
        recipient_count: customers?.length ?? 0,
        delivered_count: deliveredCount,
      });

      results.push({
        campaign_id: campaign.id,
        name: campaign.name,
        recipient_count: customers?.length ?? 0,
        delivered_count: deliveredCount,
      });
    }

    return NextResponse.json({ data: { processed: results.length, campaigns: results } });
  } catch (err) {
    console.error('Process scheduled campaigns error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
