import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border-ui-input-border text-ui-text focus:ring-ui-ring',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
