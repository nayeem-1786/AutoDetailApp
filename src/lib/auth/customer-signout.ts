import { createClient } from '@/lib/supabase/client';

interface CustomerSignOutOptions {
  /** 'local' signs out this device only; 'global' signs out all devices */
  scope?: 'local' | 'global';
  /** If true, skip the redirect after sign-out (used by booking wizard inline auth) */
  skipRedirect?: boolean;
  /** Callback fired after sign-out completes (before redirect) */
  onSignOut?: () => void;
}

/**
 * Shared customer sign-out utility.
 * All customer-facing sign-out call sites must use this function.
 */
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
