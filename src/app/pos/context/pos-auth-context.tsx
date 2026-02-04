'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { UserRole } from '@/lib/supabase/types';

const POS_SESSION_KEY = 'pos_session';

export interface PosSessionEmployee {
  id: string;
  auth_user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
}

interface PosSessionData {
  token: string;
  employee: PosSessionEmployee;
  idleTimeoutMinutes: number;
}

interface PosAuthContextType {
  employee: PosSessionEmployee | null;
  role: UserRole | null;
  token: string | null;
  locked: boolean;
  loading: boolean;
  idleTimeoutMinutes: number;
  signOut: () => void;
  lock: () => void;
  unlock: (employee: PosSessionEmployee, token: string) => void;
  replaceSession: (data: PosSessionData) => void;
}

const PosAuthContext = createContext<PosAuthContextType>({
  employee: null,
  role: null,
  token: null,
  locked: false,
  loading: true,
  idleTimeoutMinutes: 15,
  signOut: () => {},
  lock: () => {},
  unlock: () => {},
  replaceSession: () => {},
});

function readSession(): PosSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POS_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosSessionData;
  } catch {
    return null;
  }
}

function writeSession(data: PosSessionData) {
  sessionStorage.setItem(POS_SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(POS_SESSION_KEY);
}

export function PosAuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<PosSessionEmployee | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(15);

  // Read session on mount
  useEffect(() => {
    const session = readSession();
    if (session) {
      setEmployee(session.employee);
      setToken(session.token);
      setIdleTimeoutMinutes(session.idleTimeoutMinutes);
    }
    setLoading(false);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setEmployee(null);
    setToken(null);
    setLocked(false);
  }, []);

  const lock = useCallback(() => {
    setLocked(true);
  }, []);

  const unlock = useCallback(
    (emp: PosSessionEmployee, tok: string) => {
      // Same employee re-entering PIN — just unlock, keep existing token
      setEmployee(emp);
      setToken(tok);
      setLocked(false);

      // Update sessionStorage with potentially refreshed token
      const session = readSession();
      if (session) {
        writeSession({ ...session, employee: emp, token: tok });
      }
    },
    []
  );

  const replaceSession = useCallback((data: PosSessionData) => {
    writeSession(data);
    setEmployee(data.employee);
    setToken(data.token);
    setIdleTimeoutMinutes(data.idleTimeoutMinutes);
    setLocked(false);
  }, []);

  return (
    <PosAuthContext.Provider
      value={{
        employee,
        role: employee?.role ?? null,
        token,
        locked,
        loading,
        idleTimeoutMinutes,
        signOut,
        lock,
        unlock,
        replaceSession,
      }}
    >
      {children}
    </PosAuthContext.Provider>
  );
}

export function usePosAuth() {
  const context = useContext(PosAuthContext);
  if (!context) {
    throw new Error('usePosAuth must be used within a PosAuthProvider');
  }
  return context;
}

/** Write a new POS session to sessionStorage (used by login page). */
export function storePosSession(data: PosSessionData) {
  writeSession(data);
}

/** Get the current POS token from sessionStorage (used by posFetch). */
export function getPosToken(): string | null {
  const session = readSession();
  return session?.token ?? null;
}
