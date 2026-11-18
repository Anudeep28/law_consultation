jest.mock('@sentry/node', () => ({ init: jest.fn(), captureException: jest.fn(), flush: jest.fn().mockResolvedValue(true) }));
const originalDsn = process.env.SENTRY_DSN;
const originalBrowserDsn = process.env.REACT_APP_SENTRY_DSN;

afterEach(() => {
  if (originalDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = originalDsn;
  if (originalBrowserDsn === undefined) delete process.env.REACT_APP_SENTRY_DSN;
  else process.env.REACT_APP_SENTRY_DSN = originalBrowserDsn;
  jest.clearAllMocks();
});

test('unset monitoring is a complete no-op', async () => {
  delete process.env.SENTRY_DSN;
  delete process.env.REACT_APP_SENTRY_DSN;
  let monitoring;
  jest.isolateModules(() => { monitoring = require('./monitoring'); });
  const sdk = require('@sentry/node');
  monitoring.captureError(new Error('Ignored'));
  await expect(monitoring.flush()).resolves.toBe(true);
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.captureException).not.toHaveBeenCalled();
  expect(monitoring.sentryIngestOrigins()).toEqual([]);
});

test('configured monitoring disables PII, removes request bodies and captures with correlation', async () => {
  process.env.SENTRY_DSN = 'https://public-key@errors.example.test/42';
  process.env.REACT_APP_SENTRY_DSN = 'https://browser-key@browser-errors.example.test/43';
  let monitoring;
  let sdk;
  jest.isolateModules(() => { monitoring = require('./monitoring'); sdk = require('@sentry/node'); });
  const options = sdk.init.mock.calls[0][0];
  expect(options.sendDefaultPii).toBe(false);
  expect(options.integrations([{ name: 'OnUncaughtException' }, { name: 'OnUnhandledRejection' }, { name: 'Http' }])).toEqual([{ name: 'Http' }]);
  const event = { user: { email: 'private@example.test' }, breadcrumbs: [{ message: 'Private' }], request: { data: { password: 'SECRET' }, headers: { Authorization: 'SECRET' }, cookies: 'SECRET', query_string: 'token=SECRET', url: 'https://app.test/api?token=SECRET' }, exception: { values: [{ value: 'Invalid JSON containing SECRET' }] } };
  const sanitized = options.beforeSend(event, { originalException: Object.assign(new Error('Invalid JSON'), { body: 'SECRET' }) });
  expect(sanitized.request).toEqual({ url: 'https://app.test/api' });
  expect(JSON.stringify(sanitized)).not.toContain('SECRET');
  expect(sanitized.user).toBeUndefined();
  expect(sanitized.breadcrumbs).toBeUndefined();
  const error = new Error('Failure');
  monitoring.captureError(error, 'trace-id');
  expect(sdk.captureException).toHaveBeenCalledWith(error, { tags: { requestId: 'trace-id' } });
  await monitoring.flush();
  expect(sdk.flush).toHaveBeenCalledWith(2000);
  expect(monitoring.sentryIngestOrigins()).toEqual(['https://errors.example.test', 'https://browser-errors.example.test']);
});
