process.env.JWT_SECRET = 'review-test-jwt';
process.env.RAZORPAY_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_review';
process.env.RAZORPAY_KEY_SECRET = 'review-test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'review-test-webhook';

jest.mock('../db', () => ({ user: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() }, payment: { findUnique: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() }, consultation: { updateMany: jest.fn(), findUnique: jest.fn() }, adminAuditLog: { create: jest.fn(), update: jest.fn() }, $transaction: jest.fn() }));
jest.mock('./notifications', () => ({ createNotification: jest.fn(), sendEmail: jest.fn(), setSocketIo: jest.fn() }));
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../db');
const notifications = require('./notifications');
const { app } = require('../app');
let payment, actor, provider, calls, stub, queue, audits;
const auth = () => `Bearer ${jwt.sign({ userId: actor.id }, process.env.JWT_SECRET)}`;
const post = (action = 'reconcile', body = {}) => request(app).post(`/api/admin/payments/payment_review/${action}`).set('Authorization', auth()).send(body);
const refund = status => ({ id: 'rfnd_review', payment_id: 'pay_review', amount: 25000, currency: 'INR', status, notes: { refundAttemptId: 'attempt_review' } });
const capture = () => ({ id: 'pay_review', order_id: 'order_review', amount: 25000, currency: 'INR', status: 'captured', amount_refunded: 0 });
const webhook = (event, payload) => {
  const body = JSON.stringify({ event, payload });
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')).send(body);
};

beforeAll(async () => {
  stub = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    calls.push({ method: req.method, path: req.url, body: raw ? JSON.parse(raw) : null, key: req.headers['x-refund-idempotency'] });
    const result = await provider(req, raw ? JSON.parse(raw) : null);
    res.writeHead(result.httpStatus || (result.error ? 503 : 200), { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  process.env.RAZORPAY_API_URL = `http://127.0.0.1:${stub.address().port}`;
});
afterAll(() => new Promise(resolve => stub.close(resolve)));
beforeEach(() => {
  jest.clearAllMocks(); calls = []; audits = []; queue = Promise.resolve();
  actor = { id: `admin_${Math.random()}`, role: 'ADMIN', accountStatus: 'ACTIVE', tokenVersion: 0 };
  payment = { id: 'payment_review', userId: 'client_review', status: 'PAID', refundStatus: 'REVIEW', refundId: 'rfnd_review', refundAttemptId: 'attempt_review', refundError: 'Ambiguous refund outcome', amount: 25000, currency: 'INR', razorpayPaymentId: 'pay_review', razorpayOrderId: 'order_review', consultationId: 'cons_review', user: { email: 'client@example.test' }, consultation: { id: 'cons_review', status: 'COMPLETED', lawyer: { userId: 'lawyer_review' } } };
  provider = async () => refund('processed');
  prisma.user.findUnique.mockImplementation(async () => actor);
  prisma.payment.findUnique.mockImplementation(async () => JSON.parse(JSON.stringify(payment)));
  prisma.payment.findMany.mockImplementation(async () => [JSON.parse(JSON.stringify(payment))]);
  prisma.payment.count.mockResolvedValue(1);
  prisma.payment.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.id && where.id !== payment.id || where.status && where.status !== payment.status) return { count: 0 };
    if (where.OR && !where.OR.some(branch => Object.entries(branch).every(([key, value]) => value?.in ? value.in.includes(payment[key]) : value === payment[key]))) return { count: 0 };
    if (Object.hasOwn(where, 'refundId') && where.refundId !== payment.refundId) return { count: 0 };
    if (where.refundStatus && (where.refundStatus.in ? !where.refundStatus.in.includes(payment.refundStatus) : payment.refundStatus !== where.refundStatus)) return { count: 0 };
    Object.assign(payment, data); return { count: 1 };
  });
  prisma.adminAuditLog.create.mockImplementation(async ({ data }) => { const entry = { id: `audit_${audits.length}`, ...data }; audits.push(entry); return entry; });
  prisma.adminAuditLog.update.mockImplementation(async ({ where, data }) => Object.assign(audits.find(entry => entry.id === where.id), data));
  prisma.consultation.findUnique.mockImplementation(async () => payment.consultation);
  prisma.consultation.updateMany.mockImplementation(async ({ data }) => { Object.assign(payment.consultation, data); return { count: 1 }; });
  prisma.user.updateMany.mockResolvedValue({ count: 1 });
  prisma.user.update.mockResolvedValue({});
  prisma.$transaction.mockImplementation(fn => { const run = queue.then(() => fn(prisma)); queue = run.catch(() => {}); return run; });
});

