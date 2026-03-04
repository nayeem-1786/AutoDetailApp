'use client';

import { useState } from 'react';
import {
  Mail,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Trash2,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ALL_GROUPS, VARIABLE_GROUPS } from '@/lib/utils/template';

// ─── Types ────────────────────────────────────────────────────────

export interface StepFormData {
  id: string;
  step_order: number;
  delay_days: number;
  delay_hours: number;
  channel: 'email' | 'sms' | 'both';
  template_id: string;
  sms_template: string;
  coupon_id: string;
  subject_override: string;
  exit_condition: string;
  exit_action: string;
  exit_sequence_id: string;
  exit_tag: string;
  is_active: boolean;
  expanded: boolean;
}

interface DripStepCardProps {
  step: StepFormData;
  stepIndex: number;
  onChange: (updated: StepFormData) => void;
  onRemove: () => void;
  emailTemplates: Array<{ id: string; name: string; subject: string }>;
  coupons: Array<{ id: string; code: string; name: string | null }>;
  sequences: Array<{ id: string; name: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatDelay(days: number, hours: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (parts.length === 0) return 'Immediately';
  return `After ${parts.join(' ')}`;
}

function getChannelIcons(channel: string) {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4 text-blue-500" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'both':
      return (
        <div className="flex items-center gap-1">
          <Mail className="h-4 w-4 text-blue-500" />
          <MessageSquare className="h-4 w-4 text-green-500" />
        </div>
      );
    default:
      return null;
  }
}

function getTemplateName(
  templateId: string,
  templates: Array<{ id: string; name: string }>
): string {
  if (!templateId) return 'No template';
  const tpl = templates.find((t) => t.id === templateId);
  return tpl ? tpl.name : 'Unknown template';
}

// ─── Component ────────────────────────────────────────────────────

export function DripStepCard({
  step,
  stepIndex,
  onChange,
  onRemove,
  emailTemplates,
  coupons,
  sequences,
}: DripStepCardProps) {
  const [showExitConditions, setShowExitConditions] = useState(
    !!step.exit_condition
  );

  function update(partial: Partial<StepFormData>) {
    onChange({ ...step, ...partial });
  }

  function insertVariable(variable: string) {
    update({ sms_template: step.sms_template + `{${variable}}` });
  }

  // ── Collapsed view ─────────────────────────────────────────────
  if (!step.expanded) {
    return (
      <Card className={!step.is_active ? 'opacity-60' : undefined}>
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Step number */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
            {stepIndex + 1}
          </div>

          {/* Delay */}
          <div className="flex items-center gap-1 text-sm text-ui-text-muted">
            <Clock className="h-3.5 w-3.5" />
            {formatDelay(step.delay_days, step.delay_hours)}
          </div>

          {/* Channel icon */}
          {getChannelIcons(step.channel)}

          {/* Template name */}
          <span className="truncate text-sm text-ui-text">
            {step.channel === 'sms'
              ? step.sms_template
                ? step.sms_template.slice(0, 50) + (step.sms_template.length > 50 ? '...' : '')
                : 'No SMS text'
              : getTemplateName(step.template_id, emailTemplates)}
          </span>

          {!step.is_active && (
            <Badge variant="secondary" className="ml-auto mr-2">
              Disabled
            </Badge>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => update({ expanded: true })}
            className="ml-auto rounded p-1 text-ui-text-muted hover:bg-ui-bg-hover hover:text-ui-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Remove */}
          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remove step"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </Card>
    );
  }

  // ── Expanded view ──────────────────────────────────────────────
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-ui-border px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
          {stepIndex + 1}
        </div>
        <span className="text-sm font-medium text-ui-text">
          Step {stepIndex + 1}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-ui-text-muted">
            Active
            <Switch
              checked={step.is_active}
              onCheckedChange={(checked) => update({ is_active: checked })}
            />
          </label>

          <button
            onClick={() => update({ expanded: false })}
            className="rounded p-1 text-ui-text-muted hover:bg-ui-bg-hover hover:text-ui-text"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          <button
            onClick={onRemove}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Remove step"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CardContent className="space-y-4 pt-4">
        {/* Delay */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Delay (days)" htmlFor={`step-${step.id}-days`}>
            <Input
              id={`step-${step.id}-days`}
              type="number"
              min={0}
              value={step.delay_days}
              onChange={(e) =>
                update({ delay_days: Math.max(0, parseInt(e.target.value) || 0) })
              }
            />
          </FormField>
          <FormField label="Delay (hours)" htmlFor={`step-${step.id}-hours`}>
            <Input
              id={`step-${step.id}-hours`}
              type="number"
              min={0}
              max={23}
              value={step.delay_hours}
              onChange={(e) =>
                update({
                  delay_hours: Math.min(23, Math.max(0, parseInt(e.target.value) || 0)),
                })
              }
            />
          </FormField>
        </div>

        {/* Channel */}
        <FormField label="Channel" htmlFor={`step-${step.id}-channel`}>
          <Select
            id={`step-${step.id}-channel`}
            value={step.channel}
            onChange={(e) =>
              update({ channel: e.target.value as 'email' | 'sms' | 'both' })
            }
          >
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="both">Email + SMS</option>
          </Select>
        </FormField>

        {/* Email template (when channel is email or both) */}
        {(step.channel === 'email' || step.channel === 'both') && (
          <>
            <FormField
              label="Email Template"
              htmlFor={`step-${step.id}-template`}
            >
              <Select
                id={`step-${step.id}-template`}
                value={step.template_id}
                onChange={(e) => update({ template_id: e.target.value })}
              >
                <option value="">Select a template...</option>
                {emailTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Subject Override"
              htmlFor={`step-${step.id}-subject`}
              description="Leave blank to use the template's default subject"
            >
              <Input
                id={`step-${step.id}-subject`}
                value={step.subject_override}
                onChange={(e) => update({ subject_override: e.target.value })}
                placeholder="Optional subject line override"
              />
            </FormField>
          </>
        )}

        {/* SMS template (when channel is sms or both) */}
        {(step.channel === 'sms' || step.channel === 'both') && (
          <div className="space-y-2">
            <FormField
              label="SMS Message"
              htmlFor={`step-${step.id}-sms`}
            >
              <Textarea
                id={`step-${step.id}-sms`}
                value={step.sms_template}
                onChange={(e) => update({ sms_template: e.target.value })}
                placeholder="Enter SMS message text..."
                rows={3}
              />
            </FormField>

            {/* Variable chips */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-ui-text-muted">
                Insert variable:
              </p>
              {ALL_GROUPS.map((groupName) => {
                const groupVars = VARIABLE_GROUPS[groupName];
                return (
                  <div key={groupName} className="space-y-1">
                    <p className="text-xs text-ui-text-dim">{groupName}</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(groupVars).map(([varName, desc]) => (
                        <button
                          key={varName}
                          type="button"
                          onClick={() => insertVariable(varName)}
                          className="rounded-full border border-ui-border bg-ui-bg-muted px-2 py-0.5 text-xs text-ui-text-muted hover:bg-ui-bg-hover hover:text-ui-text"
                          title={desc}
                        >
                          {`{${varName}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coupon */}
        <FormField label="Attach Coupon" htmlFor={`step-${step.id}-coupon`}>
          <Select
            id={`step-${step.id}-coupon`}
            value={step.coupon_id}
            onChange={(e) => update({ coupon_id: e.target.value })}
          >
            <option value="">None</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}{c.name ? ` - ${c.name}` : ''}
              </option>
            ))}
          </Select>
        </FormField>

        {/* Exit Condition section */}
        <div className="border-t border-ui-border pt-4">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-ui-text-muted hover:text-ui-text"
            onClick={() => setShowExitConditions(!showExitConditions)}
          >
            {showExitConditions ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Exit Condition
          </button>

          {showExitConditions && (
            <div className="mt-3 space-y-3 pl-6">
              <FormField
                label="Exit Condition"
                htmlFor={`step-${step.id}-exit-cond`}
              >
                <Select
                  id={`step-${step.id}-exit-cond`}
                  value={step.exit_condition}
                  onChange={(e) => {
                    const val = e.target.value;
                    update({
                      exit_condition: val,
                      // Clear action-related fields when condition is cleared
                      ...(val === '' ? { exit_action: '', exit_sequence_id: '', exit_tag: '' } : {}),
                    });
                  }}
                >
                  <option value="">None</option>
                  <option value="has_transaction">Has Transaction</option>
                  <option value="has_appointment">Has Appointment</option>
                  <option value="opened_email">Opened Email</option>
                  <option value="clicked_link">Clicked Link</option>
                </Select>
              </FormField>

              {step.exit_condition && (
                <FormField
                  label="Exit Action"
                  htmlFor={`step-${step.id}-exit-action`}
                >
                  <Select
                    id={`step-${step.id}-exit-action`}
                    value={step.exit_action}
                    onChange={(e) => {
                      const val = e.target.value;
                      update({
                        exit_action: val,
                        // Clear downstream fields when action changes
                        ...(val !== 'move' ? { exit_sequence_id: '' } : {}),
                        ...(val !== 'tag' ? { exit_tag: '' } : {}),
                      });
                    }}
                  >
                    <option value="">Select action...</option>
                    <option value="stop">Stop Sequence</option>
                    <option value="move">Move to Another Sequence</option>
                    <option value="tag">Tag Customer</option>
                  </Select>
                </FormField>
              )}

              {step.exit_action === 'move' && (
                <FormField
                  label="Transfer to Sequence"
                  htmlFor={`step-${step.id}-exit-seq`}
                >
                  <Select
                    id={`step-${step.id}-exit-seq`}
                    value={step.exit_sequence_id}
                    onChange={(e) =>
                      update({ exit_sequence_id: e.target.value })
                    }
                  >
                    <option value="">Select sequence...</option>
                    {sequences.map((seq) => (
                      <option key={seq.id} value={seq.id}>
                        {seq.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}

              {step.exit_action === 'tag' && (
                <FormField
                  label="Tag"
                  htmlFor={`step-${step.id}-exit-tag`}
                >
                  <Input
                    id={`step-${step.id}-exit-tag`}
                    value={step.exit_tag}
                    onChange={(e) => update({ exit_tag: e.target.value })}
                    placeholder="e.g. engaged, vip"
                  />
                </FormField>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
