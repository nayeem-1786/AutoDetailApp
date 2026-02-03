'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { TicketState } from '../types';

export interface HeldTicket {
  id: string;
  ticket: TicketState;
  heldAt: number; // Date.now()
}

interface HeldTicketsContextType {
  heldTickets: HeldTicket[];
  holdTicket: (ticket: TicketState) => void;
  resumeTicket: (id: string) => TicketState | null;
  removeHeldTicket: (id: string) => void;
}

const HeldTicketsContext = createContext<HeldTicketsContextType | null>(null);

function generateHeldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `held-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function HeldTicketsProvider({ children }: { children: ReactNode }) {
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>([]);

  const holdTicket = useCallback((ticket: TicketState) => {
    const held: HeldTicket = {
      id: generateHeldId(),
      ticket: { ...ticket },
      heldAt: Date.now(),
    };
    setHeldTickets((prev) => [...prev, held]);
  }, []);

  const resumeTicket = useCallback((id: string): TicketState | null => {
    let found: TicketState | null = null;
    setHeldTickets((prev) => {
      const entry = prev.find((h) => h.id === id);
      if (entry) {
        found = entry.ticket;
        return prev.filter((h) => h.id !== id);
      }
      return prev;
    });
    return found;
  }, []);

  const removeHeldTicket = useCallback((id: string) => {
    setHeldTickets((prev) => prev.filter((h) => h.id !== id));
  }, []);

  return (
    <HeldTicketsContext.Provider
      value={{ heldTickets, holdTicket, resumeTicket, removeHeldTicket }}
    >
      {children}
    </HeldTicketsContext.Provider>
  );
}

export function useHeldTickets() {
  const context = useContext(HeldTicketsContext);
  if (!context) {
    throw new Error('useHeldTickets must be used within a HeldTicketsProvider');
  }
  return context;
}
