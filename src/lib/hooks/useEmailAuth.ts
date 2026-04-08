'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';

export interface UseEmailAuthOptions {
  onSuccess: (userId: string) => void | Promise<void>;
  onNoCustomer?: () => void;
}

export interface UseEmailAuthReturn {
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  resetError: () => void;
}

export function useEmailAuth(options: UseEmailAuthOptions): UseEmailAuthReturn {
  const { onSuccess, onNoCustomer } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onNoCustomerRef = useRef(onNoCustomer);
  onNoCustomerRef.current = onNoCustomer;

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (
          authError.message.includes('Invalid login') ||
          authError.message.includes('invalid')
        ) {
          setError(AUTH_ERRORS.INVALID_CREDENTIALS);
        } else if (
          authError.message.includes('rate') ||
          authError.message.includes('too many')
        ) {
          setError(AUTH_ERRORS.SIGNIN_RATE_LIMITED);
        } else {
          setError(AUTH_ERRORS.SIGNIN_FAILED);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError(AUTH_ERRORS.SIGNIN_FAILED);
        return;
      }

      // Staff guard
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (emp) {
        await supabase.auth.signOut();
        setError(AUTH_ERRORS.STAFF_EMAIL);
        return;
      }

      // Customer check
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!cust) {
        await supabase.auth.signOut();
        if (onNoCustomerRef.current) {
          onNoCustomerRef.current();
        }
        setError(AUTH_ERRORS.NO_CUSTOMER);
        return;
      }

      await onSuccessRef.current(user.id);
    } catch (err) {
      console.error('Email sign-in error:', err);
      setError(AUTH_ERRORS.SIGNIN_FAILED);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetError = useCallback(() => setError(null), []);

  return { loading, error, signIn, resetError };
}
