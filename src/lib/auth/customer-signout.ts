/**
 * SINGLE SOURCE OF TRUTH for customer sign-out.
 *
 * ALL customer-facing sign-out actions MUST use this function.
 * Do NOT call supabase.auth.signOut() directly in any component.
 *
 * Exceptions (direct supabase.auth.signOut() is acceptable):
 *  - Error recovery in auth hooks (staff guard in usePhoneOtp, stale session cleanup)
 *  - Server-side API routes
 *
 * Verify with: grep -rn "supabase.auth.signOut" src/
 * Every result must be either this file, a hook error-recovery path, a login page
 * stale-session cleanup, or a server-side API route. Zero direct calls in components.
 */

import { createClient } from '@/lib/supabase/client';

interface CustomerSignOutOptions {
  /** 'local' signs out this device only; 'global' signs out all devices */
  scope?: 'local' | 'global';
  /** If true, skip the redirect after sign-out (used by booking wizard inline auth) */
  skipRedirect?: boolean;
  /** Callback fired after sign-out completes (before redirect) */
  onSignOut?: () => void;
}

export async function customerSignOut(options: CustomerSignOutOptions = {}) {
  const { scope = 'local', skipRedirect = false, onSignOut } = options;

  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope });
  } catch (err) {
    console.error('Sign out error:', err);
  }

  onSignOut?.();

  if (!skipRedirect) {
    window.location.href = '/';
  }
}
