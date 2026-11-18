process.env.JWT_SECRET = 'test-secret';

jest.mock('../db', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  consultation: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  consultationMessage: {},
  payment: { findMany: jest.fn() },
  document: { findMany: jest.fn(), deleteMany: jest.fn() },
  deliverable: {},
  emailVerificationToken: { deleteMany: jest.fn() },
  passwordResetToken: { deleteMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  notification: { findMany: jest.fn(), deleteMany: jest.fn() },
  pushSubscription: { deleteMany: jest.fn() },
  lawyerReview: { findMany: jest.fn(), updateMany: jest.fn() },
  notificationPreference: {},
  lawyer: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app, ensureDeploymentAdmin, io } = require('../app');
const prisma = require('../db');

const activeUser = { id: 'user-1', accountStatus: 'ACTIVE', role: 'CLIENT', name: 'Test User', email: 'test@example.com' };
const authHeader = () => `Bearer ${jwt.sign({ userId: activeUser.id }, process.env.JWT_SECRET)}`;

beforeEach(() => jest.clearAllMocks());

describe('billable endpoint protection', () => {
  it('rejects anonymous scribe-token requests', async () => {
    const res = await request(app).get('/api/scribe-token');
    expect(res.status).toBe(401);
  });

  it('rejects anonymous translate requests', async () => {
    const res = await request(app).post('/api/translate').send({ text: 'hi', fromLanguage: 'en', toLanguage: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects translate requests with unsupported languages', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    const res = await request(app)
      .post('/api/translate')
      .set('Authorization', authHeader())
      .send({ text: 'hello', fromLanguage: 'xx', toLanguage: 'en' });
    expect(res.status).toBe(400);
  });
});

describe('auth endpoints', () => {
  it.each(['deleted+victim@deleted.invalid', 'deleted+victim@DeLeTeD.InVaLiD'])('rejects registration using reserved email %s', async (email) => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Test', email, phone: '9999999999', password: 'secret123', role: 'client' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/domain is reserved/);
  });
  it('rejects reserved deployment administrator emails before querying the database', async () => {
    const previousEmail = process.env.ADMIN_EMAIL;
    const previousPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = 'admin@DELETED.INVALID';
    process.env.ADMIN_PASSWORD = 'long-test-password';
    try {
      await expect(ensureDeploymentAdmin()).rejects.toThrow('reserved deleted.invalid domain');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    } finally {
      if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousEmail;
      if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousPassword;
    }
  });
  it('forgot-password returns 200 for unknown emails without leaking accounts', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rate limits repeated login attempts', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a@b.com', password: 'secret1', role: 'client' });
    }
    expect(last.status).toBe(429);
  });
});

