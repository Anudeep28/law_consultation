process.env.JWT_SECRET = 'jaas-auth-test';
jest.mock('../db', () => ({
  user: { findUnique: jest.fn() },
  lawyer: { findUnique: jest.fn() },
  consultation: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  document: { findMany: jest.fn() },
  payment: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  lawyerReview: { findMany: jest.fn() },
  notification: { findMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
}));

const { generateKeyPairSync, createHmac } = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../db');
const { app } = require('../app');
const meetings = require('./meetings');
const notifications = require('./notifications');
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const envKeys = ['JAAS_APP_ID', 'JAAS_API_KEY_ID', 'JAAS_PRIVATE_KEY', 'RAZORPAY_ENV', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const now = Date.now();
const room = `law-writer-${'a'.repeat(32)}`;
const user = { id: 'client', role: 'CLIENT', accountStatus: 'ACTIVE', name: 'Client Name', email: 'client@example.test', subscriptionPlan: 'TRIAL', documentCredits: 0 };
const lawyerUser = { ...user, id: 'lawyer-user', role: 'LAWYER', name: 'Lawyer Name', email: 'lawyer@example.test', lawyerProfile: { id: 'lawyer' } };
let consultation;
const getMeeting = (id = user.id) => request(app).get('/api/consultations/consultation/meeting').set('Authorization', `Bearer ${jwt.sign({ userId: id }, process.env.JWT_SECRET)}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  process.env.JAAS_APP_ID = 'vpaas-magic-cookie-test';
  process.env.JAAS_API_KEY_ID = 'vpaas-magic-cookie-test/test-key';
  process.env.JAAS_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
  consultation = {
    id: 'consultation', userId: user.id, lawyerId: 'lawyer', mode: 'CALL', status: 'BOOKED', package: 'CALL_ONLY', topic: 'Private topic', notes: 'Private notes',
    startsAt: new Date(now), endsAt: new Date(now + 600000), meetingUrl: `jaas:${room}`,
    user, lawyer: { id: 'lawyer', userId: lawyerUser.id, name: 'Adv. Lawyer', approvalStatus: 'APPROVED' },
  };
  prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === lawyerUser.id ? { ...lawyerUser, lawyerProfile: consultation.lawyer } : where.id === user.id ? user : { ...user, id: where.id });
  prisma.lawyer.findUnique.mockResolvedValue(consultation.lawyer);
  prisma.consultation.findUnique.mockImplementation(async () => consultation);
  prisma.consultation.findMany.mockImplementation(async () => [consultation]);
  prisma.consultation.updateMany.mockImplementation(async ({ data }) => { if (data.meetingUrl) consultation.meetingUrl = data.meetingUrl; return { count: 1 }; });
  prisma.document.findMany.mockResolvedValue([]);
  prisma.payment.findMany.mockResolvedValue([]);
  prisma.lawyerReview.findMany.mockResolvedValue([]);
  prisma.notification.findMany.mockResolvedValue([]);
  prisma.notification.create.mockImplementation(async ({ data }) => data);
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { for (const key of envKeys) { if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key]; } });

test.each([[user, 'false'], [lawyerUser, 'true']])('mints an RS256 token for $id with the exact room and requester identity', async (participant, moderator) => {
  if (participant.id === lawyerUser.id) process.env.JAAS_PRIVATE_KEY = privateKey;
  const response = await getMeeting(participant.id);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const url = new URL(response.body.url);
  expect(url.origin).toBe('https://8x8.vc');
  expect(url.pathname).toBe(`/vpaas-magic-cookie-test/${room}`);
  const token = url.searchParams.get('jwt');
  const verified = jwt.verify(token, publicKey, { algorithms: ['RS256'], audience: 'jitsi', issuer: 'chat', subject: process.env.JAAS_APP_ID, complete: true });
  expect(verified.header).toEqual({ alg: 'RS256', typ: 'JWT', kid: process.env.JAAS_API_KEY_ID });
  expect(verified.payload.room).toBe(room);
  expect(verified.payload.context.user).toEqual({ id: participant.id, name: participant.name, email: participant.email, moderator });
  expect(verified.payload.context.room).toEqual({ regex: false });
  expect(verified.payload.context.features).toEqual(expect.objectContaining({ recording: false, livestreaming: false, transcription: false, 'outbound-call': false }));
  expect(verified.payload.nbf).toBe(Math.floor((now - 600000) / 1000));
  expect(verified.payload.exp).toBe(Math.floor((now + 600000) / 1000) + 60);
  expect(() => jwt.verify(token, publicKey, { clockTimestamp: verified.payload.nbf - 1 })).toThrow(jwt.NotBeforeError);
  expect(() => jwt.verify(token, publicKey, { clockTimestamp: verified.payload.exp })).toThrow(jwt.TokenExpiredError);
  const next = await getMeeting(participant.id);
  expect(next.body.url).not.toBe(response.body.url);
  expect(prisma.consultation.updateMany).not.toHaveBeenCalled();
});

test('requires an active authenticated participant and an existing consultation', async () => {
  expect((await request(app).get('/api/consultations/consultation/meeting')).status).toBe(401);
  expect((await getMeeting('outsider')).status).toBe(403);
  prisma.user.findUnique.mockResolvedValueOnce({ ...user, accountStatus: 'SUSPENDED' });
  expect((await getMeeting()).status).toBe(403);
  prisma.consultation.findUnique.mockResolvedValueOnce(null);
  expect((await getMeeting()).status).toBe(404);
});

test.each(['PENDING_PAYMENT', 'CANCELLED', 'COMPLETED'])('rejects %s consultations', async (status) => {
  consultation.status = status;
  expect((await getMeeting()).status).toBe(409);
});

test('rejects chat consultations', async () => {
  consultation.mode = 'CHAT';
  expect((await getMeeting()).status).toBe(409);
});

test('enforces the opening boundary and closes exactly at endsAt', async () => {
  consultation.startsAt = new Date(now + 600001);
  expect((await getMeeting()).status).toBe(403);
  consultation.startsAt = new Date(now + 600000);
  expect((await getMeeting()).status).toBe(200);
  consultation.endsAt = new Date(now);
  expect((await getMeeting()).status).toBe(403);
});

test('upgrades legacy public rooms once and converges concurrent upgrades on the stored room', async () => {
  consultation.meetingUrl = 'https://meet.jit.si/law-writer-old';
  const response = await getMeeting();
  expect(response.status).toBe(200);
  expect(consultation.meetingUrl).toMatch(/^jaas:law-writer-[a-f0-9]{32}$/);
  expect(response.body.url).not.toContain('meet.jit.si');
  const firstRoom = jwt.decode(new URL(response.body.url).searchParams.get('jwt')).room;
  expect(consultation.meetingUrl).toBe(`jaas:${firstRoom}`);
  const stored = consultation;
  prisma.consultation.findUnique.mockResolvedValueOnce({ ...stored, meetingUrl: null });
  prisma.consultation.updateMany.mockResolvedValueOnce({ count: 0 });
  const raced = await getMeeting(lawyerUser.id);
  expect(raced.status).toBe(200);
  expect(jwt.decode(new URL(raced.body.url).searchParams.get('jwt')).room).toBe(firstRoom);
});

test('disabled JaaS preserves public meeting links and never converts a private room to public', async () => {
  envKeys.forEach((key) => delete process.env[key]);
  consultation.meetingUrl = 'https://meet.jit.si/law-writer-legacy';
  expect((await getMeeting()).body).toEqual({ url: consultation.meetingUrl });
  const list = await request(app).get('/api/consultations').set('Authorization', `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`);
  expect(list.body.consultations[0].meetingUrl).toBe(consultation.meetingUrl);
  expect(meetings.createMeetingLocation()).toMatch(/^https:\/\/meet\.jit\.si\/law-writer-[a-f0-9]{24}$/);
  consultation.meetingUrl = `jaas:${room}`;
  expect((await getMeeting()).status).toBe(409);
});

test('invalid or incomplete configuration fails closed', async () => {
  delete process.env.JAAS_PRIVATE_KEY;
  expect((await getMeeting()).status).toBe(503);
  process.env.JAAS_PRIVATE_KEY = 'invalid private key';
  expect((await getMeeting()).status).toBe(503);
});

test.each(['verification', 'webhook'])('%s stores only a random JaaS room when booking a call', async (flow) => {
  process.env.RAZORPAY_ENV = 'test';
  process.env.RAZORPAY_KEY_SECRET = 'meeting-payment-test-secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'meeting-webhook-test-secret';
  consultation.meetingUrl = null;
  consultation.status = 'PENDING_PAYMENT';
  const payment = { id: 'payment', userId: user.id, consultationId: consultation.id, consultation, user, status: 'CREATED', plan: 'CONSULTATION' };
  prisma.payment.findFirst.mockResolvedValue(payment);
  prisma.payment.findUnique.mockResolvedValue(payment);
  prisma.payment.updateMany.mockResolvedValue({ count: 1 });
  prisma.consultation.update.mockImplementation(async ({ data }) => { Object.assign(consultation, data); return consultation; });
  let response;
  if (flow === 'verification') {
    response = await request(app).post('/api/consultations/consultation/verify-payment')
      .set('Authorization', `Bearer ${jwt.sign({ userId: user.id }, process.env.JWT_SECRET)}`)
      .send({ razorpay_order_id: 'order', razorpay_payment_id: 'paid', razorpay_signature: createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('order|paid').digest('hex') });
  } else {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order', id: 'paid' } } } });
    response = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json')
      .set('x-razorpay-signature', createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')).send(body);
  }
  expect(response.status).toBe(200);
  expect(consultation.status).toBe('BOOKED');
  expect(consultation.meetingUrl).toMatch(/^jaas:law-writer-[a-f0-9]{32}$/);
  expect(response.text).not.toMatch(/jaas:|jwt=|8x8\.vc|meet\.jit\.si/);
});

test('lists, exports and reminder payloads never contain JaaS URLs or JWTs', async () => {
  const response = await getMeeting();
  const token = new URL(response.body.url).searchParams.get('jwt');
  for (const [participant, path] of [[user, '/api/consultations'], [lawyerUser, '/api/lawyer/consultations'], [user, '/api/account/export'], [lawyerUser, '/api/account/export']]) {
    const result = await request(app).get(path).set('Authorization', `Bearer ${jwt.sign({ userId: participant.id }, process.env.JWT_SECRET)}`);
    expect(result.status).toBe(200);
    expect(result.text).not.toContain(token);
    expect(result.text).not.toMatch(/8x8\.vc|jwt=|jaas:|meet\.jit\.si/);
    if (result.body.consultations) expect(result.body.consultations[0]).toMatchObject({ meetingProvider: 'jaas' });
  }
  prisma.consultation.findMany.mockResolvedValueOnce([consultation]).mockResolvedValueOnce([]);
  await notifications.sendDueReminders();
  expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  for (const [{ data }] of prisma.notification.create.mock.calls) {
    expect(data.body).toContain('Join your call from the app.');
    expect(JSON.stringify(data)).not.toMatch(/8x8\.vc|jwt=|jaas:|meet\.jit\.si/);
    expect(JSON.stringify(data)).not.toContain(token);
  }
  expect(meetings.createMeetingLocation()).toMatch(/^jaas:law-writer-[a-f0-9]{32}$/);
  expect(meetings.createMeetingLocation()).not.toBe(meetings.createMeetingLocation());
});
