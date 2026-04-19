'use client';

import { createContext, useContext, useReducer, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { QuoteState, QuoteAction } from '../types';
import type { ServicePricing, VehicleSizeClass } from '@/lib/supabase/types';
import { quoteReducer, initialQuoteState } from './quote-reducer';
import { CustomPriceModal } from '../components/custom-price-modal';
import { shouldOpenSpecialtyModal, selectPricingTierForVehicle } from '../utils/pricing';
import { posFetch } from '../lib/pos-fetch';

interface QuoteContextType {
  quote: QuoteState;
  dispatch: React.Dispatch<QuoteAction>;
  quoteValidityDays: number;
}

const QuoteContext = createContext<QuoteContextType | null>(null);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const [quote, rawDispatch] = useReducer(quoteReducer, initialQuoteState);
  const [quoteValidityDays, setQuoteValidityDays] = useState(10);

  // Specialty gate state — intercepts ADD_SERVICE for exotic/classic vehicles
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(QuoteAction & { type: 'ADD_SERVICE' }) | null>(null);

  // Wrap dispatch — same Option B gate logic as TicketProvider
  const dispatch = useCallback((action: QuoteAction) => {
    if (action.type === 'ADD_SERVICE' && !action.customPrice) {
      const vehicle = quote.vehicle;

      if (shouldOpenSpecialtyModal(vehicle, action.service)) {
        setPendingAction(action as QuoteAction & { type: 'ADD_SERVICE' });
        setGateModalOpen(true);
        return;
      }

      if (vehicle?.is_exotic || vehicle?.is_classic) {
        const correctTier = selectPricingTierForVehicle(action.service, vehicle);
        if (correctTier) {
          rawDispatch({ ...action, pricing: correctTier });
          return;
        }
        setPendingAction(action as QuoteAction & { type: 'ADD_SERVICE' });
        setGateModalOpen(true);
        return;
      }
    }
    rawDispatch(action);
  }, [quote.vehicle, rawDispatch]);

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
      {/* Specialty gate modal for quotes */}
      <CustomPriceModal
        open={gateModalOpen}
        vehicle={quote.vehicle}
        service={pendingAction?.service ?? null}
        pricing={pendingAction?.pricing as ServicePricing | null}
        vehicleSizeClass={(pendingAction?.vehicleSizeClass ?? null) as VehicleSizeClass | null}
        onConfirm={(customPrice, customNote) => {
          if (pendingAction) {
            rawDispatch({ ...pendingAction, customPrice, customNote: customNote ?? undefined });
          }
          setGateModalOpen(false);
          setPendingAction(null);
        }}
        onCancel={() => {
          setGateModalOpen(false);
          setPendingAction(null);
        }}
      />
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
