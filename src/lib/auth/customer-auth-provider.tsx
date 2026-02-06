'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Customer } from '@/lib/supabase/types';

// How often to validate session (in ms)
const SESSION_CHECK_INTERVAL = 60000; // 1 minute

interface CustomerAuthContextType {
  session: Session | null;
  user: User | null;
  customer: Customer | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType>({
  session: null,
  user: null,
  customer: null,
  loading: true,
  signOut: async () => {},
  refreshCustomer: async () => {},
});

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionCheckRef = useRef<NodeJS.Timeout | null>(null);

  const supabase = createClient();

  const loadCustomerData = useCallback(
    async (userId: string) => {
      const { data: cust } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (cust) {
        setCustomer(cust as Customer);
      }
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadCustomerData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadCustomerData(s.user.id);
      } else {
        setCustomer(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadCustomerData]);

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
    };
  }, [session, loading]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setCustomer(null);
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
