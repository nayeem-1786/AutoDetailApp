import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/admin/staff/roles/[id] — Update role and/or permissions
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify super_admin
    const { data: caller } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!caller || caller.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { display_name, description, can_access_pos, permissions: permGrants } = body;

    // Fetch the role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Cannot modify super_admin role's permissions
    if (role.is_super && permGrants) {
      return NextResponse.json(
        { error: 'Cannot modify Super Admin permissions — this role bypasses all permission checks' },
        { status: 400 }
      );
    }

    // Update role fields
    const updateFields: Record<string, unknown> = {};
    if (display_name !== undefined) updateFields.display_name = display_name.trim();
    if (description !== undefined) updateFields.description = description?.trim() || null;
    if (can_access_pos !== undefined) updateFields.can_access_pos = can_access_pos;

    if (Object.keys(updateFields).length > 0) {
      updateFields.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('roles')
        .update(updateFields)
        .eq('id', id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    }

    // Upsert permissions if provided
    if (permGrants && typeof permGrants === 'object') {
      const keys = Object.keys(permGrants);
      for (const key of keys) {
        const granted = permGrants[key] === true;

        // Try to update existing row first
        const { data: existingPerm } = await supabase
          .from('permissions')
          .select('id')
          .eq('permission_key', key)
          .eq('role_id', id)
          .is('employee_id', null)
          .maybeSingle();

        if (existingPerm) {
          await supabase
            .from('permissions')
            .update({ granted, updated_at: new Date().toISOString() })
            .eq('id', existingPerm.id);
        } else {
          await supabase
            .from('permissions')
            .insert({
              permission_key: key,
              role_id: id,
              granted,
            });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/admin/staff/roles/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/staff/roles/[id] — Delete a custom role
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify super_admin
    const { data: caller } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();

    if (!caller || caller.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Fetch the role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Cannot delete system roles
    if (role.is_system) {
      return NextResponse.json({ error: 'Cannot delete system roles' }, { status: 400 });
    }

    // Check for assigned employees
    const { data: employees } = await supabase
      .from('employees')
      .select('id')
      .eq('role_id', id)
      .in('status', ['active', 'inactive']);

    const employeeCount = employees?.length || 0;
    if (employeeCount > 0) {
      return NextResponse.json(
        {
          error: 'Cannot delete role with assigned employees. Reassign them first.',
          employee_count: employeeCount,
        },
        { status: 400 }
      );
    }

    // Delete permissions for this role first
    await supabase
      .from('permissions')
      .delete()
      .eq('role_id', id);

    // Delete the role
    const { error: deleteError } = await supabase
      .from('roles')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/staff/roles/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
