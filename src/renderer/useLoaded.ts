import { useEffect, useState } from 'react';

/**
 * State that starts at `initial` and takes what `load` resolves to, once, when the component mounts;
 * a result that arrives after it unmounts is dropped. `onFailed` gives the value to show if loading fails.
 */
export function useLoaded<T>(load: () => Promise<T>, initial: T, onFailed?: (error: unknown) => T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let current = true;
    const loading = load().then((loaded) => current && setValue(loaded));
    if (onFailed) loading.catch((error: unknown) => current && setValue(onFailed(error)));
    return () => {
      current = false;
    };
    // Loaded once: later renders' `load` and `onFailed` are the same request.
  }, []);
  return [value, setValue] as const;
}
