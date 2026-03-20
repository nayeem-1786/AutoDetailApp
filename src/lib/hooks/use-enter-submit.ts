import { useCallback } from 'react';

/**
 * Returns an onKeyDown handler that calls `onSubmit` when Enter is pressed.
 * - Ignores Shift+Enter (for textarea newlines)
 * - Ignores IME composing state (non-Latin keyboard input)
 * - Respects `enabled` flag (tie to loading/disabled state to prevent double-submit)
 */
export function useEnterSubmit(onSubmit: () => void, enabled = true) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    console.log('[useEnterSubmit]', { key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, enabled, activeTag: document.activeElement?.tagName });
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && enabled) {
      e.preventDefault();
      onSubmit();
    }
  }, [onSubmit, enabled]);

  return { onKeyDown: handleKeyDown };
}