test.each(['CLIENT', 'LAWYER'])('denies %s access to every review endpoint', async role => {
  actor.role = role;
  expect((await request(app).get('/api/admin/payments/review').set('Authorization', auth())).status).toBe(403);
  expect((await post()).status).toBe(403);
  expect((await post('resolve', { outcome: 'REFUNDED', note: 'Verified provider record' })).status).toBe(403);
  expect(calls).toHaveLength(0);
});
test('requires authentication and lists review context with a global count', async () => {
  expect((await request(app).get('/api/admin/payments/review')).status).toBe(401);
  expect((await request(app).post('/api/admin/payments/payment_review/reconcile').send({})).status).toBe(401);
  expect((await request(app).post('/api/admin/payments/payment_review/resolve').send({})).status).toBe(401);
  const response = await request(app).get('/api/admin/payments/review?q=client').set('Authorization', auth());
  expect(response.status).toBe(200); expect(response.body.reviewCount).toBe(1);
  expect(prisma.payment.findMany.mock.calls[0][0].where).toMatchObject({ refundStatus: 'REVIEW' });
});
test.each([['processed', 'REFUNDED', 'PROCESSED'], ['pending', 'PAID', 'PENDING'], ['failed', 'PAID', 'FAILED']])('applies provider %s and audits before and after', async (status, expected, refundStatus) => {
  provider = async () => refund(status);
  expect((await post()).status).toBe(200);
  expect(payment).toMatchObject({ status: expected, refundStatus });
  expect(JSON.parse(audits[0].reason)).toMatchObject({ before: { refundStatus: 'REVIEW' }, after: { refundStatus }, provider: { result: status } });
  expect(audits[0]).toMatchObject({ adminId: actor.id, action: 'PAYMENT_RECONCILE' });
  expect(notifications.createNotification).toHaveBeenCalledTimes(status === 'processed' ? 2 : 0);
});
test('concurrent checks apply and notify once but audit both clicks', async () => {
  expect((await Promise.all([post(), post()])).map(response => response.status)).toEqual([200, 200]);
  expect(calls).toHaveLength(1); expect(audits).toHaveLength(2); expect(notifications.createNotification).toHaveBeenCalledTimes(2);
});
test.each(['consultation', 'document'])('an external failed refund before capture still allows %s fulfillment', async kind => {
  payment.status = 'CREATED'; payment.refundStatus = null; payment.refundId = null; payment.refundAttemptId = null;
  if (kind === 'document') { payment.consultationId = null; payment.consultation = null; payment.plan = 'SINGLE'; }
  else payment.consultation.status = 'PENDING_PAYMENT';
  const external = { ...refund('failed'), notes: {} };
  expect((await webhook('refund.failed', { refund: { entity: external }, payment: { entity: capture() } })).status).toBe(200);
  expect(payment).toMatchObject({ status: 'CREATED', refundStatus: 'REVIEW' });
  provider = async () => external;
  expect((await post()).status).toBe(200);
  expect(payment.status).toBe('CREATED');
  expect((await webhook('payment.captured', { payment: { entity: capture() } })).status).toBe(200);
  expect(payment.status).toBe('PAID');
  if (kind === 'document') expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ documentCredits: { increment: 1 } }) }));
  else expect(payment.consultation.status).toBe('BOOKED');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
