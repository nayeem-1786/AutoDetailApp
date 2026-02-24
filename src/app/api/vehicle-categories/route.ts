import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/vehicle-categories — Public list of active vehicle categories
// No auth required (used by booking flow)
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('vehicle_categories')
    .select('id, key, display_name, description, image_url, image_alt, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
