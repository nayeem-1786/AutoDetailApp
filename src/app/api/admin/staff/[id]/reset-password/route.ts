import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(
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
    const { action, password } = await request.json();
    const supabase = createAdminClient();

    // Fetch the target employee
    const { data: employee, error: fetchError } = await supabase
      .from('employees')
      .select('id, auth_user_id, email, first_name, last_name')
      .eq('id', id)
      .single();

    if (fetchError || !employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    if (!employee.auth_user_id) {
      return NextResponse.json(
        { error: 'Employee does not have a login account' },
        { status: 400 }
      );
    }

    if (action === 'set_password') {
      if (!password || typeof password !== 'string' || password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(
        employee.auth_user_id,
        { password }
      );

      if (updateError) {
        console.error('Set password error:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      logAudit({
        userId: caller.auth_user_id,
        userEmail: caller.email,
        employeeName: [caller.first_name, caller.last_name].filter(Boolean).join(' ') || null,
        action: 'update',
        entityType: 'employee',
        entityId: id,
        entityLabel: `${employee.first_name} ${employee.last_name}`.trim(),
        details: { action: 'password_set_by_admin' },
        ipAddress: getRequestIp(request),
        source: 'admin',
      });

      return NextResponse.json({ success: true, message: 'Password updated successfully' });
    }

    if (action === 'send_reset_email') {
      if (!employee.email) {
        return NextResponse.json(
          { error: 'Employee does not have an email address on file' },
          { status: 400 }
        );
      }

      const serverClient = await createClient();
      const { error: resetError } = await serverClient.auth.resetPasswordForEmail(
        employee.email,
        {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/login/reset-password`,
        }
      );

      if (resetError) {
        console.error('Reset email error:', resetError);
        return NextResponse.json(
          { error: 'Failed to send password reset email' },
          { status: 500 }
        );
      }

      logAudit({
        userId: caller.auth_user_id,
        userEmail: caller.email,
        employeeName: [caller.first_name, caller.last_name].filter(Boolean).join(' ') || null,
        action: 'update',
        entityType: 'employee',
        entityId: id,
        entityLabel: `${employee.first_name} ${employee.last_name}`.trim(),
        details: { action: 'password_reset_email_sent', email: employee.email },
        ipAddress: getRequestIp(request),
        source: 'admin',
      });

      return NextResponse.json({
        success: true,
        message: `Reset email sent to ${employee.email}`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Staff password reset error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
