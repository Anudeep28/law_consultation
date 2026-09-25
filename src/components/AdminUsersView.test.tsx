import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../services/api';
import { AdminUsersView } from './AdminUsersView';

jest.mock('../services/api', () => ({ apiRequest: jest.fn(), ApiError: class ApiError extends Error {} }));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const user = { id: 'client-1', name: 'Test Client', email: 'client@example.com', role: 'client', accountStatus: 'active', createdAt: '2026-09-01T00:00:00.000Z' };

test('requires a reason and suspends a client account', async () => {
  mockedApiRequest.mockResolvedValueOnce({ users: [user] }).mockResolvedValueOnce({ user: { ...user, accountStatus: 'suspended' } });
  render(<AdminUsersView />);

  expect(await screen.findByText('Test Client')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Reason for Test Client'), { target: { value: 'Repeated violations of platform rules' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suspend Test Client' }));

  await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith('/api/admin/users/client-1/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'suspended', reason: 'Repeated violations of platform rules' }),
  }));
});
