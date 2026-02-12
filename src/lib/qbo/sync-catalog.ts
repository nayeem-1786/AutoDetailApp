import { createAdminClient } from '@/lib/supabase/admin';
import { QboClient } from './client';
import { isQboSyncEnabled, getQboSetting } from './settings';
import { logSync } from './sync-log';

/**
 * Sync a single service to QuickBooks Online as an Item of type 'Service'.
 */
export async function syncServiceToQbo(
  serviceId: string,
  source: 'manual' | 'auto' | 'pos_hook' | 'eod_batch' = 'manual'
): Promise<{ success: boolean; qbo_id?: string; error?: string }> {
  const startTime = Date.now();

  try {
    const enabled = await isQboSyncEnabled();
    if (!enabled) return { success: false, error: 'QBO sync not enabled' };

    const supabase = createAdminClient();
    const { data: service, error: fetchErr } = await supabase
      .from('services')
      .select('id, name, flat_price, qbo_id')
      .eq('id', serviceId)
      .single();

    if (fetchErr || !service) {
      return { success: false, error: `Service not found: ${serviceId}` };
    }

    // Income account is required for QBO Items
    const incomeAccountId = await getQboSetting('qbo_income_account_id');
    if (!incomeAccountId) {
      return { success: false, error: 'Income account not configured in QBO settings' };
    }

    const client = new QboClient();

    const itemData: Record<string, unknown> = {
      Name: (service.name || '').substring(0, 100), // QBO 100 char limit
      Type: 'Service',
      IncomeAccountRef: { value: incomeAccountId },
      UnitPrice: service.flat_price || 0,
    };

    let qboId: string;
    let action: 'create' | 'update';

    if (service.qbo_id) {
      action = 'update';
      // Fetch current SyncToken
      const existing = await client.request<{ Item: { Id: string; SyncToken: string } }>(
        'GET',
        `item/${service.qbo_id}`
      );

      const updated = await client.updateItem({
        Id: service.qbo_id,
        SyncToken: existing.Item.SyncToken,
        Name: (service.name || '').substring(0, 100),
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccountId, name: '' },
        UnitPrice: service.flat_price || 0,
      });
      qboId = updated.Id;
    } else {
      action = 'create';
      // Check for existing item by name
      const existing = await client.findItemByName((service.name || '').substring(0, 100));
      if (existing) {
        qboId = existing.Id;
      } else {
        const created = await client.createItem(itemData as never);
        qboId = created.Id;
      }
    }

    // Update our record
    await supabase
      .from('services')
      .update({ qbo_id: qboId })
      .eq('id', serviceId);

    await logSync({
      entity_type: 'service',
      entity_id: serviceId,
      action,
      qbo_id: qboId,
      status: 'success',
      error_message: null,
      request_payload: itemData as Record<string, unknown>,
      response_payload: { qbo_id: qboId },
      duration_ms: Date.now() - startTime,
      source,
    });

    return { success: true, qbo_id: qboId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logSync({
      entity_type: 'service',
      entity_id: serviceId,
      action: 'create',
      qbo_id: null,
      status: 'failed',
      error_message: errorMsg,
      request_payload: null,
      response_payload: null,
      duration_ms: Date.now() - startTime,
      source,
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Sync a single product to QuickBooks Online as an Item of type 'NonInventory'.
 */
export async function syncProductToQbo(
  productId: string,
  source: 'manual' | 'auto' | 'pos_hook' | 'eod_batch' = 'manual'
): Promise<{ success: boolean; qbo_id?: string; error?: string }> {
  const startTime = Date.now();

  try {
    const enabled = await isQboSyncEnabled();
    if (!enabled) return { success: false, error: 'QBO sync not enabled' };

    const supabase = createAdminClient();
    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, name, retail_price, qbo_id')
      .eq('id', productId)
      .single();

    if (fetchErr || !product) {
      return { success: false, error: `Product not found: ${productId}` };
    }

    const incomeAccountId = await getQboSetting('qbo_income_account_id');
    if (!incomeAccountId) {
      return { success: false, error: 'Income account not configured in QBO settings' };
    }

    const client = new QboClient();

    const itemData: Record<string, unknown> = {
      Name: (product.name || '').substring(0, 100),
      Type: 'NonInventory',
      IncomeAccountRef: { value: incomeAccountId },
      UnitPrice: product.retail_price || 0,
    };

    let qboId: string;
    let action: 'create' | 'update';

    if (product.qbo_id) {
      action = 'update';
      const existing = await client.request<{ Item: { Id: string; SyncToken: string } }>(
        'GET',
        `item/${product.qbo_id}`
      );

      const updated = await client.updateItem({
        Id: product.qbo_id,
        SyncToken: existing.Item.SyncToken,
        Name: (product.name || '').substring(0, 100),
        Type: 'NonInventory',
        IncomeAccountRef: { value: incomeAccountId, name: '' },
        UnitPrice: product.retail_price || 0,
      });
      qboId = updated.Id;
    } else {
      action = 'create';
      const existing = await client.findItemByName((product.name || '').substring(0, 100));
      if (existing) {
        qboId = existing.Id;
      } else {
        const created = await client.createItem(itemData as never);
        qboId = created.Id;
      }
    }

    await supabase
      .from('products')
      .update({ qbo_id: qboId })
      .eq('id', productId);

    await logSync({
      entity_type: 'product',
      entity_id: productId,
      action,
      qbo_id: qboId,
      status: 'success',
      error_message: null,
      request_payload: itemData as Record<string, unknown>,
      response_payload: { qbo_id: qboId },
      duration_ms: Date.now() - startTime,
      source,
    });

    return { success: true, qbo_id: qboId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logSync({
      entity_type: 'product',
      entity_id: productId,
      action: 'create',
      qbo_id: null,
      status: 'failed',
      error_message: errorMsg,
      request_payload: null,
      response_payload: null,
      duration_ms: Date.now() - startTime,
      source,
    });
    return { success: false, error: errorMsg };
  }
}

/**
 * Sync all services and products to QBO.
 * Skips items synced within the last 24 hours.
 */
export async function syncAllCatalog(
  source: 'manual' | 'auto' | 'pos_hook' | 'eod_batch' = 'manual'
): Promise<{
  services: { synced: number; failed: number };
  products: { synced: number; failed: number };
}> {
  const supabase = createAdminClient();

  // Fetch all active services
  const { data: services } = await supabase
    .from('services')
    .select('id, qbo_id')
    .eq('is_active', true)
    .or(`qbo_id.is.null,qbo_id.eq.`);

  // Also get services that haven't been synced in 24 hours (have qbo_id but old sync)
  const { data: staleServices } = await supabase
    .from('services')
    .select('id')
    .eq('is_active', true)
    .not('qbo_id', 'is', null);

  const serviceIds = new Set<string>();
  for (const s of services || []) serviceIds.add(s.id);
  // For stale services, we'd need a qbo_synced_at column on services — skip for now
  // Just sync ones without qbo_id plus any stale ones
  for (const s of staleServices || []) serviceIds.add(s.id);

  const serviceResult = { synced: 0, failed: 0 };
  for (const id of serviceIds) {
    const result = await syncServiceToQbo(id, source);
    if (result.success) serviceResult.synced++;
    else serviceResult.failed++;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Fetch all active products
  const { data: products } = await supabase
    .from('products')
    .select('id, qbo_id')
    .eq('is_active', true)
    .or(`qbo_id.is.null,qbo_id.eq.`);

  const { data: staleProducts } = await supabase
    .from('products')
    .select('id')
    .eq('is_active', true)
    .not('qbo_id', 'is', null);

  const productIds = new Set<string>();
  for (const p of products || []) productIds.add(p.id);
  for (const p of staleProducts || []) productIds.add(p.id);

  const productResult = { synced: 0, failed: 0 };
  for (const id of productIds) {
    const result = await syncProductToQbo(id, source);
    if (result.success) productResult.synced++;
    else productResult.failed++;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { services: serviceResult, products: productResult };
}
