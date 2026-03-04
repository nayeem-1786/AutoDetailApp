'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DripStepCard, type StepFormData } from './drip-step-card';

// ─── Props ────────────────────────────────────────────────────────

interface DripStepsEditorProps {
  steps: StepFormData[];
  onStepsChange: (steps: StepFormData[]) => void;
  emailTemplates: Array<{ id: string; name: string; subject: string }>;
  coupons: Array<{ id: string; code: string; name: string | null }>;
  sequences: Array<{ id: string; name: string }>;
}

// ─── Component ────────────────────────────────────────────────────

export function DripStepsEditor({
  steps,
  onStepsChange,
  emailTemplates,
  coupons,
  sequences,
}: DripStepsEditorProps) {
  function handleStepChange(index: number, updated: StepFormData) {
    const next = [...steps];
    next[index] = updated;
    onStepsChange(next);
  }

  function handleRemoveStep(index: number) {
    const next = steps.filter((_, i) => i !== index);
    onStepsChange(next);
  }

  function handleAddStep() {
    const newStep: StepFormData = {
      id: `temp-${crypto.randomUUID()}`,
      step_order: steps.length,
      delay_days: 1,
      delay_hours: 0,
      channel: 'email',
      template_id: '',
      sms_template: '',
      coupon_id: '',
      subject_override: '',
      exit_condition: '',
      exit_action: '',
      exit_sequence_id: '',
      exit_tag: '',
      is_active: true,
      expanded: true,
    };
    onStepsChange([...steps, newStep]);
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      {steps.length > 1 && (
        <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-gray-200" />
      )}

      {steps.map((step, i) => (
        <div key={step.id} className="relative mb-4 pl-10">
          {/* Timeline dot */}
          <div className="absolute left-2.5 top-4 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />
          <DripStepCard
            step={step}
            stepIndex={i}
            onChange={(updated) => handleStepChange(i, updated)}
            onRemove={() => handleRemoveStep(i)}
            emailTemplates={emailTemplates}
            coupons={coupons}
            sequences={sequences}
          />
        </div>
      ))}

      <div className="pl-10">
        <Button variant="outline" onClick={handleAddStep}>
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
      </div>
    </div>
  );
}
