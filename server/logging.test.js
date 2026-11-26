jest.mock('../db', () => ({ $queryRaw: jest.fn() }));

const request = require('supertest');
const express = require('express');
const { Writable } = require('stream');
const prisma = require('../db');
const { app } = require('../app');
const { createLogger, createRequestLogging, errorHandler } = require('./logger');

beforeEach(() => jest.clearAllMocks());

test('echoes safe request IDs and replaces unsafe, oversized and missing IDs', async () => {
  prisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
  const safe = await request(app).get('/api/health').set('x-request-id', 'trace-123_test:1.2');
  expect(safe.headers['x-request-id']).toBe('trace-123_test:1.2');
  for (const id of [undefined, 'a'.repeat(129), 'unsafe id', '<script>', 'first,second']) {
    const req = request(app).get('/api/health');
    if (id) req.set('x-request-id', id);
    const response = await req;
    expect(response.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/);
    expect(response.headers['x-request-id']).not.toBe(id);
  }
});

test('health checks the database without authentication and reports outages', async () => {
  prisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
  const healthy = await request(app).get('/api/health');
  expect(healthy.status).toBe(200);
  expect(healthy.body).toEqual({ status: 'ok' });
  expect(prisma.$queryRaw.mock.calls[0][0][0]).toBe('SELECT 1');
  prisma.$queryRaw.mockRejectedValue(new Error('private database credentials'));
  const unhealthy = await request(app).get('/api/health');
  expect(unhealthy.status).toBe(503);
  expect(unhealthy.body).toEqual({ status: 'unavailable' });
  expect(unhealthy.text).not.toContain('credentials');
});

test('JSON logs redact sensitive body fields and credentials; errors return only a request ID and safe message', async () => {
  let output = '';
  const destination = new Writable({ write(chunk, encoding, callback) { output += chunk.toString(); callback(); } });
  const logger = createLogger({ level: 'info' }, destination);
  const testApp = express();
  testApp.use(createRequestLogging(logger));
  testApp.use(express.json());
  testApp.post('/failure', (req) => {
    req.log.info({ body: req.body, headers: req.headers }, 'Submitted payload');
    throw new Error('Private failure detail');
  });
  testApp.use(errorHandler);
  const response = await request(testApp).post('/failure?token=QUERY_SECRET')
    .set('Authorization', 'Bearer AUTH_SECRET').set('Cookie', 'session=COOKIE_SECRET').set('x-request-id', 'failure-id')
    .send({ password: 'PASSWORD_SECRET', nested: [{ accessToken: 'TOKEN_SECRET', razorpay_signature: 'SIGNATURE_SECRET', OTP: 'OTP_SECRET', clientSecret: 'CLIENT_SECRET' }], safe: 'visible' });
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: 'Internal server error', requestId: 'failure-id' });
  expect(response.text).not.toMatch(/stack|Private failure detail/);
  for (const secret of ['AUTH_SECRET', 'COOKIE_SECRET', 'PASSWORD_SECRET', 'TOKEN_SECRET', 'SIGNATURE_SECRET', 'OTP_SECRET', 'CLIENT_SECRET', 'QUERY_SECRET']) expect(output).not.toContain(secret);
  const records = output.trim().split('\n').map(JSON.parse);
  expect(records.some((record) => record.msg === 'Submitted payload' && record.body.safe === 'visible')).toBe(true);
  expect(records.every((record) => record.requestId === 'failure-id')).toBe(true);
  expect(records.some((record) => record.msg === 'Unhandled request error:' && record.err.message === 'Private failure detail')).toBe(true);
  expect(records.some((record) => record.res?.statusCode === 500)).toBe(true);
  logger.error({ err: Object.assign(new Error('Parse failed near PASSWORD_SECRET'), { body: '{"password":"PASSWORD_SECRET"' }) }, 'Malformed body');
  expect(output).not.toContain('PASSWORD_SECRET');
  logger.child({ credentials: { password: 'CHILD_SECRET' } }).info('Child context');
  expect(output).not.toContain('CHILD_SECRET');
});

test('body-parser errors go through the same safe final error handler', async () => {
  const response = await request(app).post('/api/auth/login').set('x-request-id', 'json-error').set('Content-Type', 'application/json').send('{bad json');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: 'Internal server error', requestId: 'json-error' });
});
