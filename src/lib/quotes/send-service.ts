import { SupabaseClient } from '@supabase/supabase-js';
import { getBusinessInfo } from '@/lib/data/business';
import { fireWebhook } from '@/lib/utils/webhook';
import { formatCurrency } from '@/lib/utils/format';
import { createShortLink } from '@/lib/utils/short-link';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { sendTemplatedEmail } from '@/lib/email/send-templated-email';

interface QuoteCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface QuoteItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier_name: string | null;
}

interface QuoteVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
}

type SendQuoteResult =
  | { success: true; link: string; sent_via: string[]; errors?: string[]; quote: unknown }
  | { success: false; error: string; status: number };

async function getQuoteValidityDays(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', 'quote_validity_days')
    .maybeSingle();
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value);
      if (typeof parsed === 'number' && parsed > 0) return parsed;
    } catch { /* fallback */ }
  }
  return 10;
}

export async function sendQuote(
  supabase: SupabaseClient,
  quoteId: string,
  method: 'email' | 'sms' | 'both'
): Promise<SendQuoteResult> {
  const business = await getBusinessInfo();

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
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single();

  if (fetchErr || !quote) {
    return { success: false, error: 'Quote not found', status: 404 };
  }

  if (!quote.access_token) {
    return { success: false, error: 'Quote has no access token', status: 400 };
  }

  const customer = quote.customer as QuoteCustomer | null;
  const items = (quote.items as QuoteItem[]) ?? [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const quoteLink = `${appUrl}/quote/${quote.access_token}`;
  const validityDays = await getQuoteValidityDays(supabase);

  // Generate short link for SMS (falls back to full URL on failure)
  const shortLink = await createShortLink(`${appUrl}/quote/${quote.access_token}`);

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
    .eq('id', quoteId)
    .select('*')
    .single();

  if (updateErr) {
    console.error('Error updating quote status:', updateErr.message);
    return { success: false, error: 'Failed to send quote', status: 500 };
  }

  const sentVia: string[] = [];
  const errors: string[] = [];

  const shouldEmail = method === 'email' || method === 'both';
  const shouldSms = method === 'sms' || method === 'both';

  // --- Send via Email ---
  if (shouldEmail) {
    if (!customer?.email) {
      errors.push('Customer has no email address');
    } else {
      try {
        const customerName = `${customer.first_name} ${customer.last_name}`;
        const vehicle = quote.vehicle as QuoteVehicle | null;
        const vehicleStr = vehicle
          ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
          : 'N/A';

        // Pre-render items table for template variable
        const itemsTableHtml = buildItemsTableHtml(items);

        // Template-first
        const templated = await sendTemplatedEmail(customer.email, 'quote_sent', {
          first_name: customer.first_name,
          last_name: customer.last_name,
          customer_name: customerName,
          quote_number: quote.quote_number,
          quote_link: quoteLink,
          quote_subtotal: formatCurrency(quote.subtotal),
          quote_tax: formatCurrency(quote.tax_amount),
          quote_total: formatCurrency(quote.total_amount),
          validity_days: String(validityDays),
          vehicle_info: vehicleStr,
          items_table: itemsTableHtml,
          business_name: business.name,
          business_phone: business.phone,
          business_email: business.email || '',
          business_address: business.address,
          business_website: business.website || '',
        });

        let emailSuccess = false;
        let emailError = '';

        if (templated.usedTemplate) {
          emailSuccess = templated.success;
          emailError = templated.error || 'Template email failed';
        } else {
          // Fallback: send via sendEmail() (uses noreply@ for consistency)
          const textBody = buildEmailText(business, quote, customerName, vehicleStr, items, quoteLink, validityDays);
          const htmlBody = buildEmailHtml(business, quote, customerName, vehicleStr, items, quoteLink, validityDays);
          const result = await sendEmail(
            customer.email,
            `Estimate ${quote.quote_number} from ${business.name}`,
            textBody,
            htmlBody
          );
          emailSuccess = result.success;
          if (!result.success) emailError = result.error;
        }

        if (emailSuccess) {
          sentVia.push('email');
          const { error: commErr } = await supabase.from('quote_communications').insert({
            quote_id: quoteId,
            channel: 'email',
            sent_to: customer.email,
            status: 'sent',
          });
          if (commErr) console.error('Failed to record communication:', commErr.message);
        } else {
          errors.push('Failed to send email');
          const { error: commErr } = await supabase.from('quote_communications').insert({
            quote_id: quoteId,
            channel: 'email',
            sent_to: customer.email,
            status: 'failed',
            error_message: emailError,
          });
          if (commErr) console.error('Failed to record communication:', commErr.message);
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
        errors.push('Failed to send email');
      }
    }
  }

  // --- Send via SMS/MMS (via shared utility) ---
  if (shouldSms) {
    if (!customer?.phone) {
      errors.push('Customer has no phone number');
    } else if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      errors.push('SMS with PDF requires a public URL. Set NEXT_PUBLIC_APP_URL to your production domain.');
    } else {
      try {
        const smsBody =
          `Estimate ${quote.quote_number} from ${business.name}\n` +
          `Total: ${formatCurrency(quote.total_amount)}\n\n` +
          `View Your Estimate: ${shortLink}`;

        // Only attach PDF for production domains (ngrok free tier blocks MMS fetches)
        const isProductionUrl = !appUrl.includes('ngrok') && !appUrl.includes('localhost');
        const mediaUrl = isProductionUrl
          ? `${appUrl}/api/quotes/${quoteId}/pdf?token=${quote.access_token}`
          : undefined;

        const smsResult = await sendSms(customer.phone, smsBody, { mediaUrl });

        if (smsResult.success) {
          sentVia.push('sms');
          const { error: commErr } = await supabase.from('quote_communications').insert({
            quote_id: quoteId,
            channel: 'sms',
            sent_to: customer.phone,
            status: 'sent',
          });
          if (commErr) console.error('Failed to record communication:', commErr.message);
        } else {
          errors.push(smsResult.error);
          const { error: commErr } = await supabase.from('quote_communications').insert({
            quote_id: quoteId,
            channel: 'sms',
            sent_to: customer.phone,
            status: 'failed',
            error_message: smsResult.error,
          });
          if (commErr) console.error('Failed to record communication:', commErr.message);
        }
      } catch (smsErr) {
        console.error('SMS send error:', smsErr);
        errors.push('Failed to send SMS');
      }
    }
  }

  // Fire webhook with quote data + link
  fireWebhook('quote_sent', { ...quote, link: quoteLink }, supabase).catch(() => {});

  return {
    success: true,
    link: quoteLink,
    sent_via: sentVia,
    ...(errors.length > 0 ? { errors } : {}),
    quote: updated,
  };
}

// ---------------------------------------------------------------------------
// Email template builders
// ---------------------------------------------------------------------------

/** Build a standalone items table HTML for the {items_table} template variable */
function buildItemsTableHtml(items: QuoteItem[]): string {
  if (items.length === 0) return '';

  const rows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #374151;">${i.item_name}${i.tier_name ? ` <span style="color: #6b7280;">(${i.tier_name})</span>` : ''}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${i.quantity}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatCurrency(i.total_price)}</td>
        </tr>`
    )
    .join('');

  return `<table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background-color: #f3f4f6;">
        <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Item</th>
        <th style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Qty</th>
        <th style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildEmailText(
  business: { name: string; address: string; phone: string },
  quote: { quote_number: string; created_at: string; subtotal: number; tax_amount: number; total_amount: number },
  customerName: string,
  vehicleStr: string,
  items: QuoteItem[],
  quoteLink: string,
  validityDays: number
): string {
  const itemLines = items
    .map(
      (i) =>
        `  ${i.item_name}${i.tier_name ? ` (${i.tier_name})` : ''} x${i.quantity} — ${formatCurrency(i.total_price)}`
    )
    .join('\n');

  return `Estimate from ${business.name}
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

This estimate is valid for ${validityDays} days. If you have any questions, please call us at ${business.phone}.

Thank you for choosing ${business.name}!`;
}

function buildEmailHtml(
  business: { name: string; address: string; phone: string },
  quote: { quote_number: string; created_at: string; subtotal: number; tax_amount: number; total_amount: number },
  customerName: string,
  vehicleStr: string,
  items: QuoteItem[],
  quoteLink: string,
  validityDays: number
): string {
  const itemRowsHtml = items
    .map(
      (i) =>
        `<tr>
                    <td class="email-td" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #374151;">${i.item_name}${i.tier_name ? ` <span class="email-text-muted" style="color: #6b7280;">(${i.tier_name})</span>` : ''}</td>
                    <td class="email-td" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151;">${i.quantity}</td>
                    <td class="email-td" style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #374151;">${formatCurrency(i.total_price)}</td>
                  </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <style>
    /* Override auto-detected address/phone links in header */
    .email-header-text a,
    .email-header-text a[x-apple-data-detectors],
    .email-header-text a[href^="x-apple-data-detectors:"],
    .email-header-text a[href^="tel:"],
    .email-header-text a[href^="mailto:"],
    .email-header-text a[href*="maps"] {
      color: #cbd5e1 !important;
      text-decoration: none !important;
    }
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; }
      .email-info-box { background-color: #1a1a2e !important; }
      .email-text { color: #e2e8f0 !important; }
      .email-text-muted { color: #94a3b8 !important; }
      .email-border { border-color: #334155 !important; }
      .email-footer { background-color: #1a1a2e !important; }
      .email-footer-text { color: #64748b !important; }
      .email-th { background-color: #1e293b !important; color: #e2e8f0 !important; }
      .email-td { border-color: #334155 !important; color: #e2e8f0 !important; }
      .email-link { color: #93c5fd !important; }
      .email-header-text, .email-header-text a, .email-header-text a[x-apple-data-detectors] { color: #f1f5f9 !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color-scheme: light dark;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div class="email-card" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #1e3a5f; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${business.name}</h1>
        <p class="email-header-text" style="margin: 8px 0 0; color: #cbd5e1; font-size: 14px;">${business.address}</p>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <div style="margin-bottom: 24px;">
          <h2 class="email-text" style="margin: 0 0 16px; color: #1e3a5f; font-size: 20px;">Estimate ${quote.quote_number}</h2>
          <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px;">Date: ${new Date(quote.created_at).toLocaleDateString()}</p>
        </div>

        <div class="email-info-box" style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <p class="email-text" style="margin: 0 0 4px; font-size: 14px;"><strong>Customer:</strong> ${customerName}</p>
          <p class="email-text" style="margin: 0; font-size: 14px;"><strong>Vehicle:</strong> ${vehicleStr}</p>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr class="email-th" style="background-color: #f3f4f6;">
              <th class="email-th" style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Item</th>
              <th class="email-th" style="padding: 12px 16px; text-align: center; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Qty</th>
              <th class="email-th" style="padding: 12px 16px; text-align: right; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="email-border" style="border-top: 2px solid #e5e7eb; padding-top: 16px; margin-bottom: 32px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span class="email-text-muted" style="color: #6b7280;">Subtotal</span>
            <span class="email-text" style="font-weight: 500;">${formatCurrency(quote.subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span class="email-text-muted" style="color: #6b7280;">Tax</span>
            <span class="email-text" style="font-weight: 500;">${formatCurrency(quote.tax_amount)}</span>
          </div>
          <div class="email-border" style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <span class="email-text" style="font-size: 18px; font-weight: 600; color: #1e3a5f;">Total</span>
            <span class="email-text" style="font-size: 18px; font-weight: 700; color: #1e3a5f;">${formatCurrency(quote.total_amount)}</span>
          </div>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${quoteLink}" style="display: inline-block; background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Your Estimate</a>
        </div>

        <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
          This estimate is valid for ${validityDays} days.<br>
          Questions? Call us at <a class="email-link" href="tel:${business.phone}" style="color: #1e3a5f;">${business.phone}</a>
        </p>
      </div>

      <!-- Footer -->
      <div class="email-footer" style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p class="email-footer-text" style="margin: 0; color: #9ca3af; font-size: 12px;">Thank you for choosing ${business.name}!</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
