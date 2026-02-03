import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireWebhook } from '@/lib/utils/webhook';
import { BUSINESS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const method: 'email' | 'sms' | 'both' = body.method || 'both';

    const supabase = createAdminClient();

    // Fetch the quote with customer info
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

    // Build the public quote link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const quoteLink = `${appUrl}/quote/${quote.access_token}`;

    // Update status to 'sent' and set sent_at
    const { data: updated, error: updateErr } = await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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

            const textBody = `Estimate from ${BUSINESS.NAME}
${BUSINESS.ADDRESS}

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

This estimate is valid for 30 days. If you have any questions, please call us at ${BUSINESS.PHONE}.

Thank you for choosing ${BUSINESS.NAME}!`;

            const formData = new URLSearchParams();
            formData.append('from', `${BUSINESS.NAME} <quotes@${mailgunDomain}>`);
            formData.append('to', customer.email);
            formData.append(
              'subject',
              `Estimate ${quote.quote_number} from ${BUSINESS.NAME}`
            );
            formData.append('text', textBody);

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
            } else {
              sentVia.push('email');
            }
          } catch (emailErr) {
            console.error('Email send error:', emailErr);
            errors.push('Failed to send email');
          }
        }
      }
    }

    // --- Send via SMS (Twilio MMS) ---
    if (shouldSms) {
      if (!customer?.phone) {
        errors.push('Customer has no phone number');
      } else {
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

        if (!twilioSid || !twilioAuth || !twilioFrom) {
          errors.push('SMS service (Twilio) not configured');
        } else {
          try {
            const pdfUrl = `${appUrl}/api/quotes/${id}/pdf?token=${quote.access_token}`;

            const smsBody =
              `Estimate ${quote.quote_number} from ${BUSINESS.NAME}\n` +
              `Total: ${formatCurrency(quote.total_amount)}\n\n` +
              `View online: ${quoteLink}`;

            const formData = new URLSearchParams();
            formData.append('From', twilioFrom);
            formData.append('To', customer.phone);
            formData.append('Body', smsBody);
            formData.append('MediaUrl', pdfUrl);

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
            } else {
              sentVia.push('sms');
            }
          } catch (smsErr) {
            console.error('SMS send error:', smsErr);
            errors.push('Failed to send SMS');
          }
        }
      }
    }

    // Fire webhook with quote data + link (actual automation handled by n8n)
    fireWebhook('quote_sent', { ...quote, link: quoteLink }, supabase).catch(() => {});

    return NextResponse.json({
      success: true,
      link: quoteLink,
      sent_via: sentVia,
      ...(errors.length > 0 ? { errors } : {}),
      quote: updated,
    });
  } catch (err) {
    console.error('Quote send error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
