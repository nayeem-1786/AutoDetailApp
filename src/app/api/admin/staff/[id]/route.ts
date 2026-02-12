import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await getEmployeeFromSession();
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(caller.id, 'settings.manage_users');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const { first_name, last_name, email, phone, role, pin_code, hourly_rate, bookable_for_appointments } = body;

    const supabase = createAdminClient();

    // Fetch current employee to check for email change
    const { data: current, error: fetchError } = await supabase
      .from('employees')
      .select('auth_user_id, email')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Check for duplicate PIN
    if (pin_code) {
      const { data: existing } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('pin_code', pin_code)
        .neq('id', id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: `PIN already in use by ${existing.first_name} ${existing.last_name}` },
          { status: 409 }
        );
      }
    }

    // Look up role_id from roles table when role is provided
    let role_id: string | undefined;
    if (role) {
      const { data: roleRow } = await supabase
        .from('roles')
        .select('id')
        .eq('name', role)
        .single();
      if (roleRow) {
        role_id = roleRow.id;
      }
    }

    // Update employee record
    const updateData: Record<string, unknown> = {
      first_name,
      last_name,
      email,
      phone: phone || null,
      role,
      pin_code: pin_code || null,
      hourly_rate: hourly_rate ?? null,
      bookable_for_appointments,
    };
    if (role_id) {
      updateData.role_id = role_id;
    }

    const { error: updateError } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If email changed and employee has auth account, sync to Supabase Auth
    if (email && email !== current.email && current.auth_user_id) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        current.auth_user_id,
        { email, email_confirm: true }
      );

      if (authError) {
        // Revert employee email on auth failure
        await supabase
          .from('employees')
          .update({ email: current.email })
          .eq('id', id);

        return NextResponse.json(
          { error: `Failed to update login email: ${authError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Staff update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
