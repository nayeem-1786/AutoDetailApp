'use client';

import { useState } from 'react';
import { QuoteList } from '../components/quotes/quote-list';
import { QuoteDetail } from '../components/quotes/quote-detail';
import { QuoteBuilder } from '../components/quotes/quote-builder';

type View =
  | { mode: 'list' }
  | { mode: 'detail'; quoteId: string }
  | { mode: 'builder'; quoteId: string | null };

export default function QuotesPage() {
  const [view, setView] = useState<View>({ mode: 'list' });

  if (view.mode === 'detail') {
    return (
      <QuoteDetail
        quoteId={view.quoteId}
        onBack={() => setView({ mode: 'list' })}
        onEdit={(quoteId) => setView({ mode: 'builder', quoteId })}
        onReQuote={(quoteId) => setView({ mode: 'builder', quoteId: null })}
      />
    );
  }

  if (view.mode === 'builder') {
    return (
      <QuoteBuilder
        quoteId={view.quoteId}
        onBack={() => setView({ mode: 'list' })}
        onSaved={(quoteId) => setView({ mode: 'detail', quoteId })}
      />
    );
  }

  return (
    <QuoteList
      onSelect={(quoteId) => setView({ mode: 'detail', quoteId })}
      onNewQuote={() => setView({ mode: 'builder', quoteId: null })}
    />
  );
}
