process.env.JWT_SECRET = 'orders-test-jwt';
process.env.RAZORPAY_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_orders';
process.env.RAZORPAY_KEY_SECRET = 'orders-test-secret';

jest.mock('../db', () => ({
  user: { findUnique: jest.fn() },
  payment: { create: jest.fn() },
}));

const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../db');
const { app } = require('../app');

const originalUrl = process.env.RAZORPAY_API_URL;
const token = jwt.sign({ userId: 'lawyer-orders' }, process.env.JWT_SECRET);

beforeEach(() => {
  prisma.user.findUnique.mockResolvedValue({ id: 'lawyer-orders', role: 'LAWYER', accountStatus: 'ACTIVE' });
  prisma.payment.create.mockResolvedValue({ id: 'payment-orders' });
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalUrl === undefined) delete process.env.RAZORPAY_API_URL;
  else process.env.RAZORPAY_API_URL = originalUrl;
});

it.each([200, 402])('creates orders through a configured HTTP base and handles provider status %s', async (status) => {
  let received;
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200
        ? { id: 'order_local', amount: 49900, currency: 'INR' }
        : { error: { description: 'Local provider rejected order' } }));
    });
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}/gateway`;
  try {
    const response = await request(app).post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'monthly' });
    expect(received).toMatchObject({
      path: '/gateway/v1/orders',
      auth: `Basic ${Buffer.from('rzp_test_orders:orders-test-secret').toString('base64')}`,
      body: { amount: 49900, currency: 'INR', notes: { plan: 'monthly', userId: 'lawyer-orders' } },
    });
    expect(response.status).toBe(status === 200 ? 200 : 502);
    expect(response.body).toMatchObject(status === 200
      ? { orderId: 'order_local', amount: 49900, currency: 'INR', keyId: 'rzp_test_orders' }
      : { error: 'Local provider rejected order' });
  } finally {
    await new Promise((resolve) => stub.close(resolve));
  }
});

it('keeps the default HTTPS Razorpay destination when the override is unset', async () => {
  delete process.env.RAZORPAY_API_URL;
  const outgoing = new EventEmitter();
  outgoing.write = jest.fn();
  outgoing.end = jest.fn();
  outgoing.setTimeout = jest.fn();
  const transport = jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
    process.nextTick(() => {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      response.emit('data', JSON.stringify({ id: 'order_default', amount: 1000, currency: 'INR' }));
      response.emit('end');
    });
    return outgoing;
  });
  const response = await request(app).post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`).send({ plan: 'single' });
  expect(response.status).toBe(200);
  expect(transport.mock.calls[0][0].href).toBe('https://api.razorpay.com/v1/orders');
  expect(JSON.parse(outgoing.write.mock.calls[0][0])).toMatchObject({ amount: 1000, currency: 'INR' });
});

it.each([{ amount: 1 }, { currency: 'USD' }, { id: null }])('rejects an inconsistent provider order %j', async change => {
  prisma.payment.create.mockClear();
  const stub = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'order_bad', amount: 1000, currency: 'INR', ...change }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
  try {
    const response = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`).send({ plan: 'single' });
    expect(response.status).toBe(502);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  } finally {
    await new Promise(resolve => stub.close(resolve));
  }
});

it('uses different receipts for simultaneous purchase orders', async () => {
  const receipts = [];
  const stub = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const order = JSON.parse(body);
    receipts.push(order.receipt);
    res.end(JSON.stringify({ id: `order_${receipts.length}`, amount: order.amount, currency: order.currency }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
  jest.spyOn(Date, 'now').mockReturnValue(1795160297000);
  try {
    const responses = await Promise.all([0, 1].map(() => request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`).send({ plan: 'single' })));
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(new Set(receipts).size).toBe(2);
    expect(receipts.every(value => value.length <= 40)).toBe(true);
  } finally {
    await new Promise(resolve => stub.close(resolve));
  }
});
