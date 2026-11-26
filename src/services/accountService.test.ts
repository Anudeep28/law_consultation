import { saveAs } from 'file-saver';
import { apiRequest } from './api';
import { deleteAccount, exportAccountData } from './accountService';

jest.mock('./api', () => ({ apiRequest: jest.fn() }));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

test('saves the JSON export using the server export date', async () => {
  (apiRequest as jest.Mock).mockResolvedValue({ exportedAt: '2026-11-17T10:00:00.000Z', documents: [] });
  await exportAccountData();
  expect(apiRequest).toHaveBeenCalledWith('/api/account/export');
  expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'law-writer-data-2026-11-17.json');
});

test('sends the password and confirmation to the deletion endpoint', async () => {
  (apiRequest as jest.Mock).mockResolvedValue(undefined);
  await deleteAccount('password', 'DELETE');
  expect(apiRequest).toHaveBeenCalledWith('/api/account', { method: 'DELETE', body: JSON.stringify({ password: 'password', confirmation: 'DELETE' }) });
});

test('does not save a failed export', async () => {
  (apiRequest as jest.Mock).mockRejectedValue(new Error('Export unavailable'));
  await expect(exportAccountData()).rejects.toThrow('Export unavailable');
  expect(saveAs).not.toHaveBeenCalled();
});
