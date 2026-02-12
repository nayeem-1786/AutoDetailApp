import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.manage');
    if (denied) return denied;

    const body = await request.json();
    const { photo_ids, is_featured, is_internal } = body as {
      photo_ids: string[];
      is_featured?: boolean;
      is_internal?: boolean;
    };

    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return NextResponse.json({ error: 'photo_ids array required' }, { status: 400 });
    }

    if (photo_ids.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 photos per bulk update' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof is_featured === 'boolean') updates.is_featured = is_featured;
    if (typeof is_internal === 'boolean') updates.is_internal = is_internal;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('job_photos')
      .update(updates)
      .in('id', photo_ids)
      .select();

    if (error) throw error;

    return NextResponse.json({ data, updated: data?.length ?? 0 });
  } catch (err) {
    console.error('[admin/photos/bulk] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
