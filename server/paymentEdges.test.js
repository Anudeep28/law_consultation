process.env.JWT_SECRET = 'payment-edges-jwt';
process.env.RAZORPAY_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_edges';
process.env.RAZORPAY_KEY_SECRET = 'payment-edges-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'payment-edges-webhook';

const mockTx = {
  adminAuditLog: { create: jest.fn() },
  payment: { updateMany: jest.fn(), update: jest.fn() },
  consultation: { updateMany: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
  user: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
};
jest.mock('../db', () => ({
  user: { findUnique: jest.fn() },
  payment: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn(async () => 0) },
  consultation: { findUnique: jest.fn() },
  $transaction: jest.fn(fn => fn(mockTx)),
}));
jest.mock('./notifications', () => ({ createNotification: jest.fn(), sendEmail: jest.fn(), setSocketIo: jest.fn() }));

const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../db');
const notifications = require('./notifications');
const { app } = require('../app');
let stub, user, payment, consultation, entity, refundResponse, refundHttpStatus, dropRefund, calls, onRefund;
const auth = () => `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`;
const checkout = () => ({ razorpay_order_id: 'order_edge', razorpay_payment_id: 'pay_edge', razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order_edge|pay_edge').digest('hex') });
const verify = () => request(app).post('/api/consultations/cons_edge/verify-payment').set('Authorization', auth()).send(checkout());
const cancel = () => request(app).patch('/api/consultations/cons_edge/cancel').set('Authorization', auth()).send({});
const webhook = (event = 'payment.captured', payload = { payment: { entity } }) => {
  const body = JSON.stringify({ event, payload });
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')).send(body);
};

beforeAll(async () => {
  stub = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    calls.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null });
    if (dropRefund && req.method === 'POST') return res.destroy();
    if (req.method === 'POST') refundResponse.notes = JSON.parse(raw).notes;
    if (req.method === 'POST') expect(req.headers['x-refund-idempotency']).toBe(refundResponse.notes.refundAttemptId);
    if (req.method === 'POST' && onRefund) await onRefund();
    res.writeHead(req.method === 'POST' ? refundHttpStatus : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.method === 'POST' ? refundResponse : entity));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
});
afterAll(async () => { await new Promise(resolve => stub.close(resolve)); delete process.env.RAZORPAY_API_URL; });

