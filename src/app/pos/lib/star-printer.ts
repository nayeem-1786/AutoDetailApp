import type { ReceiptLine } from './receipt-template';

/**
 * Star TSP-100III WebPRNT integration.
 * Sends receipt data via HTTP to the printer's WebPRNT endpoint.
 * Printer must be on the same network and WebPRNT enabled.
 */

/**
 * Build a Star WebPRNT XML document from receipt lines.
 */
function buildWebPRNTXml(lines: ReceiptLine[]): string {
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
        const right = line.right ?? '';
        const gap = 48 - left.length - right.length;
        const padded = left + ' '.repeat(Math.max(1, gap)) + right;
        body += `<text>${escapeXml(padded)}\n</text>\n`;
        break;
      }

      case 'spacer':
        body += `<text>\n</text>\n`;
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
  const xml = buildWebPRNTXml(lines);
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
