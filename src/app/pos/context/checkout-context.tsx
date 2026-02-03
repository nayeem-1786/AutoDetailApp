'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { PaymentMethod } from '@/lib/supabase/types';

export type CheckoutStep =
  | 'payment-method'
  | 'cash'
  | 'card'
  | 'check'
  | 'split'
  | 'complete';

interface CheckoutState {
  isOpen: boolean;
  step: CheckoutStep;
  tipAmount: number;
  tipPercent: number | null;
  paymentMethod: PaymentMethod | null;
  cashTendered: number;
  cashChange: number;
  cashPortion: number; // for split
  cardPortion: number; // for split
  stripePaymentIntentId: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  receiptNumber: string | null;
  transactionId: string | null;
  customerEmail: string | null; // preserved for receipt after ticket clear
  customerPhone: string | null; // preserved for receipt after ticket clear
  processing: boolean;
  error: string | null;
}

interface CheckoutContextType extends CheckoutState {
  openCheckout: () => void;
  closeCheckout: () => void;
  setStep: (step: CheckoutStep) => void;
  setTip: (amount: number, percent: number | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setCashPayment: (tendered: number, change: number) => void;
  setSplitCash: (cashPortion: number) => void;
  setCardResult: (intentId: string, brand: string | null, lastFour: string | null) => void;
  setComplete: (transactionId: string, receiptNumber: string | null, customerEmail?: string | null, customerPhone?: string | null) => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: CheckoutState = {
  isOpen: false,
  step: 'payment-method',
  tipAmount: 0,
  tipPercent: null,
  paymentMethod: null,
  cashTendered: 0,
  cashChange: 0,
  cashPortion: 0,
  cardPortion: 0,
  stripePaymentIntentId: null,
  cardBrand: null,
  cardLastFour: null,
  receiptNumber: null,
  transactionId: null,
  customerEmail: null,
  customerPhone: null,
  processing: false,
  error: null,
};

const CheckoutContext = createContext<CheckoutContextType | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CheckoutState>(initialState);

  const openCheckout = useCallback(() => {
    setState({ ...initialState, isOpen: true, step: 'payment-method' });
  }, []);

  const closeCheckout = useCallback(() => {
    setState(initialState);
  }, []);

  const setStep = useCallback((step: CheckoutStep) => {
    setState((s) => ({ ...s, step, error: null }));
  }, []);

  const setTip = useCallback((amount: number, percent: number | null) => {
    setState((s) => ({ ...s, tipAmount: amount, tipPercent: percent }));
  }, []);

  const setPaymentMethod = useCallback((method: PaymentMethod) => {
    setState((s) => ({ ...s, paymentMethod: method }));
  }, []);

  const setCashPayment = useCallback((tendered: number, change: number) => {
    setState((s) => ({ ...s, cashTendered: tendered, cashChange: change }));
  }, []);

  const setSplitCash = useCallback((cashPortion: number) => {
    setState((s) => ({ ...s, cashPortion }));
  }, []);

  const setCardResult = useCallback(
    (intentId: string, brand: string | null, lastFour: string | null) => {
      setState((s) => ({
        ...s,
        stripePaymentIntentId: intentId,
        cardBrand: brand,
        cardLastFour: lastFour,
      }));
    },
    []
  );

  const setComplete = useCallback(
    (transactionId: string, receiptNumber: string | null, customerEmail?: string | null, customerPhone?: string | null) => {
      setState((s) => ({
        ...s,
        transactionId,
        receiptNumber,
        customerEmail: customerEmail ?? null,
        customerPhone: customerPhone ?? null,
        step: 'complete',
        processing: false,
      }));
    },
    []
  );

  const setProcessing = useCallback((processing: boolean) => {
    setState((s) => ({ ...s, processing }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, error, processing: false }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return (
    <CheckoutContext.Provider
      value={{
        ...state,
        openCheckout,
        closeCheckout,
        setStep,
        setTip,
        setPaymentMethod,
        setCashPayment,
        setSplitCash,
        setCardResult,
        setComplete,
        setProcessing,
        setError,
        reset,
      }}
    >
      {children}
    </CheckoutContext.Provider>
  );
}

export function useCheckout() {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error('useCheckout must be used within a CheckoutProvider');
  }
  return context;
}
