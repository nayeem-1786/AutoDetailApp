'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { CustomerType } from '@/lib/supabase/types';

export type { CustomerType };

const TYPE_CONFIG = {
  enthusiast: {
    label: 'Enthusiast',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  professional: {
    label: 'Professional',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
} as const;

/** Cycle to the next type: null -> enthusiast -> professional -> null */
function nextType(current: CustomerType | null): CustomerType | null {
  if (current === null) return 'enthusiast';
  if (current === 'enthusiast') return 'professional';
  return null;
}

interface CustomerTypeBadgeProps {
  customerId: string;
  customerType: CustomerType | null;
  /** Called after a successful type change with the new customer_type value */
  onTypeChanged?: (newType: CustomerType | null) => void;
  /** Display only -- no toggle */
  readOnly?: boolean;
  /** Compact sizing for tight layouts */
  size?: 'sm' | 'md';
}

export function CustomerTypeBadge({
  customerId,
  customerType,
  onTypeChanged,
  readOnly = false,
  size = 'sm',
}: CustomerTypeBadgeProps) {
  const [saving, setSaving] = useState(false);

  async function handleToggle() {
    if (readOnly || saving) return;

    const newType = nextType(customerType);
    setSaving(true);

    try {
      const res = await fetch(`/api/pos/customers/${customerId}/type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_type: newType }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update');

      onTypeChanged?.(json.data?.customer_type ?? newType);

      if (newType) {
        toast.success(`Marked as ${TYPE_CONFIG[newType].label}`);
      } else {
        toast.info('Customer type cleared');
      }
    } catch {
      toast.error('Failed to update customer type');
    } finally {
      setSaving(false);
    }
  }

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-xs';

  // No type assigned -- show assign button (unless readOnly and nothing to show)
  if (!customerType) {
    if (readOnly) return null;
    return (
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600 ${sizeClasses} ${saving ? 'opacity-50' : ''}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        Unknown
      </button>
    );
  }

  const config = TYPE_CONFIG[customerType];

  return (
    <button
      onClick={readOnly ? undefined : handleToggle}
      disabled={saving || readOnly}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.bg} ${config.text} ${config.border} ${sizeClasses} ${
        readOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
      } ${saving ? 'opacity-50' : ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </button>
  );
}
