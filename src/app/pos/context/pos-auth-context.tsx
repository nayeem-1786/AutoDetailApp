'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
  bookable_for_appointments: boolean;
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

/** Decode token payload without verification (client-side expiry check only). */
function decodeTokenExp(token: string): number | null {
  try {
    const parts = token.split('.');
    let payloadPart: string;

    if (parts.length === 2) {
      // POS custom token: payload.signature — payload is parts[0]
      payloadPart = parts[0];
    } else if (parts.length === 3) {
      // Standard JWT: header.payload.signature — payload is parts[1]
      payloadPart = parts[1];
    } else {
      return null;
    }

    // base64url → base64
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const parsed = JSON.parse(json);
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = decodeTokenExp(token);
  if (exp === null) return false; // Can't determine — assume valid
  return exp < Date.now() / 1000;
}

function readSession(): PosSessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(POS_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PosSessionData;
  } catch {
    return null;
  }
}

function writeSession(data: PosSessionData) {
  localStorage.setItem(POS_SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(POS_SESSION_KEY);
}

export function PosAuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<PosSessionEmployee | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(15);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read session on mount — check token expiry before restoring
  useEffect(() => {
    const session = readSession();
    if (session) {
      if (isTokenExpired(session.token)) {
        clearSession();
      } else {
        setEmployee(session.employee);
        setToken(session.token);
        setIdleTimeoutMinutes(session.idleTimeoutMinutes);
      }
    }
    setLoading(false);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setEmployee(null);
    setToken(null);
    setLocked(false);
  }, []);

  // Periodic expiry check — every 60s, verify token hasn't expired
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (token && isTokenExpired(token)) {
        signOut();
      }
    }, 60_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, signOut]);

  // Cross-tab sync via storage event
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key !== POS_SESSION_KEY) return;
      if (e.newValue === null) {
        // Signed out in another tab
        setEmployee(null);
        setToken(null);
        setLocked(false);
      } else {
        // New session from another tab
        try {
          const session = JSON.parse(e.newValue) as PosSessionData;
          if (isTokenExpired(session.token)) {
            clearSession();
            setEmployee(null);
            setToken(null);
            setLocked(false);
          } else {
            setEmployee(session.employee);
            setToken(session.token);
            setIdleTimeoutMinutes(session.idleTimeoutMinutes);
            setLocked(false);
          }
        } catch {
          // Corrupted data — sign out
          setEmployee(null);
          setToken(null);
          setLocked(false);
        }
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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

      // Update localStorage with potentially refreshed token
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

/** Write a new POS session to localStorage (used by login page). */
export function storePosSession(data: PosSessionData) {
  writeSession(data);
}

/** Get the current POS token from localStorage (used by posFetch). */
export function getPosToken(): string | null {
  const session = readSession();
  return session?.token ?? null;
}
