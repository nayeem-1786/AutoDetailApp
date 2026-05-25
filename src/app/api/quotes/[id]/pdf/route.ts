import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getBusinessInfo, type BusinessInfo } from '@/lib/data/business';
import { formatCurrency, formatPhone } from '@/lib/utils/format';
import { composeLineItems } from '@/lib/utils/compose-line-items';
import { resolveQuoteModifierRows } from '@/lib/quotes/modifier-display';
import {
  getLineItemPricingInfo,
  sumLineItemSavings,
} from '@/lib/quotes/line-item-pricing';

// --- Types -----------------------------------------------------------

interface QuoteItem {
  item_name: string;
  tier_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  // Issue 33 follow-up UX: combo/sale fields surfaced into PDF render.
  // SELECT below widened to pull these columns.
  standard_price: number | null;
  pricing_type: 'standard' | 'sale' | 'combo' | null;
}

interface QuoteData {
  id: string;
  quote_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  valid_until: string | null;
  created_at: string;
  access_token: string | null;
  // Phase Mobile-1.7: mobile-fee metadata pulled into PDF generation
  // so composeLineItems can append a synthetic mobile-fee row when
  // is_mobile=true. Without this, the line-item sum doesn't equal the
  // displayed subtotal on mobile quotes.
  is_mobile: boolean;
  mobile_surcharge: number | string | null;
  mobile_zone_name_snapshot: string | null;
  // Item 15g Layer 15g-v — modifier columns drive the coupon / loyalty /
  // manual-discount rows above the TOTAL line. Without these, the customer
  // sees a smaller number (post-Fix-A) with no explanation of how it was
  // reached.
  coupon_code: string | null;
  coupon_discount: number | string | null;
  loyalty_points_to_redeem: number | null;
  loyalty_discount: number | string | null;
  manual_discount_type: 'dollar' | 'percent' | null;
  manual_discount_value: number | string | null;
  manual_discount_label: string | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    year: number | null;
    make: string;
    model: string;
    color: string | null;
  } | null;
  items: QuoteItem[];
}

