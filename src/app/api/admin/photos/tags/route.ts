import { NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.view');
    if (denied) return denied;

    const supabase = createAdminClient();

    // Get all unique tags from job_photos using unnest
    const { data, error } = await supabase.rpc('get_unique_photo_tags');

    if (error) {
      // Fallback: fetch tags column directly if RPC doesn't exist
      const { data: photos, error: fallbackErr } = await supabase
        .from('job_photos')
        .select('tags')
        .not('tags', 'eq', '{}');

      if (fallbackErr) throw fallbackErr;

      const tagSet = new Set<string>();
      for (const photo of photos || []) {
        const tags = (photo.tags as string[]) || [];
        for (const t of tags) tagSet.add(t);
      }

      return NextResponse.json({ tags: [...tagSet].sort() });
    }

    const tags = (data || []).map((row: { tag: string }) => row.tag).sort();
    return NextResponse.json({ tags });
  } catch (err) {
    console.error('[admin/photos/tags] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
