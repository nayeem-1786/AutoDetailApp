import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

const BUCKET = 'cms-assets';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// POST /api/admin/vehicle-categories/[id]/image — Upload category image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Verify category exists and get key for storage path
  const { data: category } = await admin
    .from('vehicle_categories')
    .select('id, key, image_url')
    .eq('id', id)
    .single();

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate MIME type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, and WebP files are supported' },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'Image must be under 10MB' },
      { status: 400 }
    );
  }

  // Remove old image from storage if it exists
  if (category.image_url) {
    const match = category.image_url.match(/cms-assets\/(.+)/);
    if (match) {
      await admin.storage.from(BUCKET).remove([match[1]]);
    }
  }

  // Upload new image
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `vehicle-categories/${category.key}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      upsert: true,
      cacheControl: '31536000',
      contentType: file.type,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Get public URL
  const { data: urlData } = admin.storage
    .from(BUCKET)
    .getPublicUrl(path);

  const imageUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // Update category record
  const { data: updated, error: updateError } = await admin
    .from('vehicle_categories')
    .update({ image_url: imageUrl, image_alt: `${category.key} category` })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}

// DELETE /api/admin/vehicle-categories/[id]/image — Remove category image
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getEmployeeFromSession();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Get current category
  const { data: category } = await admin
    .from('vehicle_categories')
    .select('id, key, image_url')
    .eq('id', id)
    .single();

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  // Remove from storage if image exists
  if (category.image_url) {
    const match = category.image_url.match(/cms-assets\/(.+?)(\?|$)/);
    if (match) {
      await admin.storage.from(BUCKET).remove([match[1]]);
    }
  }

  // Clear image fields on category record
  const { data: updated, error } = await admin
    .from('vehicle_categories')
    .update({ image_url: null, image_alt: null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}
