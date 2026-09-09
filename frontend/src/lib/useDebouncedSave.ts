import { useCallback, useEffect, useRef } from "react";

export function useDebouncedSave<T>(save: (key: string, value: T) => void, delayMs = 420) {
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const schedule = useCallback(
    (key: string, value: T) => {
      const existing = timers.current.get(key);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timer = window.setTimeout(() => {
        save(key, value);
        timers.current.delete(key);
      }, delayMs);
      timers.current.set(key, timer);
    },
    [save, delayMs],
  );

  const cancel = useCallback((key: string) => {
    const existing = timers.current.get(key);
    if (existing) {
      window.clearTimeout(existing);
      timers.current.delete(key);
    }
  }, []);

  return { schedule, cancel };
}
