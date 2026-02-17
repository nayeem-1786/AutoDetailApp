import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential order number: WO-10001, WO-10002, etc.
 * Orders by order_number DESC to prevent reuse.
 * Prefix 'WO' (Web Order) to avoid overlap with 'SD' transaction numbers.
 */
export async function generateOrderNumber(
  supabase?: ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data } = await client
    .from('orders')
    .select('order_number')
    .order('order_number', { ascending: false })
    .limit(1)
    .single();

  let nextNum = 10001;

  if (data?.order_number) {
    const match = data.order_number.match(/^WO-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `WO-${String(nextNum).padStart(5, '0')}`;
}
