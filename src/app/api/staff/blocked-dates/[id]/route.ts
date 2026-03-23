import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.manage_schedule');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase
      .from('blocked_dates')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting blocked date:', error);
      return NextResponse.json(
        { error: 'Failed to delete blocked date' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Blocked date DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
