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
  expect(await screen.findByText(/Needs review —/)).toBeInTheDocument();
  expect(useToastStore.getState().toasts[0].variant).toBe('error');
});

test.each(['PENDING', 'PROCESSED', 'REVIEW'])('cannot refund a %s payment from the listing', async refundStatus => {
  api.mockResolvedValue({ payments: [{ ...payment, refundStatus }] });
  render(<AdminPaymentsView />);
  expect(await screen.findByText(refundStatus)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Refund consultation cons-1' })).not.toBeInTheDocument();
});

test('filters the review queue and checks the provider, then refreshes the count', async () => {
  const review = { ...payment, refundStatus: 'REVIEW', refundError: 'Ambiguous provider response', razorpayPaymentId: 'pay_review' };
  api.mockResolvedValue({ payments: [review], reviewCount: 1 });
  render(<AdminPaymentsView />);
  fireEvent.click(await screen.findByRole('button', { name: /Needs review/ }));
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/admin/payments/review?q='));
  const check = await screen.findByRole('button', { name: 'Check with Razorpay for payment payment-1' });
  api.mockResolvedValueOnce({ message: 'Provider refund is processed.' }).mockResolvedValue({ payments: [], reviewCount: 0 });
  fireEvent.click(check);
  expect(await screen.findByText('No payments found.')).toBeInTheDocument();
  expect(screen.getByLabelText('0 payments need review')).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('/api/admin/payments/payment-1/reconcile', { method: 'POST' });
  expect(useToastStore.getState().toasts[0].message).toBe('Provider refund is processed.');
});

test('manual resolution validates outcome/note and submits the trimmed audit note', async () => {
  api.mockResolvedValue({ payments: [{ ...payment, refundStatus: 'REVIEW' }], reviewCount: 1 });
  render(<AdminPaymentsView />);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark payment payment-1 resolved' }));
  expect(screen.getByRole('dialog', { name: 'Resolve payment review' })).toHaveTextContent('This cannot be undone');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm resolution' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('10–500');
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Resolution outcome'), { target: { value: 'REFUNDED' } });
  fireEvent.change(screen.getByLabelText('Resolution note'), { target: { value: '  Confirmed in provider dashboard  ' } });
  api.mockResolvedValueOnce({ message: 'Payment review resolved.' }).mockResolvedValue({ payments: [], reviewCount: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm resolution' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/admin/payments/payment-1/resolve', { method: 'POST', body: JSON.stringify({ outcome: 'REFUNDED', note: 'Confirmed in provider dashboard' }) }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a failed review check reports an error and keeps the review row actionable', async () => {
  api.mockResolvedValue({ payments: [{ ...payment, refundStatus: 'REVIEW' }], reviewCount: 1 });
  render(<AdminPaymentsView />);
  const check = await screen.findByRole('button', { name: 'Check with Razorpay for payment payment-1' });
  api.mockRejectedValueOnce(new ApiError('Unable to check Razorpay; review retained.', 502));
  fireEvent.click(check);
  await waitFor(() => expect(useToastStore.getState().toasts[0]?.variant).toBe('error'));
  expect(await screen.findByRole('button', { name: 'Check with Razorpay for payment payment-1' })).toBeEnabled();
});
