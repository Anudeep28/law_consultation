import { saveAs } from 'file-saver';
import { apiRequest } from './api';

export const exportAccountData = async () => {
  const data = await apiRequest<{ exportedAt: string }>('/api/account/export');
  saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `law-writer-data-${data.exportedAt.slice(0, 10)}.json`);
};

export const deleteAccount = (password: string, confirmation: string) => apiRequest<void>('/api/account', {
  method: 'DELETE',
  body: JSON.stringify({ password, confirmation }),
});
