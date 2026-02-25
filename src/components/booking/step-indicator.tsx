'use client';

import { cn } from '@/lib/utils/cn';
import { Check } from 'lucide-react';

const DEFAULT_STEPS = [
  { label: 'Service' },
  { label: 'Schedule' },
  { label: 'Info' },
  { label: 'Review' },
];

const STEPS_WITH_PAYMENT = [
  { label: 'Service' },
  { label: 'Schedule' },
  { label: 'Info' },
  { label: 'Review' },
  { label: 'Payment' },
];

interface StepIndicatorProps {
  currentStep: number;
  requirePayment?: boolean;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, requirePayment = false, onStepClick }: StepIndicatorProps) {
  const STEPS = requirePayment ? STEPS_WITH_PAYMENT : DEFAULT_STEPS;
  const totalSteps = STEPS.length;
  const currentLabel = STEPS[currentStep - 1]?.label ?? '';

  return (
    <nav aria-label="Booking progress" className="mb-8">
      {/* Desktop: full stepper with labels */}
      <ol className="hidden sm:flex items-center justify-between">
        {STEPS.map((step, index) => {
          const stepNum = index + 1;
          const isCompleted = currentStep > stepNum;
          const isCurrent = currentStep === stepNum;

          return (
            <li key={step.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  disabled={!isCompleted}
                  onClick={() => isCompleted && onStepClick?.(stepNum)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                    isCompleted && 'bg-lime text-site-text-on-primary cursor-pointer hover:bg-lime-200',
                    isCurrent && 'bg-lime text-site-text-on-primary ring-2 ring-lime ring-offset-2 ring-offset-brand-dark cursor-default',
                    !isCompleted && !isCurrent && 'bg-brand-surface text-site-text-muted cursor-default'
                  )}
                  aria-label={isCompleted ? `Go back to ${step.label}` : step.label}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    stepNum
                  )}
                </button>
                <span
                  className={cn(
                    'text-xs font-medium',
                    isCurrent || isCompleted ? 'text-site-text' : 'text-site-text-muted'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-0.5 flex-1',
                    isCompleted ? 'bg-lime' : 'bg-brand-surface'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: compact format */}
      <div className="sm:hidden flex flex-col items-center gap-3">
        <p className="text-sm font-medium text-site-text">
          Step {currentStep} of {totalSteps}: <span className="text-lime">{currentLabel}</span>
        </p>
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const stepNum = index + 1;
            const isCompleted = currentStep > stepNum;
            const isCurrent = currentStep === stepNum;

            return (
              <button
                key={step.label}
                type="button"
                disabled={!isCompleted}
                onClick={() => isCompleted && onStepClick?.(stepNum)}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  isCompleted && 'bg-lime cursor-pointer hover:bg-lime-200',
                  isCurrent && 'bg-lime ring-2 ring-lime/30 cursor-default',
                  !isCompleted && !isCurrent && 'bg-brand-surface cursor-default'
                )}
                aria-label={isCompleted ? `Go back to ${step.label}` : step.label}
              />
            );
          })}
        </div>
      </div>
    </nav>
  );
}