beforeEach(() => {
  jest.clearAllMocks();
  calls = []; dropRefund = false; refundHttpStatus = 200; onRefund = null;
  user = { id: 'client_edge', email: 'client@example.test', role: 'CLIENT', accountStatus: 'ACTIVE', subscriptionPlan: 'SINGLE', subscriptionExpiry: null, documentCredits: 0, payments: [] };
  consultation = { id: 'cons_edge', userId: user.id, status: 'PENDING_PAYMENT', createdAt: new Date(), startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 4200000), mode: 'CHAT', package: 'CALL_ONLY', topic: 'Edge test', notes: 'Synthetic booking', lawyer: { id: 'lawyer_edge', name: 'Test', userId: 'lawyer_user_edge', approvalStatus: 'APPROVED' }, user };
  payment = { id: 'payment_edge', userId: user.id, status: 'CREATED', razorpayOrderId: 'order_edge', razorpayPaymentId: null, amount: 25000, currency: 'INR', plan: 'CONSULTATION', consultationId: consultation.id, consultation, user, refundStatus: null, refundId: null };
  consultation.payment = payment;
  entity = { id: 'pay_edge', order_id: 'order_edge', amount: 25000, currency: 'INR', status: 'captured' };
  refundResponse = { id: 'rfnd_edge', payment_id: 'pay_edge', amount: 25000, currency: 'INR', status: 'processed' };
  prisma.user.findUnique.mockImplementation(async () => user);
  prisma.payment.findFirst.mockImplementation(async () => payment);
  prisma.payment.findUnique.mockImplementation(async ({ select }) => select ? Object.fromEntries(Object.keys(select).map(key => [key, payment[key]])) : payment);
  prisma.consultation.findUnique.mockImplementation(async () => consultation);
  mockTx.consultation.findUnique.mockImplementation(async () => consultation);
  mockTx.consultation.findFirst.mockImplementation(async ({ where }) => where.userId === consultation.userId ? consultation : null);
  const updatePayment = async ({ where, data }) => {
    if (where.status && where.status !== payment.status) return { count: 0 };
    if (where.OR && !where.OR.some(branch => Object.entries(branch).every(([key, value]) => value?.in ? value.in.includes(payment[key]) : value === payment[key]))) return { count: 0 };
    if (Object.hasOwn(where, 'refundStatus')) {
      if (where.refundStatus?.in ? !where.refundStatus.in.includes(payment.refundStatus) : where.refundStatus !== payment.refundStatus) return { count: 0 };
    }
    if (Object.hasOwn(where, 'refundId') && where.refundId !== payment.refundId) return { count: 0 };
    Object.assign(payment, data);
    return { count: 1 };
  };
  prisma.payment.updateMany.mockImplementation(updatePayment);
  mockTx.payment.updateMany.mockImplementation(updatePayment);
  mockTx.payment.update.mockImplementation(async ({ data }) => Object.assign(payment, data));
  mockTx.consultation.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.startsAt?.gt && consultation.startsAt <= where.startsAt.gt || where.startsAt?.lte && consultation.startsAt > where.startsAt.lte) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(consultation.status)) return { count: 0 };
    Object.assign(consultation, data); return { count: 1 };
  });
  mockTx.consultation.update.mockImplementation(async ({ data }) => Object.assign(consultation, data));
  mockTx.user.findUnique.mockImplementation(async () => user);
  mockTx.user.updateMany.mockResolvedValue({ count: 1 });
  mockTx.user.update.mockResolvedValue(user);
});

