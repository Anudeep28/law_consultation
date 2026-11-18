import { fireEvent, render, screen } from '@testing-library/react';
import { Register } from './Register';
import { ResetPassword } from './ResetPassword';
import { resetPassword } from '../../services/notificationService';
import { useAuthStore } from '../../stores/authStore';

jest.mock('../../services/notificationService', () => ({ resetPassword: jest.fn() }));

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
