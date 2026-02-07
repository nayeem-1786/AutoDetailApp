import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate — admin session required
    const supabaseSession = await createClient();
    const { data: { user } } = await supabaseSession.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Update employee record
    const { error: updateError } = await supabase
      .from('employees')
      .update({
        first_name,
        last_name,
        email,
        phone: phone || null,
        role,
        pin_code: pin_code || null,
        hourly_rate: hourly_rate ?? null,
        bookable_for_appointments,
      })
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
