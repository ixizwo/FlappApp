import { useEffect, useRef } from 'react';

/**
 * Debounced autosave helper.
 *
 * Buffers per-key mutations in a ref and flushes them together after
 * `delayMs` of inactivity. Unlike "just debounce the whole save," this
 * lets different nodes trigger independent flushes without clobbering each
 * other's state. Each `mark(key, value)` replaces any earlier value for
 * that key.
 */
export function useAutosave<T>(
  flush: (batch: Map<string, T>) => Promise<void> | void,
  delayMs = 500,
) {
  const buffer = useRef(new Map<string, T>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const doFlush = () => {
    if (buffer.current.size === 0) return;
    const batch = buffer.current;
    buffer.current = new Map();
    dirty.current = false;
    void flush(batch);
  };

  const mark = (key: string, value: T) => {
    buffer.current.set(key, value);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(doFlush, delayMs);
  };

  const flushNow = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    doFlush();
  };

  // Flush on unmount so nothing is lost when the user navigates away.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      if (buffer.current.size > 0) {
        void flush(buffer.current);
        buffer.current = new Map();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    mark,
    flushNow,
    isDirty: () => dirty.current,
  };
}
