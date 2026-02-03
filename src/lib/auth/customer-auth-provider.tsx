'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Customer } from '@/lib/supabase/types';

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
