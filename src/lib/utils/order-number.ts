import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential order number: SD-10001, SD-10002, etc.
 * Orders by order_number DESC to prevent reuse.
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
    const match = data.order_number.match(/^SD-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `SD-${String(nextNum).padStart(5, '0')}`;
}
