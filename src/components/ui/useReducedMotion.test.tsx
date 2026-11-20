import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });

test('subscribes to live reduced-motion changes and removes its listener', () => {
  let matches = false;
  let listener: () => void = () => {};
  const remove = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() { return matches; },
    addEventListener: (_event: string, callback: () => void) => { listener = callback; },
    removeEventListener: remove,
  });
  const { result, unmount } = renderHook(useReducedMotion);
  expect(result.current).toBe(false);
  act(() => { matches = true; listener(); });
  expect(result.current).toBe(true);
  act(() => { matches = false; listener(); });
  expect(result.current).toBe(false);
  unmount();
  expect(remove).toHaveBeenCalledWith('change', listener);
});

test('can render when matchMedia is unavailable', () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
  expect(renderHook(useReducedMotion).result.current).toBe(false);
});
