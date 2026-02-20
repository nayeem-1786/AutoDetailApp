import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const BUCKET = 'cms-assets';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

// ---------------------------------------------------------------------------
// POST /api/admin/upload/content-image — Upload an image for HTML content
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP, SVG, and GIF files are supported' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File must be under 5MB' },
        { status: 400 }
      );
    }

    const folder = request.nextUrl.searchParams.get('folder') || 'general';
    const supabase = createAdminClient();

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `content-images/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        upsert: false,
        cacheControl: '31536000',
        contentType: file.type,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      filename: file.name,
      size: file.size,
      path,
    });
  } catch (err) {
    console.error('Content image upload error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/admin/upload/content-image — Remove an image from storage
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const url = body.url as string;
    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    // Extract storage path from the public URL
    const match = url.match(/cms-assets\/(.+)/);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid storage URL' },
        { status: 400 }
      );
    }

    const storagePath = match[1];
    const supabase = createAdminClient();
    await supabase.storage.from(BUCKET).remove([storagePath]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Content image delete error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/upload/content-images — List uploaded content images
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const folder = request.nextUrl.searchParams.get('folder') || 'general';
    const supabase = createAdminClient();

    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(`content-images/${folder}`, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const images = (files || [])
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => {
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(`content-images/${folder}/${f.name}`);

        return {
          url: urlData.publicUrl,
          filename: f.name,
          size: f.metadata?.size ?? 0,
          created_at: f.created_at,
        };
      });

    return NextResponse.json({ images });
  } catch (err) {
    console.error('Content image list error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
