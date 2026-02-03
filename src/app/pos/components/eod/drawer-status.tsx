const DRAWER_SESSION_KEY = 'pos_drawer_session';

export interface DrawerSession {
  openedAt: string; // ISO timestamp
  openingFloat: number; // starting cash amount
  openedBy: string; // employee name
  status: 'open' | 'closed';
}

export function getDrawerSession(): DrawerSession | null {
  try {
    const raw = localStorage.getItem(DRAWER_SESSION_KEY);
    if (raw) {
      return JSON.parse(raw) as DrawerSession;
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

function saveDrawerSession(session: DrawerSession): void {
  localStorage.setItem(DRAWER_SESSION_KEY, JSON.stringify(session));
}

/** Close the current drawer session in localStorage */
export function closeDrawerSession(): void {
  const session = getDrawerSession();
  if (session) {
    session.status = 'closed';
    saveDrawerSession(session);
  }
}

/** Get the last opening float from the most recent session (for pre-filling next-day float) */
export function getLastOpeningFloat(): number | null {
  const session = getDrawerSession();
  if (session) {
    return session.openingFloat;
  }
  return null;
}

/** Open a new drawer session and save to localStorage */
export function openDrawerSession(float: number, employeeName: string): void {
  const newSession: DrawerSession = {
    openedAt: new Date().toISOString(),
    openingFloat: float,
    openedBy: employeeName,
    status: 'open',
  };
  saveDrawerSession(newSession);
}
