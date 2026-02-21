'use client';

import { useCheckout } from '../../context/checkout-context';
import { PaymentMethodScreen } from './payment-method-screen';
import { CashPayment } from './cash-payment';
import { CardPayment } from './card-payment';
import { CheckPayment } from './check-payment';
import { SplitPayment } from './split-payment';
import { PaymentComplete } from './payment-complete';

export function CheckoutOverlay() {
  const { isOpen, step, closeCheckout, processing } = useCheckout();

  if (!isOpen) return null;

  const canClose = !processing && step !== 'complete';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={canClose ? closeCheckout : undefined}>
      <div className="relative h-full w-full bg-white dark:bg-gray-900 md:h-[90vh] md:max-h-[700px] md:w-[90vw] md:max-w-[800px] md:rounded-2xl md:shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Step content */}
        <div className="flex h-full flex-col overflow-y-auto">
          {step === 'payment-method' && <PaymentMethodScreen />}
          {step === 'cash' && <CashPayment />}
          {step === 'card' && <CardPayment />}
          {step === 'check' && <CheckPayment />}
          {step === 'split' && <SplitPayment />}
          {step === 'complete' && <PaymentComplete />}
        </div>
      </div>
    </div>
  );
}
