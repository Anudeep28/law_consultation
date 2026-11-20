import { vi, type Mock } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountSettings } from './AccountSettings';
import { changePassword, logoutAllDevices, deleteAccount, exportAccountData } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from './ui/Toasts';

vi.mock('../services/accountService', () => ({ changePassword: vi.fn(), logoutAllDevices: vi.fn(), deleteAccount: vi.fn(), exportAccountData: vi.fn() }));

const openDeletion = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete account' })); });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my-password' } });
};
const confirm = () => fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

test('requires exact DELETE confirmation and logs out after successful deletion', async () => {
  const logout = vi.fn();
  useAuthStore.setState({ logout });
  (deleteAccount as Mock).mockResolvedValue(undefined);
  render(<AccountSettings />);
  await openDeletion();
  const submit = screen.getByRole('button', { name: 'Permanently delete account' });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } });
  expect(submit).toBeDisabled();
  confirm();
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(logout).toHaveBeenCalled());
  expect(deleteAccount).toHaveBeenCalledWith('my-password', 'DELETE');
  expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'info' });
});

test('shows server deletion errors inline, including upcoming consultation conflicts', async () => {
  (deleteAccount as Mock).mockRejectedValue(new Error('Cancel or complete your upcoming consultations before deleting your account.'));
  render(<AccountSettings />);
  await openDeletion();
  confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cancel or complete your upcoming consultations');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('downloads account data', async () => {
  (exportAccountData as Mock).mockResolvedValue(undefined);
  render(<AccountSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  await waitFor(() => expect(exportAccountData).toHaveBeenCalledTimes(1));
});

test('shows download errors', async () => {
  (exportAccountData as Mock).mockRejectedValue(new Error('Too many attempts. Please try again later.'));
  render(<AccountSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
});

test('changes password, clears credential inputs, and stays logged in', async () => {
  const logout = vi.fn();
  useAuthStore.setState({ logout });
  (changePassword as Mock).mockResolvedValue(undefined);
  render(<AccountSettings />);
  expect(screen.getByText(/10–128 characters/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Fresh-river-copper!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old', 'Fresh-river-copper!'));
  await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''));
  expect(logout).not.toHaveBeenCalled();
});

test('password mismatch and server policy errors appear inline', async () => {
  render(<AccountSettings />);
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
  (changePassword as Mock).mockRejectedValue(new Error('This password is too common.'));
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('too common');
});

test('logout-all logs out locally only after the server succeeds', async () => {
  const logout = vi.fn();
  useAuthStore.setState({ logout });
  (logoutAllDevices as Mock).mockRejectedValueOnce(new Error('Try again later')).mockResolvedValueOnce(undefined);
  render(<AccountSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later');
  expect(logout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
  await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
});
