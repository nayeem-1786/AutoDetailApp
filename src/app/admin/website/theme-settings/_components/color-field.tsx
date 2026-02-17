'use client';

import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ColorFieldProps {
  label: string;
  value: string | null;
  defaultValue: string;
  onChange: (value: string | null) => void;
}

export function ColorField({ label, value, defaultValue, onChange }: ColorFieldProps) {
  const displayValue = value ?? defaultValue;
  const isDefault = value === null || value === defaultValue;

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={displayValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded-md border border-gray-200 p-0.5"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label className={cn('text-sm', isDefault ? 'text-gray-400' : 'text-gray-900')}>
            {label}
          </label>
          {isDefault && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              default
            </span>
          )}
        </div>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === '') {
              onChange(v || null);
            }
          }}
          onBlur={(e) => {
            const v = e.target.value;
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
              onChange(null);
            }
          }}
          className="mt-0.5 w-24 text-xs text-gray-500 bg-transparent border-none p-0 focus:outline-none focus:ring-0 font-mono"
          placeholder={defaultValue}
        />
      </div>
      {!isDefault && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title="Reset to default"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
