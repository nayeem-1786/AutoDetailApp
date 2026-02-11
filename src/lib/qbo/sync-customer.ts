import { createAdminClient } from '@/lib/supabase/admin';
import { QboClient, QboApiError } from './client';
import { isQboSyncEnabled } from './settings';
import { logSync } from './sync-log';

/**
 * Sync a single customer to QuickBooks Online.
 * Creates or updates the QBO customer record.
 */
export async function syncCustomerToQbo(
  customerId: string
): Promise<{ success: boolean; qbo_id?: string; error?: string }> {
  const startTime = Date.now();

  try {
    const enabled = await isQboSyncEnabled();
    if (!enabled) {
      return { success: false, error: 'QBO sync not enabled' };
    }

    const supabase = createAdminClient();

    // Fetch customer from our DB
    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, qbo_id')
      .eq('id', customerId)
      .single();

    if (fetchErr || !customer) {
      return { success: false, error: `Customer not found: ${customerId}` };
    }

    const client = new QboClient();

    // Build display name
    const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
    let displayName = fullName || customer.phone || `Customer-${customerId.slice(0, 8)}`;

    // Build QBO customer data
    const qboData: Record<string, unknown> = {
      DisplayName: displayName,
    };
    if (customer.first_name) qboData.GivenName = customer.first_name;
    if (customer.last_name) qboData.FamilyName = customer.last_name;
    if (customer.email) qboData.PrimaryEmailAddr = { Address: customer.email };
    if (customer.phone) qboData.PrimaryPhone = { FreeFormNumber: customer.phone };

    let qboId: string;
    let action: 'create' | 'update';

    if (customer.qbo_id) {
      // Update existing QBO customer
      action = 'update';
      const existing = await client.getTokens();
      if (!existing) return { success: false, error: 'Not connected to QBO' };

      // Fetch current SyncToken
      const qboCustomerRes = await client.request<{ Customer: { Id: string; SyncToken: string } }>(
        'GET',
        `customer/${customer.qbo_id}`
      );

      const updated = await client.updateCustomer({
        Id: customer.qbo_id,
        SyncToken: qboCustomerRes.Customer.SyncToken,
        DisplayName: displayName,
        GivenName: customer.first_name || undefined,
        FamilyName: customer.last_name || undefined,
        PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
        PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
      });

      qboId = updated.Id;
    } else {
      // Check for existing QBO customer to avoid duplicates
      action = 'create';
      const existing = await client.findCustomerByName(displayName);

      if (existing) {
        // Link to existing QBO customer
        qboId = existing.Id;
      } else {
        // Create new QBO customer
        try {
          const created = await client.createCustomer(qboData as never);
          qboId = created.Id;
        } catch (createErr) {
          // Handle duplicate DisplayName error (QBO code 6240)
          if (createErr instanceof QboApiError && createErr.code === '6240') {
            // Append phone or short ID to make unique
            displayName = customer.phone
              ? `${displayName} (${customer.phone})`
              : `${displayName} (${customerId.slice(0, 8)})`;
            qboData.DisplayName = displayName;
            const retryResult = await client.createCustomer(qboData as never);
            qboId = retryResult.Id;
          } else {
            throw createErr;
          }
        }
      }
    }

    // Update our customer record with QBO ID
    const now = new Date().toISOString();
    await supabase
      .from('customers')
      .update({ qbo_id: qboId, qbo_synced_at: now })
      .eq('id', customerId);

    // Log success
    await logSync({
      entity_type: 'customer',
      entity_id: customerId,
      action,
      qbo_id: qboId,
      status: 'success',
      error_message: null,
      request_payload: qboData as Record<string, unknown>,
      response_payload: { qbo_id: qboId },
      duration_ms: Date.now() - startTime,
    });

    return { success: true, qbo_id: qboId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await logSync({
      entity_type: 'customer',
      entity_id: customerId,
      action: 'create',
      qbo_id: null,
      status: 'failed',
      error_message: errorMsg,
      request_payload: null,
      response_payload: null,
      duration_ms: Date.now() - startTime,
    });

    return { success: false, error: errorMsg };
  }
}

/**
 * Sync a batch of customers to QBO sequentially with a delay between each.
 */
export async function syncCustomerBatch(
  customerIds: string[]
): Promise<{ synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of customerIds) {
    const result = await syncCustomerToQbo(id);
    if (result.success) {
      synced++;
    } else {
      failed++;
      if (result.error) errors.push(`${id}: ${result.error}`);
    }

    // 100ms delay between calls
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { synced, failed, errors };
}
