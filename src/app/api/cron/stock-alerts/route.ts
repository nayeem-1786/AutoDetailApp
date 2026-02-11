import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';

interface LowStockProduct {
  id: string;
  name: string;
  sku: string | null;
  quantity_on_hand: number;
  reorder_threshold: number | null;
  vendor_name: string | null;
}

export async function GET(request: NextRequest) {
  // Auth: same pattern as lifecycle-engine and quote-reminders
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Query low stock products (above 0, at or below reorder threshold)
  const { data: lowStockRaw, error: lowErr } = await admin
    .from('products')
    .select('id, name, sku, quantity_on_hand, reorder_threshold, vendors(name)')
    .eq('is_active', true)
    .not('reorder_threshold', 'is', null)
    .gt('quantity_on_hand', 0)
    .order('quantity_on_hand', { ascending: true });

  if (lowErr) {
    console.error('[STOCK-ALERTS] Low stock query error:', lowErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  // Filter in JS: quantity_on_hand <= reorder_threshold (can't do cross-column comparison in PostgREST)
  const lowStockProducts: LowStockProduct[] = (lowStockRaw ?? [])
    .filter((p: Record<string, unknown>) => {
      const qty = p.quantity_on_hand as number;
      const threshold = p.reorder_threshold as number | null;
      return threshold !== null && qty <= threshold;
    })
    .map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string | null,
      quantity_on_hand: p.quantity_on_hand as number,
      reorder_threshold: p.reorder_threshold as number | null,
      vendor_name: (p.vendors as { name: string } | null)?.name ?? null,
    }));

  // 2. Query out of stock products
  const { data: outOfStockRaw, error: oosErr } = await admin
    .from('products')
    .select('id, name, sku, quantity_on_hand, reorder_threshold, vendors(name)')
    .eq('is_active', true)
    .eq('quantity_on_hand', 0)
    .order('name');

  if (oosErr) {
    console.error('[STOCK-ALERTS] Out of stock query error:', oosErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const outOfStockProducts: LowStockProduct[] = (outOfStockRaw ?? []).map(
    (p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string | null,
      quantity_on_hand: p.quantity_on_hand as number,
      reorder_threshold: p.reorder_threshold as number | null,
      vendor_name: (p.vendors as { name: string } | null)?.name ?? null,
    })
  );

  // 3. Anti-spam: check stock_alert_log for recent alerts
  const allProductIds = [
    ...lowStockProducts.map((p) => p.id),
    ...outOfStockProducts.map((p) => p.id),
  ];

  if (allProductIds.length === 0) {
    return NextResponse.json({
      success: true,
      low_stock_count: 0,
      out_of_stock_count: 0,
      alerts_sent: 0,
      recipients_notified: 0,
    });
  }

  // Get most recent alert per product
  const { data: recentAlerts } = await admin
    .from('stock_alert_log')
    .select('product_id, stock_level, created_at')
    .in('product_id', allProductIds)
    .order('created_at', { ascending: false });

  // Build map of most recent alert per product
  const lastAlertMap = new Map<string, { stock_level: number; created_at: string }>();
  for (const alert of recentAlerts ?? []) {
    if (!lastAlertMap.has(alert.product_id)) {
      lastAlertMap.set(alert.product_id, {
        stock_level: alert.stock_level,
        created_at: alert.created_at,
      });
    }
  }

  // Filter: skip if stock level hasn't changed AND last alert was < 7 days ago
  function shouldAlert(product: LowStockProduct): boolean {
    const lastAlert = lastAlertMap.get(product.id);
    if (!lastAlert) return true;

    const lastAlertDate = new Date(lastAlert.created_at);
    const isRecent = lastAlertDate > new Date(sevenDaysAgo);
    const sameLevel = lastAlert.stock_level === product.quantity_on_hand;

    return !(isRecent && sameLevel);
  }

  const lowStockToAlert = lowStockProducts.filter(shouldAlert);
  const outOfStockToAlert = outOfStockProducts.filter(shouldAlert);
  const allToAlert = [...lowStockToAlert, ...outOfStockToAlert];

  if (allToAlert.length === 0) {
    return NextResponse.json({
      success: true,
      low_stock_count: lowStockProducts.length,
      out_of_stock_count: outOfStockProducts.length,
      alerts_sent: 0,
      recipients_notified: 0,
      message: 'All products already alerted recently with same stock levels',
    });
  }

  // 4. Get recipients
  const { data: recipients } = await admin
    .from('notification_recipients')
    .select('email')
    .eq('is_active', true)
    .or('notification_type.eq.low_stock,notification_type.eq.all');

  let recipientEmails = (recipients ?? []).map((r) => r.email);

  // Fallback: use business email if no recipients configured
  if (recipientEmails.length === 0) {
    const businessInfo = await getBusinessInfo();
    if (businessInfo.email) {
      recipientEmails = [businessInfo.email];
    }
  }

  if (recipientEmails.length === 0) {
    console.warn('[STOCK-ALERTS] No recipients and no business email configured');
    return NextResponse.json({
      success: true,
      low_stock_count: lowStockToAlert.length,
      out_of_stock_count: outOfStockToAlert.length,
      alerts_sent: 0,
      recipients_notified: 0,
      message: 'No recipients configured',
    });
  }

  // 5. Build and send email
  const businessInfo = await getBusinessInfo();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const totalCount = lowStockToAlert.length + outOfStockToAlert.length;
  const subject = `Stock Alert — ${totalCount} product${totalCount !== 1 ? 's' : ''} need${totalCount === 1 ? 's' : ''} attention`;

  const textBody = buildTextEmail(businessInfo.name, lowStockToAlert, outOfStockToAlert, appUrl);
  const htmlBody = buildHtmlEmail(businessInfo.name, lowStockToAlert, outOfStockToAlert, appUrl);

  let alertsSent = 0;
  for (const email of recipientEmails) {
    const result = await sendEmail(email, subject, textBody, htmlBody);
    if (result.success) {
      alertsSent++;
    } else {
      console.error(`[STOCK-ALERTS] Failed to send to ${email}:`, result.error);
    }
  }

  // 6. Log alerts
  const alertLogs = allToAlert.map((p) => ({
    product_id: p.id,
    stock_level: p.quantity_on_hand,
    alert_type: p.quantity_on_hand === 0 ? 'out_of_stock' : 'low_stock',
  }));

  const { error: logErr } = await admin.from('stock_alert_log').insert(alertLogs);
  if (logErr) {
    console.error('[STOCK-ALERTS] Failed to log alerts:', logErr);
  }

  return NextResponse.json({
    success: true,
    low_stock_count: lowStockToAlert.length,
    out_of_stock_count: outOfStockToAlert.length,
    alerts_sent: alertsSent,
    recipients_notified: recipientEmails.length,
  });
}

