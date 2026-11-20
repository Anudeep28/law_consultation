process.env.JWT_SECRET = 'privacy-test-secret';
process.env.RAZORPAY_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_privacy';
process.env.RAZORPAY_KEY_SECRET = 'privacy-provider-secret';

jest.mock('../db', () => ({
  user: { findUnique: jest.fn() },
  lawyer: { findUnique: jest.fn() },
  consultation: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  payment: { create: jest.fn() },
}));

const request = require('supertest');
const http = require('http');
const jwt = require('jsonwebtoken');
const https = require('https');
const { EventEmitter } = require('events');
const prisma = require('../db');
const { app } = require('../app');
const client = { id: 'new-client', role: 'CLIENT', accountStatus: 'ACTIVE', emailVerifiedAt: new Date() };
const authorization = `Bearer ${jwt.sign({ userId: client.id }, process.env.JWT_SECRET)}`;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(client);
  prisma.consultation.findFirst.mockResolvedValue(null);
  prisma.consultation.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => jest.restoreAllMocks());

test.each(['provider', 'persistence'])('a %s failure releases the newly created reservation', async failure => {
  const startsAt = new Date(Date.now() + 86400000);
  startsAt.setUTCMinutes(20, 0, 0);
  const lawyer = { id: 'lawyer', isVerified: true, fee: 1000, approvalStatus: 'APPROVED', availability: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } };
  prisma.lawyer.findUnique.mockResolvedValue(lawyer);
  prisma.consultation.create.mockImplementation(async ({ data }) => ({ ...data, id: 'failed-order-reservation', lawyer }));
  if (failure === 'persistence') prisma.payment.create.mockRejectedValueOnce(new Error('Database temporarily unavailable'));
  const stub = http.createServer((req, res) => {
    req.resume();
    res.writeHead(failure === 'provider' ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(failure === 'provider' ? { error: { description: 'Unavailable' } } : { id: 'order_test', amount: 1000, currency: 'INR' }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
  try {
    const response = await request(app).post('/api/consultations').set('Authorization', authorization).send({ lawyerId: lawyer.id, startsAt, topic: 'Provider failure', notes: 'Synthetic provider failure notes', mode: 'chat' });
    expect(response.status).toBe(500);
    expect(prisma.consultation.updateMany).toHaveBeenCalledWith({ where: { id: 'failed-order-reservation', status: 'PENDING_PAYMENT', payment: { is: null } }, data: { status: 'CANCELLED' } });
  } finally {
    delete process.env.RAZORPAY_API_URL;
    await new Promise(resolve => stub.close(resolve));
  }
});

test('a cancelled slot creates a new consultation without touching the previous client data', async () => {
  const startsAt = new Date(Date.now() + 86400000);
  startsAt.setUTCMinutes(20, 0, 0);
  const lawyer = { id: 'lawyer', isVerified: true, fee: 1000, approvalStatus: 'APPROVED', availability: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } };
  const previous = { id: 'old-consultation', status: 'CANCELLED', userId: 'old-client', transcript: 'Private transcript', messages: ['Private message'], deliverables: ['Private draft'], payment: 'old-payment' };
  prisma.lawyer.findUnique.mockResolvedValue(lawyer);
  prisma.consultation.findUnique.mockResolvedValue(previous);
  prisma.consultation.update.mockImplementation(async () => ({ ...previous, lawyer, mode: 'CHAT', package: 'CALL_ONLY' }));
  prisma.consultation.create.mockImplementation(async ({ data }) => ({ ...data, id: 'new-consultation', lawyer }));
  prisma.payment.create.mockResolvedValue({ id: 'new-payment' });
  jest.spyOn(https, 'request').mockImplementation((url, options, callback) => {
    const outgoing = new EventEmitter();
    outgoing.write = jest.fn();
    outgoing.setTimeout = jest.fn();
    outgoing.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      response.emit('data', JSON.stringify({ id: 'new-order', amount: 1000, currency: 'INR' }));
      response.emit('end');
    };
    return outgoing;
  });
  const response = await request(app).post('/api/consultations').set('Authorization', authorization)
    .send({ lawyerId: lawyer.id, startsAt, topic: 'New booking', notes: 'New client booking notes', mode: 'chat' });
  expect(response.status).toBe(201);
  expect(response.body.consultation.id).toBe('new-consultation');
  expect(response.body.consultation.transcript).toBe('');
  expect(prisma.consultation.update).not.toHaveBeenCalled();
  expect(prisma.consultation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: client.id, status: 'PENDING_PAYMENT' }) }));
  expect(prisma.consultation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING_PAYMENT', createdAt: { lt: expect.any(Date) } }), data: { status: 'CANCELLED' } }));
  expect(prisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ consultationId: 'new-consultation' }) }));
});

test.each(['PENDING_PAYMENT', 'BOOKED', 'COMPLETED'])('an active slot race returns 409 for %s without modifying existing consultations', async (status) => {
  const startsAt = new Date(Date.now() + 86400000);
  startsAt.setUTCMinutes(20, 0, 0);
  prisma.lawyer.findUnique.mockResolvedValue({ id: 'lawyer', isVerified: true, fee: 1000, availability: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' } });
  prisma.consultation.findUnique.mockResolvedValue({ id: 'existing', status });
  prisma.consultation.create.mockRejectedValue({ code: 'P2002' });
  const response = await request(app).post('/api/consultations').set('Authorization', authorization)
    .send({ lawyerId: 'lawyer', startsAt, topic: 'Race', notes: 'Another client booking notes', mode: 'chat' });
  expect(response.status).toBe(409);
  expect(prisma.consultation.update).not.toHaveBeenCalled();
});
