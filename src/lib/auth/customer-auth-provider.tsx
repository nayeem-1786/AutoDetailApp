'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { customerSignOut } from '@/lib/auth/customer-signout';
import type { Session, User } from '@supabase/supabase-js';
import type { Customer } from '@/lib/supabase/types';

// How often to validate session (in ms)
const SESSION_CHECK_INTERVAL = 60000; // 1 minute

// Safety timeout: if loading is still true after this, force it to false.
// Prevents infinite spinner if onAuthStateChange never fires INITIAL_SESSION.
const LOADING_SAFETY_TIMEOUT = 5000; // 5 seconds

interface CustomerAuthContextType {
  session: Session | null;
  user: User | null;
  customer: Customer | null;
  loading: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  session: null,
  user: null,
  customer: null,
  loading: true,
  signingOut: false,
  signOut: async () => {},
  refreshCustomer: async () => {},
});

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const sessionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const loadingResolvedRef = useRef(false);

  // Stable supabase reference — prevents useEffect re-subscriptions
   
  const supabase = useMemo(() => createClient(), []);

  const loadCustomerData = useCallback(
    async (userId: string) => {
      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_user_id', userId)
        .is('deleted_at', null)
        .single();

      if (cust) {
        setCustomer(cust as Customer);
      }
    },
    [supabase]
  );

  // Mark loading as resolved (prevents safety timeout from firing after normal resolution)
  const resolveLoading = useCallback(() => {
    if (!loadingResolvedRef.current) {
      loadingResolvedRef.current = true;
      setLoading(false);
    }
  }, []);

  // Primary: onAuthStateChange subscription
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadCustomerData(s.user.id).finally(resolveLoading);
      } else {
        setCustomer(null);
        resolveLoading();
      }
    });

    // Belt-and-suspenders: if onAuthStateChange doesn't fire INITIAL_SESSION
    // (race condition, SDK bug, corrupted cookie), fall back to a manual getUser() check.
    const fallbackTimer = setTimeout(async () => {
      if (loadingResolvedRef.current) return; // Already resolved — no-op
      try {
        const { data: { user: fallbackUser } } = await supabase.auth.getUser();
        if (loadingResolvedRef.current) return; // Resolved while we were fetching
        if (fallbackUser) {
          setUser(fallbackUser);
          await loadCustomerData(fallbackUser.id);
        }
      } catch {
        // Ignore — safety timeout below will catch this
      } finally {
        resolveLoading();
      }
    }, 1000);

    // Safety timeout: absolute last resort — force loading to false after 5 seconds
    const safetyTimer = setTimeout(() => {
      if (!loadingResolvedRef.current) {
        console.warn('[CustomerAuthProvider] Safety timeout: forcing loading to false after 5s');
        resolveLoading();
      }
    }, LOADING_SAFETY_TIMEOUT);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
      clearTimeout(safetyTimer);
    };
  }, [supabase, loadCustomerData, resolveLoading]);

  // Periodic session validation - redirect to signin if session expired
  useEffect(() => {
    if (!session || loading) return;

    const validateSession = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabase.auth.getUser();

        if (error || !currentUser) {
          // Clear local state
          setSession(null);
          setUser(null);
          setCustomer(null);

          // Redirect to signin
          const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/account';
          window.location.href = `/signin?redirect=${encodeURIComponent(currentPath)}&reason=session_expired`;
        }
      } catch (err) {
        console.error('Session validation error:', err);
      }
    };

    // Start periodic checks
    sessionCheckRef.current = setInterval(validateSession, SESSION_CHECK_INTERVAL);

    // Also validate on window focus (user returns to tab)
    const handleFocus = () => validateSession();
    window.addEventListener('focus', handleFocus);

    return () => {
      if (sessionCheckRef.current) {
        clearInterval(sessionCheckRef.current);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [session, loading, supabase]);

  // Global fetch interceptor for 401 errors - redirect to signin on session expiry
  useEffect(() => {
    if (!session || loading) return;
    if (window.__fetchIntercepted) return;
    window.__fetchIntercepted = 'customer';

    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 401) {
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/account')) {
          window.location.href = `/signin?redirect=${encodeURIComponent(currentPath)}&reason=session_expired`;
          return new Promise(() => {});
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
      delete window.__fetchIntercepted;
    };
  }, [session, loading]);

  const signOut = async () => {
    setSigningOut(true);
    setSession(null);
    setUser(null);
    setCustomer(null);
    await customerSignOut();
  };

  const refreshCustomer = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await loadCustomerData(currentUser.id);
    }
  }, [supabase, loadCustomerData]);

  return (
    <CustomerAuthContext.Provider
      value={{
        session,
        user,
        customer,
        loading,
        signingOut,
        signOut,
        refreshCustomer,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
