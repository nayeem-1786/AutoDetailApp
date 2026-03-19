import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { normalizePhone } from '@/lib/utils/format';
import { isQboSyncEnabled, getQboSettings, getQboSetting } from '@/lib/qbo/settings';
import { syncCustomerToQbo } from '@/lib/qbo/sync-customer';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { first_name, last_name, phone, email, customer_type, force_create } = body;

    if (!first_name || !last_name || !phone) {
      return NextResponse.json(
        { error: 'first_name, last_name, and phone are required' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Check for existing customer with same phone (only active customers)
    const { data: existing } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('phone', normalizedPhone)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `A customer with this phone already exists: ${existing.first_name} ${existing.last_name}` },
        { status: 409 }
      );
    }

    // Second-tier: check for archived customer with same phone
    if (!force_create) {
      const { data: archivedMatch } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone, email, deleted_at')
        .eq('phone', normalizedPhone)
        .not('deleted_at', 'is', null)
        .maybeSingle();

      if (archivedMatch) {
        return NextResponse.json({
          archived_match: {
            id: archivedMatch.id,
            first_name: archivedMatch.first_name,
            last_name: archivedMatch.last_name,
            phone: archivedMatch.phone,
            email: archivedMatch.email,
            deleted_at: archivedMatch.deleted_at,
          },
          message: 'An archived customer with this phone number exists.',
        }, { status: 409 });
      }
    }

    // Validate customer_type if provided
    const validTypes = ['enthusiast', 'professional'];
    const resolvedType = customer_type && validTypes.includes(customer_type) ? customer_type : null;

    // Normalize email if provided
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: normalizedPhone,
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(resolvedType ? { customer_type: resolvedType } : {}),
      })
      .select('*')
      .single();

    if (error) {
      console.error('Customer create error:', error);
      return NextResponse.json(
        { error: 'Failed to create customer' },
        { status: 500 }
      );
    }

    // QBO Customer Sync — fire and forget
    // Checks realtime toggle: when OFF, skips immediate sync (EOD batch or cron will catch it)
    isQboSyncEnabled().then(async (enabled) => {
      if (enabled) {
        const realtimeSync = await getQboSetting('qbo_realtime_sync');
        if (realtimeSync === 'false') return;
        const settings = await getQboSettings();
        if (settings.qbo_auto_sync_customers) {
          syncCustomerToQbo(customer.id, 'pos_hook').catch(err => {
            console.error('[QBO] Background customer sync failed:', customer.id, err);
          });
        }
      }
    }).catch(err => {
      console.error('[QBO] Failed to check customer sync:', err);
    });

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'create',
      entityType: 'customer',
      entityId: customer.id,
      entityLabel: `${customer.first_name} ${customer.last_name}`,
      details: { phone: customer.phone },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: customer }, { status: 201 });
  } catch (err) {
    console.error('Customer create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
