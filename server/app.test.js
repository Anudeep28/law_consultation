process.env.JWT_SECRET = 'test-secret';

jest.mock('../db', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  consultation: { findFirst: jest.fn(), findMany: jest.fn() },
  consultationMessage: {},
  payment: { findMany: jest.fn() },
  document: { findMany: jest.fn(), deleteMany: jest.fn() },
  deliverable: {},
  emailVerificationToken: { deleteMany: jest.fn() },
  passwordResetToken: { deleteMany: jest.fn() },
  notification: { findMany: jest.fn(), deleteMany: jest.fn() },
  pushSubscription: { deleteMany: jest.fn() },
  lawyerReview: { findMany: jest.fn(), updateMany: jest.fn() },
  notificationPreference: {},
  lawyer: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../app');
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

describe('account privacy', () => {
  const bcrypt = require('bcrypt');
  const user = { ...activeUser, subscriptionPlan: 'TRIAL', documentCredits: 0, phone: '9999999999' };
  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.lawyer.findUnique.mockResolvedValue(null);
    prisma.consultation.findFirst.mockResolvedValue(null);
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
  it('rolls back on database errors', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('Database unavailable'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await remove({ password: 'correct-password', confirmation: 'DELETE' })).status).toBe(500);
    log.mockRestore();
  });
});
