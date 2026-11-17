import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notify, Toasts, useToastStore } from './Toasts';

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  jest.useRealTimers();
});

test('renders an empty polite live region', () => {
  render(<Toasts />);
  expect(screen.getByLabelText('Notifications')).toHaveAttribute('aria-live', 'polite');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('renders success, info, and error notifications', () => {
  render(<Toasts />);
  act(() => {
    notify('Saved', 'success');
    notify('Subscription required');
    notify('Export failed', 'error');
  });
  expect(screen.getAllByRole('status')).toHaveLength(2);
  expect(screen.getByText('Saved')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
});

test('manually dismisses only the selected toast', () => {
  render(<Toasts />);
  act(() => { notify('First'); notify('Second'); });
  fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
  expect(screen.queryByText('First')).not.toBeInTheDocument();
  expect(screen.getByText('Second')).toBeInTheDocument();
});

test('auto-dismisses after five seconds and keeps errors for eight seconds', () => {
  render(<Toasts />);
  act(() => { notify('Saved', 'success'); notify('Failed', 'error'); });
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  act(() => { jest.advanceTimersByTime(3000); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('cleans up timers when unmounted', () => {
  const { unmount } = render(<Toasts />);
  act(() => { notify('Saved'); });
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});
