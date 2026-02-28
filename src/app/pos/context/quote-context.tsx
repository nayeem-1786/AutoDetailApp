'use client';

import { createContext, useContext, useReducer, useState, useEffect, type ReactNode } from 'react';
import type { QuoteState, QuoteAction } from '../types';
import { quoteReducer, initialQuoteState } from './quote-reducer';
import { posFetch } from '../lib/pos-fetch';

interface QuoteContextType {
  quote: QuoteState;
  dispatch: React.Dispatch<QuoteAction>;
  quoteValidityDays: number;
}

const QuoteContext = createContext<QuoteContextType | null>(null);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quote, dispatch] = useReducer(quoteReducer, initialQuoteState);
  const [quoteValidityDays, setQuoteValidityDays] = useState(10);

  // Fetch quote validity days from admin settings on mount
  useEffect(() => {
    posFetch('/api/pos/settings/quote-defaults')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.quote_validity_days) setQuoteValidityDays(data.quote_validity_days);
      })
      .catch(() => {});
  }, []);

  return (
    <QuoteContext.Provider value={{ quote, dispatch, quoteValidityDays }}>
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
