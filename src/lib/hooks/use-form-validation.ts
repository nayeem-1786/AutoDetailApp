'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// useFormValidation — field-level errors, section badges, toast + scroll
// ---------------------------------------------------------------------------

interface ValidationRule {
  field: string;
  value: unknown;
  validate: (v: unknown) => string | null;
}

export function useFormValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setFieldError = useCallback((field: string, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const getFieldError = useCallback(
    (field: string): string | undefined => errors[field],
    [errors]
  );

  const getSectionErrors = useCallback(
    (prefix: string): number => {
      return Object.keys(errors).filter((key) => key.startsWith(prefix)).length;
    },
    [errors]
  );

  const hasErrors = Object.keys(errors).length > 0;

  const validateAll = useCallback(
    (rules: ValidationRule[]): boolean => {
      const newErrors: Record<string, string> = {};

      for (const rule of rules) {
        const error = rule.validate(rule.value);
        if (error) {
          newErrors[rule.field] = error;
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    []
  );

  const scrollToFirstError = useCallback(() => {
    // Find first element with data-field-error attribute
    const firstError = document.querySelector('[data-field-error]');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const validateAndToast = useCallback(
    (rules: ValidationRule[]): boolean => {
      const valid = validateAll(rules);
      if (!valid) {
        const count = rules.filter((r) => r.validate(r.value) !== null).length;
        toast.error(`Please fix ${count} error${count !== 1 ? 's' : ''} before saving`);
        // Defer scroll to allow DOM to re-render with error attributes
        setTimeout(() => scrollToFirstError(), 100);
      }
      return valid;
    },
    [validateAll, scrollToFirstError]
  );

  const clearAll = useCallback(() => {
    setErrors({});
  }, []);

  return {
    errors,
    setFieldError,
    clearFieldError,
    getFieldError,
    getSectionErrors,
    hasErrors,
    validateAll,
    validateAndToast,
    scrollToFirstError,
    clearAll,
  };
}
