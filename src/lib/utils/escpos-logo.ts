import sharp from 'sharp';
import type { ReceiptLine } from '@/app/pos/lib/receipt-template';

/**
 * Convert an image URL to ESC/POS raster bit-image command bytes (GS v 0).
 * Uses `sharp` (server-side only) to resize and convert to 1-bit monochrome.
 * Returns null on failure — logo is silently skipped.
 */
async function convertLogoToRaster(
  url: string,
  targetWidth: number
): Promise<number[] | null> {
  try {
    // Fetch image
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());

    // Align width to 8 pixels (required for 1-bit bitmap byte packing)
    const maxWidth = Math.min(targetWidth, 576); // 576 = max dots for 3-inch paper
    const alignedWidth = Math.ceil(maxWidth / 8) * 8;

    // Resize, convert to single-channel grayscale, get raw pixels
    const { data, info } = await sharp(buffer)
      .resize(alignedWidth, null, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Ensure bitmap width is multiple of 8 (should be, but be safe)
    const bitmapWidth = Math.ceil(info.width / 8) * 8;
    const bytesPerRow = bitmapWidth / 8;
    const bitmapData = new Uint8Array(bytesPerRow * info.height);

    // Convert grayscale to 1-bit monochrome (dark=ink, light=paper)
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const luminance = data[y * info.width + x];
        if (luminance < 128) {
          const byteIndex = y * bytesPerRow + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          bitmapData[byteIndex] |= 1 << bitIndex;
        }
      }
    }

    // GS v 0 — Print raster bit image (standard ESC/POS, supported by Star TSP100III)
    // Format: 1D 76 30 m xL xH yL yH d1...dk
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = info.height & 0xFF;
    const yH = (info.height >> 8) & 0xFF;

    return [
      0x1D, 0x76, 0x30, 0x00, // GS v 0, mode=normal
      xL, xH, yL, yH,
      ...Array.from(bitmapData),
    ];
  } catch (error) {
    console.error('Failed to convert logo for ESC/POS:', error);
    return null;
  }
}

/**
 * Pre-convert all image lines in a receipt to ESC/POS raster data.
 * Must be called server-side (uses sharp). Returns a Map of URL → raster bytes.
 * Pass the result to receiptToEscPos() as the imageData parameter.
 */
export async function prepareReceiptImages(
  lines: ReceiptLine[]
): Promise<Map<string, number[]>> {
  const imageData = new Map<string, number[]>();

  for (const line of lines) {
    if (line.type === 'image' && line.url && !imageData.has(line.url)) {
      const raster = await convertLogoToRaster(line.url, line.width ?? 200);
      if (raster) {
        imageData.set(line.url, raster);
      }
    }
  }

  return imageData;
}
