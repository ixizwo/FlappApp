import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './use-autosave.ts';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces mark() calls into a single flush batch', () => {
    const flush = vi.fn();
    const { result } = renderHook(() => useAutosave<number>(flush, 200));

    act(() => {
      result.current.mark('a', 1);
      result.current.mark('b', 2);
      result.current.mark('a', 3); // replaces earlier 'a'
    });
    expect(flush).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(flush).toHaveBeenCalledTimes(1);
    const batch = flush.mock.calls[0]![0] as Map<string, number>;
    expect(batch.get('a')).toBe(3);
    expect(batch.get('b')).toBe(2);
    expect(batch.size).toBe(2);
  });

  it('resets the buffer after a flush so the next cycle starts empty', () => {
    const flush = vi.fn();
    const { result } = renderHook(() => useAutosave<number>(flush, 100));

    act(() => {
      result.current.mark('a', 1);
      vi.advanceTimersByTime(100);
    });
    expect(flush).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.mark('b', 2);
      vi.advanceTimersByTime(100);
    });
    expect(flush).toHaveBeenCalledTimes(2);
    const second = flush.mock.calls[1]![0] as Map<string, number>;
    expect(Array.from(second.keys())).toEqual(['b']);
  });

  it('flushNow() fires immediately without waiting for the timer', () => {
    const flush = vi.fn();
    const { result } = renderHook(() => useAutosave<number>(flush, 999_999));

    act(() => {
      result.current.mark('a', 1);
      result.current.flushNow();
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushes pending changes on unmount so nothing is lost', () => {
    const flush = vi.fn();
    const { result, unmount } = renderHook(() => useAutosave<number>(flush, 999_999));

    act(() => {
      result.current.mark('a', 1);
    });
    unmount();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
