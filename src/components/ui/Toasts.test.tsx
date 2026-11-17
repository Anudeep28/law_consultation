import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { notify, Toasts, useToastStore } from './Toasts';
import { Modal } from './Modal';

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

test('toast pointer clicks keep the modal open while outside clicks and Escape close it', async () => {
  jest.useRealTimers();
  const onClose = jest.fn();
  await act(async () => {
    render(<><Modal open onClose={onClose} title="Export document"><p>Export settings</p></Modal><Toasts /></>);
  });
  act(() => { notify('Export failed', 'error'); });
  const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
  fireEvent.pointerDown(dismiss);
  fireEvent.pointerUp(dismiss);
  fireEvent.click(dismiss);
  expect(screen.queryByText('Export failed')).not.toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const outside = screen.getByRole('dialog').querySelector(':scope > div') as HTMLElement;
  fireEvent.pointerDown(outside);
  fireEvent.pointerUp(outside);
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(2);
});
