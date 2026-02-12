'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { usePosAuth } from './pos-auth-context';
import { posFetch } from '../lib/pos-fetch';

interface PosPermissionContextValue {
  permissions: Record<string, boolean>;
  isSuper: boolean;
  loading: boolean;
  refresh: () => void;
}

const PosPermissionContext = createContext<PosPermissionContextValue>({
  permissions: {},
  isSuper: false,
  loading: true,
  refresh: () => {},
});

/**
 * PosPermissionProvider — loads all resolved permissions for the current POS employee.
 * Place inside PosShell (after PosAuthProvider).
 */
export function PosPermissionProvider({ children }: { children: ReactNode }) {
  const { employee, token, loading: authLoading } = usePosAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    if (!employee || !token) {
      setPermissions({});
      setIsSuper(false);
      setLoading(false);
      return;
    }

    try {
      const res = await posFetch('/api/pos/my-permissions');
      if (!res.ok) {
        console.error('Failed to load POS permissions:', res.status);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setPermissions(data.permissions || {});
      setIsSuper(data.is_super || false);
    } catch (err) {
      console.error('Error loading POS permissions:', err);
    } finally {
      setLoading(false);
    }
  }, [employee, token]);

  useEffect(() => {
    if (authLoading) return;
    loadPermissions();
  }, [authLoading, loadPermissions]);

  const refresh = useCallback(() => {
    setLoading(true);
    loadPermissions();
  }, [loadPermissions]);

  return (
    <PosPermissionContext.Provider value={{ permissions, isSuper, loading, refresh }}>
      {children}
    </PosPermissionContext.Provider>
  );
}

/**
 * Hook to check if the POS employee has a specific permission.
 * POS buttons should be disabled (not hidden) with a tooltip.
 */
export function usePosPermission(permissionKey: string): {
  granted: boolean;
  loading: boolean;
} {
  const { permissions, isSuper, loading } = useContext(PosPermissionContext);

  if (loading) return { granted: false, loading: true };
  if (isSuper) return { granted: true, loading: false };

  return { granted: permissions[permissionKey] ?? false, loading: false };
}

export function usePosPermissionContext() {
  return useContext(PosPermissionContext);
}
