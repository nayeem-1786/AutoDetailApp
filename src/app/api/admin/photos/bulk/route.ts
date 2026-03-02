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
    const {
      photo_ids,
      is_featured,
      is_internal,
      add_tags,
      remove_tags,
    } = body as {
      photo_ids: string[];
      is_featured?: boolean;
      is_internal?: boolean;
      add_tags?: string[];
      remove_tags?: string[];
    };

    if (!Array.isArray(photo_ids) || photo_ids.length === 0) {
      return NextResponse.json({ error: 'photo_ids array required' }, { status: 400 });
    }

    if (photo_ids.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 photos per bulk update' }, { status: 400 });
    }

    const hasFieldUpdate = typeof is_featured === 'boolean' || typeof is_internal === 'boolean';
    const hasTagUpdate = (add_tags && add_tags.length > 0) || (remove_tags && remove_tags.length > 0);

    if (!hasFieldUpdate && !hasTagUpdate) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let updated = 0;
    let skipped = 0;

    // Handle featuring with pair-complete validation
    if (is_featured === true) {
      // Get all requested photos with their job_id, zone, phase
      const { data: requestedPhotos, error: fetchErr } = await supabase
        .from('job_photos')
        .select('id, job_id, zone, phase')
        .in('id', photo_ids);

      if (fetchErr) throw fetchErr;

      // For each photo, check if pair exists
      const featurableJobZones = new Set<string>();
      const skipIds = new Set<string>();

      for (const photo of requestedPhotos || []) {
        const key = `${photo.job_id}:${photo.zone}`;
        if (featurableJobZones.has(key)) continue; // already checked

        const oppositePhase = photo.phase === 'intake' ? 'completion' : 'intake';
        const { count } = await supabase
          .from('job_photos')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', photo.job_id)
          .eq('zone', photo.zone)
          .eq('phase', oppositePhase);

        if (count && count > 0) {
          featurableJobZones.add(key);
        } else {
          skipIds.add(photo.id);
        }
      }

      // Feature both sides of valid pairs
      for (const key of featurableJobZones) {
        const [jobId, zone] = key.split(':');
        const { error: updateErr } = await supabase
          .from('job_photos')
          .update({ is_featured: true })
          .eq('job_id', jobId)
          .eq('zone', zone)
          .in('phase', ['intake', 'completion']);

        if (!updateErr) {
          updated += 2; // both sides featured
        }
      }

      skipped = skipIds.size;
    } else if (is_featured === false) {
      // Unfeaturing: get job_id+zone for all requested photos, unfeatured both sides
      const { data: requestedPhotos, error: fetchErr } = await supabase
        .from('job_photos')
        .select('id, job_id, zone')
        .in('id', photo_ids);

      if (fetchErr) throw fetchErr;

      const processedKeys = new Set<string>();
      for (const photo of requestedPhotos || []) {
        const key = `${photo.job_id}:${photo.zone}`;
        if (processedKeys.has(key)) continue;
        processedKeys.add(key);

        await supabase
          .from('job_photos')
          .update({ is_featured: false })
          .eq('job_id', photo.job_id)
          .eq('zone', photo.zone)
          .in('phase', ['intake', 'completion']);
      }
      updated = photo_ids.length;
    }

    // Handle is_internal update (no pair validation needed)
    if (typeof is_internal === 'boolean' && typeof is_featured !== 'boolean') {
      const { data, error: updateErr } = await supabase
        .from('job_photos')
        .update({ is_internal })
        .in('id', photo_ids)
        .select();

      if (updateErr) throw updateErr;
      updated = data?.length ?? 0;
    }

    // Handle tag operations
    if (hasTagUpdate) {
      // Get current tags for all photos
      const { data: currentPhotos, error: tagFetchErr } = await supabase
        .from('job_photos')
        .select('id, tags')
        .in('id', photo_ids);

      if (tagFetchErr) throw tagFetchErr;

      for (const photo of currentPhotos || []) {
        let currentTags = (photo.tags as string[]) || [];

        if (add_tags && add_tags.length > 0) {
          const tagSet = new Set(currentTags);
          for (const t of add_tags) tagSet.add(t);
          currentTags = [...tagSet];
        }

        if (remove_tags && remove_tags.length > 0) {
          const removeSet = new Set(remove_tags.map((t) => t.toLowerCase()));
          currentTags = currentTags.filter((t) => !removeSet.has(t.toLowerCase()));
        }

        await supabase
          .from('job_photos')
          .update({ tags: currentTags })
          .eq('id', photo.id);
      }

      if (!hasFieldUpdate) {
        updated = currentPhotos?.length ?? 0;
      }
    }

    return NextResponse.json({ updated, skipped });
  } catch (err) {
    console.error('[admin/photos/bulk] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
