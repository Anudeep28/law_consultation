import { saveAs } from 'file-saver';
import { apiRequest, setAuthToken } from './api';
import { refreshSocketAuthentication } from './socket';

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const result = await apiRequest<{ token: string }>('/api/account/password', {
    method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
  });
  setAuthToken(result.token);
  refreshSocketAuthentication();
};

export const logoutAllDevices = () => apiRequest<void>('/api/account/logout-all', { method: 'POST' });

export const exportAccountData = async () => {
  const data = await apiRequest<{ exportedAt: string }>('/api/account/export');
  saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `law-writer-data-${data.exportedAt.slice(0, 10)}.json`);
};

export const deleteAccount = (password: string, confirmation: string) => apiRequest<void>('/api/account', {
  method: 'DELETE',
  body: JSON.stringify({ password, confirmation }),
});
