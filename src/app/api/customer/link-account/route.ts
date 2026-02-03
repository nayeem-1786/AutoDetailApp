import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone } from '@/lib/utils/format';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { first_name, last_name, email, phone } = body;

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Guard: reject if this email belongs to an employee
    const { data: emp } = await admin
      .from('employees')
      .select('id')
      .eq('email', email)
      .limit(1)
      .single();

    if (emp) {
      return NextResponse.json(
        { error: 'This email is associated with a staff account. Please use the staff login.' },
        { status: 403 }
      );
    }

    // (1) Check if a customer record already has this auth_user_id
    const { data: alreadyLinked } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .single();

    if (alreadyLinked) {
      return NextResponse.json({ success: true, customer_id: alreadyLinked.id });
    }

    // Normalize phone
    const e164Phone = phone ? normalizePhone(phone) : null;

    // (2) Try to find existing customer by phone where auth_user_id is null
    if (e164Phone) {
      const { data: existingByPhone } = await admin
        .from('customers')
        .select('id, first_name, last_name, email')
        .eq('phone', e164Phone)
        .is('auth_user_id', null)
        .limit(1)
        .single();

      if (existingByPhone) {
        const updates: Record<string, unknown> = {
          auth_user_id: user.id,
          updated_at: new Date().toISOString(),
        };
        if (!existingByPhone.first_name && first_name) updates.first_name = first_name;
        if (!existingByPhone.last_name && last_name) updates.last_name = last_name;
        if (!existingByPhone.email && email) updates.email = email;

        await admin.from('customers').update(updates).eq('id', existingByPhone.id);

        return NextResponse.json({ success: true, customer_id: existingByPhone.id });
      }
    }

    // (3) Try to find existing customer by email where auth_user_id is null
    const { data: existingByEmail } = await admin
      .from('customers')
      .select('id, first_name, last_name, phone')
      .eq('email', email)
      .is('auth_user_id', null)
      .limit(1)
      .single();

    if (existingByEmail) {
      const updates: Record<string, unknown> = {
        auth_user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      if (!existingByEmail.first_name && first_name) updates.first_name = first_name;
      if (!existingByEmail.last_name && last_name) updates.last_name = last_name;
      if (!existingByEmail.phone && e164Phone) updates.phone = e164Phone;

      await admin.from('customers').update(updates).eq('id', existingByEmail.id);

      return NextResponse.json({ success: true, customer_id: existingByEmail.id });
    }

    // (4) No existing customer found — create a new one
    const { data: newCustomer, error: custErr } = await admin
      .from('customers')
      .insert({
        auth_user_id: user.id,
        first_name,
        last_name,
        email,
        phone: e164Phone,
      })
      .select('id')
      .single();

    if (custErr || !newCustomer) {
      console.error('Customer creation failed:', custErr?.message);
      return NextResponse.json(
        { error: 'Failed to create customer record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, customer_id: newCustomer.id },
      { status: 201 }
    );
  } catch (err) {
    console.error('Link account error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
