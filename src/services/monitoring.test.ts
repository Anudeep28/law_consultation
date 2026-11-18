import * as Sentry from '@sentry/react';
import { initializeMonitoring, reportBoundaryError } from './monitoring';

jest.mock('@sentry/react', () => ({ init: jest.fn(), captureException: jest.fn() }));
const originalDsn = process.env.REACT_APP_SENTRY_DSN;

afterEach(() => {
  if (originalDsn === undefined) delete process.env.REACT_APP_SENTRY_DSN;
  else process.env.REACT_APP_SENTRY_DSN = originalDsn;
  jest.clearAllMocks();
});

test('monitoring is a no-op without a DSN', () => {
  delete process.env.REACT_APP_SENTRY_DSN;
  initializeMonitoring();
  reportBoundaryError(new Error('Ignored'), { componentStack: 'Component' });
  expect(Sentry.init).not.toHaveBeenCalled();
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('configured monitoring disables PII and removes request payloads before sending', () => {
  process.env.REACT_APP_SENTRY_DSN = 'https://public-key@errors.example.test/42';
  initializeMonitoring();
  const options = (Sentry.init as jest.Mock).mock.calls[0][0];
  expect(options.sendDefaultPii).toBe(false);
  const event = options.beforeSend({ user: { email: 'private@example.test' }, breadcrumbs: [{ message: 'Private' }], request: { data: { password: 'SECRET' }, headers: { Authorization: 'SECRET' }, cookies: 'SECRET', query_string: 'token=SECRET', url: 'https://app.test/api?token=SECRET' } });
  expect(event).toEqual({ request: { url: 'https://app.test/api' } });
  const error = new Error('Boundary error');
  reportBoundaryError(error, { componentStack: 'Component' });
  expect(Sentry.captureException).toHaveBeenCalledWith(error, { contexts: { react: { componentStack: 'Component' } } });
});
