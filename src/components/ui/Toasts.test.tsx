import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notify, Toasts, useToastStore } from './Toasts';

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => jest.useRealTimers());

test('renders an empty polite notification region', () => {
  render(<Toasts />);
  expect(screen.getByLabelText('Notifications')).toHaveAttribute('aria-live', 'polite');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('dismisses info notifications and auto-dismisses success and error notifications', () => {
  render(<Toasts />);
  act(() => { notify('Account deleted'); });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(screen.queryByText('Account deleted')).not.toBeInTheDocument();
  act(() => { notify('Saved', 'success'); notify('Failed', 'error'); });
  expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(3000); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
