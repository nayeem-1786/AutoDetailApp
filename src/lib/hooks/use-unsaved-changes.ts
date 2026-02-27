'use client';

import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// useUnsavedChanges — beforeunload + popstate navigation guard
// ---------------------------------------------------------------------------

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;

    // Browser-native "Changes you made may not be saved" dialog
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages but returnValue is needed
      e.returnValue = '';
    };

    // Intercept browser back/forward navigation
    const handlePopState = () => {
      const leave = window.confirm(
        'You have unsaved changes. Leave anyway?'
      );
      if (!leave) {
        // Push the current state back to cancel navigation
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Push a state so we can detect back navigation
    window.history.pushState(null, '', window.location.href);

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty]);
}
