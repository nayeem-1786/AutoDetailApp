import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireWebhook } from '@/lib/utils/webhook';
import { sendSms } from '@/lib/utils/sms';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';
import { renderSmsTemplate } from '@/lib/sms/render-sms-template';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { access_token } = body;

    if (!access_token || typeof access_token !== 'string') {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch quote
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Validate access token
    if (quote.access_token !== access_token) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 403 });
    }

    // Only allow accept if status is 'sent' or 'viewed'
    if (quote.status !== 'sent' && quote.status !== 'viewed') {
      return NextResponse.json(
        { error: `Cannot accept a quote with status "${quote.status}"` },
        { status: 400 }
      );
    }

    // Update status to accepted
    const { data: updated, error: updateErr } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('Error accepting quote:', updateErr.message);
      return NextResponse.json({ error: 'Failed to accept quote' }, { status: 500 });
    }

    // Fire webhook
    fireWebhook('quote_accepted', { ...quote, status: 'accepted', accepted_at: updated.accepted_at }, supabase).catch(() => {});

    // Send SMS confirmation to customer
    const customer = quote.customer as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
    if (customer?.phone) {
      const items = (quote.items as Array<{ item_name: string }>) ?? [];
      // Session 2A.5: per-slug typed signature requires per-branch render calls.
      // The single and multi slugs have different contracts (single: item_name
      // required; multi: no required chips), so the literal-union shape can't
      // satisfy both — split into two narrowed calls instead.
      const result = items.length === 1 && items[0]?.item_name
        ? await renderSmsTemplate('quote_accepted_single', {
            first_name: customer.first_name,
            item_name: items[0].item_name,
          }, `Thanks ${customer.first_name}! Your quote for ${items[0].item_name} has been accepted. Our team will reach out shortly to schedule your appointment.`)
        : await renderSmsTemplate('quote_accepted_multi', {
            first_name: customer.first_name,
          }, `Thanks ${customer.first_name}! Your quote has been accepted. Our team will reach out shortly to schedule.`);

      if (result.isActive) {
        const smsResult = await sendSms(customer.phone, result.body, {
          logToConversation: true,
          customerId: customer.id,
          notificationType: 'quote_accepted',
          contextId: id,
        });
        await supabase.from('quote_communications').insert({
          quote_id: id,
          channel: 'sms',
          sent_to: customer.phone,
          status: smsResult.success ? 'sent' : 'failed',
          error_message: smsResult.success ? null : 'SMS delivery failed',
        });
      }
    }

    // Notify staff — fire-and-forget, must not block customer response
    try {
      const biz = await getBusinessInfo();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      const items = (quote.items as Array<{ item_name: string }>) ?? [];
      const serviceList = items.map((i) => i.item_name).join(', ') || 'Services';
      const customerName = customer
        ? `${customer.first_name} ${customer.last_name}`.trim()
        : 'Customer';

      // Staff SMS via template
      const staffFallback = `Quote accepted! ${customerName} — Q-${quote.quote_number} for ${formatCurrency(Number(quote.total_amount))}. Services: ${serviceList}. Schedule in POS.`;
      const staffResult = await renderSmsTemplate('quote_accepted_staff_notify', {
        customer_name: customerName,
        quote_number: quote.quote_number,
        service_total: formatCurrency(Number(quote.total_amount)),
        services: serviceList,
        customer_phone: customer?.phone || '',
      }, staffFallback);

      if (staffResult.isActive) {
        const phones = staffResult.recipientPhones?.length ? staffResult.recipientPhones : (biz.phone ? [biz.phone] : []);
        for (const phone of phones) {
          sendSms(phone, staffResult.body).catch((err) =>
            console.error('[QuoteAccept] Staff SMS failed:', err)
          );
        }
      }

      // Staff email
      if (biz.email) {
        const adminUrl = `${appUrl}/admin/quotes/${id}`;
        const subject = `Quote #${quote.quote_number} Accepted — ${customerName}`;
        const textBody = [
          `Quote #${quote.quote_number} has been accepted!`,
          '',
          `Customer: ${customerName}`,
          customer?.phone ? `Phone: ${customer.phone}` : '',
          customer?.email ? `Email: ${customer.email}` : '',
          `Services: ${serviceList}`,
          `Total: ${formatCurrency(Number(quote.total_amount))}`,
          '',
          `View in admin: ${adminUrl}`,
          '',
          'Next step: Convert this quote to an appointment in POS.',
        ].filter(Boolean).join('\n');

        const htmlBody = `<div style="font-family: sans-serif; max-width: 500px;">
<h2 style="color: #1e3a5f;">Quote Accepted!</h2>
<p><strong>Quote #${quote.quote_number}</strong></p>
<p><strong>Customer:</strong> ${customerName}</p>
${customer?.phone ? `<p><strong>Phone:</strong> ${customer.phone}</p>` : ''}
${customer?.email ? `<p><strong>Email:</strong> ${customer.email}</p>` : ''}
<p><strong>Services:</strong> ${serviceList}</p>
<p><strong>Total:</strong> ${formatCurrency(Number(quote.total_amount))}</p>
<br/>
<a href="${adminUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1e3a5f; color: #fff; text-decoration: none; border-radius: 6px;">View Quote in Admin</a>
<br/><br/>
<p style="color: #6b7280; font-size: 14px;">Next step: Convert this quote to an appointment in POS.</p>
</div>`;

        sendEmail(biz.email, subject, textBody, htmlBody).catch((err) =>
          console.error('[QuoteAccept] Staff email failed:', err)
        );
      }
    } catch (staffNotifyErr) {
      console.error('[QuoteAccept] Staff notification failed (non-blocking):', staffNotifyErr);
    }

    return NextResponse.json({ success: true, quote: updated });
  } catch (err) {
    console.error('Quote accept error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
