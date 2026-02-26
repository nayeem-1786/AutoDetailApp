import { createBrowserClient } from '@supabase/ssr';

const GLOBAL_KEY = '__supabase_browser_client';

export function createClient() {
  if (typeof window !== 'undefined' && (window as Record<string, unknown>)[GLOBAL_KEY]) {
    return (window as Record<string, unknown>)[GLOBAL_KEY] as ReturnType<typeof createBrowserClient>;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => {
          return await fn();
        },
      },
    }
  );

  if (typeof window !== 'undefined') {
    (window as Record<string, unknown>)[GLOBAL_KEY] = client;
  }

  return client;
}