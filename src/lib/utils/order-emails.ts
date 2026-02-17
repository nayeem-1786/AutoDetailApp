import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';
import type { Order, OrderItem } from '@/lib/supabase/types';

type OrderWithItems = Order & { items?: OrderItem[] };

function emailWrapper(title: string, body: string, footerHtml: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <h1 style="color:#FFFFFF;font-size:24px;margin:0 0 8px;">${title}</h1>
    </div>
    ${body}
    <div style="text-align:center;padding:24px;">
      <p style="color:#6B7280;font-size:12px;margin:0;">${footerHtml}</p>
    </div>
  </div>
</body>
</html>`;
}

function card(content: string) {
  return `<div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">${content}</div>`;
}

function itemsTable(items: OrderItem[]) {
  const rows = items.map(
    (item) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;">${item.product_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;text-align:right;">${formatCurrency(item.line_total / 100)}</td>
      </tr>`
  ).join('');

  return `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:left;font-size:12px;text-transform:uppercase;">Item</th>
        <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:center;font-size:12px;text-transform:uppercase;">Qty</th>
        <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:right;font-size:12px;text-transform:uppercase;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export async function sendReadyForPickupEmail(order: OrderWithItems) {
  const biz = await getBusinessInfo();
  const html = emailWrapper(
    'Your Order is Ready for Pickup!',
    card(`
      <p style="color:#FFFFFF;margin:0 0 12px;">Hi ${order.first_name},</p>
      <p style="color:#D1D5DB;margin:0 0 16px;">Great news! Your order <strong style="color:#CCFF00;">${order.order_number}</strong> is ready for pickup.</p>
      <p style="color:#D1D5DB;margin:0 0 8px;"><strong style="color:#FFFFFF;">Pickup Location:</strong></p>
      <p style="color:#D1D5DB;margin:0;">${biz.address || biz.name}</p>
    `) +
    (order.items?.length
      ? card(`<h2 style="color:#FFFFFF;font-size:16px;margin:0 0 16px;">Order Items</h2>${itemsTable(order.items)}`)
      : ''),
    `${biz.name}<br>${biz.phone}<br>${biz.email}`
  );

  await sendEmail(
    order.email,
    `Your Order ${order.order_number} is Ready for Pickup | ${biz.name}`,
    `Hi ${order.first_name}, your order ${order.order_number} is ready for pickup at ${biz.address || biz.name}. — ${biz.name}`,
    html
  );
}

export async function sendShippedEmail(order: OrderWithItems) {
  const biz = await getBusinessInfo();

  const trackingHtml = order.tracking_url
    ? `<p style="margin:16px 0 0;">
        <a href="${order.tracking_url}" style="display:inline-block;background:#CCFF00;color:#000000;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;">Track Your Package</a>
      </p>`
    : order.tracking_number
      ? `<p style="color:#D1D5DB;margin:16px 0 0;">Tracking Number: <strong style="color:#CCFF00;">${order.tracking_number}</strong>${order.shipping_carrier ? ` (${order.shipping_carrier})` : ''}</p>`
      : '';

  const html = emailWrapper(
    'Your Order Has Shipped!',
    card(`
      <p style="color:#FFFFFF;margin:0 0 12px;">Hi ${order.first_name},</p>
      <p style="color:#D1D5DB;margin:0;">Your order <strong style="color:#CCFF00;">${order.order_number}</strong> is on its way!</p>
      ${trackingHtml}
    `),
    `${biz.name}<br>${biz.phone}<br>${biz.email}`
  );

  await sendEmail(
    order.email,
    `Your Order ${order.order_number} Has Shipped | ${biz.name}`,
    `Hi ${order.first_name}, your order ${order.order_number} has shipped.${order.tracking_number ? ` Tracking: ${order.tracking_number}` : ''}${order.tracking_url ? ` Track: ${order.tracking_url}` : ''} — ${biz.name}`,
    html
  );
}

export async function sendDeliveredEmail(order: OrderWithItems) {
  const biz = await getBusinessInfo();
  const html = emailWrapper(
    'Your Order Has Been Delivered!',
    card(`
      <p style="color:#FFFFFF;margin:0 0 12px;">Hi ${order.first_name},</p>
      <p style="color:#D1D5DB;margin:0 0 16px;">Your order <strong style="color:#CCFF00;">${order.order_number}</strong> has been delivered. We hope you enjoy your purchase!</p>
      <p style="color:#D1D5DB;margin:0;">If you have any questions or concerns, don't hesitate to reach out.</p>
    `),
    `${biz.name}<br>${biz.phone}<br>${biz.email}`
  );

  await sendEmail(
    order.email,
    `Your Order ${order.order_number} Has Been Delivered | ${biz.name}`,
    `Hi ${order.first_name}, your order ${order.order_number} has been delivered. Thank you! — ${biz.name}`,
    html
  );
}

export async function sendRefundEmail(order: OrderWithItems, amountCents: number) {
  const biz = await getBusinessInfo();
  const isFullRefund = amountCents >= order.total;
  const html = emailWrapper(
    isFullRefund ? 'Refund Processed' : 'Partial Refund Processed',
    card(`
      <p style="color:#FFFFFF;margin:0 0 12px;">Hi ${order.first_name},</p>
      <p style="color:#D1D5DB;margin:0 0 16px;">A ${isFullRefund ? 'full' : 'partial'} refund of <strong style="color:#CCFF00;">${formatCurrency(amountCents / 100)}</strong> has been processed for your order <strong style="color:#FFFFFF;">${order.order_number}</strong>.</p>
      <p style="color:#D1D5DB;margin:0;">The refund should appear in your account within 5-10 business days, depending on your bank.</p>
    `),
    `${biz.name}<br>${biz.phone}<br>${biz.email}`
  );

  await sendEmail(
    order.email,
    `Refund Processed — ${order.order_number} | ${biz.name}`,
    `Hi ${order.first_name}, a ${isFullRefund ? 'full' : 'partial'} refund of ${formatCurrency(amountCents / 100)} has been processed for order ${order.order_number}. — ${biz.name}`,
    html
  );
}

/**
 * Route fulfillment status changes to the appropriate email
 */
export async function sendFulfillmentEmail(order: OrderWithItems, newStatus: string) {
  switch (newStatus) {
    case 'ready_for_pickup':
      await sendReadyForPickupEmail(order);
      break;
    case 'shipped':
      await sendShippedEmail(order);
      break;
    case 'delivered':
      await sendDeliveredEmail(order);
      break;
  }
}