// --- Helpers ---------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function generatePdf(quote: QuoteData, business: BusinessInfo): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const marginLeft = 50;
    const marginRight = 50;
    const contentWidth = pageWidth - marginLeft - marginRight;

    // ── Colors ──
    const primaryColor = '#1a1a2e';
    const accentColor = '#0f3460';
    const lightGray = '#f4f4f4';
    const mediumGray = '#888888';
    const darkText = '#222222';

    // ══════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════

    // Business name
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(primaryColor)
      .text(business.name, marginLeft, 50);

    // Address
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(mediumGray)
      .text(business.address, marginLeft, 76);

    // "QUOTE" label on the right
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(accentColor)
      .text('QUOTE', marginLeft, 50, {
        width: contentWidth,
        align: 'right',
      });

    // Divider
    const dividerY = 100;
    doc
      .moveTo(marginLeft, dividerY)
      .lineTo(pageWidth - marginRight, dividerY)
      .strokeColor(accentColor)
      .lineWidth(2)
      .stroke();

    // ══════════════════════════════════════════════════════════════════
    // QUOTE META + CUSTOMER / VEHICLE INFO
    // ══════════════════════════════════════════════════════════════════

    let y = dividerY + 20;
    const col1X = marginLeft;
    const col2X = marginLeft + contentWidth / 2 + 20;

    // -- Left column: Quote details --
    doc.font('Helvetica-Bold').fontSize(10).fillColor(darkText);
    doc.text('Quote #:', col1X, y);
    doc.font('Helvetica').text(quote.quote_number, col1X + 70, y);

    y += 16;
    doc.font('Helvetica-Bold').text('Date:', col1X, y);
    doc.font('Helvetica').text(formatDate(quote.created_at), col1X + 70, y);

    if (quote.valid_until) {
      y += 16;
      doc.font('Helvetica-Bold').text('Valid Until:', col1X, y);
      doc.font('Helvetica').text(formatDate(quote.valid_until), col1X + 70, y);
    }

    y += 16;
    doc.font('Helvetica-Bold').text('Status:', col1X, y);
    doc
      .font('Helvetica')
      .text(quote.status.charAt(0).toUpperCase() + quote.status.slice(1), col1X + 70, y);

    // -- Right column: Customer & Vehicle --
    let ry = dividerY + 20;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(accentColor)
      .text('CUSTOMER', col2X, ry);
    ry += 16;

    doc.font('Helvetica').fontSize(10).fillColor(darkText);
    if (quote.customer) {
      doc.text(`${quote.customer.first_name} ${quote.customer.last_name}`, col2X, ry);
      ry += 14;

      if (quote.customer.phone) {
        doc.text(formatPhone(quote.customer.phone) || quote.customer.phone, col2X, ry);
        ry += 14;
      }

      if (quote.customer.email) {
        doc.text(quote.customer.email, col2X, ry);
        ry += 14;
      }
    } else {
      doc.text('N/A', col2X, ry);
      ry += 14;
    }

    ry += 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(accentColor)
      .text('VEHICLE', col2X, ry);
    ry += 16;

    doc.font('Helvetica').fontSize(10).fillColor(darkText);
    if (quote.vehicle) {
      const vehicleParts = [
        quote.vehicle.year,
        quote.vehicle.make,
        quote.vehicle.model,
      ].filter(Boolean);
      doc.text(vehicleParts.length > 0 ? vehicleParts.join(' ') : 'N/A', col2X, ry);
      ry += 14;

      if (quote.vehicle.color) {
        doc.text(`Color: ${quote.vehicle.color}`, col2X, ry);
        ry += 14;
      }
    } else {
      doc.text('N/A', col2X, ry);
      ry += 14;
    }

    // Move y past whichever column is taller
    y = Math.max(y + 30, ry + 20);

    // ══════════════════════════════════════════════════════════════════
    // LINE ITEMS TABLE
    // ══════════════════════════════════════════════════════════════════

    // Column positions
    const colItem = marginLeft;
    const colTier = marginLeft + 220;
    const colQty = marginLeft + 320;
    const colPrice = marginLeft + 380;
    const colTotal = pageWidth - marginRight - 70;

    // Table header background
    doc
      .rect(marginLeft, y, contentWidth, 22)
      .fill(accentColor);

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.text('Item', colItem + 8, y + 6);
    doc.text('Tier', colTier, y + 6);
    doc.text('Qty', colQty, y + 6, { width: 40, align: 'center' });
    doc.text('Unit Price', colPrice, y + 6, { width: 70, align: 'right' });
    doc.text('Total', colTotal, y + 6, { width: 70, align: 'right' });

    y += 22;

    // Table rows
    doc.font('Helvetica').fontSize(9).fillColor(darkText);

    // Phase Mobile-1.7: render through composeLineItems so the synthetic
    // mobile-fee row (when is_mobile=true) is appended at end. Without
    // this, the line-item sum doesn't match the displayed subtotal on
    // mobile quotes (the surcharge lives on the parent record only).
    const displayItems = composeLineItems(quote, quote.items);

    displayItems.forEach((item, index) => {
      // Issue 33 follow-up UX: pull pricing info from the original quote_items
      // row (mobile-fee synthetic rows have no original entry).
      const original = item.is_mobile_fee ? null : quote.items[index] ?? null;
      const pricingInfo = original
        ? getLineItemPricingInfo({
            unit_price: original.unit_price,
            standard_price: original.standard_price ?? null,
            pricing_type: original.pricing_type ?? null,
            quantity: original.quantity,
          })
        : null;
      // Reserve extra vertical space for the discount sub-line.
      const rowHeight = pricingInfo?.hasDiscount ? 32 : 20;

      // Check if we need a new page
      if (y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
      }

      // Alternate row shading
      if (index % 2 === 0) {
        doc.rect(marginLeft, y, contentWidth, rowHeight).fill(lightGray);
      }

      doc.fillColor(darkText);
      doc.font('Helvetica').fontSize(9);

      // Item name (truncate if too long)
      const itemName =
        item.name.length > 35
          ? item.name.substring(0, 35) + '...'
          : item.name;
      doc.text(itemName, colItem + 8, y + 5);

      // Tier
      doc.text(item.tier_name || '-', colTier, y + 5);

      // Quantity
      doc.text(String(item.quantity), colQty, y + 5, {
        width: 40,
        align: 'center',
      });

      // Unit price
      doc.text(formatCurrency(item.unit_price), colPrice, y + 5, {
        width: 70,
        align: 'right',
      });

      // Total
      doc.text(formatCurrency(item.total_price), colTotal, y + 5, {
        width: 70,
        align: 'right',
      });

      // Issue 33 follow-up UX (operator Q5): single-line discount sub-text
      // beneath the item name when combo / sale applies. Use ASCII arrow
      // "->" — PDFKit's default Helvetica font does not embed the Unicode
      // arrow glyph, and rendering would either drop the glyph or require
      // bundling an additional font. ASCII is byte-clean across all PDF
      // readers.
      if (pricingInfo?.hasDiscount) {
        const discountText = `${pricingInfo.label}: $${(pricingInfo.standardPrice as number).toFixed(2)} -> $${item.unit_price.toFixed(2)} (Save $${pricingInfo.savingsPerUnit.toFixed(2)})`;
        doc.fillColor('#16a34a').fontSize(8);
        doc.text(discountText, colItem + 8, y + 18);
        doc.fillColor(darkText).fontSize(9);
      }

      y += rowHeight;
    });

    // Bottom border of table
    doc
      .moveTo(marginLeft, y)
      .lineTo(pageWidth - marginRight, y)
      .strokeColor(accentColor)
      .lineWidth(1)
      .stroke();

    // ══════════════════════════════════════════════════════════════════
    // TOTALS
    // ══════════════════════════════════════════════════════════════════

    y += 16;
    const totalsLabelX = colPrice - 30;
    const totalsValueX = colTotal;

    doc.font('Helvetica').fontSize(10).fillColor(darkText);

    doc.text('Subtotal:', totalsLabelX, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(quote.subtotal), totalsValueX, y, {
      width: 70,
      align: 'right',
    });

    y += 18;
    doc.text('Tax:', totalsLabelX, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(quote.tax_amount), totalsValueX, y, {
      width: 70,
      align: 'right',
    });

    // Issue 33 follow-up UX (operator Q1): "You saved $X" totals row.
    // Hidden when no combo/sale savings apply across the line items.
    const totalLineSavings = sumLineItemSavings(
      quote.items.map((i) => ({
        unit_price: i.unit_price,
        standard_price: i.standard_price ?? null,
        pricing_type: i.pricing_type ?? null,
        quantity: i.quantity,
      })),
    );
    if (totalLineSavings > 0) {
      y += 16;
      doc.font('Helvetica').fontSize(10).fillColor('#16a34a');
      doc.text('You saved:', totalsLabelX, y, { width: 100, align: 'right' });
      doc.text(`-${formatCurrency(totalLineSavings)}`, totalsValueX, y, {
        width: 70,
        align: 'right',
      });
      doc.fillColor(darkText);
    }

    // Item 15g Layer 15g-v: modifier rows between Tax and TOTAL. Conditional
    // per modifier; mirrors the operator UI's <QuoteTotals> ordering. The
    // label column uses a wider width to fit "Coupon (CODE)" / "Loyalty (N
    // pts)" / operator manual-label text.
    const modifierRows = resolveQuoteModifierRows(quote);
    if (modifierRows.length > 0) {
      doc.font('Helvetica').fontSize(10).fillColor(darkText);
      const modifierLabelX = totalsLabelX - 120; // wider label column for verbose labels
      const modifierLabelWidth = 220;
      for (const row of modifierRows) {
        y += 16;
        doc.text(`${row.label}:`, modifierLabelX, y, {
          width: modifierLabelWidth,
          align: 'right',
        });
        doc.text(`-${formatCurrency(row.amount)}`, totalsValueX, y, {
          width: 70,
          align: 'right',
        });
      }
    }

    y += 22;
    // Total with emphasis
    doc
      .rect(totalsLabelX - 10, y - 4, 180, 24)
      .fill(accentColor);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff');
    doc.text('TOTAL:', totalsLabelX, y, { width: 100, align: 'right' });
    doc.text(formatCurrency(quote.total_amount), totalsValueX, y, {
      width: 70,
      align: 'right',
    });

    // ══════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════

    y += 50;

    // Check if we need a new page for the footer
    if (y > doc.page.height - 100) {
      doc.addPage();
      y = 50;
    }

    doc
      .moveTo(marginLeft, y)
      .lineTo(pageWidth - marginRight, y)
      .strokeColor(lightGray)
      .lineWidth(1)
      .stroke();

    y += 16;
    doc
      .font('Helvetica-Oblique')
      .fontSize(11)
      .fillColor(mediumGray)
      .text('Thank you for your business!', marginLeft, y, {
        width: contentWidth,
        align: 'center',
      });

    y += 20;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(mediumGray)
      .text(
        `${business.name}  |  ${business.address}`,
        marginLeft,
        y,
        { width: contentWidth, align: 'center' }
      );

    doc.end();
  });
}

