import { vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, apiRequest } from '../services/api';
import { AdminPaymentsView } from './AdminPaymentsView';
import { useToastStore } from './ui/Toasts';

vi.mock('../services/api', () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));
const api = vi.mocked(apiRequest);
const payment = { id: 'payment-1', amount: 37500, currency: 'INR', status: 'PAID', plan: 'CONSULTATION', refundStatus: null, refundError: null, refundId: null, user: { name: 'Client', email: 'client@example.test' }, consultation: { id: 'cons-1', status: 'BOOKED', startsAt: '2026-12-01T12:00:00Z', lawyer: { name: 'Advocate Test' } } };
beforeEach(() => { api.mockReset(); useToastStore.setState({ toasts: [] }); });

test('validates the modal reason and note before requesting the displayed full amount', async () => {
  api.mockResolvedValue({ payments: [payment] });
  render(<AdminPaymentsView />);
  fireEvent.click(await screen.findByRole('button', { name: 'Refund consultation cons-1' }));
  expect(screen.getByText('Full amount: INR 375.00')).toBeInTheDocument();
  expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('10–500');
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'TECHNICAL_FAILURE' } });
  fireEvent.change(screen.getByLabelText('Administrative note'), { target: { value: 'too short' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Administrative note'), { target: { value: '  Verified technical disruption during call  ' } });
  api.mockResolvedValueOnce({ payment: { refundStatus: 'PROCESSED' } }).mockResolvedValue({ payments: [{ ...payment, status: 'REFUNDED', refundStatus: 'PROCESSED' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/admin/consultations/cons-1/refund', { method: 'POST', body: JSON.stringify({ reason: 'TECHNICAL_FAILURE', note: 'Verified technical disruption during call' }) }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await screen.findByText('PROCESSED')).toBeInTheDocument();
  expect(useToastStore.getState().toasts[0].message).toBe('Full refund processed.');
});

test('shows empty and load-error states and supports server-side search', async () => {
  api.mockResolvedValueOnce({ payments: [] }).mockRejectedValueOnce(new Error('offline'));
  render(<AdminPaymentsView />);
  expect(await screen.findByText('No payments found.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search payments'), { target: { value: 'client@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load payments');
  expect(api).toHaveBeenLastCalledWith('/api/admin/payments?q=client%40example.test');
});

test('a provider failure stays visible and does not show a success toast', async () => {
  api.mockResolvedValue({ payments: [payment] });
  render(<AdminPaymentsView />);
  fireEvent.click(await screen.findByRole('button', { name: 'Refund consultation cons-1' }));
  fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'OTHER' } });
  fireEvent.change(screen.getByLabelText('Administrative note'), { target: { value: 'Verified support request' } });
  api.mockRejectedValueOnce(new ApiError('Refund requires reconciliation', 502)).mockResolvedValue({ payments: [{ ...payment, refundStatus: 'REVIEW', refundError: 'Outcome unknown' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Refund requires reconciliation');
  expect(await screen.findByText(/Needs review/)).toBeInTheDocument();
  expect(useToastStore.getState().toasts[0].variant).toBe('error');
});

test.each(['PENDING', 'PROCESSED', 'REVIEW'])('cannot refund a %s payment from the listing', async refundStatus => {
  api.mockResolvedValue({ payments: [{ ...payment, refundStatus }] });
  render(<AdminPaymentsView />);
  expect(await screen.findByText(refundStatus)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refund consultation cons-1' })).not.toBeInTheDocument();
});
