import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

/**
 * GET /api/pos/jobs/[id]/photos — List photos for a job
 * Query params: ?phase=intake&zone=exterior_front
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const phase = searchParams.get('phase');
    const zone = searchParams.get('zone');

    let query = supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id)
      .order('zone')
      .order('sort_order');

    if (phase) query = query.eq('phase', phase);
    if (zone) query = query.eq('zone', zone);

    const { data: photos, error } = await query;

    if (error) {
      console.error('Photos list error:', error);
      return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
    }

    return NextResponse.json({ data: photos ?? [] });
  } catch (err) {
    console.error('Photos list route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/pos/jobs/[id]/photos — Upload a photo
 * Multipart form data: image (file), zone, phase, notes?, is_internal?, annotation_data?
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const zone = formData.get('zone') as string;
    const phase = formData.get('phase') as string;
    const notes = formData.get('notes') as string | null;
    const isInternal = formData.get('is_internal') === 'true';
    const annotationDataRaw = formData.get('annotation_data') as string | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }
    if (!zone) {
      return NextResponse.json({ error: 'Zone is required' }, { status: 400 });
    }
    if (!phase || !['intake', 'progress', 'completion'].includes(phase)) {
      return NextResponse.json({ error: 'Valid phase is required (intake/progress/completion)' }, { status: 400 });
    }

    let annotationData = null;
    if (annotationDataRaw) {
      try {
        annotationData = JSON.parse(annotationDataRaw);
      } catch {
        // ignore invalid JSON
      }
    }

    // Read file buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process with sharp: resize to max 1920px width, JPEG 80%
    const processedImage = await sharp(buffer)
      .rotate() // auto-rotate based on EXIF
      .resize(1920, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Generate thumbnail: 400px width
    const thumbnail = await sharp(buffer)
      .rotate()
      .resize(400, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();

    const photoUuid = randomUUID();
    const mainPath = `${jobId}/${photoUuid}.jpg`;
    const thumbPath = `${jobId}/${photoUuid}_thumb.jpg`;

    // Upload main image
    const { error: mainUploadError } = await supabase.storage
      .from('job-photos')
      .upload(mainPath, processedImage, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });

    if (mainUploadError) {
      console.error('Main image upload error:', mainUploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    // Upload thumbnail
    const { error: thumbUploadError } = await supabase.storage
      .from('job-photos')
      .upload(thumbPath, thumbnail, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      });

    if (thumbUploadError) {
      console.error('Thumbnail upload error:', thumbUploadError);
      // Continue — thumbnail is non-critical
    }

    // Get public URLs
    const { data: mainUrlData } = supabase.storage.from('job-photos').getPublicUrl(mainPath);
    const { data: thumbUrlData } = supabase.storage.from('job-photos').getPublicUrl(thumbPath);

    // Get next sort_order for this zone+phase
    const { data: existingPhotos } = await supabase
      .from('job_photos')
      .select('sort_order')
      .eq('job_id', jobId)
      .eq('zone', zone)
      .eq('phase', phase)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = existingPhotos && existingPhotos.length > 0
      ? existingPhotos[0].sort_order + 1
      : 0;

    // Create job_photos record
    const { data: photo, error: insertError } = await supabase
      .from('job_photos')
      .insert({
        job_id: jobId,
        zone,
        phase,
        image_url: mainUrlData.publicUrl,
        thumbnail_url: thumbUploadError ? null : thumbUrlData.publicUrl,
        storage_path: mainPath,
        notes: notes || null,
        annotation_data: annotationData,
        is_internal: isInternal,
        sort_order: nextSortOrder,
        created_by: posEmployee.employee_id,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Photo record insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save photo record' }, { status: 500 });
    }

    return NextResponse.json({ data: photo }, { status: 201 });
  } catch (err) {
    console.error('Photo upload route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
