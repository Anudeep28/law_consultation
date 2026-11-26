import React from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { ThemeControl } from './ThemeControl';
import { setTheme } from '../../services/theme';

let media: MediaQueryList;
beforeEach(() => {
  const target = new EventTarget();
  media = Object.assign(target, { matches: false, media: '(prefers-color-scheme: dark)', onchange: null }) as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  localStorage.clear();
  setTheme('system');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('offers three choices and synchronizes persisted selections across controls', () => {
  render(<><ThemeControl /><ThemeControl /></>);
  const controls = screen.getAllByRole('combobox', { name: 'Color theme' });
  expect(controls[0]).toHaveValue('system');
  fireEvent.change(controls[0], { target: { value: 'dark' } });
  expect(document.documentElement).toHaveClass('dark');
  expect(controls[1]).toHaveValue('dark');
  expect(localStorage.getItem('law-writer-theme')).toBe('dark');
  fireEvent.change(controls[1], { target: { value: 'light' } });
  expect(document.documentElement).not.toHaveClass('dark');
  expect(controls[0]).toHaveValue('light');
});

test('system follows live preference changes while explicit choices do not', () => {
  render(<ThemeControl />);
  Object.defineProperty(media, 'matches', { value: true, configurable: true });
  act(() => { media.dispatchEvent(new Event('change')); });
  expect(document.documentElement).toHaveClass('dark');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'light' } });
  act(() => { media.dispatchEvent(new Event('change')); });
  expect(document.documentElement).not.toHaveClass('dark');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'system' } });
  expect(document.documentElement).toHaveClass('dark');
});

test('synchronizes valid cross-tab settings and treats invalid values as System', () => {
  render(<ThemeControl />);
  fireEvent(window, new StorageEvent('storage', { key: 'law-writer-theme', newValue: 'dark' }));
  expect(screen.getByRole('combobox')).toHaveValue('dark');
  fireEvent(window, new StorageEvent('storage', { key: 'law-writer-theme', newValue: 'invalid' }));
  expect(screen.getByRole('combobox')).toHaveValue('system');
  expect(document.documentElement).not.toHaveClass('dark');
});

test('still changes theme when persistence is blocked', () => {
  render(<ThemeControl />);
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dark' } });
  expect(document.documentElement).toHaveClass('dark');
  expect(screen.getByRole('combobox')).toHaveValue('dark');
  fail.mockRestore();
});
