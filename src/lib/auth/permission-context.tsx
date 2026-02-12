'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-provider';

interface PermissionContextValue {
  permissions: Record<string, boolean>;
  isSuper: boolean;
  loading: boolean;
  refresh: () => void;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: {},
  isSuper: false,
  loading: true,
  refresh: () => {},
});

/**
 * PermissionProvider — loads all resolved permissions for the current admin user on mount.
 * Place inside AdminShell (after AuthProvider).
 */
export function PermissionProvider({ children }: { children: ReactNode }) {
  const { employee, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!employee) {
      setPermissions({});
      setIsSuper(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/my-permissions');
      if (!res.ok) {
        console.error('Failed to load permissions:', res.status);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPermissions(data.permissions || {});
      setIsSuper(data.is_super || false);
    } catch (err) {
      console.error('Error loading permissions:', err);
    } finally {
      setLoading(false);
    }
  }, [employee]);

  useEffect(() => {
    if (authLoading) return;
    loadPermissions();
  }, [authLoading, loadPermissions]);

  const refresh = useCallback(() => {
    setLoading(true);
    loadPermissions();
  }, [loadPermissions]);

  return (
    <PermissionContext.Provider value={{ permissions, isSuper, loading, refresh }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissionContext() {
  return useContext(PermissionContext);
}
