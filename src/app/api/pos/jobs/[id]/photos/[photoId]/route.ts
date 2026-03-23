import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';

/**
 * PATCH /api/pos/jobs/[id]/photos/[photoId] — Update photo metadata
 * Body: { annotation_data?, notes?, is_internal?, is_featured? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: jobId, photoId } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Permission check: editing photo metadata requires photos.upload
    const canEdit = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'photos.upload');
    if (!canEdit) {
      return NextResponse.json({ error: 'Forbidden', message: 'Missing permission: photos.upload' }, { status: 403 });
    }

    const body = await request.json();

    // Featured toggle additionally requires photos.approve_marketing
    if ('is_featured' in body) {
      const canApprove = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'photos.approve_marketing');
      if (!canApprove) {
        return NextResponse.json({ error: 'Forbidden', message: 'Missing permission: photos.approve_marketing' }, { status: 403 });
      }
    }

    const allowedFields = ['annotation_data', 'notes', 'is_internal', 'is_featured'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data: photo, error } = await supabase
      .from('job_photos')
      .update(updates)
      .eq('id', photoId)
      .eq('job_id', jobId)
      .select('*')
      .single();

    if (error) {
      console.error('Photo update error:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 });
    }

    return NextResponse.json({ data: photo });
  } catch (err) {
    console.error('Photo update route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/pos/jobs/[id]/photos/[photoId] — Delete photo and storage files
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { id: jobId, photoId } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const canDelete = await checkPosPermission(supabase, posEmployee.role, posEmployee.employee_id, 'photos.delete');
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden', message: 'Missing permission: photos.delete' }, { status: 403 });
    }

    // Get photo to find storage path
    const { data: photo, error: fetchError } = await supabase
      .from('job_photos')
      .select('storage_path')
      .eq('id', photoId)
      .eq('job_id', jobId)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Delete from storage (main + thumbnail)
    const thumbPath = photo.storage_path.replace('.jpg', '_thumb.jpg');
    await supabase.storage.from('job-photos').remove([photo.storage_path, thumbPath]);

    // Delete DB record
    const { error: deleteError } = await supabase
      .from('job_photos')
      .delete()
      .eq('id', photoId)
      .eq('job_id', jobId);

    if (deleteError) {
      console.error('Photo delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Photo delete route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
