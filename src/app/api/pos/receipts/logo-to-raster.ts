import sharp from 'sharp';

/**
 * Star TSP100 full printable width at 203dpi for 80mm paper.
 * Every raster row sent to the printer must be exactly this many pixels wide.
 */
const PRINTER_WIDTH_PX = 576;
const ROW_BYTE_COUNT = PRINTER_WIDTH_PX / 8; // 72

/**
 * Fetch an image URL and convert it to Star TSP100 raster bitmap bytes.
 *
 * Star Line Mode raster printing protocol:
 *   Enter raster mode:  ESC * r A  (0x1B 0x2A 0x72 0x41)
 *   Send each row:      b nL nH d1 d2 ... dk
 *     where nL nH = row byte count in little-endian (width_pixels / 8)
 *     and d1..dk = pixel data, MSB = leftmost pixel, 1 = black, 0 = white
 *   Exit raster mode:   ESC * r B  (0x1B 0x2A 0x72 0x42)
 *
 * Returns empty Uint8Array on failure (logo silently skipped).
 *
 * @param imageUrl - The image URL (Supabase storage)
 * @param cssWidth - Logo width from receipt config (CSS pixels). Converted to printer pixels (~2x for 203dpi).
 * @param alignment - 'left' | 'center' | 'right'
 */
export async function logoToEscPosRaster(
  imageUrl: string,
  cssWidth = 200,
  alignment: 'left' | 'center' | 'right' = 'center'
): Promise<Uint8Array> {
  try {
    // Convert CSS px to printer px (~2x since 200px CSS ≈ 400px at 203dpi), cap at printer width
    const maxWidthPx = Math.min(Math.round(cssWidth * 2), PRINTER_WIDTH_PX);

    // 1. Fetch the image with a 5-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(imageUrl, { signal: controller.signal });
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
      console.error('Logo fetch failed or timed out:', imageUrl);
      return new Uint8Array(0);
    }

    if (!response.ok) {
      console.error('Logo fetch returned', response.status, imageUrl);
      return new Uint8Array(0);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // 2. Resize, convert to grayscale, get raw 8-bit pixels
    const { data: pixels, info } = await sharp(buffer)
      .resize({ width: maxWidthPx, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imgWidth = info.width;
    const imgHeight = info.height;

    // 3. Calculate alignment padding (in pixels)
    let leftPad = 0;
    if (alignment === 'center') {
      leftPad = Math.floor((PRINTER_WIDTH_PX - imgWidth) / 2);
    } else if (alignment === 'right') {
      leftPad = PRINTER_WIDTH_PX - imgWidth;
    }
    leftPad = Math.max(0, leftPad);

    // 4. Build the Star raster command sequence
    const parts: number[] = [];

    // Enter raster mode: ESC * r A
    parts.push(0x1B, 0x2A, 0x72, 0x41);

    // Row byte count in little-endian
    const nL = ROW_BYTE_COUNT & 0xFF;
    const nH = (ROW_BYTE_COUNT >> 8) & 0xFF;

    // 5. Convert each pixel row to 1-bit packed bytes (full printer width)
    for (let y = 0; y < imgHeight; y++) {
      // Build a full-width row of pixel values (0-255)
      // Left padding = white (255), image pixels, right padding = white (255)
      const fullRow = new Uint8Array(PRINTER_WIDTH_PX);
      fullRow.fill(255); // white background

      // Copy image pixels into the correct position
      const rowOffset = y * imgWidth;
      for (let x = 0; x < imgWidth; x++) {
        fullRow[leftPad + x] = pixels[rowOffset + x];
      }

      // Pack into 1-bit bytes: pixel < 128 = black (bit=1), >= 128 = white (bit=0)
      // MSB = leftmost pixel in each group of 8
      const rowBytes = new Uint8Array(ROW_BYTE_COUNT);
      for (let byteIdx = 0; byteIdx < ROW_BYTE_COUNT; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = fullRow[byteIdx * 8 + bit];
          if (px < 128) {
            byte |= (0x80 >> bit); // black pixel
          }
        }
        rowBytes[byteIdx] = byte;
      }

      // Row command: b nL nH [data]
      parts.push(0x62, nL, nH);
      for (let i = 0; i < ROW_BYTE_COUNT; i++) {
        parts.push(rowBytes[i]);
      }
    }

    // Exit raster mode: ESC * r B
    parts.push(0x1B, 0x2A, 0x72, 0x42);

    return new Uint8Array(parts);
  } catch (err) {
    console.error('Logo raster conversion failed:', err);
    return new Uint8Array(0);
  }
}
