import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get all active, bookable employees
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, first_name, last_name, role, bookable_for_appointments')
      .eq('bookable_for_appointments', true)
      .eq('status', 'active')
      .order('first_name');

    if (empError) {
      console.error('Error fetching employees:', empError);
      return NextResponse.json(
        { error: 'Failed to fetch employees' },
        { status: 500 }
      );
    }

    if (!employees || employees.length === 0) {
      return NextResponse.json({ schedules: [] });
    }

    // Get all schedules for these employees
    const employeeIds = employees.map((e) => e.id);
    const { data: allSchedules, error: schedError } = await supabase
      .from('employee_schedules')
      .select('*')
      .in('employee_id', employeeIds)
      .order('day_of_week');

    if (schedError) {
      console.error('Error fetching schedules:', schedError);
      return NextResponse.json(
        { error: 'Failed to fetch schedules' },
        { status: 500 }
      );
    }

    // Group schedules by employee
    const schedulesByEmployee: Record<string, typeof allSchedules> = {};
    for (const sched of allSchedules ?? []) {
      if (!schedulesByEmployee[sched.employee_id]) {
        schedulesByEmployee[sched.employee_id] = [];
      }
      schedulesByEmployee[sched.employee_id].push(sched);
    }

    const schedules = employees.map((emp) => ({
      employee: {
        id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        role: emp.role,
      },
      schedule: schedulesByEmployee[emp.id] ?? [],
    }));

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error('Staff schedules GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
