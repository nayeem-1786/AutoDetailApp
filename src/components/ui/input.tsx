import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-ui-input-border bg-ui-input-bg px-3 py-1 text-sm text-ui-text shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ui-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
