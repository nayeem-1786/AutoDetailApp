import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { normalizePhone } from '@/lib/utils/format';
import { isQboSyncEnabled, getQboSettings, getQboSetting } from '@/lib/qbo/settings';
import { syncCustomerToQbo } from '@/lib/qbo/sync-customer';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { first_name, last_name, phone, customer_type } = body;

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

    // Check for existing customer with same phone
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A customer with this phone number already exists' },
        { status: 409 }
      );
    }

    // Validate customer_type if provided
    const validTypes = ['enthusiast', 'professional'];
    const resolvedType = customer_type && validTypes.includes(customer_type) ? customer_type : null;

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: normalizedPhone,
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

    return NextResponse.json({ data: customer }, { status: 201 });
  } catch (err) {
    console.error('Customer create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
