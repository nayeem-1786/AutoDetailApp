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
    const employee = await getEmployeeFromSession(request);
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

// DELETE - Archive a customer (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'customers.delete');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify customer exists and is not already archived
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, auth_user_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found or already archived' }, { status: 404 });
    }

    // Soft delete — set deleted_at timestamp
    const { error: archiveError } = await supabase
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (archiveError) {
      console.error('Failed to archive customer:', archiveError);
      return NextResponse.json({ error: 'Failed to archive customer' }, { status: 500 });
    }

    // Disconnect portal access (non-blocking)
    if (customer.auth_user_id) {
      try {
        await supabase
          .from('customers')
          .update({
            deactivated_auth_user_id: customer.auth_user_id,
            auth_user_id: null,
          })
          .eq('id', id);
      } catch (e) {
        console.error('Failed to disconnect portal on archive:', e);
      }
    }

    // Stop active drip enrollments (non-blocking)
    try {
      await supabase
        .from('drip_enrollments')
        .update({ status: 'stopped', stopped_reason: 'customer_archived', stopped_at: new Date().toISOString() })
        .eq('customer_id', id)
        .eq('status', 'active');
    } catch (e) {
      console.error('Failed to stop drip enrollments on archive:', e);
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'delete',
      entityType: 'customer',
      entityId: id,
      entityLabel: `Archived: ${customer.first_name} ${customer.last_name}`.trim(),
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Archive customer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
