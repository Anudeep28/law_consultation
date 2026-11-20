process.env.JWT_SECRET = 'test-secret';
process.env.RAZORPAY_KEY_SECRET = 'test-rzp-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';

const mockTx = {
  payment: { updateMany: jest.fn() },
  consultation: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  user: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
};

jest.mock('../db', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  consultation: { findFirst: jest.fn() },
  consultationMessage: {},
  payment: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  document: {},
  deliverable: {},
  emailVerificationToken: {},
  passwordResetToken: {},
  notification: { create: jest.fn() },
  lawyer: {},
  $transaction: jest.fn((fn) => fn(mockTx)),
}));

const crypto = require('crypto');
const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../app');
const prisma = require('../db');
let stub;
let providerPayment;

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(providerPayment));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
});
afterAll(async () => { await new Promise(resolve => stub.close(resolve)); delete process.env.RAZORPAY_API_URL; });

const lawyerUser = {
  id: 'lawyer-1', accountStatus: 'ACTIVE', role: 'LAWYER', name: 'Adv. Test', email: 'lawyer@example.com',
  phone: null, phoneVerifiedAt: null, emailVerifiedAt: null, lawyerProfile: null,
  subscriptionPlan: 'SINGLE', subscriptionExpiry: null, documentCredits: 0,
  emailNotifications: false, pushNotifications: false, payments: [],
};
const clientUser = {
  ...lawyerUser, id: 'client-1', role: 'CLIENT', email: 'client@example.com',
  pushSubscriptions: [],
};

const authHeader = (user = lawyerUser) => `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`;

const signCheckout = (orderId, paymentId) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

const signWebhook = (rawBody) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

const webhookRequest = (rawBody, signature) =>
  request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature)
    .send(rawBody);

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.payment.updateMany.mockResolvedValue({ count: 1 });
  mockTx.user.update.mockResolvedValue({});
  mockTx.user.findUnique.mockResolvedValue(lawyerUser);
  mockTx.user.updateMany.mockResolvedValue({ count: 1 });
  mockTx.consultation.updateMany.mockResolvedValue({ count: 1 });
  mockTx.consultation.update.mockResolvedValue({});
  prisma.notification.create.mockResolvedValue({ id: 'n-1' });
  providerPayment = { id: 'pay_123', order_id: 'order_123', amount: 49900, currency: 'INR', status: 'captured' };
});

describe('POST /api/payments/verify', () => {
  const order = { orderId: 'order_123', paymentId: 'pay_123' };

  it('grants a monthly subscription on a valid signature', async () => {
    prisma.user.findUnique.mockResolvedValue(lawyerUser);
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p-1', razorpayOrderId: order.orderId, status: 'CREATED', plan: 'MONTHLY',
      user: lawyerUser, userId: lawyerUser.id, amount: 49900, currency: 'INR',
    });
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', authHeader())
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: order.paymentId,
        razorpay_signature: signCheckout(order.orderId, order.paymentId),
      });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(mockTx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', status: 'CREATED', refundId: null },
      data: { status: 'PAID', razorpayPaymentId: order.paymentId, refundStatus: null, refundError: null },
    });
    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subscriptionPlan: 'MONTHLY' }) })
    );
  });

  it('rejects a forged signature', async () => {
    prisma.user.findUnique.mockResolvedValue(lawyerUser);
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p-1', razorpayOrderId: order.orderId, status: 'CREATED', plan: 'MONTHLY',
      user: lawyerUser,
    });
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', authHeader())
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: order.paymentId,
        razorpay_signature: 'deadbeef'.repeat(8),
      });
    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects replay on an already-paid payment', async () => {
    prisma.user.findUnique.mockResolvedValue(lawyerUser);
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p-1', razorpayOrderId: order.orderId, status: 'PAID', plan: 'MONTHLY',
      user: lawyerUser,
    });
    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', authHeader())
      .send({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: order.paymentId,
        razorpay_signature: signCheckout(order.orderId, order.paymentId),
      });
    expect(res.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/webhook', () => {
  const consultationPayment = {
    id: 'p-9', razorpayOrderId: 'order_999', status: 'CREATED', plan: 'CONSULTATION',
    amount: 50000, userId: 'client-1', user: clientUser,
    currency: 'INR', consultationId: 'cons-1',
    consultation: {
      id: 'cons-1', mode: 'CHAT', status: 'PENDING_PAYMENT', topic: 'Lease review',
      startsAt: new Date(Date.now() + 3600000), createdAt: new Date(),
      lawyer: { userId: 'lawyer-1' },
    },
  };

  const capturedEvent = (overrides = {}) => JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_999', order_id: 'order_999', amount: 50000, currency: 'INR', status: 'captured', ...overrides } } },
  });

  it('rejects an invalid webhook signature', async () => {
    const res = await webhookRequest(capturedEvent(), 'bad-signature');
    expect(res.status).toBe(400);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });

  it('settles a consultation payment server-side (the paid-but-cancelled hole)', async () => {
    const booked = {
      id: 'cons-1', mode: 'CHAT', status: 'BOOKED', topic: 'Lease review',
      startsAt: new Date('2026-11-20T10:00:00Z'),
      lawyer: { userId: 'lawyer-1' }, user: clientUser,
    };
    mockTx.consultation.findUnique.mockResolvedValue(booked);
    prisma.payment.findUnique.mockResolvedValue(consultationPayment);
    prisma.user.findUnique.mockResolvedValue({ ...clientUser, pushSubscriptions: [] });

    const rawBody = capturedEvent();
    const res = await webhookRequest(rawBody, signWebhook(rawBody));

    expect(res.status).toBe(200);
    expect(mockTx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-9', status: 'CREATED', refundId: null },
      data: { status: 'PAID', razorpayPaymentId: 'pay_999', refundStatus: null, refundError: null },
    });
    expect(mockTx.consultation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'BOOKED' }) })
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CONSULTATION_BOOKED', userId: 'lawyer-1' }) })
    );
  });

  it('is idempotent for already-settled payments', async () => {
    prisma.payment.findUnique.mockResolvedValue({ ...consultationPayment, status: 'PAID' });
    const rawBody = capturedEvent();
    const res = await webhookRequest(rawBody, signWebhook(rawBody));
    expect(res.status).toBe(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ignores non-captured events', async () => {
    const rawBody = JSON.stringify({ event: 'payment.failed', payload: {} });
    const res = await webhookRequest(rawBody, signWebhook(rawBody));
    expect(res.status).toBe(200);
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
  });
});
