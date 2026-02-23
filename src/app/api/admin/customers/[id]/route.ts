import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { normalizePhone } from '@/lib/utils/format';
import { logAudit, getRequestIp, buildChangeDetails } from '@/lib/services/audit';

// PATCH - Update a customer
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'customers.edit');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch current customer for consent change detection and audit diff
    const { data: existing, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

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

    // Normalize phone
    let normalizedPhone: string | null = null;
    if (phone) {
      normalizedPhone = normalizePhone(phone);
    }

    // Check phone uniqueness (excluding self)
    if (normalizedPhone) {
      const { data: existingByPhone } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .eq('phone', normalizedPhone)
        .neq('id', id)
        .maybeSingle();

      if (existingByPhone) {
        return NextResponse.json(
          { error: `Phone number already in use by ${existingByPhone.first_name} ${existingByPhone.last_name}` },
          { status: 409 }
        );
      }
    }

    // Check email uniqueness (excluding self)
    const normalizedEmail = email ? email.toLowerCase().trim() : null;
    if (normalizedEmail) {
      const { data: existingByEmail } = await supabase
        .from('customers')
        .select('id, first_name, last_name')
        .ilike('email', normalizedEmail)
        .neq('id', id)
        .maybeSingle();

      if (existingByEmail) {
        return NextResponse.json(
          { error: `Email already in use by ${existingByEmail.first_name} ${existingByEmail.last_name}` },
          { status: 409 }
        );
      }
    }

    // Validate customer_type
    const validTypes = ['enthusiast', 'professional'];
    const resolvedType = customer_type && validTypes.includes(customer_type)
      ? customer_type
      : customer_type === null
        ? null
        : existing.customer_type;

    const updatePayload = {
      first_name: first_name ?? existing.first_name,
      last_name: last_name ?? existing.last_name,
      phone: normalizedPhone,
      email: normalizedEmail || null,
      birthday: birthday !== undefined ? (birthday || null) : existing.birthday,
      address_line_1: address_line_1 !== undefined ? (address_line_1 || null) : existing.address_line_1,
      address_line_2: address_line_2 !== undefined ? (address_line_2 || null) : existing.address_line_2,
      city: city !== undefined ? (city || null) : existing.city,
      state: state !== undefined ? (state || null) : existing.state,
      zip: zip !== undefined ? (zip || null) : existing.zip,
      notes: notes !== undefined ? (notes || null) : existing.notes,
      tags: tags !== undefined ? (tags || []) : existing.tags,
      sms_consent: sms_consent ?? existing.sms_consent,
      email_consent: email_consent ?? existing.email_consent,
      customer_type: resolvedType,
    };

    const { error: updateError } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error('Admin customer update error:', updateError);
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
    }

    // Log consent changes
    const resolvedSmsConsent = sms_consent ?? existing.sms_consent;
    const resolvedEmailConsent = email_consent ?? existing.email_consent;

    if (resolvedSmsConsent !== existing.sms_consent) {
      await supabase.from('marketing_consent_log').insert({
        customer_id: id,
        channel: 'sms',
        action: resolvedSmsConsent ? 'opt_in' : 'opt_out',
        source: 'manual',
      });
      const auditPhone = normalizedPhone || existing.phone;
      if (auditPhone) {
        await supabase.from('sms_consent_log').insert({
          customer_id: id,
          phone: auditPhone,
          action: resolvedSmsConsent ? 'opt_in' : 'opt_out',
          keyword: resolvedSmsConsent ? 'opt_in' : 'opt_out',
          source: 'admin_manual',
          previous_value: existing.sms_consent,
          new_value: resolvedSmsConsent,
        });
      }
    }
    if (resolvedEmailConsent !== existing.email_consent) {
      await supabase.from('marketing_consent_log').insert({
        customer_id: id,
        channel: 'email',
        action: resolvedEmailConsent ? 'opt_in' : 'opt_out',
        source: 'manual',
      });
    }

    // Build change details for audit
    const changes = buildChangeDetails(
      existing as Record<string, unknown>,
      updatePayload as Record<string, unknown>,
      ['first_name', 'last_name', 'phone', 'email', 'customer_type', 'sms_consent', 'email_consent']
    );

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'update',
      entityType: 'customer',
      entityId: id,
      entityLabel: `${updatePayload.first_name} ${updatePayload.last_name}`.trim(),
      details: changes,
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update customer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a customer and associated records
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'customers.delete');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Delete associated records

    // 1. Delete vehicles
    const { error: vehiclesError } = await supabase
      .from('vehicles')
      .delete()
      .eq('customer_id', id);

    if (vehiclesError) {
      console.error('Failed to delete vehicles:', vehiclesError);
    }

    // 2. Delete loyalty ledger entries
    const { error: ledgerError } = await supabase
      .from('loyalty_ledger')
      .delete()
      .eq('customer_id', id);

    if (ledgerError) {
      console.error('Failed to delete loyalty ledger:', ledgerError);
    }

    // 3. Unlink transactions (preserve for accounting)
    const { error: txError } = await supabase
      .from('transactions')
      .update({ customer_id: null })
      .eq('customer_id', id);

    if (txError) {
      console.error('Failed to unlink transactions:', txError);
    }

    // 4. Delete marketing consent log entries
    const { error: consentError } = await supabase
      .from('marketing_consent_log')
      .delete()
      .eq('customer_id', id);

    if (consentError) {
      console.error('Failed to delete consent log:', consentError);
    }

    // 5. Delete appointments
    const { error: appointmentsError } = await supabase
      .from('appointments')
      .delete()
      .eq('customer_id', id);

    if (appointmentsError) {
      console.error('Failed to delete appointments:', appointmentsError);
    }

    // 6. Delete quotes
    const { error: quotesError } = await supabase
      .from('quotes')
      .delete()
      .eq('customer_id', id);

    if (quotesError) {
      console.error('Failed to delete quotes:', quotesError);
    }

    // Finally delete the customer
    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete customer:', deleteError);
      return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'delete',
      entityType: 'customer',
      entityId: id,
      entityLabel: `${customer.first_name} ${customer.last_name}`.trim(),
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({
      success: true,
      deleted: `${customer.first_name} ${customer.last_name}`
    });
  } catch (err) {
    console.error('Delete customer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
