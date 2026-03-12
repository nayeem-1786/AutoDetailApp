import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  if (typeof window !== 'undefined' && window.__supabase_browser_client) {
    return window.__supabase_browser_client;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          return await fn();
        },
      },
    }
  );

  if (typeof window !== 'undefined') {
    window.__supabase_browser_client = client;
  }

  return client;
}
