import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { getBusinessInfo } from '@/lib/data/business';
import { fireWebhook } from '@/lib/utils/webhook';
import { formatCurrency } from '@/lib/utils/format';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const method: 'email' | 'sms' | 'both' = body.method || 'both';

    const supabase = createAdminClient();
    const business = await getBusinessInfo();

    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email),
        vehicle:vehicles(id, year, make, model),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .single();

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.access_token) {
      return NextResponse.json({ error: 'Quote has no access token' }, { status: 400 });
    }

    const customer = quote.customer as {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    } | null;

    const items = (quote.items as {
      item_name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      tier_name: string | null;
    }[]) ?? [];

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const quoteLink = `${appUrl}/quote/${quote.access_token}`;
    const shortLink = `${appUrl}/q/${quote.access_token}`;

    // Update sent_at (and status to 'sent' only if currently draft)
    const updatePayload: Record<string, unknown> = {
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (quote.status === 'draft') {
      updatePayload.status = 'sent';
    }

    const { data: updated, error: updateErr } = await supabase
      .from('quotes')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('Error updating quote status:', updateErr.message);
      return NextResponse.json({ error: 'Failed to send quote' }, { status: 500 });
    }

    const sentVia: string[] = [];
    const errors: string[] = [];

    const shouldEmail = method === 'email' || method === 'both';
    const shouldSms = method === 'sms' || method === 'both';

    // --- Send via Email (Mailgun) ---
    if (shouldEmail) {
      if (!customer?.email) {
        errors.push('Customer has no email address');
      } else {
        const mailgunDomain = process.env.MAILGUN_DOMAIN;
        const mailgunKey = process.env.MAILGUN_API_KEY;

        if (!mailgunDomain || !mailgunKey) {
          errors.push('Email service (Mailgun) not configured');
        } else {
          try {
            const customerName = `${customer.first_name} ${customer.last_name}`;
            const vehicle = quote.vehicle as {
              id: string;
              year: number;
              make: string;
              model: string;
            } | null;
            const vehicleStr = vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : 'N/A';

            const itemLines = items
              .map(
                (i) =>
                  `  ${i.item_name}${i.tier_name ? ` (${i.tier_name})` : ''} x${i.quantity} — ${formatCurrency(i.total_price)}`
              )
              .join('\n');

            const textBody = `Estimate from ${business.name}
${business.address}

Estimate #${quote.quote_number}
Date: ${new Date(quote.created_at).toLocaleDateString()}
Customer: ${customerName}
Vehicle: ${vehicleStr}

Items:
${itemLines}

Subtotal: ${formatCurrency(quote.subtotal)}
Tax: ${formatCurrency(quote.tax_amount)}
Total: ${formatCurrency(quote.total_amount)}

View your estimate online:
${quoteLink}

This estimate is valid for 10 days. If you have any questions, please call us at ${business.phone}.

Thank you for choosing ${business.name}!`;

            const itemRowsHtml = items
              .map(
                (i) =>
                  `<tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">${i.item_name}${i.tier_name ? ` <span style="color: #6b7280;">(${i.tier_name})</span>` : ''}</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">${i.quantity}</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(i.total_price)}</td>
                  </tr>`
              )
              .join('');

            const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <div style="background-color: #1e3a5f; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${business.name}</h1>
        <p style="margin: 8px 0 0; color: #94a3b8; font-size: 14px;">${business.address}</p>
      </div>
      <div style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px; color: #1e3a5f; font-size: 20px;">Estimate ${quote.quote_number}</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Date: ${new Date(quote.created_at).toLocaleDateString()}</p>
        </div>
        <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px; font-size: 14px;"><strong>Customer:</strong> ${customerName}</p>
          <p style="margin: 0; font-size: 14px;"><strong>Vehicle:</strong> ${vehicleStr}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Item</th>
              <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Qty</th>
              <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
          </tbody>
        </table>
        <div style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-bottom: 32px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Subtotal</span>
            <span style="font-weight: 500;">${formatCurrency(quote.subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Tax</span>
            <span style="font-weight: 500;">${formatCurrency(quote.tax_amount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span style="font-size: 18px; font-weight: 600; color: #1e3a5f;">Total</span>
            <span style="font-size: 18px; font-weight: 700; color: #1e3a5f;">${formatCurrency(quote.total_amount)}</span>
          </div>
        </div>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${quoteLink}" style="display: inline-block; background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Your Estimate</a>
        </div>
        <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
          This estimate is valid for 10 days.<br>
          Questions? Call us at <a href="tel:${business.phone}" style="color: #1e3a5f;">${business.phone}</a>
        </p>
      </div>
      <div style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">Thank you for choosing ${business.name}!</p>
      </div>
    </div>
  </div>
</body>
</html>`;

            const formData = new URLSearchParams();
            formData.append('from', `${business.name} <quotes@${mailgunDomain}>`);
            formData.append('to', customer.email);
            formData.append(
              'subject',
              `Estimate ${quote.quote_number} from ${business.name}`
            );
            formData.append('text', textBody);
            formData.append('html', htmlBody);

            const mgRes = await fetch(
              `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
                },
                body: formData,
              }
            );

            if (!mgRes.ok) {
              const errText = await mgRes.text();
              console.error('Mailgun error:', errText);
              errors.push('Failed to send email');
              await supabase.from('quote_communications').insert({
                quote_id: id,
                channel: 'email',
                sent_to: customer.email,
                status: 'failed',
                error_message: 'Mailgun delivery failed',
              });
            } else {
              sentVia.push('email');
              await supabase.from('quote_communications').insert({
                quote_id: id,
                channel: 'email',
                sent_to: customer.email,
                status: 'sent',
              });
            }
          } catch (emailErr) {
            console.error('Email send error:', emailErr);
            errors.push('Failed to send email');
          }
        }
      }
    }

    // --- Send via SMS (Twilio) ---
    if (shouldSms) {
      if (!customer?.phone) {
        errors.push('Customer has no phone number');
      } else if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
        errors.push('SMS with PDF requires a public URL. Set NEXT_PUBLIC_APP_URL to your production domain.');
      } else {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

        if (!twilioSid || !twilioAuth || !twilioFrom) {
          errors.push('SMS service (Twilio) not configured');
        } else {
          try {
            const smsBody =
              `Estimate ${quote.quote_number} from ${business.name}\n` +
              `Total: ${formatCurrency(quote.total_amount)}\n\n` +
              `View Your Estimate: ${shortLink}`;

            const formData = new URLSearchParams();
            formData.append('From', twilioFrom);
            formData.append('To', customer.phone);
            formData.append('Body', smsBody);

            const isProductionUrl = !appUrl.includes('ngrok') && !appUrl.includes('localhost');
            if (isProductionUrl) {
              const pdfUrl = `${appUrl}/api/quotes/${id}/pdf?token=${quote.access_token}`;
              formData.append('MediaUrl', pdfUrl);
            }

            const twRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
              }
            );

            if (!twRes.ok) {
              const errText = await twRes.text();
              console.error('Twilio error:', errText);
              errors.push('Failed to send SMS');
              await supabase.from('quote_communications').insert({
                quote_id: id,
                channel: 'sms',
                sent_to: customer.phone,
                status: 'failed',
                error_message: 'Twilio delivery failed',
              });
            } else {
              sentVia.push('sms');
              await supabase.from('quote_communications').insert({
                quote_id: id,
                channel: 'sms',
                sent_to: customer.phone,
                status: 'sent',
              });
            }
          } catch (smsErr) {
            console.error('SMS send error:', smsErr);
            errors.push('Failed to send SMS');
          }
        }
      }
    }

    fireWebhook('quote_sent', { ...quote, link: quoteLink }, supabase).catch(() => {});

    return NextResponse.json({
      success: true,
      link: quoteLink,
      sent_via: sentVia,
      ...(errors.length > 0 ? { errors } : {}),
      quote: updated,
    });
  } catch (err) {
    console.error('POS Quote send error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
