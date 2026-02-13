'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuoteList } from '../components/quotes/quote-list';
import { QuoteDetail } from '../components/quotes/quote-detail';
import { QuoteBuilder } from '../components/quotes/quote-builder';

type View =
  | { mode: 'list' }
  | { mode: 'detail'; quoteId: string }
  | { mode: 'builder'; quoteId: string | null; walkIn?: boolean };

function QuotesPageInner() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>({ mode: 'list' });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    const mode = searchParams.get('mode');
    const quoteId = searchParams.get('quoteId');
    const walkIn = searchParams.get('walkIn') === 'true';
    if (mode === 'builder') {
      setView({ mode: 'builder', quoteId: quoteId || null, walkIn });
    } else if (mode === 'detail' && quoteId) {
      setView({ mode: 'detail', quoteId });
    }
    setInitialized(true);
  }, [searchParams, initialized]);

  if (!initialized) return null;

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
        walkInMode={view.walkIn}
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

export default function QuotesPage() {
  return (
    <Suspense>
      <QuotesPageInner />
    </Suspense>
  );
}
