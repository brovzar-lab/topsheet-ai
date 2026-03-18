import { useState, useEffect } from 'react';

/**
 * Returns `showSaved: true` for 2 seconds after `lastSavedAt` changes.
 * Pass the `lastSavedAt` timestamp from any store.
 */
export function useAutosaveIndicator(lastSavedAt: number | null): { showSaved: boolean } {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!lastSavedAt) return;
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSavedAt]);

  return { showSaved };
}
