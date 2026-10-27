import { useEffect, useState } from 'react';

/** A status-bar message, gone after `ms` (or replaced by the next one). */
export function useTransientMessage(ms: number) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(timer);
  }, [message, ms]);
  return [message, setMessage] as const;
}
