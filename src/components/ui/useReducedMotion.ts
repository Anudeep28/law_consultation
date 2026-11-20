import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(query);
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
};
const getSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

export const useReducedMotion = () => useSyncExternalStore(subscribe, getSnapshot, () => false);
