import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';
const key = 'law-writer-theme';
const parse = (value: string | null): Theme => value === 'light' || value === 'dark' ? value : 'system';
const read = (): Theme => { try { return parse(localStorage.getItem(key)); } catch { return 'system'; } };
let theme = read();
let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();
const apply = () => {
  const dark = theme === 'dark' || theme === 'system' && (media?.matches ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1020' : '#4f46e5');
};
const changed = () => { apply(); listeners.forEach(listener => listener()); };
const stored = (event: StorageEvent) => {
  if (event.key !== key && event.key !== null) return;
  theme = parse(event.newValue);
  changed();
};
const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', changed);
    window.addEventListener('storage', stored);
    apply();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media?.removeEventListener('change', changed);
      media = undefined;
      window.removeEventListener('storage', stored);
    }
  };
};
export const setTheme = (value: Theme) => {
  theme = parse(value);
  try { localStorage.setItem(key, theme); } catch { /* Storage may be unavailable in private browsing. */ }
  changed();
};
export const useTheme = () => useSyncExternalStore(subscribe, () => theme, () => 'system' as Theme);
