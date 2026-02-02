'use client';

import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { TicketState, TicketAction } from '../types';
import { ticketReducer, initialTicketState } from './ticket-reducer';

interface TicketContextType {
  ticket: TicketState;
  dispatch: React.Dispatch<TicketAction>;
}

const TicketContext = createContext<TicketContextType | null>(null);

export function TicketProvider({ children }: { children: ReactNode }) {
  const [ticket, dispatch] = useReducer(ticketReducer, initialTicketState);

  return (
    <TicketContext.Provider value={{ ticket, dispatch }}>
      {children}
    </TicketContext.Provider>
  );
}

export function useTicket() {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicket must be used within a TicketProvider');
  }
  return context;
}