describe('admin consultation refunds', () => {
  const data = { reason: 'LAWYER_NO_SHOW', note: 'Verified lawyer absence with client' };
  const adminRefund = (body = data) => request(app).post('/api/admin/consultations/cons_edge/refund').set('Authorization', auth()).send(body);
  beforeEach(() => {
    user = { ...user, id: `admin_${crypto.randomUUID()}`, role: 'ADMIN' };
    payment.status = 'PAID'; payment.razorpayPaymentId = 'pay_edge'; consultation.status = 'BOOKED';
    mockTx.adminAuditLog.create.mockResolvedValue({ id: 'audit_edge' });
    prisma.payment.findMany.mockResolvedValue([]);
  });
  test('rejects anonymous and non-admin refund and listing requests', async () => {
    expect((await request(app).post('/api/admin/consultations/cons_edge/refund').send(data)).status).toBe(401);
    expect((await request(app).get('/api/admin/payments')).status).toBe(401);
    for (const role of ['CLIENT', 'LAWYER']) {
      user.role = role;
      expect((await adminRefund()).status).toBe(403);
      expect((await request(app).get('/api/admin/payments').set('Authorization', auth())).status).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });
  test.each([{ reason: 'INVALID', note: data.note }, { reason: 'OTHER', note: '' }, { reason: 'OTHER', note: 'short' }, { reason: 'OTHER', note: 'a'.repeat(501) }])('validates reason and note %j', async body => {
    expect((await adminRefund(body)).status).toBe(400);
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
  test.each(['PENDING', 'PROCESSED', 'REVIEW'])('rejects ineligible %s state', async status => {
    payment.refundStatus = status;
    expect((await adminRefund()).status).toBe(409);
    expect(calls).toHaveLength(0);
    expect(mockTx.adminAuditLog.create).not.toHaveBeenCalled();
  });
  test.each(['CREATED', 'REFUNDED'])('rejects payment status %s', async status => {
    payment.status = status;
    expect((await adminRefund()).status).toBe(409);
    expect(calls).toHaveLength(0);
  });
  test('rejects a consultation without a payment', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    expect((await adminRefund()).status).toBe(409);
  });
  test('concurrent double clicks issue one full refund and one audit record', async () => {
    const responses = await Promise.all([adminRefund(), adminRefund()]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.amount).toBe(25000);
    expect(consultation.status).toBe('CANCELLED');
    expect(mockTx.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockTx.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ adminId: user.id, targetUserId: payment.userId, action: 'CONSULTATION_REFUND' });
    expect(JSON.parse(audit.reason)).toMatchObject({ ...data, amount: 25000, paymentId: payment.id, consultationId: consultation.id });
    expect(notifications.createNotification.mock.calls.map(([entry]) => entry.userId)).toEqual([payment.userId, consultation.lawyer.userId]);
  });
  test('past consultations are closed without deleting history', async () => {
    consultation.startsAt = new Date(Date.now() - 3600000);
    expect((await adminRefund({ ...data, reason: 'TECHNICAL_FAILURE' })).status).toBe(200);
    expect(consultation.status).toBe('COMPLETED');
    expect(payment.status).toBe('REFUNDED');
    expect(consultation.notes).toBe('Synthetic booking');
  });
  test('provider rejection returns 502 and keeps an audited retryable failure', async () => {
    refundHttpStatus = 400; refundResponse = { error: { description: 'Unavailable' } };
    expect((await adminRefund()).status).toBe(502);
    expect(payment).toMatchObject({ status: 'PAID', refundStatus: 'FAILED' });
    expect(mockTx.adminAuditLog.create).toHaveBeenCalledTimes(1);
    refundHttpStatus = 200; refundResponse = { id: 'rfnd_retry', payment_id: 'pay_edge', amount: 25000, currency: 'INR', status: 'processed' };
    expect((await adminRefund()).status).toBe(200);
    expect(payment.status).toBe('REFUNDED');
  });
  test('a pending provider result remains pending and notification errors do not undo it', async () => {
    refundResponse.status = 'pending'; notifications.createNotification.mockRejectedValueOnce(new Error('offline'));
    expect((await adminRefund()).status).toBe(200);
    expect(payment.refundStatus).toBe('PENDING');
    expect(notifications.createNotification).toHaveBeenCalledTimes(2);
  });
  test('audit persistence failure prevents the provider call', async () => {
    mockTx.adminAuditLog.create.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await adminRefund()).status).toBe(500);
    expect(calls).toHaveLength(0);
  });
  test('listing searches client email, consultation ID and lawyer and handles empty results', async () => {
    const response = await request(app).get('/api/admin/payments?q=example').set('Authorization', auth());
    expect(response.status).toBe(200); expect(response.body).toEqual({ payments: [], reviewCount: 0 });
    expect(prisma.payment.findMany.mock.calls[0][0]).toMatchObject({ take: 100, where: { OR: [{ user: { email: { contains: 'example' } } }, { consultationId: { contains: 'example' } }, { consultation: { lawyer: { OR: [{ name: { contains: 'example' } }, { id: 'example' }] } } }] } });
  });
  test('listing failures return a safe error', async () => {
    prisma.payment.findMany.mockRejectedValueOnce(new Error('private details'));
    const response = await request(app).get('/api/admin/payments').set('Authorization', auth());
    expect(response.status).toBe(500); expect(response.body.error).toBe('Unable to load payments');
  });
  test('refund requests are rate limited per administrator', async () => {
    for (let i = 0; i < 10; i++) expect((await adminRefund({ reason: 'OTHER', note: '' })).status).toBe(400);
    expect((await adminRefund()).status).toBe(429);
  });
});

