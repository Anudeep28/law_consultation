import { vi, type Mock } from 'vitest';
import * as Sentry from '@sentry/react';
import { initializeMonitoring, reportBoundaryError } from './monitoring';

vi.mock('@sentry/react', () => ({ init: vi.fn(), captureException: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test('monitoring is a no-op without a DSN', () => {
  vi.stubEnv('REACT_APP_SENTRY_DSN', undefined);
  initializeMonitoring();
  reportBoundaryError(new Error('Ignored'), { componentStack: 'Component' });
  expect(Sentry.init).not.toHaveBeenCalled();
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('configured monitoring disables PII and removes request payloads before sending', () => {
  vi.stubEnv('REACT_APP_SENTRY_DSN', 'https://public-key@errors.example.test/42');
  initializeMonitoring();
  const options = (Sentry.init as Mock).mock.calls[0][0];
  expect(options.sendDefaultPii).toBe(false);
  const event = options.beforeSend({ user: { email: 'private@example.test' }, breadcrumbs: [{ message: 'Private' }], request: { data: { password: 'SECRET' }, headers: { Authorization: 'SECRET' }, cookies: 'SECRET', query_string: 'token=SECRET', url: 'https://app.test/api?token=SECRET' } });
  expect(event).toEqual({ request: { url: 'https://app.test/api' } });
  const error = new Error('Boundary error');
  reportBoundaryError(error, { componentStack: 'Component' });
  expect(Sentry.captureException).toHaveBeenCalledWith(error, { contexts: { react: { componentStack: 'Component' } } });
});
