import { fireEvent, render, screen } from '@testing-library/react';
import { Register } from './Register';
import { ResetPassword } from './ResetPassword';
import { resetPassword } from '../../services/notificationService';
import { useAuthStore } from '../../stores/authStore';
import { apiRequest, ApiError, setAuthToken } from '../../services/api';
import App from '../../App';
import { User } from '../../types';

jest.mock('../../services/notificationService', () => ({ resetPassword: jest.fn() }));
jest.mock('../../services/api', () => ({ ...jest.requireActual('../../services/api'), apiRequest: jest.fn() }));
jest.mock('../Dashboard', () => ({ Dashboard: () => <h1>Account dashboard</h1> }));

beforeEach(() => localStorage.clear());
afterEach(() => { window.history.replaceState({}, '', '/'); });

test('registration displays password rules and inline policy errors', async () => {
  const register = jest.fn().mockResolvedValue('This password is too common.');
  useAuthStore.setState({ register });
  render(<Register onToggleMode={jest.fn()} />);
  expect(screen.getByText(/10–128 characters/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByLabelText('Password', { exact: true }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('too common');
});

test('reset displays rules and server errors, then confirms success', async () => {
  (resetPassword as jest.Mock).mockRejectedValueOnce(new Error('Password must be at most 72 bytes.')).mockResolvedValueOnce(undefined);
  render(<ResetPassword token="reset-token" onDone={jest.fn()} />);
  expect(screen.getByText(/10–128 characters/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('72 bytes');
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  expect(await screen.findByText(/Your password has been updated/)).toBeInTheDocument();
});

test.each([true, false])('reset revalidates the existing session (revoked: %s) before returning to the app', async (revoked) => {
  const user: User = { id: revoked ? 'reset-account' : 'other-account', email: 'account@example.test', name: 'Test', role: 'client', accountStatus: 'active', subscriptionStatus: 'trial', subscriptionPlan: 'trial', documentCredits: 0, appliedPaymentIds: [], isPhoneVerified: true, isEmailVerified: true };
  setAuthToken('existing-token');
  useAuthStore.setState({ user, isAuthenticated: true });
  (apiRequest as jest.Mock).mockResolvedValueOnce({ user });
  if (revoked) (apiRequest as jest.Mock).mockRejectedValueOnce(new ApiError('Session expired', 401));
  else (apiRequest as jest.Mock).mockResolvedValueOnce({ user });
  (resetPassword as jest.Mock).mockResolvedValueOnce(undefined);
  window.history.replaceState({}, '', '/reset-password?token=reset-token');
  render(<App />);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Back to sign in' }));
  expect(await screen.findByRole('heading', { name: revoked ? /Client sign in/ : 'Account dashboard' })).toBeInTheDocument();
  expect(useAuthStore.getState().isAuthenticated).toBe(!revoked);
});
