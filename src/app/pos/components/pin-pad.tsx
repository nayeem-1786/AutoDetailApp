'use client';

import { cn } from '@/lib/utils/cn';
import { Delete } from 'lucide-react';

interface PinPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onAction?: () => void;
  actionLabel?: string;
  size?: 'sm' | 'default' | 'lg';
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
  const isSm = size === 'sm';

  function handleKey(key: string) {
    if (key === 'backspace') {
      onBackspace();
    } else {
      onDigit(key);
    }
  }

  return (
    <div className={cn('flex flex-col', isSm ? 'gap-1' : 'gap-2')}>
      <div className={cn('grid grid-cols-3', isSm ? 'gap-1' : 'gap-2', isLg && 'gap-3')}>
        {KEYS.flat().map((key, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleKey(key)}
            className={cn(
              'flex items-center justify-center border border-gray-200 bg-white font-medium transition-all',
              'active:scale-[0.97] active:bg-gray-100',
              'hover:bg-gray-50',
              isSm
                ? 'min-h-[44px] rounded-lg text-base'
                : isLg
                  ? 'min-h-[72px] rounded-xl text-2xl'
                  : 'min-h-[60px] rounded-xl text-xl',
              key === '.' && 'text-gray-400'
            )}
          >
            {key === 'backspace' ? (
              <Delete className={cn('text-gray-500', isSm ? 'h-4 w-4' : isLg ? 'h-7 w-7' : 'h-5 w-5')} />
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
            'w-full bg-blue-600 font-semibold text-white transition-all',
            'hover:bg-blue-700 active:scale-[0.99]',
            isSm
              ? 'mt-0.5 min-h-[38px] rounded-lg text-sm'
              : isLg
                ? 'mt-1 min-h-[60px] rounded-xl text-lg'
                : 'mt-1 min-h-[48px] rounded-xl text-base'
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
