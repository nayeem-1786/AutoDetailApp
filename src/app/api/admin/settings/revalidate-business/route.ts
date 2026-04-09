import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from 'next/cache';

/**
 * POST /api/admin/settings/revalidate-business
 * Busts the business-info data cache and the public business-info HTTP cache
 * after the admin saves business profile settings.
 */
export async function POST() {
  // Auth check — only authenticated users can trigger revalidation
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Bust the unstable_cache for getBusinessInfo() and getSeoSettings()
  revalidateTag('business-info');

  // Bust the HTTP cache for /api/public/business-info (s-maxage=300)
  revalidatePath('/api/public/business-info');

  return NextResponse.json({ revalidated: true });
}
