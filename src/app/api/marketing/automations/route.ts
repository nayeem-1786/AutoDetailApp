import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lifecycleRuleSchema } from '@/lib/utils/validation';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('lifecycle_rules')
      .select('*, services:trigger_service_id(id, name), coupons:coupon_id(id, name, code)')
      .order('chain_order')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    console.error('List automations error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: employee } = await admin
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = lifecycleRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('lifecycle_rules')
      .insert(parsed.data)
      .select()
      .single();

    if (error) throw error;

    logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'create',
      entityType: 'campaign',
      entityId: data.id,
      entityLabel: data.name,
      details: { trigger_type: data.trigger_type },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Create automation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
