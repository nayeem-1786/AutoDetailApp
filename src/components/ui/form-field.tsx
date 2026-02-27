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
}

function FormField({ label, error, description, required, className, labelClassName, children, htmlFor }: FormFieldProps) {
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
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export { FormField };