function buildTextEmail(
  businessName: string,
  lowStock: LowStockProduct[],
  outOfStock: LowStockProduct[],
  appUrl: string
): string {
  const lines = [
    `Stock Alert — ${businessName}`,
    '',
    `${lowStock.length} product${lowStock.length !== 1 ? 's' : ''} low on stock, ${outOfStock.length} product${outOfStock.length !== 1 ? 's' : ''} out of stock`,
    '',
  ];

  if (outOfStock.length > 0) {
    lines.push('OUT OF STOCK:');
    for (const p of outOfStock) {
      lines.push(`  - ${p.name}${p.sku ? ` (${p.sku})` : ''} — Stock: 0${p.vendor_name ? ` — Vendor: ${p.vendor_name}` : ''}`);
    }
    lines.push('');
  }

  if (lowStock.length > 0) {
    lines.push('LOW STOCK:');
    for (const p of lowStock) {
      lines.push(`  - ${p.name}${p.sku ? ` (${p.sku})` : ''} — Stock: ${p.quantity_on_hand} / Reorder at: ${p.reorder_threshold}${p.vendor_name ? ` — Vendor: ${p.vendor_name}` : ''}`);
    }
    lines.push('');
  }

  lines.push(`View Products: ${appUrl}/admin/catalog/products?stock=low-stock`);
  return lines.join('\n');
}

function buildHtmlEmail(
  businessName: string,
  lowStock: LowStockProduct[],
  outOfStock: LowStockProduct[],
  appUrl: string
): string {
  const allProducts = [
    ...outOfStock.map((p) => ({ ...p, status: 'Out of Stock' as const })),
    ...lowStock.map((p) => ({ ...p, status: 'Low Stock' as const })),
  ];

  const productRows = allProducts
    .map((p) => {
      const statusColor = p.status === 'Out of Stock' ? '#dc2626' : '#d97706';
      const statusBg = p.status === 'Out of Stock' ? '#fef2f2' : '#fffbeb';
      return `<tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 14px;">${p.name}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">${p.sku || '—'}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #374151; font-size: 14px; font-weight: 600;">${p.quantity_on_hand}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">${p.reorder_threshold ?? '—'}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">${p.vendor_name || '—'}</td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; color: ${statusColor}; background-color: ${statusBg};">${p.status}</span>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <style>
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a2e !important; }
      .email-card { background-color: #16213e !important; }
      .email-text { color: #e2e8f0 !important; }
      .email-text-muted { color: #94a3b8 !important; }
      .email-th { background-color: #1e293b !important; color: #e2e8f0 !important; }
      .email-td { border-color: #334155 !important; color: #e2e8f0 !important; }
      .email-footer { background-color: #1a1a2e !important; }
      .email-footer-text { color: #64748b !important; }
    }
  </style>
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; color-scheme: light dark;">
  <div style="max-width: 700px; margin: 0 auto; padding: 40px 20px;">
    <div class="email-card" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #1e3a5f; padding: 24px 32px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Stock Alert</h1>
        <p style="margin: 8px 0 0; color: #cbd5e1; font-size: 14px;">${businessName}</p>
      </div>

      <!-- Content -->
      <div style="padding: 32px;">
        <p class="email-text" style="margin: 0 0 24px; color: #374151; font-size: 16px;">
          <strong>${outOfStock.length}</strong> product${outOfStock.length !== 1 ? 's' : ''} out of stock and
          <strong>${lowStock.length}</strong> product${lowStock.length !== 1 ? 's' : ''} low on stock.
        </p>

        <!-- Products Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
          <thead>
            <tr class="email-th" style="background-color: #f3f4f6;">
              <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Product</th>
              <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">SKU</th>
              <th style="padding: 12px 16px; text-align: center; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Stock</th>
              <th style="padding: 12px 16px; text-align: center; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Reorder At</th>
              <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Vendor</th>
              <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${appUrl}/admin/catalog/products?stock=low-stock" style="display: inline-block; background-color: #1e3a5f; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">View Products &rarr;</a>
        </div>

        <p class="email-text-muted" style="margin: 0; color: #6b7280; font-size: 13px; text-align: center;">
          Products are only re-alerted when stock levels change or after 7 days.
        </p>
      </div>

      <!-- Footer -->
      <div class="email-footer" style="background-color: #f9fafb; padding: 24px 32px; text-align: center;">
        <p class="email-footer-text" style="margin: 0; color: #9ca3af; font-size: 12px;">Sent daily at 8:00 AM PST by ${businessName}</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
