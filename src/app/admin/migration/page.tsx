'use client';

import { useState, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Circle, AlertCircle, SkipForward, Loader2, ChevronLeft } from 'lucide-react';
import {
  MIGRATION_STEPS,
  createInitialState,
  type MigrationState,
  type MigrationStep,
  type StepStatus,
} from '@/lib/migration/types';
import { UploadStep } from './steps/upload-step';
import { CustomerStep } from './steps/customer-step';
import { ProductStep } from './steps/product-step';
import { EmployeeStep } from './steps/employee-step';
import { VehicleStep } from './steps/vehicle-step';
import { TransactionStep } from './steps/transaction-step';
import { LoyaltyStep } from './steps/loyalty-step';
import { ValidationStep } from './steps/validation-step';

function getStepIcon(status: StepStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'in_progress':
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 text-red-600" />;
    case 'skipped':
      return <SkipForward className="h-5 w-5 text-gray-400" />;
    default:
      return <Circle className="h-5 w-5 text-gray-300" />;
  }
}

function getStepStatusVariant(status: StepStatus): 'success' | 'info' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
      return 'info';
    case 'error':
      return 'destructive';
    case 'skipped':
      return 'warning';
    default:
      return 'secondary';
  }
}

export default function MigrationPage() {
  const [state, setState] = useState<MigrationState>(createInitialState);

  const currentStepIndex = MIGRATION_STEPS.findIndex((s) => s.key === state.currentStep);

  const goToStep = useCallback(
    (step: MigrationStep) => {
      const targetIndex = MIGRATION_STEPS.findIndex((s) => s.key === step);
      const currentIndex = MIGRATION_STEPS.findIndex((s) => s.key === state.currentStep);

      // Can go back to any completed step for review
      // Can only go forward to the next incomplete step
      if (targetIndex <= currentIndex) {
        setState((prev) => ({ ...prev, currentStep: step }));
      } else if (targetIndex === currentIndex + 1) {
        // Allow advancing to next step
        setState((prev) => ({ ...prev, currentStep: step }));
      }
    },
    [state.currentStep]
  );

  const advanceToNextStep = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < MIGRATION_STEPS.length) {
      const nextStep = MIGRATION_STEPS[nextIndex].key;
      setState((prev) => ({
        ...prev,
        currentStep: nextStep,
        steps: {
          ...prev.steps,
          [prev.currentStep]:
            prev.steps[prev.currentStep].status === 'pending'
              ? { ...prev.steps[prev.currentStep], status: 'completed' }
              : prev.steps[prev.currentStep],
        },
      }));
    }
  }, [currentStepIndex]);

  const handleStateChange = useCallback((newState: MigrationState) => {
    setState(newState);
  }, []);

  const completedCount = Object.values(state.steps).filter(
    (s) => s.status === 'completed' || s.status === 'skipped'
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Square Data Migration"
        description="Import customers, products, and transactions from Square into the Auto Detail platform"
        action={
          <Badge variant={completedCount === 8 ? 'success' : 'info'}>
            {completedCount}/8 steps complete
          </Badge>
        }
      />

      {/* Horizontal Step Tracker */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[800px] items-center gap-1 rounded-lg border bg-white p-3">
          {MIGRATION_STEPS.map((step, index) => {
            const stepState = state.steps[step.key];
            const isCurrent = state.currentStep === step.key;
            const isClickable =
              index <= currentStepIndex ||
              (index === currentStepIndex + 1 && stepState.status !== 'pending') ||
              stepState.status === 'completed' ||
              stepState.status === 'skipped';

            return (
              <div key={step.key} className="flex flex-1 items-center">
                <button
                  onClick={() => isClickable && goToStep(step.key)}
                  disabled={!isClickable && !isCurrent}
                  className={`flex w-full flex-col items-center gap-1 rounded-lg px-2 py-2 text-center transition-colors ${
                    isCurrent
                      ? 'bg-gray-100 ring-2 ring-gray-900'
                      : isClickable
                        ? 'hover:bg-gray-50 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {getStepIcon(stepState.status)}
                    <span
                      className={`text-xs font-medium ${
                        isCurrent ? 'text-gray-900' : 'text-gray-500'
                      }`}
                    >
                      {step.number}. {step.label}
                    </span>
                  </div>
                  {stepState.status !== 'pending' && (
                    <Badge
                      variant={getStepStatusVariant(stepState.status)}
                      className="text-[10px]"
                    >
                      {stepState.status === 'completed' && stepState.count !== undefined
                        ? stepState.count.toLocaleString()
                        : stepState.status}
                    </Badge>
                  )}
                </button>
                {index < MIGRATION_STEPS.length - 1 && (
                  <div
                    className={`mx-1 h-px w-4 flex-shrink-0 ${
                      stepState.status === 'completed' || stepState.status === 'skipped'
                        ? 'bg-green-400'
                        : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Back Button */}
      {currentStepIndex > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goToStep(MIGRATION_STEPS[currentStepIndex - 1].key)}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to {MIGRATION_STEPS[currentStepIndex - 1].label}
        </Button>
      )}

      {/* Current Step Content */}
      <div>
        {state.currentStep === 'upload' && (
          <UploadStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={() => {
              setState((prev) => ({
                ...prev,
                currentStep: 'customers',
                steps: { ...prev.steps, upload: { status: 'completed', message: 'Files uploaded' } },
              }));
            }}
          />
        )}
        {state.currentStep === 'customers' && (
          <CustomerStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'products' && (
          <ProductStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'employees' && (
          <EmployeeStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'vehicles' && (
          <VehicleStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'transactions' && (
          <TransactionStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'loyalty' && (
          <LoyaltyStep
            state={state}
            onStateChange={handleStateChange}
            onContinue={advanceToNextStep}
          />
        )}
        {state.currentStep === 'validation' && (
          <ValidationStep state={state} onStateChange={handleStateChange} />
        )}
      </div>
    </div>
  );
}
