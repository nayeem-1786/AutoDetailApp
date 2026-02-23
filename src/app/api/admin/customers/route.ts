import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { normalizePhone } from '@/lib/utils/format';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'customers.create');
    if (denied) return denied;

    const supabase = createAdminClient();
    const body = await request.json();

    const {
      first_name,
      last_name,
      phone,
      email,
      birthday,
      address_line_1,
      address_line_2,
      city,
      state,
      zip,
      notes,
      tags,
      sms_consent,
      email_consent,
      customer_type,
    } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    // Normalize phone
    let normalizedPhone: string | null = null;
    if (phone) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
    }

    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Mobile number is required' }, { status: 400 });
    }

    // Check phone uniqueness
    const { data: existingByPhone } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existingByPhone) {
      return NextResponse.json(
        { error: `A customer with this phone already exists: ${existingByPhone.first_name} ${existingByPhone.last_name}` },
        { status: 409 }
      );
    }

    // Check email uniqueness
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    if (normalizedEmail) {
      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .ilike('email', normalizedEmail)
        .maybeSingle();

      if (existingByEmail) {
        return NextResponse.json(
          { error: `A customer with this email already exists: ${existingByEmail.first_name} ${existingByEmail.last_name}` },
          { status: 409 }
        );
      }
    }

    // Validate customer_type
    const validTypes = ['enthusiast', 'professional'];
    const resolvedType = customer_type && validTypes.includes(customer_type) ? customer_type : null;

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: normalizedPhone,
        email: normalizedEmail || null,
        birthday: birthday || null,
        address_line_1: address_line_1 || null,
        address_line_2: address_line_2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        notes: notes || null,
        tags: tags || [],
        sms_consent: sms_consent ?? false,
        email_consent: email_consent ?? false,
        customer_type: resolvedType,
      })
      .select('id, first_name, last_name, phone')
      .single();

    if (error) {
      console.error('Admin customer create error:', error);
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }

    // Log marketing consent if given
    if (sms_consent && normalizedPhone) {
      await supabase.from('marketing_consent_log').insert({
        customer_id: customer.id,
        channel: 'sms',
        action: 'opt_in',
        source: 'manual',
      });
      await supabase.from('sms_consent_log').insert({
        customer_id: customer.id,
        phone: normalizedPhone,
        action: 'opt_in',
        keyword: 'opt_in',
        source: 'admin_manual',
        previous_value: null,
        new_value: true,
      });
    }
    if (email_consent) {
      await supabase.from('marketing_consent_log').insert({
        customer_id: customer.id,
        channel: 'email',
        action: 'opt_in',
        source: 'manual',
      });
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'create',
      entityType: 'customer',
      entityId: customer.id,
      entityLabel: `${customer.first_name} ${customer.last_name}`.trim(),
      details: { phone: customer.phone },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ data: customer }, { status: 201 });
  } catch (err) {
    console.error('Admin customer create route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
