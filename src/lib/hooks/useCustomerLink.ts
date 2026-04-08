'use client';

import { useState, useCallback } from 'react';
import { AUTH_ERRORS } from '@/lib/auth/auth-errors';

export interface ExistsResult {
  exists: boolean;
  hasAuthAccount: boolean;
}

export interface LinkResult {
  success: boolean;
  customerId?: string;
  found?: boolean;
  error?: string;
}

export interface UseCustomerLinkReturn {
  loading: boolean;
  error: string | null;
  checkExists: (params: { phone?: string; email?: string }) => Promise<ExistsResult>;
  linkByPhone: (phone: string) => Promise<LinkResult>;
  linkAccount: (data: {
    first_name: string;
    last_name: string;
    email?: string;
    phone: string;
  }) => Promise<LinkResult>;
  resetError: () => void;
}

export function useCustomerLink(): UseCustomerLinkReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExists = useCallback(
    async (params: { phone?: string; email?: string }): Promise<ExistsResult> => {
      try {
        const qs = new URLSearchParams();
        if (params.phone) qs.set('phone', params.phone);
        if (params.email) qs.set('email', params.email);
        const res = await fetch(`/api/customer/check-exists?${qs.toString()}`);
        if (!res.ok) return { exists: false, hasAuthAccount: false };
        return await res.json();
      } catch {
        return { exists: false, hasAuthAccount: false };
      }
    },
    []
  );

  const linkByPhone = useCallback(
    async (phone: string): Promise<LinkResult> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/customer/link-by-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();

        if (data.success) {
          return { success: true, customerId: data.customer_id };
        }

        if (data.error === 'This phone number is already linked to another account') {
          setError(AUTH_ERRORS.PHONE_ALREADY_LINKED);
          return { success: false, error: 'ALREADY_LINKED' };
        }

        if (!data.found) {
          return { success: false, found: false, error: 'NOT_FOUND' };
        }

        setError(AUTH_ERRORS.LINK_FAILED);
        return { success: false, error: 'LINK_FAILED' };
      } catch {
        setError(AUTH_ERRORS.LINK_FAILED);
        return { success: false, error: 'LINK_FAILED' };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const linkAccount = useCallback(
    async (data: {
      first_name: string;
      last_name: string;
      email?: string;
      phone: string;
    }): Promise<LinkResult> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/customer/link-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();

        if (res.ok && json.success) {
          return { success: true, customerId: json.customer_id };
        }

        if (res.status === 401) {
          setError(AUTH_ERRORS.SESSION_EXPIRED);
          return { success: false, error: 'SESSION_EXPIRED' };
        }

        if (json.error?.includes('staff account')) {
          setError(AUTH_ERRORS.STAFF_EMAIL);
          return { success: false, error: 'STAFF_ACCOUNT' };
        }

        if (res.status === 409) {
          const errMsg = json.error || AUTH_ERRORS.PHONE_ALREADY_LINKED;
          setError(errMsg);
          return { success: false, error: 'ALREADY_LINKED' };
        }

        setError(AUTH_ERRORS.LINK_FAILED);
        return { success: false, error: 'LINK_FAILED' };
      } catch {
        setError(AUTH_ERRORS.LINK_FAILED);
        return { success: false, error: 'LINK_FAILED' };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const resetError = useCallback(() => setError(null), []);

  return { loading, error, checkExists, linkByPhone, linkAccount, resetError };
}
