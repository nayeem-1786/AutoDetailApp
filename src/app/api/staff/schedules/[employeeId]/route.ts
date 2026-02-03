import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeWeeklyScheduleSchema } from '@/lib/utils/validation';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const { employeeId } = await params;
    const body = await request.json();

    // Validate request body
    const parsed = employeeWeeklyScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { schedules } = parsed.data;
    const supabase = createAdminClient();

    // Verify the employee exists and is bookable
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .eq('status', 'active')
      .eq('bookable_for_appointments', true)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found or not bookable' },
        { status: 404 }
      );
    }

    // Delete existing schedules for this employee
    const { error: deleteError } = await supabase
      .from('employee_schedules')
      .delete()
      .eq('employee_id', employeeId);

    if (deleteError) {
      console.error('Error deleting existing schedules:', deleteError);
      return NextResponse.json(
        { error: 'Failed to update schedules' },
        { status: 500 }
      );
    }

    // Insert new schedule rows (only if there are schedules to insert)
    if (schedules.length > 0) {
      const rows = schedules.map((s) => ({
        employee_id: employeeId,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_available: s.is_available,
      }));

      const { error: insertError } = await supabase
        .from('employee_schedules')
        .insert(rows);

      if (insertError) {
        console.error('Error inserting schedules:', insertError);
        return NextResponse.json(
          { error: 'Failed to save schedules' },
          { status: 500 }
        );
      }
    }

    // Return the updated schedules
    const { data: updated, error: fetchError } = await supabase
      .from('employee_schedules')
      .select('*')
      .eq('employee_id', employeeId)
      .order('day_of_week');

    if (fetchError) {
      console.error('Error fetching updated schedules:', fetchError);
      return NextResponse.json(
        { error: 'Schedules saved but failed to fetch updated data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ schedules: updated });
  } catch (err) {
    console.error('Staff schedule PUT error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
