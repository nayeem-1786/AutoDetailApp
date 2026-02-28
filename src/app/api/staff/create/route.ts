import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeCreateSchema } from '@/lib/utils/validation';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(request: NextRequest) {
  try {
    const caller = await getEmployeeFromSession();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(caller.id, 'settings.manage_users');
    if (denied) return denied;

    const body = await request.json();

    // Validate input
    const parsed = employeeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { password, pin_code, ...employeeData } = parsed.data;
    const adminClient = createAdminClient();

    // Look up role_id from roles table
    const { data: roleRow, error: roleError } = await adminClient
      .from('roles')
      .select('id')
      .eq('name', employeeData.role)
      .single();

    if (roleError || !roleRow) {
      return NextResponse.json(
        { error: `Invalid role: ${employeeData.role}` },
        { status: 400 }
      );
    }

    // Map role name to valid enum value; custom roles fall back to 'detailer'
    const VALID_ROLE_ENUMS = ['super_admin', 'admin', 'cashier', 'detailer'];
    const roleEnum = VALID_ROLE_ENUMS.includes(employeeData.role)
      ? employeeData.role
      : 'detailer';

    // Check for duplicate PIN
    if (pin_code) {
      const { data: existing } = await adminClient
        .from('employees')
        .select('id, first_name, last_name')
        .eq('pin_code', pin_code)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: `PIN already in use by ${existing.first_name} ${existing.last_name}` },
          { status: 409 }
        );
      }
    }

    // Create Supabase auth user
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email: employeeData.email,
      password: password,
      email_confirm: true,
    });

    if (authError) {
      console.error('Auth user creation error:', authError);
      return NextResponse.json(
        { error: authError.message || 'Failed to create auth user' },
        { status: 400 }
      );
    }

    if (!authUser.user) {
      return NextResponse.json(
        { error: 'Auth user creation returned no user' },
        { status: 500 }
      );
    }

    // Create employee record
    const { data: employee, error: employeeError } = await adminClient
      .from('employees')
      .insert({
        auth_user_id: authUser.user.id,
        first_name: employeeData.first_name,
        last_name: employeeData.last_name,
        email: employeeData.email,
        phone: employeeData.phone || null,
        role: roleEnum,
        role_id: roleRow.id,
        pin_code: pin_code || null,
        hourly_rate: employeeData.hourly_rate ?? null,
        bookable_for_appointments: employeeData.bookable_for_appointments,
        status: 'active',
      })
      .select('*')
      .single();

    if (employeeError) {
      console.error('Employee creation error:', employeeError);
      // Try to clean up the auth user since employee creation failed
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json(
        { error: employeeError.message || 'Failed to create employee record' },
        { status: 500 }
      );
    }

    logAudit({
      userId: caller.auth_user_id,
      userEmail: caller.email,
      employeeName: [caller.first_name, caller.last_name].filter(Boolean).join(' ') || null,
      action: 'create',
      entityType: 'employee',
      entityId: employee.id,
      entityLabel: `${employee.first_name} ${employee.last_name}`.trim(),
      details: { role: employee.role },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (err) {
    console.error('Staff create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
