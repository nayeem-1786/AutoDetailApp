import { createBrowserClient } from '@supabase/ssr';

const GLOBAL_KEY = '__supabase_browser_client';

export function createClient() {
  // Store on window so the singleton survives Next.js HMR module re-execution.
  // Module-level `let` gets wiped on every hot reload, but window persists,
  // preventing duplicate Supabase clients from fighting over Web Locks.
  if (typeof window !== 'undefined' && (window as Record<string, unknown>)[GLOBAL_KEY]) {
    return (window as Record<string, unknown>)[GLOBAL_KEY] as ReturnType<typeof createBrowserClient>;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  if (typeof window !== 'undefined') {
    (window as Record<string, unknown>)[GLOBAL_KEY] = client;
  }

  return client;
}
