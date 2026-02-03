import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Generate the next sequential quote number: Q-0001, Q-0002, etc.
 */
export async function generateQuoteNumber(
  supabase?: ReturnType<typeof createAdminClient>
): Promise<string> {
  const client = supabase ?? createAdminClient();

  const { data } = await client
    .from('quotes')
    .select('quote_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let nextNum = 1;

  if (data?.quote_number) {
    const match = data.quote_number.match(/^Q-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `Q-${String(nextNum).padStart(4, '0')}`;
}
