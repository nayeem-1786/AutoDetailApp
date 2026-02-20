'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * Prevents concurrent async mutations within a component.
 *
 * Uses a synchronous `useRef` lock (not just state, which updates async)
 * so that rapid double-clicks are blocked even before React re-renders.
 *
 * Usage:
 *   const { isSubmitting, execute } = useAsyncAction();
 *   const handleClick = () => execute(async () => { ... });
 *   <Button disabled={isSubmitting} onClick={handleClick}>Save</Button>
 */
export function useAsyncAction() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockRef = useRef(false);

  const execute = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (lockRef.current) return undefined;
      lockRef.current = true;
      setIsSubmitting(true);
      try {
        return await fn();
      } finally {
        lockRef.current = false;
        setIsSubmitting(false);
      }
    },
    []
  );

  return { isSubmitting, execute } as const;
}
