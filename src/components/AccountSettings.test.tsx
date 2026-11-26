import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountSettings } from './AccountSettings';
import { deleteAccount, exportAccountData } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from './ui/Toasts';

jest.mock('../services/accountService', () => ({ deleteAccount: jest.fn(), exportAccountData: jest.fn() }));

const openDeletion = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete account' })); });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'my-password' } });
};
const confirm = () => fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

test('requires exact DELETE confirmation and logs out after successful deletion', async () => {
  const logout = jest.fn();
  useAuthStore.setState({ logout });
  (deleteAccount as jest.Mock).mockResolvedValue(undefined);
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
  (deleteAccount as jest.Mock).mockRejectedValue(new Error('Cancel or complete your upcoming consultations before deleting your account.'));
  render(<AccountSettings />);
  await openDeletion();
  confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Cancel or complete your upcoming consultations');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('downloads account data', async () => {
  (exportAccountData as jest.Mock).mockResolvedValue(undefined);
  render(<AccountSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  await waitFor(() => expect(exportAccountData).toHaveBeenCalledTimes(1));
});

test('shows download errors', async () => {
  (exportAccountData as jest.Mock).mockRejectedValue(new Error('Too many attempts. Please try again later.'));
  render(<AccountSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
});
