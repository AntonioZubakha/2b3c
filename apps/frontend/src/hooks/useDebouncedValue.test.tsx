import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates only after delay', () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebouncedValue(v, 200), {
      initialProps: { v: 'one' },
    });
    expect(result.current).toBe('one');

    rerender({ v: 'two' });
    expect(result.current).toBe('one');

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe('one');

    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current).toBe('two');
  });
});
