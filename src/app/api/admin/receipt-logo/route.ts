import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'receipt-assets';

export async function POST(request: NextRequest) {
  try {
    // Authenticate — admin session required
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Parse multipart form
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate type and size
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPG, and WebP files are supported' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'Logo must be under 2MB' }, { status: 400 });
    }

    // Ensure bucket exists (idempotent — will succeed if already exists)
    const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    // Ignore "already exists" error
    if (bucketError && !bucketError.message?.includes('already exists')) {
      return NextResponse.json({ error: `Bucket error: ${bucketError.message}` }, { status: 500 });
    }

    // Upload file
    const ext = file.name.split('.').pop() || 'png';
    const path = `receipt-logo.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({
      url: `${publicUrlData.publicUrl}?t=${Date.now()}`,
    });
  } catch (err) {
    console.error('Receipt logo upload error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Remove all logo files
    const { data: files } = await supabase.storage.from(BUCKET).list('', { limit: 10 });
    if (files && files.length > 0) {
      const paths = files
        .filter((f) => f.name.startsWith('receipt-logo'))
        .map((f) => f.name);
      if (paths.length > 0) {
        await supabase.storage.from(BUCKET).remove(paths);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt logo delete error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
