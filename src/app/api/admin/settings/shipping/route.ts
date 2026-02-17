import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — fetch shipping settings (singleton row)
export async function GET() {
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('shipping_settings')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask API keys — never return full keys
  const masked = {
    ...data,
    shippo_api_key_live: data.shippo_api_key_live ? maskApiKey(data.shippo_api_key_live) : null,
    shippo_api_key_test: data.shippo_api_key_test ? maskApiKey(data.shippo_api_key_test) : null,
  };

  return NextResponse.json({ data: masked });
}

// PUT — update shipping settings
export async function PUT(request: NextRequest) {
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

  // Allowlist fields
  const allowedFields = [
    'shippo_api_key_live', 'shippo_api_key_test', 'shippo_mode',
    'ship_from_name', 'ship_from_company', 'ship_from_street1', 'ship_from_street2',
    'ship_from_city', 'ship_from_state', 'ship_from_zip', 'ship_from_country',
    'ship_from_phone', 'ship_from_email',
    'default_parcel_length', 'default_parcel_width', 'default_parcel_height',
    'default_parcel_distance_unit', 'default_parcel_weight', 'default_parcel_mass_unit',
    'offer_free_shipping', 'free_shipping_threshold', 'flat_rate_enabled', 'flat_rate_amount',
    'enabled_carriers', 'enabled_service_levels',
    'handling_fee_type', 'handling_fee_amount',
    'show_estimated_delivery', 'show_carrier_logo', 'sort_rates_by',
    'local_pickup_enabled', 'local_pickup_address', 'local_pickup_instructions',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      // Skip masked API keys (don't overwrite real key with mask)
      if ((key === 'shippo_api_key_live' || key === 'shippo_api_key_test') && isMasked(body[key])) {
        continue;
      }
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the singleton ID
  const { data: current } = await admin
    .from('shipping_settings')
    .select('id')
    .limit(1)
    .single();

  if (!current) {
    return NextResponse.json({ error: 'Shipping settings not found' }, { status: 404 });
  }

  const { error } = await admin
    .from('shipping_settings')
    .update(updates)
    .eq('id', current.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch updated record with masked keys
  const { data: updated } = await admin
    .from('shipping_settings')
    .select('*')
    .eq('id', current.id)
    .single();

  const masked = updated ? {
    ...updated,
    shippo_api_key_live: updated.shippo_api_key_live ? maskApiKey(updated.shippo_api_key_live) : null,
    shippo_api_key_test: updated.shippo_api_key_test ? maskApiKey(updated.shippo_api_key_test) : null,
  } : null;

  return NextResponse.json({ data: masked });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 8) + '••••••••' + key.slice(-4);
}

function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.includes('••••••••');
}
