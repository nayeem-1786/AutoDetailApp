import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAddress } from '@/lib/services/shippo';

// POST — validate a ship-from address via Shippo
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { street1, street2, city, state, zip, country } = body;

  if (!street1 || !city || !state || !zip || !country) {
    return NextResponse.json({ error: 'Address fields required (street1, city, state, zip, country)' }, { status: 400 });
  }

  try {
    const result = await validateAddress({ street1, street2, city, state, zip, country });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Address validation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
