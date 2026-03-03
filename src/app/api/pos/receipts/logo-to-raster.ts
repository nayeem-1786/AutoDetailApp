import sharp from 'sharp';

const ESC = 0x1B;

/**
 * Convert a logo image URL to self-contained ESC/POS raster bytes.
 * Server-only — uses sharp for image processing.
 *
 * The returned Uint8Array contains alignment + GS v 0 raster command + bitmap
 * data + alignment reset. It can be inserted as-is into the ESC/POS byte stream.
 *
 * Returns empty Uint8Array on failure (logo silently skipped).
 */
export async function logoToEscPosRaster(
  imageUrl: string,
  targetWidth: number,
  alignment: 'left' | 'center' | 'right'
): Promise<Uint8Array> {
  try {
    // Fetch image from Supabase storage
    const response = await fetch(imageUrl);
    if (!response.ok) return new Uint8Array(0);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Width must be multiple of 8 for bitmap byte packing, max 576 dots (3-inch paper)
    const maxWidth = Math.min(targetWidth, 576);
    const alignedWidth = Math.ceil(maxWidth / 8) * 8;

    // Resize maintaining aspect ratio, convert to single-channel grayscale
    const { data, info } = await sharp(buffer)
      .resize(alignedWidth, null, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Actual output width may differ from alignedWidth — re-align
    const bitmapWidth = Math.ceil(info.width / 8) * 8;
    const bytesPerRow = bitmapWidth / 8;
    const bitmapData = new Uint8Array(bytesPerRow * info.height);

    // Convert grayscale pixels to 1-bit monochrome
    // Dark pixels (luminance < 128) = ink = bit 1, light = paper = bit 0
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

    // Alignment byte: 0x00=left, 0x01=center, 0x02=right
    const alignByte = alignment === 'center' ? 0x01 : alignment === 'right' ? 0x02 : 0x00;

    // GS v 0 dimensions (little-endian 16-bit)
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = info.height & 0xFF;
    const yH = (info.height >> 8) & 0xFF;

    // Build self-contained byte sequence:
    //   1. Set alignment (ESC GS a n)
    //   2. GS v 0 raster command + bitmap data
    //   3. Reset alignment to left (ESC GS a 0)
    const header = new Uint8Array([
      ESC, 0x1D, 0x61, alignByte,   // Set alignment
      0x1D, 0x76, 0x30, 0x00,       // GS v 0, normal mode
      xL, xH, yL, yH,               // Bytes per row, height in dots
    ]);

    const footer = new Uint8Array([
      ESC, 0x1D, 0x61, 0x00,        // Reset to left alignment
    ]);

    // Concatenate into single Uint8Array
    const result = new Uint8Array(header.length + bitmapData.length + footer.length);
    result.set(header, 0);
    result.set(bitmapData, header.length);
    result.set(footer, header.length + bitmapData.length);

    return result;
  } catch (error) {
    console.error('Failed to convert logo for ESC/POS:', error);
    return new Uint8Array(0);
  }
}
