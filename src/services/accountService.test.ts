import { vi, type Mock } from 'vitest';
import { saveAs } from 'file-saver';
import { apiRequest, setAuthToken } from './api';
import { refreshSocketAuthentication } from './socket';
import { changePassword, logoutAllDevices, deleteAccount, exportAccountData } from './accountService';

vi.mock('./api', () => ({ apiRequest: vi.fn(), setAuthToken: vi.fn() }));
vi.mock('./socket', () => ({ refreshSocketAuthentication: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

test('saves the JSON export using the server export date', async () => {
  (apiRequest as Mock).mockResolvedValue({ exportedAt: '2026-11-17T10:00:00.000Z', documents: [] });
  await exportAccountData();
  expect(apiRequest).toHaveBeenCalledWith('/api/account/export');
  expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'law-writer-data-2026-11-17.json');
});

test('sends the password and confirmation to the deletion endpoint', async () => {
  (apiRequest as Mock).mockResolvedValue(undefined);
  await deleteAccount('password', 'DELETE');
  expect(apiRequest).toHaveBeenCalledWith('/api/account', { method: 'DELETE', body: JSON.stringify({ password: 'password', confirmation: 'DELETE' }) });
});

test('does not save a failed export', async () => {
  (apiRequest as Mock).mockRejectedValue(new Error('Export unavailable'));
  await expect(exportAccountData()).rejects.toThrow('Export unavailable');
  expect(saveAs).not.toHaveBeenCalled();
});

test('replaces the current token and reconnects sockets only after a successful password change', async () => {
  (apiRequest as Mock).mockResolvedValueOnce({ token: 'fresh-session' });
  await changePassword('old', 'new-password');
  expect(apiRequest).toHaveBeenCalledWith('/api/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: 'old', newPassword: 'new-password' }) });
  expect(setAuthToken).toHaveBeenCalledWith('fresh-session');
  expect(refreshSocketAuthentication).toHaveBeenCalledTimes(1);
  vi.clearAllMocks();
  (apiRequest as Mock).mockRejectedValueOnce(new Error('Incorrect current password'));
  await expect(changePassword('wrong', 'new-password')).rejects.toThrow('Incorrect current password');
  expect(setAuthToken).not.toHaveBeenCalled();
  expect(refreshSocketAuthentication).not.toHaveBeenCalled();
});

test('requests server-side revocation for all devices', async () => {
  (apiRequest as Mock).mockResolvedValueOnce(undefined);
  await logoutAllDevices();
  expect(apiRequest).toHaveBeenCalledWith('/api/account/logout-all', { method: 'POST' });
});
