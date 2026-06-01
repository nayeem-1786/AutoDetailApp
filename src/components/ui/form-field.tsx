import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { Label } from './label';

interface FormFieldProps {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
  htmlFor?: string;
  /**
   * #136 Q4/Q5/B6 — opt-in error-space reservation. When `true`, the error
   * `<p>` slot ALWAYS renders with `min-h-[1rem]`, so toggling an error
   * on/off does not shift surrounding layout. Default `false` preserves the
   * pre-#136 behavior for the other ~54 FormField consumers across the
   * codebase. Vehicle-form fields opt in to eliminate the per-keystroke
   * layout shift from real-time validation introduced by Q5.
   */
  reserveErrorSpace?: boolean;
}

function FormField({
  label,
  error,
  description,
  required,
  className,
  labelClassName,
  children,
  htmlFor,
  reserveErrorSpace = false,
}: FormFieldProps) {
  return (
    <div
      className={cn('space-y-1.5', className)}
      {...(error ? { 'data-field-error': 'true' } : {})}
    >
      <Label htmlFor={htmlFor} className={labelClassName}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      <div className={cn(error && '[&_input]:border-red-500 [&_textarea]:border-red-500 [&_select]:border-red-500')}>
        {children}
      </div>
      {description && !error && (
        <p className="text-xs text-ui-text-muted">{description}</p>
      )}
      {reserveErrorSpace ? (
        <p
          className="text-xs text-red-500 min-h-[1rem]"
          role="alert"
          aria-live="polite"
        >
          {error ?? ''}
        </p>
      ) : (
        error && <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

export { FormField };
