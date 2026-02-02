import { createClient } from '@supabase/supabase-js';

// Anonymous client for static generation and build-time data fetching.
// Uses the anon key (respects RLS) but does not require cookies.
// Use this in generateStaticParams(), sitemap generation, and similar contexts
// where cookies() is not available.
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
