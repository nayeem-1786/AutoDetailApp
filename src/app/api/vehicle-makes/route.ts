import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/vehicle-makes — Public list of active vehicle makes for combobox
export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('vehicle_makes')
    .select('id, name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ makes: data });
}