describe('validated settlement', () => {
  test.each([{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }, { status: 'authorized' }, { id: 'pay_other' }])('rejects provider mismatch %j without booking', async (change) => {
    Object.assign(entity, change);
    expect((await verify()).status).toBe(400);
    expect(mockTx.consultation.updateMany).not.toHaveBeenCalled();
    expect(mockTx.user.update).not.toHaveBeenCalled();
    expect(payment.status).toBe('CREATED');
  });
  test.each([{ amount: 1 }, { currency: 'USD' }, { status: 'authorized' }])('rejects signed webhook mismatch %j', async change => {
    Object.assign(entity, change);
    expect((await webhook()).status).toBe(400);
    expect(payment.refundStatus).toBe('REVIEW');
    expect(payment.status).toBe('CREATED');
  });
  test('does not trust amount/currency supplied by the browser', async () => {
    const response = await request(app).post('/api/consultations/cons_edge/verify-payment').set('Authorization', auth()).send({ ...checkout(), amount: 1, currency: 'USD' });
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/payments/pay_edge' });
    expect(payment.amount).toBe(25000);
    expect(consultation.status).toBe('BOOKED');
  });
  test('booked consultations still require a valid signature', async () => {
    consultation.status = 'BOOKED'; payment.status = 'PAID'; payment.razorpayPaymentId = 'pay_edge';
    const response = await request(app).post('/api/consultations/cons_edge/verify-payment').set('Authorization', auth()).send({ ...checkout(), razorpay_signature: 'bad' });
    expect(response.status).toBe(400);
  });
  test('missing checkout IDs cannot become omitted Prisma filters', async () => {
    const response = await request(app).post('/api/consultations/cons_edge/verify-payment').set('Authorization', auth()).send({});
    expect(response.status).toBe(400);
    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });
  test('order.paid confirms a closed-tab booking and duplicates cannot book twice', async () => {
    const payload = { payment: { entity }, order: { entity: { id: 'order_edge', amount: 25000, amount_paid: 25000, currency: 'INR', status: 'paid' } } };
    expect((await webhook('order.paid', payload)).status).toBe(200);
    expect((await webhook('order.paid', payload)).status).toBe(200);
    expect((await webhook()).status).toBe(200);
    expect(mockTx.consultation.updateMany).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
  });
  test('rejects an order.paid event whose order entity disagrees', async () => {
    expect((await webhook('order.paid', { payment: { entity }, order: { entity: { id: 'order_other' } } })).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  test('an unknown captured order is not silently acknowledged', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    expect((await webhook()).status).toBe(503);
  });
  test('a capture claim cannot clear an intervening external-refund review', async () => {
    const snapshot = { ...payment };
    prisma.payment.findUnique.mockImplementation(async ({ where }) => where.razorpayOrderId ? snapshot : payment);
    mockTx.payment.updateMany.mockImplementationOnce(async ({ where }) => {
      payment.refundId = 'rfnd_external'; payment.refundStatus = 'REVIEW';
      expect(where.refundId).toBe(null);
      return { count: 0 };
    });
    expect((await webhook()).status).toBe(200);
    expect(payment).toMatchObject({ status: 'CREATED', refundStatus: 'REVIEW' });
    expect(mockTx.consultation.updateMany).not.toHaveBeenCalled();
  });
  test('a notification failure does not turn successful settlement into failure', async () => {
    notifications.createNotification.mockRejectedValueOnce(new Error('Email unavailable'));
    expect((await verify()).status).toBe(200);
    expect(payment.status).toBe('PAID');
  });
  test('webhook and verify apply a single credit only once', async () => {
    user.role = 'LAWYER'; payment.consultationId = null; payment.plan = 'SINGLE';
    const responses = await Promise.all([webhook(), request(app).post('/api/payments/verify').set('Authorization', auth()).send(checkout())]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect(mockTx.user.update).toHaveBeenCalledTimes(1);
    expect(mockTx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { subscriptionPlan: 'SINGLE', documentCredits: { increment: 1 } } }));
  });
  test.each([{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }])('subscription verification also rejects provider mismatch %j', async change => {
    user.role = 'LAWYER'; payment.consultationId = null; payment.plan = 'MONTHLY';
    Object.assign(entity, change);
    const response = await request(app).post('/api/payments/verify').set('Authorization', auth()).send(checkout());
    expect(response.status).toBe(400);
    expect(mockTx.user.update).not.toHaveBeenCalled();
  });
  test('late payment is refunded rather than resurrecting an unavailable slot', async () => {
    mockTx.consultation.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await webhook()).status).toBe(200);
    expect(consultation.status).toBe('CANCELLED');
    expect(payment.status).toBe('REFUNDED');
    expect(calls).toContainEqual({ method: 'POST', path: '/v1/payments/pay_edge/refund', body: expect.objectContaining({ amount: 25000 }) });
    expect(mockTx.consultation.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'PENDING_PAYMENT', createdAt: { gte: expect.any(Date) }, startsAt: { gt: expect.any(Date) } });
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
});

