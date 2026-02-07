'use client';

import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { QuoteState, QuoteAction } from '../types';
import { quoteReducer, initialQuoteState } from './quote-reducer';

interface QuoteContextType {
  quote: QuoteState;
  dispatch: React.Dispatch<QuoteAction>;
}

const QuoteContext = createContext<QuoteContextType | null>(null);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quote, dispatch] = useReducer(quoteReducer, initialQuoteState);

  return (
    <QuoteContext.Provider value={{ quote, dispatch }}>
      {children}
    </QuoteContext.Provider>
  );
}

export function useQuote() {
  const context = useContext(QuoteContext);
  if (!context) {
    throw new Error('useQuote must be used within a QuoteProvider');
  }
  return context;
}
