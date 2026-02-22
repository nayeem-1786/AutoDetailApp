import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { lifecycleRuleSchema } from '@/lib/utils/validation';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Get automation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // If only toggling is_active, skip full validation
    if (Object.keys(body).length === 1 && 'is_active' in body) {
      const { data, error } = await admin
        .from('lifecycle_rules')
        .update({ is_active: body.is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      logAudit({
        userId: user.id,
        userEmail: user.email,
        action: 'update',
        entityType: 'campaign',
        entityId: id,
        entityLabel: data.name,
        details: { updated_fields: ['is_active'] },
        ipAddress: getRequestIp(request),
        source: 'admin',
      });

      return NextResponse.json({ data });
    }

    const parsed = lifecycleRuleSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('lifecycle_rules')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'update',
      entityType: 'campaign',
      entityId: id,
      entityLabel: data.name,
      details: { updated_fields: Object.keys(parsed.data) },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Update automation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { error } = await admin
      .from('lifecycle_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'delete',
      entityType: 'campaign',
      entityId: id,
      entityLabel: `Automation #${id.slice(0, 8)}`,
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete automation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
