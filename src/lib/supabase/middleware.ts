import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { user, supabaseResponse };
  } catch (error) {
    // Stale/corrupt session cookie — clear all sb-* cookies and return as unauthenticated
    // This prevents the white screen of death on server restart/deploy
    console.warn('[middleware] Auth session error, clearing cookies:', error instanceof Error ? error.message : error);

    // Delete all Supabase cookies from the response
    request.cookies.getAll().forEach((cookie) => {
      if (cookie.name.startsWith('sb-')) {
        supabaseResponse.cookies.delete(cookie.name);
      }
    });

    return { user: null, supabaseResponse };
  }
}