test.each(['BOOKED', 'COMPLETED', 'CANCELLED', 'SINGLE', 'MONTHLY'])('imported failed refunds cannot auto-refund %s on capture replay', async kind => {
  payment.refundStatus = null; payment.refundId = null; payment.refundAttemptId = null;
  if (['SINGLE', 'MONTHLY'].includes(kind)) { payment.consultationId = null; payment.consultation = null; payment.plan = kind; }
  else payment.consultation.status = kind;
  const external = { ...refund('failed'), notes: {} };
  expect((await webhook('refund.failed', { refund: { entity: external } })).status).toBe(200);
  provider = async (req, body) => req.method === 'POST' ? { ...refund('processed'), notes: body.notes } : external;
  expect((await post()).status).toBe(200);
  expect(payment.refundStatus).toBe('FAILED');
  expect((await webhook('payment.captured', { payment: { entity: capture() } })).status).toBe(200);
  expect(payment.status).toBe('PAID');
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  expect(prisma.user.update).not.toHaveBeenCalled();
  if (payment.consultation) expect(payment.consultation.status).toBe(kind);
});
test.each(['REQUIRED', 'FAILED'])('capture replay still resumes an app-initiated %s refund of a cancelled booking', async refundStatus => {
  payment.refundStatus = refundStatus; payment.consultation.status = 'CANCELLED';
  if (refundStatus === 'REQUIRED') payment.refundAttemptId = null;
  provider = async (_req, body) => ({ ...refund('processed'), notes: body.notes });
  expect((await webhook('payment.captured', { payment: { entity: capture() } })).status).toBe(200);
  expect(payment.refundStatus).toBe('PROCESSED');
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
});
test.each([true, false])('matches refund history by correlation or untracked full amount (%s)', async tracked => {
  payment.refundId = null;
  provider = async () => ({ items: [{ ...refund('processed'), notes: tracked ? { refundAttemptId: payment.refundAttemptId } : {} }] });
  expect((await post()).status).toBe(200); expect(payment.refundStatus).toBe('PROCESSED');
});
test('an absent stored refund is found through its payment history', async () => {
  provider = async req => req.url === '/v1/refunds/rfnd_review' ? { httpStatus: 404, error: { description: 'Not found' } } : { items: [{ ...refund('processed'), id: 'rfnd_found' }] };
  expect((await post()).status).toBe(200);
  expect(payment).toMatchObject({ refundStatus: 'PROCESSED', refundId: 'rfnd_found' });
  expect(calls.map(call => call.path)).toEqual(['/v1/refunds/rfnd_review', '/v1/payments/pay_review/refunds?count=100&skip=0']);
});
test('no refund clears review to retryable FAILED after validating capture', async () => {
  payment.refundId = null; payment.refundRequestedAt = new Date(Date.now() - 25 * 3600000);
  provider = async req => req.url.includes('/refunds') ? { items: [] } : { id: 'pay_review', order_id: 'order_review', amount: 25000, currency: 'INR', status: 'captured', amount_refunded: 0 };
  expect((await post()).status).toBe(200); expect(payment.refundStatus).toBe('FAILED');
});
test('a late capture without a provider refund uses the atomic idempotent refund path', async () => {
  payment.refundId = null; payment.refundAttemptId = null; payment.consultation.status = 'CANCELLED';
  provider = async (req, body) => req.method === 'POST' ? { ...refund('processed'), notes: body.notes } : req.url.includes('/refunds') ? { items: [] } : { id: 'pay_review', order_id: 'order_review', amount: 25000, currency: 'INR', status: 'captured', amount_refunded: 0 };
  expect((await Promise.all([post(), post()])).map(response => response.status)).toEqual([200, 200]);
  expect(payment.refundStatus).toBe('PROCESSED');
  const writes = calls.filter(call => call.method === 'POST'); expect(writes).toHaveLength(1); expect(writes[0].key).toBe(writes[0].body.notes.refundAttemptId);
  expect(audits.some(entry => JSON.parse(entry.reason).provider.autoRefund)).toBe(true);
});
test('a timed-out original attempt cannot be replaced while its history is still empty', async () => {
  payment.refundId = null; payment.refundAttemptId = null; payment.refundStatus = 'REQUIRED'; payment.consultation.status = 'CANCELLED';
  const timeout = jest.fn().mockRejectedValue(new Error('Razorpay request timed out'));
  const service = require('./paymentService')({ prisma, request: timeout, notifications, logger: { error: jest.fn() }, meetings: {}, pendingTtl: 900000 });
  await expect(service.settle(payment, capture())).rejects.toMatchObject({ status: 502 });
  expect(payment.refundStatus).toBe('REVIEW');
  const originalAttempt = payment.refundAttemptId, requestedAt = payment.refundRequestedAt;
  expect(timeout.mock.calls[0][3]['X-Refund-Idempotency']).toBe(originalAttempt);
  provider = async (req, body) => req.method === 'POST' ? { ...refund('processed'), notes: body.notes } : req.url.includes('/refunds') ? { items: [] } : capture();
  expect((await post()).status).toBe(200);
  expect(payment).toMatchObject({ refundStatus: 'REVIEW', refundAttemptId: originalAttempt, refundRequestedAt: requestedAt });
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  const retry = await request(app).post('/api/admin/consultations/cons_review/refund').set('Authorization', auth()).send({ reason: 'OTHER', note: 'Checking an ambiguous original provider attempt' });
  expect(retry.status).toBe(409);
  provider = async () => ({ items: [{ ...refund('processed'), notes: { refundAttemptId: originalAttempt } }] });
  expect((await post()).status).toBe(200);
  expect(payment).toMatchObject({ refundStatus: 'PROCESSED', refundAttemptId: originalAttempt });
  expect(calls.every(call => call.method === 'GET')).toBe(true);
  expect(JSON.parse(audits[0].reason)).toMatchObject({ after: { refundStatus: 'REVIEW' }, provider: { reviewRetained: true } });
});
test.each([null, 0, 23.99, -1])('empty history retains a recent or undated attempt (%s hours old)', async hours => {
  payment.refundId = null; payment.refundRequestedAt = hours === null ? null : new Date(Date.now() - hours * 3600000);
  provider = async req => req.url.includes('/refunds') ? { items: [] } : capture();
  for (let i = 0; i < 2; i++) {
    const response = await post(); expect(response.status).toBe(200);
    expect(response.body.message).toContain('remains under review');
    expect(payment).toMatchObject({ refundStatus: 'REVIEW', refundAttemptId: 'attempt_review' });
  }
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
test.each([24, 25])('empty history releases an attempt after the 24-hour review window (%s hours old)', async hours => {
  payment.refundId = null; payment.refundRequestedAt = new Date(Date.now() - hours * 3600000);
  provider = async req => req.url.includes('/refunds') ? { items: [] } : capture();
  expect((await post()).status).toBe(200);
  expect(payment.refundStatus).toBe('FAILED');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
test.each([undefined, -1, '0', 1])('no-refund recovery rejects unsafe refunded amounts (%s)', async amountRefunded => {
  payment.refundId = null; payment.consultation.status = 'CANCELLED';
  provider = async req => req.url.includes('/refunds') ? { items: [] } : { id: 'pay_review', order_id: 'order_review', amount: 25000, currency: 'INR', status: 'captured', amount_refunded: amountRefunded };
  expect((await post()).status).toBe(502);
  expect(payment.refundStatus).toBe('REVIEW');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});
test.each([
  () => ({ error: { description: 'Private provider details' } }),
  () => ({ ...refund('processed'), amount: 1 }),
  () => ({ ...refund('processed'), payment_id: 'pay_other' }),
  () => ({ ...refund('processed'), currency: 'USD' }),
])('retains review and audits failed/invalid provider checks', async result => {
  provider = async () => result(); expect((await post()).status).toBe(502); expect(payment.refundStatus).toBe('REVIEW'); expect(JSON.parse(audits[0].reason).provider.result).toBe('error');
});
test('multiple matching or partial refunds never clear review', async () => {
  payment.refundId = null; provider = async () => ({ items: [refund('processed'), refund('pending')] });
  expect((await post()).status).toBe(502); expect(payment.refundStatus).toBe('REVIEW');
});
test.each([{ outcome: 'INVALID', note: 'Validated externally' }, { outcome: 'REFUNDED', note: 'short' }, { outcome: 'REFUNDED', note: 'x'.repeat(501) }])('validates manual overrides %j', async body => {
  expect((await post('resolve', body)).status).toBe(400); expect(audits).toHaveLength(0);
});
test.each(['REFUNDED', 'NO_REFUND_NEEDED'])('manually resolves %s once with an audited note', async outcome => {
  const body = { outcome, note: '  Confirmed with provider dashboard  ' };
  expect((await post('resolve', body)).status).toBe(200);
  expect(payment.refundStatus).toBe(outcome === 'REFUNDED' ? 'PROCESSED' : null);
  expect(JSON.parse(audits[0].reason)).toMatchObject({ note: body.note.trim(), provider: { outcome } });
  expect((await post('resolve', body)).status).toBe(409); expect(calls).toHaveLength(0);
});
test('missing payments return 404 without touching the provider', async () => {
  prisma.payment.updateMany.mockResolvedValueOnce({ count: 0 }); expect((await post()).status).toBe(404); expect(calls).toHaveLength(0);
});
test('notification failure does not roll back a reconciled provider refund', async () => {
  notifications.createNotification.mockRejectedValueOnce(new Error('Unavailable'));
  expect((await post()).status).toBe(200);
  expect(payment.refundStatus).toBe('PROCESSED');
  expect(audits).toHaveLength(1);
});
test.each(['reconcile', 'resolve'])('rate limits %s per administrator', async action => {
  for (let i = 0; i < 10; i++) expect((await post(action)).status).toBe(action === 'resolve' ? 400 : 200);
  expect((await post(action)).status).toBe(429);
});