describe('password and session hardening', () => {
  const bcrypt = require('bcrypt');
  let user;
  let clock = Date.now() + 3600000;
  let disconnectSockets;
  const token = (version = user.tokenVersion) => jwt.sign({ userId: activeUser.id, tokenVersion: version }, process.env.JWT_SECRET);
  const me = (value) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${value}`);
  const change = (newPassword = 'Fresh-river-copper!', currentPassword = 'short') => request(app).post('/api/account/password').set('Authorization', `Bearer ${token()}`).send({ currentPassword, newPassword });
  const login = (email = user.email, password = 'wrong') => request(app).post('/api/auth/login').send({ email, password });
  beforeEach(async () => {
    jest.clearAllMocks();
    clock += 20 * 60000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    disconnectSockets = jest.fn();
    jest.spyOn(io, 'in').mockReturnValue({ disconnectSockets });
    user = { ...activeUser, tokenVersion: 0, subscriptionPlan: 'TRIAL', documentCredits: 0, passwordHash: await bcrypt.hash('short', 4) };
    prisma.user.findUnique.mockImplementation(async ({ where }) => where.email && where.email.toLowerCase() !== user.email ? null : { ...user });
    prisma.user.update.mockImplementation(async ({ where, data }) => {
      if (where.tokenVersion !== undefined && where.tokenVersion !== user.tokenVersion) throw Object.assign(new Error('Race'), { code: 'P2025' });
      if (data.passwordHash) user.passwordHash = data.passwordHash;
      if (data.tokenVersion?.increment) user.tokenVersion += data.tokenVersion.increment;
      return { ...user };
    });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.passwordResetToken.findUnique.mockImplementation(async () => ({ id: 'reset', userId: user.id, user: { ...user }, expiresAt: new Date(clock + 3600000) }));
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['', /10.*128/], [undefined, /10.*128/], [null, /10.*128/], [{ value: 'password123' }, /10.*128/],
    ['short', /10.*128/], ['x'.repeat(129), /10.*128/], ['x'.repeat(73), /72.*byte/], ['é'.repeat(37), /72.*byte/],
    ['password123', /common/i], ['TEST-copper-river', /email/i],
  ])('register, reset and change share policy rejection for %s', async (password, message) => {
    const registered = await request(app).post('/api/auth/register').send({ name: 'Test', email: user.email, phone: '9999999999', password });
    const reset = await request(app).post('/api/auth/reset-password').send({ token: 'reset', password });
    const changed = await request(app).post('/api/account/password').set('Authorization', `Bearer ${token()}`).send({ currentPassword: 'short', newPassword: password });
    for (const result of [registered, reset, changed]) {
      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(message);
    }
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test.each(['CLIENT', 'ADMIN'])('%s changes own password and keeps only the fresh session', async (role) => {
    user.role = role;
    const old = token();
    const response = await change('R'.repeat(72));
    expect(response.status).toBe(200);
    const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(payload.tokenVersion).toBe(1);
    expect(payload.exp - payload.iat).toBe(7 * 86400);
    expect(await bcrypt.compare('R'.repeat(72), user.passwordHash)).toBe(true);
    expect((await me(old)).status).toBe(401);
    expect((await me(response.body.token)).status).toBe(200);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('requires auth/current password, rate limits changes per user, and does not mutate on failure', async () => {
    expect((await request(app).post('/api/account/password').send({})).status).toBe(401);
    expect((await change(undefined, 'wrong')).status).toBe(401);
    for (let i = 0; i < 5; i++) await change(undefined, 'wrong');
    expect((await change()).status).toBe(429);
    expect(user.tokenVersion).toBe(0);
  });

  test('reset consumes the token once and revokes prior sessions', async () => {
    const old = token();
    const reset = () => request(app).post('/api/auth/reset-password').send({ token: 'reset', password: 'Fresh-river-copper!' });
    expect((await reset()).status).toBe(200);
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({ where: { id: 'reset', token: 'reset', usedAt: null, expiresAt: { gt: expect.any(Date) } }, data: { usedAt: expect.any(Date) } });
    expect((await me(old)).status).toBe(401);
    prisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await reset()).status).toBe(400);
    expect(user.tokenVersion).toBe(1);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  test.each([null, { usedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }, { expiresAt: new Date(0) }])('rejects missing, used or expired reset records', async (record) => {
    prisma.passwordResetToken.findUnique.mockResolvedValueOnce(record);
    const result = await request(app).post('/api/auth/reset-password').send({ token: 'reset', password: 'Fresh-river-copper!' });
    expect(result.status).toBe(400);
    expect(user.tokenVersion).toBe(0);
  });

  test('logout-all revokes the current token and removes push subscriptions', async () => {
    const old = token();
    const result = await request(app).post('/api/account/logout-all').set('Authorization', `Bearer ${old}`);
    expect(result.status).toBe(204);
    expect((await me(old)).status).toBe(401);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  test('short existing passwords can log in; success resets failed attempts', async () => {
    for (let i = 0; i < 4; i++) expect((await login()).status).toBe(401);
    const result = await login(user.email, 'short');
    expect(result.status).toBe(200);
    expect(jwt.verify(result.body.token, process.env.JWT_SECRET).tokenVersion).toBe(0);
    for (let i = 0; i < 4; i++) expect((await login()).status).toBe(401);
  });

  test.each(['test@example.com', 'unknown@example.com'])('locks %s generically after five failures, including normalized email and role changes', async (email) => {
    const compare = jest.spyOn(bcrypt, 'compare');
    for (let i = 0; i < 5; i++) expect((await login(email)).status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(5);
    expect(typeof compare.mock.calls[0][1]).toBe('string');
    const result = await request(app).post('/api/auth/login').send({ email: ` ${email.toUpperCase()} `, password: 'short', role: 'admin' });
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ error: 'Too many attempts. Please try again later.' });
    clock += 15 * 60000;
    expect((await login(email)).status).toBe(401);
  });
});

describe('account privacy', () => {
  const bcrypt = require('bcrypt');
  const user = { ...activeUser, subscriptionPlan: 'TRIAL', documentCredits: 0, phone: '9999999999' };
  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.lawyer.findUnique.mockResolvedValue(null);
    prisma.consultation.findFirst.mockResolvedValue(null);
    prisma.consultation.updateMany.mockResolvedValue({ count: 0 });
    for (const model of ['document', 'consultation', 'payment', 'lawyerReview', 'notification']) prisma[model].findMany.mockResolvedValue([]);
  });
  const remove = (body) => request(app).delete('/api/account').set('Authorization', authHeader()).send(body);

  it('requires authentication to export', async () => {
    expect((await request(app).get('/api/account/export')).status).toBe(401);
  });
  it('exports an attachment without credentials or token rows', async () => {
    const res = await request(app).get('/api/account/export').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="law-writer-data-\d{4}-\d{2}-\d{2}\.json"/);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|passwordResetToken|emailVerificationToken|p256dh/);
    expect(res.body.profile).toMatchObject({ id: user.id, phone: user.phone });
    expect(res.body.documents).toEqual([]);
    expect(prisma.consultation.findMany).toHaveBeenCalledWith({ where: { userId: user.id }, include: { messages: true, deliverables: { where: { status: 'DELIVERED' } }, review: true, payment: true } });
  });
  it('exports lawyer consultations as well as client consultations', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, lawyerProfile: { id: 'lawyer-1', approvalStatus: 'APPROVED' } });
    const res = await request(app).get('/api/account/export').set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(prisma.consultation.findMany).toHaveBeenCalledWith({ where: { lawyerId: 'lawyer-1' }, include: { messages: true, deliverables: true, review: true, payment: true } });
  });
  it('requires exact confirmation', async () => {
    expect((await remove({ password: 'correct-password', confirmation: 'delete' })).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects an incorrect password', async () => {
    expect((await remove({ password: 'wrong', confirmation: 'DELETE' })).status).toBe(401);
  });
  it('rejects administrator deletion', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, role: 'ADMIN' });
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(403);
  });
  it('rejects deletion with an upcoming consultation for either role', async () => {
    prisma.lawyer.findUnique.mockResolvedValue({ id: 'lawyer-1' });
    prisma.consultation.findFirst.mockResolvedValue({ id: 'upcoming' });
    const res = await remove({ password: 'correct-password', confirmation: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Cancel or complete/);
    expect(prisma.consultation.findFirst).toHaveBeenCalledWith({ where: {
      OR: [{ userId: user.id }, { lawyerId: 'lawyer-1' }],
      status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, endsAt: { gt: expect.any(Date) },
    } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('anonymizes the account and lawyer, erases private data, and retains ratings', async () => {
    prisma.lawyer.findUnique.mockResolvedValue({ id: 'lawyer-1' });
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(204);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toEqual({
      email: 'deleted+user-1@deleted.invalid', name: 'Deleted user', phone: null,
      phoneVerifiedAt: null, emailVerifiedAt: null, passwordHash: expect.any(String),
      accountStatus: 'DEACTIVATED', statusReason: 'Deleted by user', statusChangedAt: expect.any(Date),
      emailNotifications: false, pushNotifications: false,
    });
    expect(await bcrypt.compare('correct-password', data.passwordHash)).toBe(false);
    for (const model of ['document', 'notification', 'pushSubscription', 'emailVerificationToken', 'passwordResetToken']) {
      expect(prisma[model].deleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
    }
    expect(prisma.lawyerReview.updateMany).toHaveBeenCalledWith({ where: { userId: user.id }, data: { comment: null } });
    expect(prisma.lawyer.update).toHaveBeenCalledWith({ where: { id: 'lawyer-1' }, data: {
      isVerified: false, approvalStatus: 'DRAFT', name: 'Deleted lawyer', bio: '', avatarUrl: null,
      slug: 'deleted-lawyer-1', enrollmentNumber: 'deleted-lawyer-1', barCouncil: '', title: '',
    } });
  });
  it('rejects a deactivated account JWT', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, accountStatus: 'DEACTIVATED' });
    expect((await request(app).get('/api/account/export').set('Authorization', authHeader())).status).toBe(403);
  });
  it('limits exports to five per hour per user', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, id: 'export-rate-user' });
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/api/account/export').set('Authorization', authHeader())).status).toBe(200);
    }
    expect((await request(app).get('/api/account/export').set('Authorization', authHeader())).status).toBe(429);
  });
  it('deletes a client account without requiring a lawyer profile', async () => {
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(204);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accountStatus: 'DEACTIVATED' }) }));
  });
  it('expires stale unpaid reservations before checking lawyer deletion eligibility', async () => {
    prisma.lawyer.findUnique.mockResolvedValue({ id: 'lawyer-1' });
    const reservation = { status: 'PENDING_PAYMENT', createdAt: new Date(Date.now() - 16 * 60 * 1000), endsAt: new Date(Date.now() + 60 * 60 * 1000) };
    prisma.consultation.updateMany.mockImplementationOnce(async ({ where, data }) => {
      expect(where).toEqual({ status: 'PENDING_PAYMENT', createdAt: { lt: expect.any(Date) } });
      expect(Math.abs(where.createdAt.lt.getTime() - (Date.now() - 15 * 60 * 1000))).toBeLessThan(1000);
      if (reservation.createdAt < where.createdAt.lt) reservation.status = data.status;
      return { count: 1 };
    });
    prisma.consultation.findFirst.mockImplementationOnce(async () => reservation.status === 'PENDING_PAYMENT' ? reservation : null);
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(204);
    expect(reservation.status).toBe('CANCELLED');
    expect(prisma.consultation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(prisma.consultation.findFirst.mock.invocationCallOrder[0]);
    expect(prisma.user.update).toHaveBeenCalled();
  });
  it('rolls back on database errors', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('Database unavailable'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(500);
    log.mockRestore();
  });
});
