import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.manage');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (typeof body.is_featured === 'boolean') updates.is_featured = body.is_featured;
    if (typeof body.is_internal === 'boolean') updates.is_internal = body.is_internal;
    if (Array.isArray(body.tags)) updates.tags = body.tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Pair-complete validation: when featuring a photo, ensure matching pair exists
    if (updates.is_featured === true) {
      // Get this photo's job_id and zone
      const { data: photo, error: photoErr } = await supabase
        .from('job_photos')
        .select('job_id, zone, phase')
        .eq('id', id)
        .single();

      if (photoErr || !photo) {
        return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
      }

      // Check for matching pair
      const oppositePhase = photo.phase === 'intake' ? 'completion' : 'intake';
      const { count } = await supabase
        .from('job_photos')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', photo.job_id)
        .eq('zone', photo.zone)
        .eq('phase', oppositePhase);

      if (!count || count === 0) {
        const missing = oppositePhase === 'intake' ? 'intake (before)' : 'completion (after)';
        return NextResponse.json(
          { error: `Cannot feature: no matching ${missing} photo for this zone` },
          { status: 400 }
        );
      }

      // Feature both photos in the pair
      const { error: pairError } = await supabase
        .from('job_photos')
        .update({ is_featured: true })
        .eq('job_id', photo.job_id)
        .eq('zone', photo.zone)
        .in('phase', ['intake', 'completion']);

      if (pairError) throw pairError;

      // Apply remaining updates (tags, is_internal) to just this photo
      const otherUpdates = { ...updates };
      delete otherUpdates.is_featured;
      if (Object.keys(otherUpdates).length > 0) {
        const { error: otherErr } = await supabase
          .from('job_photos')
          .update(otherUpdates)
          .eq('id', id);
        if (otherErr) throw otherErr;
      }

      // Return the updated photo
      const { data: updated, error: fetchErr } = await supabase
        .from('job_photos')
        .select()
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      return NextResponse.json({ data: updated });
    }

    // When unfeaturing, unfeatured both sides of the pair
    if (updates.is_featured === false) {
      const { data: photo } = await supabase
        .from('job_photos')
        .select('job_id, zone')
        .eq('id', id)
        .single();

      if (photo) {
        await supabase
          .from('job_photos')
          .update({ is_featured: false })
          .eq('job_id', photo.job_id)
          .eq('zone', photo.zone)
          .in('phase', ['intake', 'completion']);
      }

      // Apply remaining updates to just this photo
      const otherUpdates = { ...updates };
      delete otherUpdates.is_featured;
      if (Object.keys(otherUpdates).length > 0) {
        await supabase.from('job_photos').update(otherUpdates).eq('id', id);
      }

      const { data: updated, error: fetchErr } = await supabase
        .from('job_photos')
        .select()
        .eq('id', id)
        .single();
      if (fetchErr) throw fetchErr;

      return NextResponse.json({ data: updated });
    }

    // Normal update (tags, is_internal only)
    const { data, error } = await supabase
      .from('job_photos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[admin/photos/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
