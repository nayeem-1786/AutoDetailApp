/**
 * IndexedDB-based offline transaction queue for POS.
 *
 * When the POS is offline, cash transactions are queued here.
 * When connectivity is restored, they are synced to the server.
 */

const DB_NAME = 'pos-offline';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

export interface OfflineTransactionItem {
  item_type: 'service' | 'product';
  product_id: string | null;
  service_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  tax_amount: number;
  is_taxable: boolean;
  tier_name: string | null;
  vehicle_size_class: string | null;
  notes: string | null;
}

export interface QueuedTransaction {
  id: string;
  timestamp: number;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_id: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  coupon_id: string | null;
  coupon_code: string | null;
  loyalty_points_redeemed: number;
  loyalty_discount: number;
  notes: string | null;
  items: OfflineTransactionItem[];
  cash_tendered: number;
  cash_change: number;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueTransaction(
  tx: Omit<QueuedTransaction, 'id' | 'timestamp' | 'synced'>
): Promise<string> {
  const db = await openDB();
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: QueuedTransaction = {
    ...tx,
    id,
    timestamp: Date.now(),
    synced: false,
  };

  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readwrite');
    txn.objectStore(STORE_NAME).add(record);
    txn.oncomplete = () => resolve(id);
    txn.onerror = () => reject(txn.error);
  });
}

export async function getUnsyncedTransactions(): Promise<QueuedTransaction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readonly');
    const store = txn.objectStore(STORE_NAME);
    const results: QueuedTransaction[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const record = cursor.value as QueuedTransaction;
        if (!record.synced) {
          results.push(record);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markSynced(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txn = db.transaction(STORE_NAME, 'readwrite');
    const store = txn.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result;
      if (record) {
        record.synced = true;
        store.put(record);
      }
    };
    txn.oncomplete = () => resolve();
    txn.onerror = () => reject(txn.error);
  });
}

export async function syncAllTransactions(): Promise<{ synced: number; failed: number }> {
  const unsynced = await getUnsyncedTransactions();
  let synced = 0;
  let failed = 0;

  for (const tx of unsynced) {
    try {
      // Get the POS session token for auth
      const token =
        typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('pos_session') || '{}')?.token
          : null;

      const response = await fetch('/api/pos/sync-offline-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-POS-Session': token } : {}),
        },
        body: JSON.stringify(tx),
      });

      if (response.ok) {
        await markSynced(tx.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

export async function getQueueCount(): Promise<number> {
  const unsynced = await getUnsyncedTransactions();
  return unsynced.length;
}
