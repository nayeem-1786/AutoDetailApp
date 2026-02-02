import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeCreateSchema } from '@/lib/utils/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const parsed = employeeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { password, ...employeeData } = parsed.data;
    const adminClient = createAdminClient();

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
        role: employeeData.role,
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

    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (err) {
    console.error('Staff create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