describe('refund lifecycle and cancellation policy', () => {
  beforeEach(() => { payment.status = 'PAID'; payment.razorpayPaymentId = 'pay_edge'; consultation.status = 'BOOKED'; });
  test.each([25000, 37500])('concurrent client cancellations issue one full refund of %s paise, including package fees', async amount => {
    payment.amount = amount; refundResponse.amount = amount;
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.map(r => r.status)).toEqual([204, 204]);
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(calls[0].body.amount).toBe(amount);
    expect(payment).toMatchObject({ status: 'REFUNDED', refundStatus: 'PROCESSED', refundId: 'rfnd_edge' });
    expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
    expect(consultation.status).toBe('CANCELLED');
  });
  test('a pending provider refund is not marked REFUNDED until its webhook', async () => {
    refundResponse.status = 'pending';
    expect((await cancel()).status).toBe(204);
    expect(payment).toMatchObject({ status: 'PAID', refundStatus: 'PENDING' });
    const processed = { ...refundResponse, status: 'processed' };
    expect((await webhook('refund.processed', { refund: { entity: processed } })).status).toBe(200);
    expect((await webhook('refund.processed', { refund: { entity: processed } })).status).toBe(200);
    expect((await webhook('refund.failed', { refund: { entity: { ...processed, status: 'failed' } } })).status).toBe(200);
    expect(payment).toMatchObject({ status: 'REFUNDED', refundStatus: 'PROCESSED' });
  });
  test('an explicit provider rejection is retryable, including after the original start time', async () => {
    refundHttpStatus = 400; refundResponse = { error: { description: 'Refund temporarily unavailable' } };
    expect((await cancel()).status).toBe(502);
    expect(payment).toMatchObject({ status: 'PAID', refundStatus: 'FAILED' });
    expect(consultation.status).toBe('CANCELLED');
    consultation.startsAt = new Date(Date.now() - 60000);
    refundHttpStatus = 200; refundResponse = { id: 'rfnd_retry', payment_id: 'pay_edge', amount: 25000, currency: 'INR', status: 'processed' };
    expect((await cancel()).status).toBe(204);
    expect(payment.status).toBe('REFUNDED');
  });
  test('an ambiguous network failure is flagged and never blindly POSTed again', async () => {
    dropRefund = true;
    expect((await cancel()).status).toBe(502);
    expect(payment).toMatchObject({ status: 'PAID', refundStatus: 'REVIEW' });
    expect((await cancel()).status).toBe(204);
    expect(calls).toHaveLength(1);
  });
  test('refund.failed is retryable and stale failures cannot override a newer refund', async () => {
    refundResponse.status = 'pending'; await cancel();
    expect((await webhook('refund.failed', { refund: { entity: { ...refundResponse, status: 'failed' } } })).status).toBe(200);
    expect(payment.refundStatus).toBe('FAILED');
    const old = { ...refundResponse, status: 'failed' };
    refundResponse = { ...refundResponse, id: 'rfnd_retry', status: 'pending' };
    onRefund = async () => { await webhook('refund.failed', { refund: { entity: old } }); };
    await cancel();
    await webhook('refund.failed', { refund: { entity: old } });
    expect(payment).toMatchObject({ refundId: 'rfnd_retry', refundStatus: 'PENDING' });
  });
  test.each(['failed', 'processed'])('a refund.%s webhook before the API response is not regressed by a pending response', async status => {
    refundResponse.status = 'pending';
    onRefund = async () => { expect((await webhook(`refund.${status}`, { refund: { entity: { ...refundResponse, status } } })).status).toBe(200); };
    expect((await cancel()).status).toBe(status === 'failed' ? 502 : 204);
    expect(payment.refundStatus).toBe(status === 'failed' ? 'FAILED' : 'PROCESSED');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(status === 'failed' ? 0 : 1);
  });
  test('a processed webhook can apply when the API records its refund ID after the webhook read', async () => {
    refundResponse.status = 'pending';
    onRefund = async () => {
      const update = prisma.payment.updateMany.getMockImplementation();
      prisma.payment.updateMany.mockImplementationOnce(async args => {
        payment.refundId = refundResponse.id;
        return update(args);
      });
      expect((await webhook('refund.processed', { refund: { entity: { ...refundResponse, status: 'processed' } } })).status).toBe(200);
    };
    expect((await cancel()).status).toBe(204);
    expect(payment.refundStatus).toBe('PROCESSED');
  });
  test('an early external refund requiring review cannot send a stale pending confirmation', async () => {
    refundResponse.status = 'pending';
    onRefund = async () => {
      expect((await webhook('refund.processed', { refund: { entity: { ...refundResponse, notes: {}, status: 'processed' } } })).status).toBe(200);
    };
    expect((await cancel()).status).toBe(502);
    expect(payment.refundStatus).toBe('REVIEW');
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });
  test.each([{ amount: 100 }, { currency: 'USD' }])('rejects a mismatched refund webhook %j', async change => {
    refundResponse.status = 'pending'; await cancel();
    expect((await webhook('refund.processed', { refund: { entity: { ...refundResponse, ...change, status: 'processed' } } })).status).toBe(400);
    expect(payment.refundStatus).toBe('PENDING');
  });
  test('an invalid provider refund response is flagged rather than marked refunded', async () => {
    refundResponse.amount = 1;
    expect((await cancel()).status).toBe(502);
    expect(payment).toMatchObject({ status: 'PAID', refundStatus: 'REVIEW' });
  });
  test('a provider-dashboard refund is flagged for reconciliation rather than ignored', async () => {
    expect((await webhook('refund.processed', { refund: { entity: refundResponse } })).status).toBe(200);
    expect(payment.refundStatus).toBe('REVIEW');
  });
  test('refund.processed before capture delivery prevents booking already-refunded money', async () => {
    payment.status = 'CREATED'; payment.razorpayPaymentId = null; consultation.status = 'PENDING_PAYMENT';
    prisma.payment.findUnique.mockImplementation(async ({ where }) => where.razorpayPaymentId ? null : payment);
    expect((await webhook('refund.processed', { refund: { entity: refundResponse }, payment: { entity } })).status).toBe(200);
    expect(payment).toMatchObject({ status: 'REFUNDED', refundStatus: 'REVIEW', razorpayPaymentId: 'pay_edge' });
    expect(consultation.status).toBe('CANCELLED');
    expect((await webhook()).status).toBe(200);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
  test('a previous capture-validation review cannot hide a subsequent external refund', async () => {
    payment.status = 'CREATED'; payment.razorpayPaymentId = null; consultation.status = 'PENDING_PAYMENT';
    entity.amount = 1;
    expect((await webhook()).status).toBe(400);
    expect(payment.refundStatus).toBe('REVIEW');
    entity.amount = payment.amount;
    expect((await webhook('refund.processed', { refund: { entity: refundResponse }, payment: { entity } })).status).toBe(200);
    expect((await webhook()).status).toBe(200);
    expect(payment.status).toBe('REFUNDED');
    expect(consultation.status).toBe('CANCELLED');
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });
  test('a client cannot cancel another account booking', async () => {
    user.id = 'foreign_client';
    expect((await cancel()).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(consultation.status).toBe('BOOKED');
  });
  test('a lawyer cannot cancel a client booking', async () => {
    user.role = 'LAWYER';
    expect((await cancel()).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  test('a session already started cannot be newly cancelled', async () => {
    consultation.startsAt = new Date(Date.now() - 1);
    expect((await cancel()).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
