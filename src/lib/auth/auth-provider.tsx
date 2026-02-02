'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Employee, Permission, UserRole } from '@/lib/supabase/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  employee: Employee | null;
  role: UserRole | null;
  permissions: Permission[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  employee: null,
  role: null,
  permissions: [],
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const loadEmployeeData = useCallback(
    async (userId: string) => {
      // Fetch employee profile
      const { data: emp } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', userId)
        .single();

      if (emp) {
        setEmployee(emp as Employee);

        // Fetch permissions (role-level + user-level overrides)
        const { data: perms } = await supabase
          .from('permissions')
          .select('*')
          .or(`role.eq.${emp.role},employee_id.eq.${emp.id}`);

        setPermissions((perms as Permission[]) || []);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadEmployeeData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadEmployeeData(s.user.id);
      } else {
        setEmployee(null);
        setPermissions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadEmployeeData]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setEmployee(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        employee,
        role: employee?.role ?? null,
        permissions,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
