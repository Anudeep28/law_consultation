process.env.JWT_SECRET = 'test-secret';

jest.mock('../db', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  consultation: { findFirst: jest.fn() },
  consultationMessage: {},
  payment: {},
  document: {},
  deliverable: {},
  emailVerificationToken: {},
  passwordResetToken: {},
  notification: {},
  notificationPreference: {},
  lawyer: {},
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
