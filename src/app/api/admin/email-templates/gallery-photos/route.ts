import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';

// GET /api/admin/email-templates/gallery-photos — Browse featured photos for manual gallery pick
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const zone = searchParams.get('zone');
    const tag = searchParams.get('tag');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    const admin = createAdminClient();

    // Query featured photos with both intake and completion phases for pairing
    let query = admin
      .from('job_photos')
      .select('id, job_id, zone, phase, image_url, thumbnail_url, tags, is_featured, created_at')
      .eq('is_featured', true)
      .eq('is_internal', false)
      .in('phase', ['intake', 'completion'])
      .order('created_at', { ascending: false })
      .limit(limit * 4); // Fetch extra to build complete pairs

    if (zone) query = query.eq('zone', zone);
    if (tag) query = query.overlaps('tags', [tag]);

    const { data: photos, error } = await query;
    if (error) throw error;

    // Group by job_id + zone to build before/after pairs
    const pairMap = new Map<string, {
      before: { id: string; url: string; thumbnail?: string } | null;
      after: { id: string; url: string; thumbnail?: string } | null;
      zone: string;
      tags: string[];
      created_at: string;
    }>();

    for (const photo of photos ?? []) {
      const key = `${photo.job_id}:${photo.zone}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          before: null,
          after: null,
          zone: photo.zone,
          tags: photo.tags || [],
          created_at: photo.created_at,
        });
      }
      const pair = pairMap.get(key)!;
      if (photo.phase === 'intake' && !pair.before) {
        pair.before = { id: photo.id, url: photo.image_url, thumbnail: photo.thumbnail_url || undefined };
      } else if (photo.phase === 'completion' && !pair.after) {
        pair.after = { id: photo.id, url: photo.image_url, thumbnail: photo.thumbnail_url || undefined };
      }
    }

    // Only return complete pairs
    const pairs = Array.from(pairMap.values())
      .filter(p => p.before && p.after)
      .slice(0, limit)
      .map(p => ({
        before_url: p.before!.url,
        before_thumbnail: p.before!.thumbnail,
        after_url: p.after!.url,
        after_thumbnail: p.after!.thumbnail,
        zone: p.zone,
        tags: p.tags,
        created_at: p.created_at,
      }));

    // Also fetch available zones and tags for filter UI
    const { data: zones } = await admin.rpc('array_agg_distinct', { col: 'zone', tbl: 'job_photos' }).single();
    const { data: allTags } = await admin
      .from('job_photos')
      .select('tags')
      .eq('is_featured', true)
      .not('tags', 'eq', '{}');

    const uniqueTags = new Set<string>();
    for (const row of allTags ?? []) {
      for (const t of row.tags || []) uniqueTags.add(t);
    }

    return NextResponse.json({
      pairs,
      filters: {
        zones: zones || [],
        tags: Array.from(uniqueTags).sort(),
      },
    });
  } catch (err) {
    console.error('[admin/email-templates/gallery-photos] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
