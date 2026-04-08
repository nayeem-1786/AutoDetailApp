import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  if (typeof window !== 'undefined' && window.__supabase_browser_client) {
    return window.__supabase_browser_client;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  if (typeof window !== 'undefined') {
    window.__supabase_browser_client = client;
  }

  return client;
}
