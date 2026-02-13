import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Annotation } from '@/lib/utils/job-zones';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build an SVG overlay from annotation data at the given pixel dimensions.
 * Annotations use percentage-based coordinates (0–100), mapped here to pixels.
 */
function buildAnnotationSvg(
  annotations: Annotation[],
  width: number,
  height: number
): string {
  const strokeWidth = Math.max(3, Math.round(width * 0.004));
  const fontSize = Math.max(16, Math.round(height * 0.035));
  const markerSize = Math.max(10, Math.round(strokeWidth * 3));
  const markerHalf = Math.round(markerSize * 0.35);
  const markerFull = Math.round(markerSize * 0.7);

  const elements = annotations.map((ann) => {
    if (ann.type === 'circle') {
      const cx = (ann.x / 100) * width;
      const cy = (ann.y / 100) * height;
      const rx = (ann.radius / 100) * width;
      const ry = (ann.radius / 100) * height;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${ann.color}" stroke-width="${strokeWidth}"/>`;
    }
    if (ann.type === 'arrow') {
      const x1 = (ann.x1 / 100) * width;
      const y1 = (ann.y1 / 100) * height;
      const x2 = (ann.x2 / 100) * width;
      const y2 = (ann.y2 / 100) * height;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ann.color}" stroke-width="${strokeWidth}" marker-end="url(#ah)"/>`;
    }
    if (ann.type === 'text') {
      const x = (ann.x / 100) * width;
      const y = (ann.y / 100) * height;
      const textStroke = Math.round(fontSize / 6);
      return `<text x="${x}" y="${y}" fill="${ann.color}" font-size="${fontSize}" font-weight="bold" paint-order="stroke" stroke="white" stroke-width="${textStroke}px">${escapeXml(ann.label)}</text>`;
    }
    return '';
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs>
<marker id="ah" markerWidth="${markerSize}" markerHeight="${markerFull}" refX="${markerSize}" refY="${markerHalf}" orient="auto">
<polygon points="0 0, ${markerSize} ${markerHalf}, 0 ${markerFull}" fill="#FF0000"/>
</marker>
</defs>
${elements.join('\n')}
</svg>`;
}

/**
 * Render annotations onto an image, returning the composited JPEG buffer.
 */
export async function renderAnnotatedImage(
  imageUrl: string,
  annotations: Annotation[]
): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const imageBuffer = Buffer.from(await res.arrayBuffer());

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  const svgOverlay = buildAnnotationSvg(annotations, width, height);

  const result = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return result;
}

/**
 * Get a public URL for the annotated version of a photo.
 * If the photo has no annotations, returns the original image_url.
 * Renders annotations server-side using sharp, uploads to Supabase Storage.
 */
export async function getAnnotatedPhotoUrl(
  supabase: SupabaseClient,
  photo: { id: string; image_url: string; annotation_data: unknown },
  jobId: string
): Promise<string> {
  const annotations = photo.annotation_data as Annotation[] | null;
  if (!annotations || annotations.length === 0) {
    return photo.image_url;
  }

  try {
    const annotatedBuffer = await renderAnnotatedImage(photo.image_url, annotations);

    const storagePath = `${jobId}/${photo.id}_annotated.jpg`;
    const { error } = await supabase.storage
      .from('job-photos')
      .upload(storagePath, annotatedBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Failed to upload annotated image:', error);
      return photo.image_url;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('job-photos').getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error('Failed to render annotated image:', err);
    return photo.image_url;
  }
}
