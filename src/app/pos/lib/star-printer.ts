import type { ReceiptLine } from './receipt-template';

/**
 * Star TSP-100III WebPRNT integration.
 * Sends receipt data via HTTP to the printer's WebPRNT endpoint.
 * Printer must be on the same network and WebPRNT enabled.
 */

/**
 * Convert an image URL to a Star WebPRNT base64 monochrome bitmap.
 * Uses Canvas API to load, resize, and convert to 1-bit monochrome.
 */
export async function imageToStarBitmap(
  url: string,
  targetWidth: number
): Promise<string> {
  // Load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load receipt logo'));
    img.src = url;
  });

  // Calculate height maintaining aspect ratio
  const aspect = img.naturalHeight / img.naturalWidth;
  const width = Math.min(targetWidth, 576); // max 576px for 3-inch receipt paper
  // Star printers require width to be a multiple of 8
  const alignedWidth = Math.ceil(width / 8) * 8;
  const height = Math.round(alignedWidth * aspect);

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = alignedWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, alignedWidth, height);
  ctx.drawImage(img, 0, 0, alignedWidth, height);

  // Get pixel data and convert to monochrome 1-bit
  const imageData = ctx.getImageData(0, 0, alignedWidth, height);
  const pixels = imageData.data;
  const bytesPerRow = alignedWidth / 8;
  const bitmapBytes = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < alignedWidth; x++) {
      const idx = (y * alignedWidth + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      // Luminance threshold: dark pixels = ink (1), light = paper (0)
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance < 128) {
        const byteIndex = y * bytesPerRow + Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        bitmapBytes[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  // Convert to base64
  let binary = '';
  for (let i = 0; i < bitmapBytes.length; i++) {
    binary += String.fromCharCode(bitmapBytes[i]);
  }
  const base64 = btoa(binary);

  // Return the Star WebPRNT bit-image XML element
  return `<bit-image width="${alignedWidth}" height="${height}">${base64}</bit-image>\n`;
}

/**
 * Build a Star WebPRNT XML document from receipt lines.
 */
async function buildWebPRNTXml(lines: ReceiptLine[]): Promise<string> {
  let body = '';

  for (const line of lines) {
    switch (line.type) {
      case 'header':
        body += `<text emphasis="true" width="2" height="2">\n`;
        body += escapeXml(line.text ?? '') + '\n';
        body += `</text>\n`;
        body += `<text>\n\n</text>\n`;
        break;

      case 'bold':
        body += `<text emphasis="true">${escapeXml(line.text ?? '')}\n</text>\n`;
        break;

      case 'text':
        body += `<text>${escapeXml(line.text ?? '')}\n</text>\n`;
        break;

      case 'divider':
        body += `<text>${'─'.repeat(48)}\n</text>\n`;
        break;

      case 'columns': {
        const left = line.left ?? '';
        const center = line.center ?? '';
        const right = line.right ?? '';
        let padded: string;
        if (center) {
          const usedLen = left.length + center.length + right.length;
          const totalGap = Math.max(2, 48 - usedLen);
          const gapLeft = Math.ceil(totalGap / 2);
          const gapRight = totalGap - gapLeft;
          padded = left + ' '.repeat(gapLeft) + center + ' '.repeat(gapRight) + right;
        } else {
          const gap = 48 - left.length - right.length;
          padded = left + ' '.repeat(Math.max(1, gap)) + right;
        }
        body += `<text>${escapeXml(padded)}\n</text>\n`;
        break;
      }

      case 'spacer':
        body += `<text>\n</text>\n`;
        break;

      case 'image':
        if (line.url) {
          try {
            // Star WebPRNT alignment: left/center/right
            const align = line.alignment || 'center';
            body += `<alignment position="${align}" />\n`;
            const bitmapXml = await imageToStarBitmap(line.url, line.width ?? 200);
            body += bitmapXml;
            // Reset to left alignment after image
            body += `<alignment position="left" />\n`;
          } catch {
            // Skip image on failure — don't block receipt printing
          }
        }
        break;
    }
  }

  // Cut paper
  body += `<cut type="partial" />\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<starWebPrint xmlns="http://www.star-m.jp/2011/starWebPrint">
${body}
</starWebPrint>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Send receipt to Star TSP-100III printer via WebPRNT.
 * @param printerIp - The IP address of the Star printer (e.g., "192.168.1.100")
 * @param lines - Receipt lines from generateReceiptLines()
 */
export async function printReceipt(
  printerIp: string,
  lines: ReceiptLine[]
): Promise<void> {
  const xml = await buildWebPRNTXml(lines);
  const url = `http://${printerIp}/StarWebPRNT/SendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
    body: xml,
  });

  if (!res.ok) {
    throw new Error(`Printer returned ${res.status}: ${res.statusText}`);
  }

  // Star WebPRNT returns XML — check for errors
  const responseText = await res.text();
  if (responseText.includes('Error')) {
    throw new Error(`Printer error: ${responseText}`);
  }
}

/**
 * Open the cash drawer via the printer (DK port command).
 */
export async function openCashDrawer(printerIp: string): Promise<void> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<starWebPrint xmlns="http://www.star-m.jp/2011/starWebPrint">
<drawer open="true" />
</starWebPrint>`;

  const url = `http://${printerIp}/StarWebPRNT/SendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
    body: xml,
  });

  if (!res.ok) {
    throw new Error(`Cash drawer command failed: ${res.status}`);
  }
}
