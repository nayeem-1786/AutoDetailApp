import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Log the auth event (fire-and-forget)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const isPasswordReset = next.includes('reset-password');
        const isSignup = !user.last_sign_in_at || user.last_sign_in_at === user.created_at;

        logAudit({
          userId: user.id,
          userEmail: user.email || null,
          action: isPasswordReset ? 'update' : isSignup ? 'create' : 'login',
          entityType: 'customer',
          entityId: user.id,
          details: isPasswordReset
            ? { event: 'password_reset' }
            : isSignup
              ? { event: 'signup_email' }
              : { event: 'signin_email' },
          ipAddress: getRequestIp(request),
          source: 'customer_portal',
        });
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If code exchange fails or no code, redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
