import { vi, type Mock } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { checkout } from '../services/razorpayService';
import { useAuthStore } from '../stores/authStore';
import { User } from '../types';
import { SubscriptionView } from './SubscriptionView';

vi.mock('../services/razorpayService', () => ({ checkout: vi.fn() }));

const user: User = {
  id: 'lawyer-1', name: 'Lawyer', email: 'lawyer@example.test', role: 'lawyer', accountStatus: 'active',
  isPhoneVerified: true, isEmailVerified: true, subscriptionStatus: 'trial', subscriptionPlan: 'trial',
  documentCredits: 0, appliedPaymentIds: [],
};

afterEach(() => { useAuthStore.setState({ user: null }); });

test.each(['Payment was cancelled', 'Invalid payment signature'])('preserves the subscription checkout message: %s', async (message) => {
  useAuthStore.setState({ user });
  (checkout as Mock).mockRejectedValueOnce(new Error(message));
  render(<SubscriptionView />);
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe monthly' }));
  expect(await screen.findByText(message, { exact: true })).toBeInTheDocument();
  expect(useAuthStore.getState().user).toEqual(user);
});
