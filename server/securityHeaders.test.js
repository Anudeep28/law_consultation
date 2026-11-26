jest.mock('../db', () => ({}));

const request = require('supertest');
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

const loadApp = (environment) => {
  process.env.NODE_ENV = environment;
  let app;
  jest.isolateModules(() => { app = require('../app').app; });
  return app;
};

test.each(['test', 'development', 'production'])('sets security headers in %s without exposing Express', async (environment) => {
  const response = await request(loadApp(environment)).get('/api/account/export').set('Host', 'law.example');
  expect(response.status).toBe(401);
  expect(response.headers['x-powered-by']).toBeUndefined();
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
  expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  expect(response.headers['cross-origin-embedder-policy']).toBeUndefined();
  expect(response.headers['access-control-allow-origin']).toBeUndefined();

  const csp = response.headers['content-security-policy'];
  const directives = Object.fromEntries(csp.split(';').map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/);
    return [name, values];
  }));
  expect(directives['default-src']).toEqual(["'self'"]);
  expect(directives['base-uri']).toEqual(["'self'"]);
  expect(directives['object-src']).toEqual(["'none'"]);
  expect(directives['frame-ancestors']).toEqual(["'self'"]);
  expect(directives['script-src-attr']).toEqual(["'none'"]);
  expect(directives['script-src']).toEqual([
    "'self'", 'https://checkout.razorpay.com', 'https://checkout-static.razorpay.com', 'https://checkout-static-next.razorpay.com',
    'https://cdn.razorpay.com/static/cx/razorpay-risk-detection/',
  ]);
  expect(directives['connect-src']).toEqual([
    "'self'", 'ws://law.example', 'wss://law.example', 'wss://api.elevenlabs.io',
    'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://checkout-static.razorpay.com',
    'https://checkout-static-next.razorpay.com', 'https://lumberjack.razorpay.com',
  ]);
  expect(directives['frame-src']).toEqual(["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com']);
  expect(directives['worker-src']).toEqual(["'self'"]);
  expect(directives['font-src']).toEqual(["'self'"]);
  expect(directives['img-src']).toEqual(["'self'", 'https:', 'data:', 'blob:']);
  expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  expect(csp).not.toContain('unsafe-eval');

  if (environment === 'production') {
    expect(response.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(directives['upgrade-insecure-requests']).toEqual([]);
  } else {
    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(directives['upgrade-insecure-requests']).toBeUndefined();
  }
});

test('applies headers before the raw-body webhook without changing signature rejection', async () => {
  const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = 'headers-webhook-test';
  try {
    const body = '{ "event": "ignored.event" }';
    const signature = require('crypto').createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
    const app = loadApp('test');
    const response = await request(app).post('/api/payments/webhook')
      .set('Content-Type', 'application/json').set('x-razorpay-signature', signature).send(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(response.headers['content-security-policy']).toBeDefined();
    const rejected = await request(app).post('/api/payments/webhook')
      .set('Content-Type', 'application/json').set('x-razorpay-signature', 'invalid').send(body);
    expect(rejected.status).toBe(400);
  } finally {
    if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  }
});
