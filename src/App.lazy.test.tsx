import { vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from './App';
import { useAuthStore } from './stores/authStore';

const imports = vi.hoisted(() => ({ dashboard: 0, release: undefined as undefined | (() => void) }));
vi.mock('./components/Dashboard', async () => {
  imports.dashboard++;
  await new Promise<void>(resolve => { imports.release = resolve; });
  return { Dashboard: () => <h1>Account dashboard</h1> };
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null, refreshUser: vi.fn().mockResolvedValue(undefined) });
});

test('sign-in does not import authenticated dashboards', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /client sign in/i })).toBeInTheDocument();
  expect(imports.dashboard).toBe(0);
});

test('loads the dashboard only for an authenticated session', async () => {
  useAuthStore.setState({ isAuthenticated: true });
  render(<App />);
  expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
  await act(async () => { imports.release!(); });
  expect(await screen.findByRole('heading', { name: 'Account dashboard' })).toBeInTheDocument();
  expect(imports.dashboard).toBe(1);
});
