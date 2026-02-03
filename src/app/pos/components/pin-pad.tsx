'use client';

import { cn } from '@/lib/utils/cn';
import { Delete } from 'lucide-react';

interface PinPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onAction?: () => void;
  actionLabel?: string;
  size?: 'default' | 'lg';
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
];

export function PinPad({
  onDigit,
  onBackspace,
  onAction,
  actionLabel,
  size = 'default',
}: PinPadProps) {
  const isLg = size === 'lg';

  function handleKey(key: string) {
    if (key === 'backspace') {
      onBackspace();
    } else {
      onDigit(key);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('grid grid-cols-3 gap-2', isLg && 'gap-3')}>
        {KEYS.flat().map((key, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleKey(key)}
            className={cn(
              'flex items-center justify-center rounded-xl border border-gray-200 bg-white font-medium transition-all',
              'active:scale-[0.97] active:bg-gray-100',
              'hover:bg-gray-50',
              isLg
                ? 'min-h-[72px] text-2xl'
                : 'min-h-[60px] text-xl',
              key === '.' && 'text-gray-400'
            )}
          >
            {key === 'backspace' ? (
              <Delete className={cn('text-gray-500', isLg ? 'h-7 w-7' : 'h-5 w-5')} />
            ) : (
              key
            )}
          </button>
        ))}
      </div>

      {onAction && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            'mt-1 w-full rounded-xl bg-blue-600 font-semibold text-white transition-all',
            'hover:bg-blue-700 active:scale-[0.99]',
            isLg ? 'min-h-[60px] text-lg' : 'min-h-[48px] text-base'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
