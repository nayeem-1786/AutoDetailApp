import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBusinessInfo, type BusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';

// --- Types -----------------------------------------------------------

interface QuoteItem {
  item_name: string;
  tier_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
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
        doc.text(quote.customer.phone, col2X, ry);
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

    quote.items.forEach((item, index) => {
      // Check if we need a new page
      if (y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
      }

      // Alternate row shading
      if (index % 2 === 0) {
        doc.rect(marginLeft, y, contentWidth, 20).fill(lightGray);
      }

      doc.fillColor(darkText);
      doc.font('Helvetica').fontSize(9);

      // Item name (truncate if too long)
      const itemName =
        item.item_name.length > 35
          ? item.item_name.substring(0, 35) + '...'
          : item.item_name;
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

      y += 20;
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

    // Determine access: public via token OR internal referrer
    const referer = request.headers.get('referer') || '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const isInternal = referer.startsWith(appUrl);

    if (!token && !isInternal) {
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
        customer:customers(first_name, last_name, phone, email),
        vehicle:vehicles(year, make, model, color),
        items:quote_items(item_name, tier_name, quantity, unit_price, total_price)
      `
      )
      .eq('id', id)
      .single();

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // If accessed via public token, validate it
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