// --- Route Handler ---------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // Auth: internal employee session OR public access_token
    let authenticated = false;

    if (!token) {
      // Internal access — verify employee session
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: employee } = await authClient
          .from('employees')
          .select('role')
          .eq('auth_user_id', user.id)
          .single();
        if (employee) {
          authenticated = true;
        }
      }
    }

    if (!authenticated && !token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();

    // Fetch business info from database
    const business = await getBusinessInfo();

    // Fetch quote with relations
    const { data: quote, error } = await supabase
      .from('quotes')
      .select(
        `
        id, quote_number, status, subtotal, tax_amount, total_amount,
        valid_until, created_at, access_token,
        is_mobile, mobile_surcharge, mobile_zone_name_snapshot,
        coupon_code, coupon_discount,
        loyalty_points_to_redeem, loyalty_discount,
        manual_discount_type, manual_discount_value, manual_discount_label,
        customer:customers(first_name, last_name, phone, email),
        vehicle:vehicles(year, make, model, color),
        items:quote_items(item_name, tier_name, quantity, unit_price, total_price, standard_price, pricing_type)
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Public access — validate token matches quote
    if (token && quote.access_token !== token) {
      return NextResponse.json(
        { error: 'Invalid access token' },
        { status: 403 }
      );
    }

    // Generate PDF
    const pdfBuffer = await generatePdf(quote as unknown as QuoteData, business);

    const filename = `Quote-${quote.quote_number}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Quote PDF generation error:', err);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
