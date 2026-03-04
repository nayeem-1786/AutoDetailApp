import sharp from 'sharp';

/**
 * Star TSP100 full printable width at 203dpi for 80mm paper.
 * Every raster row sent to the printer must be exactly this many pixels wide (72 bytes).
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
 * @param url - The image URL (Supabase storage)
 * @param maxWidthPx - Maximum width in pixels (Star TSP100 80mm paper = 576px at 203dpi,
 *                     but content area is ~546px; use 384 for safe default)
 * @param alignment - 'left' | 'center' | 'right'
 * @returns Uint8Array of complete raster commands, or null if fetch/processing fails
 */
export async function imageToStarRaster(
  url: string,
  maxWidthPx = 384,
  alignment: 'left' | 'center' | 'right' = 'center'
): Promise<Uint8Array | null> {
  try {
    // 1. Fetch the image from the URL with a 5-second timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
      console.error('Logo fetch failed or timed out:', url);
      return null;
    }

    if (!response.ok) {
      console.error('Logo fetch returned', response.status, url);
      return null;
    }

    // 2. Load into sharp from the response buffer
    const buffer = Buffer.from(await response.arrayBuffer());

    // 3. Resize: constrain width to maxWidthPx, maintain aspect ratio
    // 4. Flatten alpha onto white background, convert to grayscale, get raw 1-channel 8-bit pixels
    //    CRITICAL: .flatten() composites any alpha channel onto white BEFORE grayscale conversion.
    //    Without this, PNGs with transparency produce 2-channel (grey+alpha) output and the
    //    pixel indexing below reads wrong bytes, producing garbage on the printer.
    const { data: pixels, info } = await sharp(buffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({ width: maxWidthPx, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imgWidth = info.width;
    const imgHeight = info.height;

    // 5. Pad the pixel width to a multiple of 8 (raster rows must be byte-aligned)
    //    Since we send full PRINTER_WIDTH_PX rows (576px, already multiple of 8),
    //    the image itself doesn't need separate byte-alignment — it's embedded in the full row.

    // 6. Apply alignment via pixel padding
    let leftPad = 0;
    if (alignment === 'center') {
      leftPad = Math.floor((PRINTER_WIDTH_PX - imgWidth) / 2);
    } else if (alignment === 'right') {
      leftPad = PRINTER_WIDTH_PX - imgWidth;
    }
    leftPad = Math.max(0, leftPad);

    // 7. Build the Star raster command sequence
    const parts: number[] = [];

    // 8. Start: ESC * r A — enter raster mode
    parts.push(0x1B, 0x2A, 0x72, 0x41);

    // Row byte count in little-endian
    const nL = ROW_BYTE_COUNT & 0xFF;
    const nH = (ROW_BYTE_COUNT >> 8) & 0xFF;

    // Convert each pixel row to 1-bit packed bytes (full printer width)
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

    // End: ESC * r B — exit raster mode
    parts.push(0x1B, 0x2A, 0x72, 0x42);

    // 9. Concatenate all bytes into a single Uint8Array and return
    return new Uint8Array(parts);
  } catch (err) {
    console.error('Logo raster conversion failed:', err);
    return null;
  }
}
