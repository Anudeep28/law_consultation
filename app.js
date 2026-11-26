require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server: SocketServer } = require('socket.io');
const prisma = require('./db');
const notifications = require('./server/notifications');
const { logger, createRequestLogging, errorHandler } = require('./server/logger');
const { sentryIngestOrigins } = require('./server/monitoring');
const meetings = require('./server/meetings');
const commonPasswords = new Set(require('./src/data/commonPasswords.json'));

const app = express();
app.disable('x-powered-by');
app.use(createRequestLogging());
app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === 'production',
  contentSecurityPolicy: {
    directives: {
      scriptSrc: [
        "'self'", 'https://checkout.razorpay.com', 'https://checkout-static.razorpay.com',
        'https://checkout-static-next.razorpay.com', 'https://cdn.razorpay.com/static/cx/razorpay-risk-detection/',
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      connectSrc: [
        "'self'",
        (req) => `ws://${req.get('host')}`,
        (req) => `wss://${req.get('host')}`,
        'wss://api.elevenlabs.io',
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://checkout-static.razorpay.com',
        'https://checkout-static-next.razorpay.com',
        'https://lumberjack.razorpay.com',
        ...sentryIngestOrigins(),
      ],
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));
const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;
const payments = require('./server/paymentService')({ prisma, request: (...args) => razorpayRequest(...args), meetings, notifications, logger, pendingTtl: PENDING_PAYMENT_TTL_MS });

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (err) {
    req.log.error({ err }, 'Database health check failed');
    res.status(503).json({ status: 'unavailable' });
  }
});

const razorpayCredentials = () => {
  const live = process.env.RAZORPAY_ENV === 'live';
  return {
    keyId: live ? process.env.RAZORPAY_KEY_ID_LIVE : process.env.RAZORPAY_KEY_ID,
    keySecret: live ? process.env.RAZORPAY_KEY_SECRET_LIVE : process.env.RAZORPAY_KEY_SECRET,
  };
};
const PLANS = {
  single: { amount: 1000, name: 'Single document' },
  monthly: { amount: 49900, name: 'Monthly subscription' },
};
const TRIAL_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
const otpRequests = new Map();

const normalizeIndianPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  const nationalNumber = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(nationalNumber) ? `91${nationalNumber}` : '';
};

const isPlausibleEnrollmentNumber = (value) => /^[A-Z]{1,8}[/-][A-Z0-9-]{1,12}[/-](?:19|20)\d{2}$/i.test(value);

const hasTimedAccess = (user) =>
  (user.subscriptionPlan === 'TRIAL' || user.subscriptionPlan === 'MONTHLY')
  && (user.subscriptionExpiry?.getTime() || 0) > Date.now();

const allowOtpRequest = (userId) => {
  const now = Date.now();
  const attempts = (otpRequests.get(userId) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (attempts.length >= 5 || (attempts.length && now - attempts[attempts.length - 1] < 60 * 1000)) return false;
  otpRequests.set(userId, [...attempts, now]);
  return true;
};

const rateBuckets = new Map();
const rateLimit = (keyFn, limit, windowMs) => (req, res, next) => {
  const key = keyFn(req);
  const now = Date.now();
  const attempts = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (attempts.length >= limit) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  rateBuckets.set(key, [...attempts, now]);
  next();
};
const clientIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';
const isReservedEmail = (email) => /@deleted\.invalid$/i.test(email);
const isDeploymentAdminEmail = (email) => email.toLowerCase() === String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const deploymentPasswordError = 'Rotate this deployment administrator password via ADMIN_PASSWORD.';
const passwordError = (password, email) => {
  if (typeof password !== 'string' || Array.from(password).length < 10 || Array.from(password).length > 128) return 'Password must contain 10–128 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes in UTF-8 (some characters use more than one byte).';
  const normalized = password.toLowerCase();
  if (commonPasswords.has(normalized)) return 'This password is too common. Choose a less predictable password.';
  const localPart = email.split('@')[0].toLowerCase();
  if (localPart && normalized.includes(localPart)) return 'Password must not contain the part of your email before @.';
  return null;
};
const failedLogins = new Map();
const loginWindowMs = 15 * 60 * 1000;
const recentLoginFailures = (email) => (failedLogins.get(email) || []).filter((time) => Date.now() - time < loginWindowMs);
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

// Razorpay webhook needs the raw body for signature verification, so it is
// registered before express.json() parses bodies.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook is not configured' });
  const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
  const receivedBuffer = Buffer.from(String(req.headers['x-razorpay-signature'] || ''));
  const expectedBuffer = Buffer.from(expectedSignature);
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
  if (!event || typeof event !== 'object') return res.status(400).json({ error: 'Invalid webhook payload' });
  if (!['payment.captured', 'order.paid', 'refund.processed', 'refund.failed'].includes(event.event)) return res.json({ received: true });
  try {
    if (event.event.startsWith('refund.')) {
      const refund = event.payload?.refund?.entity;
      if (!refund || refund.status !== event.event.slice(7)) return res.status(400).json({ error: 'Malformed refund payload' });
      await payments.refundEvent(refund, event.payload?.payment?.entity?.order_id);
      return res.json({ received: true });
    }
    const entity = event.payload?.payment?.entity || {};
    const orderId = entity.order_id;
    const paymentId = entity.id;
    if (typeof orderId !== 'string' || !orderId || typeof paymentId !== 'string' || !paymentId) return res.status(400).json({ error: 'Malformed payment payload' });
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: orderId },
      include: { user: true, consultation: { include: { lawyer: true } } },
    });
    if (!payment) {
      req.log.error({ orderId, paymentId }, 'Captured payment has no local order; reconciliation required');
      return res.status(503).json({ error: 'Payment order requires reconciliation' });
    }
    if (event.event === 'order.paid') {
      const order = event.payload?.order?.entity;
      if (!order || order.id !== orderId || order.amount !== payment.amount || order.amount_paid !== payment.amount || order.currency !== payment.currency || order.status !== 'paid') return res.status(400).json({ error: 'Order amount, currency or status mismatch' });
    }
    await payments.settle(payment, entity);
    res.json({ received: true });
  } catch (error) {
    req.log.error({ err: error }, 'Payment webhook error:');
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Webhook processing failed' });
  }
});

app.use(express.json());

const serializeUser = (user) => {
  const expiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  const timedAccess = hasTimedAccess(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.toLowerCase(),
    accountStatus: user.accountStatus.toLowerCase(),
    phone: user.phone || undefined,
    isPhoneVerified: Boolean(user.phoneVerifiedAt),
    isEmailVerified: Boolean(user.emailVerifiedAt),
    lawyerProfile: user.lawyerProfile ? serializeLawyer(user.lawyerProfile) : undefined,
    subscriptionStatus: timedAccess
      ? (user.subscriptionPlan === 'TRIAL' ? 'trial' : 'active')
      : (user.documentCredits > 0 ? 'active' : 'expired'),
    subscriptionPlan: user.subscriptionPlan.toLowerCase(),
    subscriptionExpiry: expiry,
    documentCredits: user.documentCredits,
    emailNotifications: user.emailNotifications,
    pushNotifications: user.pushNotifications,
    appliedPaymentIds: (user.payments || []).map((payment) => payment.razorpayPaymentId).filter(Boolean),
  };
};

const userWithPayments = (id) => prisma.user.findUnique({
  where: { id },
  include: {
    payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } },
    lawyerProfile: true,
  },
});

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
  try {
    if (!payload || typeof payload !== 'object' || typeof payload.userId !== 'string' || !payload.userId) return res.status(401).json({ error: 'Invalid authentication token' });
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid authentication token' });
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    if (user.accountStatus !== 'ACTIVE') return res.status(403).json({ error: 'This account is not active' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: `${role.toLowerCase()} access required` });
  next();
};

const signToken = (user) => jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.post('/api/account/password', authenticate, rateLimit((req) => `password:${req.user.id}`, 5, 15 * 60 * 1000), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !await bcrypt.compare(currentPassword, req.user.passwordHash)) return res.status(401).json({ error: 'Current password is incorrect.' });
    if (isDeploymentAdminEmail(req.user.email)) return res.status(403).json({ error: deploymentPasswordError });
    const error = passwordError(newPassword, req.user.email);
    if (error) return res.status(400).json({ error });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const user = await prisma.user.update({ where: { id: req.user.id, tokenVersion: req.user.tokenVersion ?? 0 }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    io.in(`user:${user.id}`).disconnectSockets(true);
    res.json({ token: signToken(user) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    req.log.error({ err }, 'Unable to change password');
    res.status(500).json({ error: 'Unable to change password. Please try again.' });
  }
});

app.post('/api/account/logout-all', authenticate, rateLimit((req) => `logout-all:${req.user.id}`, 5, 15 * 60 * 1000), async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
      await tx.pushSubscription.deleteMany({ where: { userId: req.user.id } });
    });
    io.in(`user:${req.user.id}`).disconnectSockets(true);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, 'Unable to log out all devices');
    res.status(500).json({ error: 'Unable to log out all devices. Please try again.' });
  }
});

app.get('/api/account/export', authenticate, rateLimit((req) => `account-export:${req.user.id}`, 5, 60 * 60 * 1000), async (req, res) => {
  try {
    const user = await userWithPayments(req.user.id);
    const consultationInclude = { messages: true, deliverables: true, review: true, payment: true };
    const [documents, clientConsultations, lawyerConsultations, payments, reviews, userNotifications] = await Promise.all([
      prisma.document.findMany({ where: { userId: user.id } }),
      prisma.consultation.findMany({ where: { userId: user.id }, include: { ...consultationInclude, deliverables: { where: { status: 'DELIVERED' } } } }),
      user.lawyerProfile ? prisma.consultation.findMany({ where: { lawyerId: user.lawyerProfile.id }, include: consultationInclude }) : [],
      prisma.payment.findMany({ where: { userId: user.id } }),
      prisma.lawyerReview.findMany({ where: { userId: user.id } }),
      prisma.notification.findMany({ where: { userId: user.id } }),
    ]);
    const exportedAt = new Date().toISOString();
    res.set('Cache-Control', 'no-store');
    res.attachment(`law-writer-data-${exportedAt.slice(0, 10)}.json`).json({
      exportedAt,
      profile: { ...serializeUser(user), phone: user.phone, createdAt: user.createdAt, updatedAt: user.updatedAt },
      lawyerProfile: user.lawyerProfile || null,
      documents,
      clientConsultations: clientConsultations.map((consultation) => ({ ...consultation, meetingUrl: meetings.publicMeetingUrl(consultation) })),
      lawyerConsultations: lawyerConsultations.map((consultation) => ({ ...consultation, meetingUrl: meetings.publicMeetingUrl(consultation) })),
      payments, reviews, notifications: userNotifications,
    });
  } catch (error) {
    req.log.error({ err: error }, 'Account export failed:');
    res.status(500).json({ error: 'Unable to export your account data. Please try again.' });
  }
});

app.delete('/api/account', authenticate, rateLimit((req) => `account-delete:${req.user.id}`, 10, 60 * 60 * 1000), async (req, res) => {
  try {
    const { password, confirmation } = req.body || {};
    if (confirmation !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm account deletion.' });
    if (req.user.role === 'ADMIN') return res.status(403).json({ error: 'Administrator accounts cannot be deleted through self-service.' });
    if (typeof password !== 'string' || !await bcrypt.compare(password, req.user.passwordHash)) return res.status(401).json({ error: 'Incorrect password.' });
    await expireStalePendingConsultations();
    const now = new Date();
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
    const deleted = await prisma.$transaction(async (tx) => {
      const lawyer = await tx.lawyer.findUnique({ where: { userId: req.user.id } });
      const upcoming = await tx.consultation.findFirst({ where: {
        OR: [{ userId: req.user.id }, ...(lawyer ? [{ lawyerId: lawyer.id }] : [])],
        status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, endsAt: { gt: now },
      } });
      if (upcoming) return false;
      const where = { userId: req.user.id };
      await tx.document.deleteMany({ where });
      await tx.notification.deleteMany({ where });
      await tx.pushSubscription.deleteMany({ where });
      await tx.emailVerificationToken.deleteMany({ where });
      await tx.passwordResetToken.deleteMany({ where });
      await tx.lawyerReview.updateMany({ where, data: { comment: null } });
      if (lawyer) await tx.lawyer.update({ where: { id: lawyer.id }, data: {
        isVerified: false, approvalStatus: 'DRAFT', name: 'Deleted lawyer', bio: '', avatarUrl: null,
        slug: `deleted-${lawyer.id}`, enrollmentNumber: `deleted-${lawyer.id}`, barCouncil: '', title: '',
      } });
      await tx.user.update({ where: { id: req.user.id }, data: {
        email: `deleted+${req.user.id}@deleted.invalid`, name: 'Deleted user', phone: null,
        phoneVerifiedAt: null, emailVerifiedAt: null, passwordHash, accountStatus: 'DEACTIVATED',
        statusReason: 'Deleted by user', statusChangedAt: now, emailNotifications: false, pushNotifications: false,
      } });
      return true;
    });
    if (!deleted) return res.status(409).json({ error: 'Cancel or complete your upcoming consultations before deleting your account.' });
    io.in(`user:${req.user.id}`).disconnectSockets(true);
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, 'Account deletion failed:');
    res.status(500).json({ error: 'Unable to delete your account. Please try again.' });
  }
});

const { sendEmail } = require('./server/notifications');

const appUrl = process.env.APP_URL || 'http://localhost:3000';

const sendVerificationEmail = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.emailVerificationToken.upsert({
    where: { userId: user.id },
    update: { token, expiresAt, usedAt: null },
    create: { userId: user.id, token, expiresAt },
  });
  const verifyUrl = `${appUrl}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your email - Law Writer',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #701f2f;">Welcome to Law Writer</h2>
        <p>Hi ${user.name},</p>
        <p>Please verify your email address by clicking the button below. This link expires in 24 hours.</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #701f2f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify email address</a>
        <p style="margin-top: 24px; font-size: 12px; color: #666;">If you didn't create this account, you can ignore this email.</p>
      </div>
    `,
    text: `Welcome to Law Writer. Verify your email by opening this link: ${verifyUrl}. This link expires in 24 hours.`,
  });
};

app.post('/api/auth/register', rateLimit((req) => `register:${clientIp(req)}`, 10, 60 * 60 * 1000), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const phone = normalizeIndianPhone(req.body.phone);
  const role = String(req.body.role || 'client').toUpperCase();
  const barCouncil = String(req.body.barCouncil || '').trim();
  const enrollmentNumber = String(req.body.enrollmentNumber || '').trim();
  if (isReservedEmail(email)) return res.status(400).json({ error: 'This email domain is reserved. Please use a different email address.' });
  if (!name || !email || !phone || !['CLIENT', 'LAWYER'].includes(role)) {
    return res.status(400).json({ error: 'Name, email, valid Indian mobile number, and account type are required' });
  }
  const error = passwordError(password, email);
  if (error) return res.status(400).json({ error });
  if (role === 'LAWYER' && (!barCouncil || !isPlausibleEnrollmentNumber(enrollmentNumber))) {
    return res.status(400).json({ error: 'Bar Council and an enrollment number in the council format (for example D/1234/2018) are required for lawyers' });
  }
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT is not configured' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        phone,
        role,
        subscriptionExpiry: new Date(Date.now() + TRIAL_DURATION_MS),
        lawyerProfile: role === 'LAWYER' ? {
          create: {
            slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${crypto.randomBytes(3).toString('hex')}`,
            name,
            title: 'Advocate',
            bio: 'Lawyer profile pending verification.',
            practiceAreas: [],
            languages: ['English'],
            experienceYears: 0,
            barCouncil,
            enrollmentNumber,
            fee: 0,
            rating: 0,
            reviewCount: 0,
            availability: { days: [1, 2, 3, 4, 5], start: '04:30', end: '12:30' },
          },
        } : undefined,
      },
      include: { lawyerProfile: true },
    });
    // Send verification email asynchronously; don't block registration if it fails
    sendVerificationEmail(user).catch((err) => req.log.error({ err }, '[email-verify] Failed to send verification email:'));
    res.status(201).json({ token: signToken(user), user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email or enrollment number already exists' });
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', rateLimit((req) => `login:${clientIp(req)}`, 10, 15 * 60 * 1000), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'client').toUpperCase();
  if (!['CLIENT', 'LAWYER', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Invalid account type' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT is not configured' });
  if (recentLoginFailures(email).length >= 5) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } },
        lawyerProfile: true,
      },
    });
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash || dummyPasswordHash);
    if (!user || user.role !== role || !passwordMatches) {
      failedLogins.set(email, [...recentLoginFailures(email), Date.now()]);
      return res.status(401).json({ error: 'Invalid email, password, or account type' });
    }
    if (user.accountStatus !== 'ACTIVE') return res.status(403).json({ error: 'This account is suspended or deactivated' });
    failedLogins.delete(email);
    res.json({ token: signToken(user), user: serializeUser(user) });
  } catch {
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await userWithPayments(req.user.id);
    res.json({ user: serializeUser(user) });
  } catch {
    res.status(500).json({ error: 'Unable to load account' });
  }
});

app.post('/api/auth/send-verification-email', authenticate, async (req, res) => {
  try {
    if (req.user.emailVerifiedAt) return res.status(400).json({ error: 'Email is already verified' });
    await sendVerificationEmail(req.user);
    res.json({ message: 'Verification email sent' });
  } catch (error) {
    req.log.error({ err: error }, '[email-verify] Resend verification failed:');
    res.status(500).json({ error: 'Unable to send verification email' });
  }
});

app.post('/api/auth/verify-email', async (req, res) => {
  const token = String(req.query.token || req.body.token || '');
  if (!token) return res.status(400).json({ error: 'Verification token is required' });
  try {
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired' });
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    res.json({ verified: true, email: record.user.email });
  } catch {
    res.status(500).json({ error: 'Unable to verify email' });
  }
});

app.post('/api/auth/forgot-password', rateLimit((req) => `forgot:${clientIp(req)}`, 5, 15 * 60 * 1000), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  try {
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (user && !isDeploymentAdminEmail(user.email)) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.passwordResetToken.upsert({
        where: { userId: user.id },
        update: { token, expiresAt, usedAt: null },
        create: { userId: user.id, token, expiresAt },
      });
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your password - Law Writer',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #701f2f;">Reset your password</h2>
            <p>We received a request to reset the password for your Law Writer account. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display: inline-block; background: #701f2f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a>
            <p style="margin-top: 24px; font-size: 12px; color: #666;">If you didn't request this, you can ignore this email — your password won't change.</p>
          </div>
        `,
        text: `Reset your Law Writer password by opening this link (expires in 1 hour): ${resetUrl}. If you didn't request this, ignore this email.`,
      });
    }
  } catch (err) {
    req.log.error({ err }, '[forgot-password] Failed:');
  }
  // Always succeed — do not reveal whether the account exists
  res.json({ ok: true });
});

app.post('/api/auth/reset-password', rateLimit((req) => `reset:${clientIp(req)}`, 10, 15 * 60 * 1000), async (req, res) => {
  const token = String(req.body.token || '');
  const password = req.body.password;
  if (!token) {
    return res.status(400).json({ error: 'A valid reset link is required' });
  }
  try {
    const record = await prisma.passwordResetToken.findUnique({ where: { token }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }
    if (isDeploymentAdminEmail(record.user.email)) return res.status(403).json({ error: deploymentPasswordError });
    const error = passwordError(password, record.user.email);
    if (error) return res.status(400).json({ error });
    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({ where: { id: record.id, token, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) return null;
      return tx.user.update({ where: { id: record.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    });
    if (!updated) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    io.in(`user:${record.userId}`).disconnectSockets(true);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to reset password' });
  }
});

app.post('/api/auth/phone/send-otp', authenticate, async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid Indian mobile number' });
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) return res.status(503).json({ error: 'Mobile verification is not configured' });
  if (!allowOtpRequest(req.user.id)) return res.status(429).json({ error: 'Please wait before requesting another OTP' });
  try {
    const query = new URLSearchParams({ template_id: process.env.MSG91_TEMPLATE_ID, mobile: phone });
    const response = await fetch(`https://control.msg91.com/api/v5/otp?${query}`, {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY },
    });
    const result = await response.json();
    if (!response.ok || result.type === 'error') return res.status(502).json({ error: 'Unable to send OTP' });
    await prisma.user.update({ where: { id: req.user.id }, data: { phone, phoneVerifiedAt: null } });
    res.json({ message: 'OTP sent', phone: `******${phone.slice(-4)}` });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This mobile number is already linked to another account' });
    res.status(502).json({ error: 'Unable to send OTP' });
  }
});

app.post('/api/auth/phone/verify-otp', authenticate, async (req, res) => {
  const otp = String(req.body.otp || '').trim();
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.phone || !/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: 'Enter the OTP sent to your mobile number' });
  if (!process.env.MSG91_AUTH_KEY) return res.status(503).json({ error: 'Mobile verification is not configured' });
  try {
    const query = new URLSearchParams({ otp, mobile: user.phone });
    const response = await fetch(`https://control.msg91.com/api/v5/otp/verify?${query}`, { headers: { authkey: process.env.MSG91_AUTH_KEY } });
    const result = await response.json();
    if (!response.ok || result.type !== 'success') return res.status(400).json({ error: 'The OTP is invalid or expired' });
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    const updatedUser = await userWithPayments(user.id);
    res.json({ user: serializeUser(updatedUser) });
  } catch {
    res.status(502).json({ error: 'Unable to verify OTP' });
  }
});

const serializeLawyer = (lawyer) => ({
  id: lawyer.id,
  slug: lawyer.slug,
  name: lawyer.name,
  title: lawyer.title,
  bio: lawyer.bio,
  practiceAreas: lawyer.practiceAreas,
  languages: lawyer.languages,
  experienceYears: lawyer.experienceYears,
  barCouncil: lawyer.barCouncil,
  enrollmentNumber: lawyer.enrollmentNumber,
  fee: lawyer.fee,
  documentFeePercent: lawyer.documentFeePercent,
  rating: lawyer.rating,
  reviewCount: lawyer.reviewCount,
  isVerified: lawyer.isVerified,
  approvalStatus: lawyer.approvalStatus.toLowerCase(),
  rejectionReason: lawyer.rejectionReason || undefined,
  avatarUrl: lawyer.avatarUrl,
  availability: lawyer.availability,
  reviews: (lawyer.reviews || []).map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment || '',
    createdAt: review.createdAt,
    clientName: review.user?.name || 'Client',
  })),
});

const serializeConsultation = (consultation) => ({
  id: consultation.id,
  startsAt: consultation.startsAt,
  endsAt: consultation.endsAt,
  topic: consultation.topic,
  notes: consultation.notes,
  mode: consultation.mode.toLowerCase(),
  package: consultation.package.toLowerCase(),
  status: consultation.status.toLowerCase(),
  meetingUrl: meetings.publicMeetingUrl(consultation),
  meetingProvider: consultation.mode === 'CALL' && meetings.isJaasMeeting(consultation) ? 'jaas' : undefined,
  transcript: consultation.transcript || '',
  lawyer: serializeLawyer(consultation.lawyer),
  client: consultation.user ? { id: consultation.user.id, name: consultation.user.name, email: consultation.user.email } : undefined,
  review: consultation.review ? {
    id: consultation.review.id,
    rating: consultation.review.rating,
    comment: consultation.review.comment || '',
    createdAt: consultation.review.createdAt,
  } : undefined,
  canReview: consultation.payment?.status === 'PAID' && consultation.endsAt <= new Date() && ['BOOKED', 'COMPLETED'].includes(consultation.status) && !consultation.review,
});

const serializeDeliverable = (deliverable, { includeDocument = false } = {}) => ({
  id: deliverable.id,
  consultationId: deliverable.consultationId,
  documentId: deliverable.documentId,
  title: deliverable.title,
  content: deliverable.content,
  status: deliverable.status.toLowerCase(),
  deliveredAt: deliverable.deliveredAt,
  createdAt: deliverable.createdAt,
  ...(includeDocument && deliverable.document ? { document: deliverable.document } : {}),
});

const translationLanguages = new Map([
  ['en', 'English'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['te', 'Telugu'], ['mr', 'Marathi'],
  ['ta', 'Tamil'], ['ur', 'Urdu'], ['gu', 'Gujarati'], ['kn', 'Kannada'], ['ml', 'Malayalam'],
  ['pa', 'Punjabi'], ['or', 'Odia'], ['as', 'Assamese'], ['ne', 'Nepali'], ['sd', 'Sindhi'],
  ['kok', 'Konkani'], ['ks', 'Kashmiri'], ['doi', 'Dogri'], ['mni', 'Manipuri'], ['sa', 'Sanskrit'],
  ['bho', 'Bhojpuri'], ['raj', 'Rajasthani'],
]);

const deepseekChat = async (systemPrompt, userPrompt) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek API error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
};

app.put('/api/lawyer/profile', authenticate, requireRole('LAWYER'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const title = String(req.body.title || '').trim();
  const bio = String(req.body.bio || '').trim();
  const practiceAreas = Array.isArray(req.body.practiceAreas) ? [...new Set(req.body.practiceAreas.map((value) => String(value).trim()).filter(Boolean))] : [];
  const languages = Array.isArray(req.body.languages) ? [...new Set(req.body.languages.map((value) => String(value).trim()).filter(Boolean))] : [];
  const experienceYears = Number(req.body.experienceYears);
  const barCouncil = String(req.body.barCouncil || '').trim();
  const enrollmentNumber = String(req.body.enrollmentNumber || '').trim();
  const fee = Number(req.body.fee);
  const documentFeePercent = Number(req.body.documentFeePercent);
  const avatarUrl = String(req.body.avatarUrl || '').trim() || null;
  const availability = req.body.availability;
  const validAvailability = availability && Array.isArray(availability.days) && availability.days.length > 0
    && availability.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && /^\d{2}:\d{2}$/.test(availability.start) && /^\d{2}:\d{2}$/.test(availability.end) && availability.start < availability.end;
  if (!name || !title || bio.length < 40 || bio.length > 2000 || !practiceAreas.length || !languages.length
    || !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80
    || !barCouncil || !isPlausibleEnrollmentNumber(enrollmentNumber) || !Number.isInteger(fee) || fee < 100
    || !Number.isInteger(documentFeePercent) || documentFeePercent < 0 || documentFeePercent > 500
    || (avatarUrl && !/^https:\/\//i.test(avatarUrl)) || !validAvailability) {
    return res.status(400).json({ error: 'Complete all professional profile fields with valid information' });
  }
  try {
    const current = await prisma.lawyer.findUnique({ where: { userId: req.user.id } });
    if (!current) return res.status(404).json({ error: 'Lawyer profile not found' });
    const credentialsChanged = current.barCouncil !== barCouncil || current.enrollmentNumber !== enrollmentNumber;
    const lawyer = await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: req.user.id }, data: { name } });
      return transaction.lawyer.update({
        where: { userId: req.user.id },
        data: {
          name, title, bio, practiceAreas, languages, experienceYears, barCouncil, enrollmentNumber, fee, documentFeePercent, avatarUrl,
          availability: { days: [...new Set(availability.days)].sort(), start: availability.start, end: availability.end },
          approvalStatus: credentialsChanged || current.approvalStatus !== 'APPROVED' ? 'PENDING' : 'APPROVED',
          isVerified: credentialsChanged ? false : current.isVerified,
          rejectionReason: null,
        },
      });
    });
    const user = await userWithPayments(req.user.id);
    res.json({ lawyer: serializeLawyer(lawyer), user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This enrollment number is already in use' });
    res.status(500).json({ error: 'Unable to save lawyer profile' });
  }
});

app.post('/api/admin/consultations/:id/refund', authenticate, requireRole('ADMIN'), rateLimit(req => `admin-refund:${req.user.id}`, 10, 15 * 60 * 1000), async (req, res) => {
  const { reason, note } = req.body;
  if (!['LAWYER_NO_SHOW', 'TECHNICAL_FAILURE', 'OTHER'].includes(reason) || typeof note !== 'string' || note.trim().length < 10 || note.trim().length > 500) return res.status(400).json({ error: 'Choose a refund reason and provide a note of 10–500 characters' });
  try {
    const payment = await payments.adminRefund(req.params.id, req.user.id, reason, note.trim());
    res.json({ payment });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to request refund' });
  }
});

app.post('/api/admin/payments/:id/reconcile', authenticate, requireRole('ADMIN'), rateLimit(req => `admin-reconcile:${req.user.id}`, 10, 15 * 60 * 1000), async (req, res) => {
  try { res.json(await payments.reconcile(req.params.id, req.user.id)); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to reconcile payment' }); }
});

app.post('/api/admin/payments/:id/resolve', authenticate, requireRole('ADMIN'), rateLimit(req => `admin-resolve:${req.user.id}`, 10, 15 * 60 * 1000), async (req, res) => {
  const { outcome, note } = req.body;
  if (!['REFUNDED', 'NO_REFUND_NEEDED'].includes(outcome) || typeof note !== 'string' || note.trim().length < 10 || note.trim().length > 500) return res.status(400).json({ error: 'Choose an outcome and provide a note of 10–500 characters' });
  try { res.json(await payments.reconcile(req.params.id, req.user.id, { outcome, note: note.trim() })); }
  catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to resolve payment review' }); }
});

app.get(['/api/admin/payments', '/api/admin/payments/review'], authenticate, requireRole('ADMIN'), rateLimit(req => `admin-payments:${req.user.id}`, 120, 15 * 60 * 1000), async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 200);
  try {
    const now = new Date();
    const reviewWhere = payments.reviewWhere(now);
    const rows = await prisma.payment.findMany({
      where: { ...(req.path.endsWith('/review') ? { AND: [reviewWhere] } : {}), ...(query ? { OR: [{ user: { email: { contains: query, mode: 'insensitive' } } }, { consultationId: { contains: query, mode: 'insensitive' } }, { consultation: { lawyer: { OR: [{ name: { contains: query, mode: 'insensitive' } }, { id: query }] } } }] } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, amount: true, currency: true, status: true, plan: true, razorpayPaymentId: true, razorpayOrderId: true, refundAttemptId: true, refundRequestedAt: true, refundStatus: true, refundError: true, refundId: true, updatedAt: true, user: { select: { email: true, name: true } }, consultation: { select: { id: true, status: true, startsAt: true, lawyer: { select: { name: true } } } } },
    });
    res.json({ payments: rows.map(payment => ({ ...payment, needsReview: payments.needsReview(payment, now) })), reviewCount: await prisma.payment.count({ where: reviewWhere }) });
  } catch { res.status(500).json({ error: 'Unable to load payments' }); }
});

app.get('/api/admin/lawyers', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const lawyers = await prisma.lawyer.findMany({ orderBy: [{ approvalStatus: 'asc' }, { name: 'asc' }] });
    res.json({ lawyers: lawyers.map(serializeLawyer) });
  } catch {
    res.status(500).json({ error: 'Unable to load lawyer applications' });
  }
});

app.patch('/api/admin/lawyers/:id/review', authenticate, requireRole('ADMIN'), async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const rejectionReason = String(req.body.rejectionReason || '').trim();
  if (!['APPROVED', 'REJECTED'].includes(decision) || (decision === 'REJECTED' && rejectionReason.length < 10)) {
    return res.status(400).json({ error: 'Choose approve or provide a rejection reason of at least 10 characters' });
  }
  try {
    const application = await prisma.lawyer.findUnique({ where: { id: req.params.id } });
    if (!application) return res.status(404).json({ error: 'Lawyer profile not found' });
    if (application.approvalStatus !== 'PENDING') return res.status(409).json({ error: 'Only pending applications can be reviewed' });
    const lawyer = await prisma.lawyer.update({
      where: { id: req.params.id },
      data: {
        approvalStatus: decision,
        isVerified: decision === 'APPROVED',
        rejectionReason: decision === 'REJECTED' ? rejectionReason : null,
      },
    });
    res.json({ lawyer: serializeLawyer(lawyer) });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Lawyer profile not found' });
    res.status(500).json({ error: 'Unable to review lawyer profile' });
  }
});

app.get('/api/admin/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  const query = String(req.query.q || '').trim();
  const role = String(req.query.role || '').toUpperCase();
  const status = String(req.query.status || '').toUpperCase();
  const where = {
    role: { not: 'ADMIN' },
    ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] } : {}),
    ...(['CLIENT', 'LAWYER'].includes(role) ? { role } : {}),
    ...(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status) ? { accountStatus: status } : {}),
  };
  try {
    const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { lawyerProfile: true } });
    res.json({ users: users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase(), accountStatus: user.accountStatus.toLowerCase(), statusReason: user.statusReason || '', createdAt: user.createdAt, lawyerProfile: user.lawyerProfile ? serializeLawyer(user.lawyerProfile) : undefined })) });
  } catch {
    res.status(500).json({ error: 'Unable to load users' });
  }
});

app.patch('/api/admin/users/:id/status', authenticate, requireRole('ADMIN'), async (req, res) => {
  const status = String(req.body.status || '').toUpperCase();
  const reason = String(req.body.reason || '').trim();
  if (!['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(status) || (status !== 'ACTIVE' && reason.length < 10) || reason.length > 500) {
    return res.status(400).json({ error: 'Choose a valid status and provide a reason of 10–500 characters' });
  }
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'ADMIN') return res.status(403).json({ error: 'Administrator accounts cannot be changed here' });
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: target.id }, data: { accountStatus: status, statusReason: status === 'ACTIVE' ? null : reason, statusChangedAt: new Date() } });
      await tx.adminAuditLog.create({ data: { adminId: req.user.id, targetUserId: target.id, action: `ACCOUNT_${status}`, reason: reason || 'Account reactivated by administrator' } });
      return updated;
    });
    if (status !== 'ACTIVE') io.in(`user:${target.id}`).disconnectSockets(true);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase(), accountStatus: user.accountStatus.toLowerCase(), statusReason: user.statusReason || '', createdAt: user.createdAt } });
  } catch {
    res.status(500).json({ error: 'Unable to update account status' });
  }
});

app.get('/api/admin/reviews', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const reviews = await prisma.lawyerReview.findMany({ include: { user: { select: { name: true } }, lawyer: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ reviews: reviews.map((review) => ({ id: review.id, rating: review.rating, comment: review.comment || '', isVisible: review.isVisible, moderationReason: review.moderationReason || '', createdAt: review.createdAt, clientName: review.user.name, lawyerName: review.lawyer.name })) });
  } catch {
    res.status(500).json({ error: 'Unable to load reviews' });
  }
});

app.patch('/api/admin/reviews/:id/moderation', authenticate, requireRole('ADMIN'), async (req, res) => {
  const isVisible = Boolean(req.body.isVisible);
  const reason = String(req.body.reason || '').trim();
  if (!isVisible && (reason.length < 10 || reason.length > 500)) return res.status(400).json({ error: 'Provide a moderation reason of 10–500 characters' });
  try {
    const review = await prisma.lawyerReview.update({ where: { id: req.params.id }, data: { isVisible, moderationReason: isVisible ? null : reason } });
    const aggregate = await prisma.lawyerReview.aggregate({ where: { lawyerId: review.lawyerId, isVisible: true }, _avg: { rating: true }, _count: true });
    await prisma.lawyer.update({ where: { id: review.lawyerId }, data: { rating: aggregate._avg.rating || 0, reviewCount: aggregate._count } });
    res.json({ review: { ...review, isVisible } });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Review not found' });
    res.status(500).json({ error: 'Unable to moderate review' });
  }
});

app.get('/api/lawyers', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    const lawyers = await prisma.lawyer.findMany({
      where: { isVerified: true, user: { accountStatus: 'ACTIVE' } },
      include: { reviews: { where: { isVisible: true }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 10 } },
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
    });
    res.json({ lawyers: lawyers.map(serializeLawyer) });
  } catch {
    res.status(500).json({ error: 'Unable to load lawyers' });
  }
});

const expireStalePendingConsultations = () => prisma.consultation.updateMany({
  where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(Date.now() - PENDING_PAYMENT_TTL_MS) } },
  data: { status: 'CANCELLED' },
});

app.get('/api/lawyers/:id/slots', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    await expireStalePendingConsultations();
    const lawyer = await prisma.lawyer.findUnique({ where: { id: req.params.id } });
    if (!lawyer || !lawyer.isVerified) return res.status(404).json({ error: 'Lawyer not found' });
    const from = new Date();
    from.setUTCMinutes(Math.ceil(from.getUTCMinutes() / 10) * 10, 0, 0);
    const until = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const bookings = await prisma.consultation.findMany({
      where: { lawyerId: lawyer.id, status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, startsAt: { gte: from, lt: until } },
      select: { startsAt: true },
    });
    const booked = new Set(bookings.map((booking) => booking.startsAt.toISOString()));
    const schedule = lawyer.availability;
    const slots = [];
    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const date = new Date(from);
      date.setUTCDate(from.getUTCDate() + dayOffset);
      if (!schedule.days.includes(date.getUTCDay())) continue;
      const [startHour, startMinute] = schedule.start.split(':').map(Number);
      const [endHour, endMinute] = schedule.end.split(':').map(Number);
      const cursor = new Date(date);
      cursor.setUTCHours(startHour, startMinute, 0, 0);
      const end = new Date(date);
      end.setUTCHours(endHour, endMinute, 0, 0);
      while (cursor < end) {
        if (cursor >= from && !booked.has(cursor.toISOString())) slots.push(cursor.toISOString());
        cursor.setUTCMinutes(cursor.getUTCMinutes() + 10);
      }
    }
    res.json({ slots });
  } catch {
    res.status(500).json({ error: 'Unable to load availability' });
  }
});

app.get('/api/lawyer/consultations', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const lawyer = await prisma.lawyer.findUnique({ where: { userId: req.user.id } });
    if (!lawyer) return res.status(404).json({ error: 'Lawyer profile not found' });
    const consultations = await prisma.consultation.findMany({
      where: { lawyerId: lawyer.id },
      include: { lawyer: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ consultations: consultations.map(serializeConsultation) });
  } catch {
    res.status(500).json({ error: 'Unable to load consultations' });
  }
});

app.get('/api/consultations', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    await expireStalePendingConsultations();
    const consultations = await prisma.consultation.findMany({
      where: { userId: req.user.id },
      include: { lawyer: true, payment: true, review: true },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ consultations: consultations.map(serializeConsultation) });
  } catch {
    res.status(500).json({ error: 'Unable to load consultations' });
  }
});

app.post('/api/consultations', authenticate, requireRole('CLIENT'), async (req, res) => {
  const { keyId, keySecret } = razorpayCredentials();
  if (!keyId || !keySecret) return res.status(500).json({ error: 'Razorpay is not configured' });
  const lawyerId = String(req.body.lawyerId || '');
  const topic = String(req.body.topic || '').trim();
  const notes = String(req.body.notes || '').trim();
  const mode = String(req.body.mode || 'chat').toUpperCase();
  const packageInput = String(req.body.package || '').toUpperCase();
  const startsAt = new Date(req.body.startsAt);
  const consultationPackage = mode === 'CHAT' ? 'CALL_ONLY' : (['CALL_ONLY', 'CALL_WITH_DOCUMENT'].includes(packageInput) ? packageInput : null);
  if (!lawyerId || !['CHAT', 'CALL'].includes(mode) || !consultationPackage || !topic || topic.length > 100 || notes.length < 10 || notes.length > 1000 || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ error: 'Choose a slot, consultation package, and provide a topic and 10–1000 character summary' });
  }
  if (startsAt.getTime() < Date.now() + 5 * 60 * 1000) return res.status(400).json({ error: 'This slot is no longer available' });
  if (!req.user.emailVerifiedAt) return res.status(403).json({ error: 'Please verify your email address before booking a consultation' });
  const endsAt = new Date(startsAt.getTime() + 10 * 60 * 1000);
  let reservationId;
  try {
    const lawyer = await prisma.lawyer.findUnique({ where: { id: lawyerId } });
    if (!lawyer || !lawyer.isVerified) return res.status(404).json({ error: 'Lawyer not found' });
    const documentFee = consultationPackage === 'CALL_WITH_DOCUMENT' ? Math.round(lawyer.fee * (lawyer.documentFeePercent / 100)) : 0;
    const totalFee = lawyer.fee + documentFee;
    const schedule = lawyer.availability;
    const [startHour, startMinute] = schedule.start.split(':').map(Number);
    const [endHour, endMinute] = schedule.end.split(':').map(Number);
    const minuteOfDay = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
    if (!schedule.days.includes(startsAt.getUTCDay()) || minuteOfDay < startHour * 60 + startMinute || minuteOfDay + 10 > endHour * 60 + endMinute || startsAt.getUTCMinutes() % 10 !== 0) {
      return res.status(400).json({ error: 'Invalid consultation slot' });
    }
    await expireStalePendingConsultations();
    const overlapping = await prisma.consultation.findFirst({
      where: { userId: req.user.id, status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (overlapping) return res.status(409).json({ error: 'You already have a consultation at this time' });
    const consultation = await prisma.consultation.create({
      data: { userId: req.user.id, lawyerId, startsAt, endsAt, topic, notes, mode, package: consultationPackage, status: 'PENDING_PAYMENT' },
      include: { lawyer: true },
    });
    reservationId = consultation.id;
    const order = await razorpayRequest('POST', '/v1/orders', {
      amount: totalFee,
      currency: 'INR',
      receipt: `consultation_${consultation.id}`,
      notes: { consultationId: consultation.id, userId: req.user.id },
    });
    if (!order.id || order.amount !== totalFee || order.currency !== 'INR') throw new Error('Invalid Razorpay order');
    await prisma.payment.create({
      data: {
        userId: req.user.id,
        razorpayOrderId: order.id,
        plan: 'CONSULTATION',
        amount: totalFee,
        consultationId: consultation.id,
      },
    });
    res.status(201).json({
      consultation: serializeConsultation(consultation),
      order: { orderId: order.id, amount: order.amount, currency: order.currency, keyId },
    });
  } catch (error) {
    if (reservationId) {
      try {
        await prisma.consultation.updateMany({ where: { id: reservationId, status: 'PENDING_PAYMENT', payment: { is: null } }, data: { status: 'CANCELLED' } });
      } catch (err) {
        req.log.error({ err, consultationId: reservationId }, 'Unable to release failed payment reservation');
      }
    }
    if (error.code === 'P2002') return res.status(409).json({ error: 'This slot was just booked. Please choose another.' });
    res.status(500).json({ error: 'Unable to book consultation' });
  }
});

app.post('/api/consultations/:id/verify-payment', authenticate, requireRole('CLIENT'), async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!payments.verifySignature(orderId, paymentId, signature, razorpayCredentials().keySecret)) return res.status(400).json({ error: 'Invalid payment signature' });
  try {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId, userId: req.user.id, consultationId: req.params.id },
      include: { consultation: { include: { lawyer: true } } },
    });
    if (!payment || !payment.consultation) return res.status(400).json({ error: 'Unknown payment order' });
    if (payment.status === 'PAID' && payment.razorpayPaymentId === paymentId && payment.consultation.status === 'BOOKED') {
      return res.json({ verified: true, consultation: serializeConsultation(payment.consultation) });
    }

    const entity = await razorpayRequest('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    if (entity.id !== paymentId) return res.status(400).json({ error: 'Payment ID mismatch' });
    await payments.settle(payment, entity);
    const consultation = await prisma.consultation.findUnique({ where: { id: req.params.id }, include: { lawyer: true } });
    if (consultation.status !== 'BOOKED') return res.status(409).json({ error: 'The reservation is unavailable. The payment refund has been requested or flagged for support.' });
    res.json({ verified: true, consultation: serializeConsultation(consultation) });
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'P2025' || error.message === 'Payment has already been applied') {
      return res.status(409).json({ error: 'Payment has already been applied' });
    }
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to verify payment' });
  }
});

app.get('/api/consultations/:id/meeting', authenticate, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const consultation = await prisma.consultation.findUnique({ where: { id: req.params.id }, include: { lawyer: true } });
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    if (consultation.userId !== req.user.id && consultation.lawyer.userId !== req.user.id) return res.status(403).json({ error: 'Only consultation participants may join' });
    if (consultation.mode !== 'CALL' || consultation.status !== 'BOOKED') return res.status(409).json({ error: 'A booked call consultation is required' });
    const now = Date.now();
    if (now < new Date(consultation.startsAt).getTime() - 10 * 60000 || now >= new Date(consultation.endsAt).getTime()) {
      return res.status(403).json({ error: 'Meeting opens 10 minutes before the booked session and closes when it ends' });
    }
    if (!meetings.jaasEnabled()) {
      const url = meetings.publicMeetingUrl(consultation);
      if (!url) return res.status(409).json({ error: 'Meeting is unavailable' });
      return res.json({ url });
    }
    let room = meetings.storedRoom(consultation.meetingUrl);
    if (!room) {
      const location = `jaas:${meetings.randomRoom()}`;
      const updated = await prisma.consultation.updateMany({ where: { id: consultation.id, status: 'BOOKED', meetingUrl: consultation.meetingUrl }, data: { meetingUrl: location } });
      if (updated.count === 1) room = meetings.storedRoom(location);
      else {
        const current = await prisma.consultation.findUnique({ where: { id: consultation.id } });
        if (current?.status === 'BOOKED') room = meetings.storedRoom(current.meetingUrl);
      }
      if (!room) return res.status(409).json({ error: 'Meeting changed. Please try again.' });
    }
    res.json({ url: meetings.mintMeetingUrl(consultation, req.user, room) });
  } catch (err) {
    req.log.error({ err }, 'Unable to create meeting link');
    res.status(503).json({ error: 'Meeting service is unavailable. Please try again later.' });
  }
});

app.post('/api/consultations/:id/review', authenticate, requireRole('CLIENT'), async (req, res) => {
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 2000) return res.status(400).json({ error: 'Rating must be 1–5 and the review must be under 2000 characters' });
  try {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.id, userId: req.user.id, endsAt: { lte: new Date() }, status: { in: ['BOOKED', 'COMPLETED'] }, payment: { status: 'PAID' } },
      include: { review: true },
    });
    if (!consultation) return res.status(403).json({ error: 'Only completed paid consultations can be reviewed' });
    if (consultation.review) return res.status(409).json({ error: 'This consultation has already been reviewed' });
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.lawyerReview.create({ data: { consultationId: consultation.id, lawyerId: consultation.lawyerId, userId: req.user.id, rating, comment: comment || null } });
      await tx.consultation.update({ where: { id: consultation.id }, data: { status: 'COMPLETED' } });
      const aggregate = await tx.lawyerReview.aggregate({ where: { lawyerId: consultation.lawyerId, isVisible: true }, _avg: { rating: true }, _count: true });
      await tx.lawyer.update({ where: { id: consultation.lawyerId }, data: { rating: aggregate._avg.rating || 0, reviewCount: aggregate._count } });
      return created;
    });
    res.status(201).json({ review: { id: review.id, rating: review.rating, comment: review.comment || '', createdAt: review.createdAt } });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This consultation has already been reviewed' });
    res.status(500).json({ error: 'Unable to save review' });
  }
});

app.get('/api/consultations/:id/messages', authenticate, async (req, res) => {
  try {
    const consultation = await prisma.consultation.findFirst({
      where: {
        id: req.params.id,
        mode: 'CHAT',
        ...(req.user.role === 'LAWYER' ? { lawyer: { userId: req.user.id } } : { userId: req.user.id }),
      },
      select: { id: true },
    });
    if (!consultation) return res.status(404).json({ error: 'Chat consultation not found' });
    const messages = await prisma.consultationMessage.findMany({
      where: { consultationId: consultation.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages: messages.map((message) => ({ ...message, sender: message.sender.toLowerCase() })) });
  } catch {
    res.status(500).json({ error: 'Unable to load messages' });
  }
});

app.post('/api/consultations/:id/messages', authenticate, async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content || content.length > 2000) return res.status(400).json({ error: 'Message must be between 1 and 2000 characters' });
  try {
    const now = new Date();
    const consultation = await prisma.consultation.findFirst({
      where: {
        id: req.params.id,
        ...(req.user.role === 'LAWYER' ? { lawyer: { userId: req.user.id } } : { userId: req.user.id }),
        mode: 'CHAT',
        status: 'BOOKED',
        startsAt: { lte: new Date(now.getTime() + 10 * 60 * 1000) },
        endsAt: { gt: now },
      },
      select: { id: true },
    });
    if (!consultation) return res.status(400).json({ error: 'Chat opens 10 minutes before the booked session and closes when it ends' });
    const message = await prisma.consultationMessage.create({
      data: { consultationId: consultation.id, sender: req.user.role === 'LAWYER' ? 'LAWYER' : 'USER', content },
    });
    const serialized = { ...message, sender: message.sender.toLowerCase() };
    io.to(`consultation:${consultation.id}`).emit('chat:message', serialized);
    res.status(201).json({ message: serialized });
  } catch {
    res.status(500).json({ error: 'Unable to send message' });
  }
});

const findParticipantConsultation = (consultationId, user) => prisma.consultation.findFirst({
  where: {
    id: consultationId,
    status: { in: ['BOOKED', 'COMPLETED'] },
    ...(user.role === 'LAWYER' ? { lawyer: { userId: user.id } } : { userId: user.id }),
  },
});

app.post('/api/consultations/:id/transcript', authenticate, async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text || text.length > 20000) return res.status(400).json({ error: 'Transcript text must be between 1 and 20000 characters' });
  try {
    const consultation = await findParticipantConsultation(req.params.id, req.user);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const speaker = req.user.role === 'LAWYER' ? 'Lawyer' : 'Client';
    const updated = await prisma.consultation.update({
      where: { id: consultation.id },
      data: { transcript: (consultation.transcript ? `${consultation.transcript}\n` : '') + `${speaker}: ${text}` },
    });
    res.json({ transcript: updated.transcript });
  } catch {
    res.status(500).json({ error: 'Unable to save transcript' });
  }
});

app.put('/api/consultations/:id/transcript', authenticate, requireRole('LAWYER'), async (req, res) => {
  const transcript = String(req.body.transcript || '');
  if (transcript.length > 100000) return res.status(400).json({ error: 'Transcript is too long' });
  try {
    const consultation = await findParticipantConsultation(req.params.id, req.user);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const updated = await prisma.consultation.update({
      where: { id: consultation.id },
      data: { transcript },
    });
    res.json({ transcript: updated.transcript });
  } catch {
    res.status(500).json({ error: 'Unable to update transcript' });
  }
});

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { consultation: { select: { id: true, topic: true, mode: true, startsAt: true } } },
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, read: false },
    });
    res.json({ notifications, unreadCount });
  } catch {
    res.status(500).json({ error: 'Unable to load notifications' });
  }
});

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true },
    });
    if (!notification.count) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to update notification' });
  }
});

app.patch('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to update notifications' });
  }
});

app.get('/api/notifications/vapid-public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(500).json({ error: 'Push notifications are not configured' });
  res.json({ publicKey: key });
});

app.post('/api/notifications/subscribe', authenticate, async (req, res) => {
  const endpoint = String(req.body.endpoint || '');
  const p256dh = String(req.body.keys?.p256dh || '');
  const auth = String(req.body.keys?.auth || '');
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Invalid subscription' });
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.user.id, p256dh, auth },
      create: { userId: req.user.id, endpoint, p256dh, auth },
    });
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to save subscription' });
  }
});

app.delete('/api/notifications/subscribe', authenticate, async (req, res) => {
  const endpoint = String(req.body.endpoint || '');
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Unable to remove subscription' });
  }
});

app.patch('/api/users/notification-preferences', authenticate, async (req, res) => {
  const emailNotifications = typeof req.body.emailNotifications === 'boolean' ? req.body.emailNotifications : undefined;
  const pushNotifications = typeof req.body.pushNotifications === 'boolean' ? req.body.pushNotifications : undefined;
  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { ...(emailNotifications !== undefined && { emailNotifications }), ...(pushNotifications !== undefined && { pushNotifications }) },
    });
    res.json({ emailNotifications: updated.emailNotifications, pushNotifications: updated.pushNotifications });
  } catch {
    res.status(500).json({ error: 'Unable to update preferences' });
  }
});

app.post('/api/consultations/:id/draft', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const consultation = await prisma.consultation.findFirst({
      where: {
        id: req.params.id,
        lawyer: { userId: req.user.id },
        status: { in: ['BOOKED', 'COMPLETED'] },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        user: { select: { name: true } },
      },
    });
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

    const sections = [
      consultation.notes ? `Client's booking notes:\n${consultation.notes}` : '',
      consultation.messages.length
        ? `Chat transcript:\n${consultation.messages.map((message) => `${message.sender === 'LAWYER' ? 'Lawyer' : 'Client'}: ${message.content}`).join('\n')}`
        : '',
      consultation.transcript ? `Voice transcript:\n${consultation.transcript}` : '',
    ].filter(Boolean);
    if (!sections.length) return res.status(400).json({ error: 'There is no consultation content to draft from yet' });

    const requestedTitle = String(req.body.title || '').trim();
    const content = await deepseekChat(
      'You are a drafting assistant for an Indian advocate. Draft a professional legal document in GitHub-flavored markdown based on the consultation material provided. ' +
      'Use only the facts present in the material; where information a court would expect is missing, insert a clearly marked placeholder like [TODO: client\'s full address]. ' +
      'Do not invent names, dates, case numbers, or citations. Do not include explanations or commentary outside the document itself.',
      `Consultation topic: ${consultation.topic}\nClient name: ${consultation.user?.name || 'Client'}\n\n${sections.join('\n\n')}`
    );
    if (!content) return res.status(502).json({ error: 'The drafting service returned an empty document' });

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          userId: req.user.id,
          title: requestedTitle || `Draft – ${consultation.topic}`.slice(0, 120),
          content,
          category: 'consultation',
          language: 'en',
        },
      });
      const deliverable = await tx.deliverable.create({
        data: { consultationId: consultation.id, documentId: document.id, title: document.title },
        include: { document: true },
      });
      return { document, deliverable };
    });
    res.status(201).json({
      document: result.document,
      deliverable: serializeDeliverable(result.deliverable, { includeDocument: true }),
    });
  } catch (error) {
    if (error.message?.startsWith('DeepSeek')) return res.status(502).json({ error: error.message });
    res.status(500).json({ error: 'Unable to generate draft' });
  }
});

app.get('/api/consultations/:id/deliverables', authenticate, async (req, res) => {
  try {
    const consultation = await findParticipantConsultation(req.params.id, req.user)
      || await prisma.consultation.findFirst({
        where: {
          id: req.params.id,
          ...(req.user.role === 'LAWYER' ? { lawyer: { userId: req.user.id } } : { userId: req.user.id }),
        },
      });
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const isLawyer = req.user.role === 'LAWYER';
    const deliverables = await prisma.deliverable.findMany({
      where: { consultationId: consultation.id, ...(isLawyer ? {} : { status: 'DELIVERED' }) },
      include: { document: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ deliverables: deliverables.map((deliverable) => serializeDeliverable(deliverable, { includeDocument: isLawyer })) });
  } catch {
    res.status(500).json({ error: 'Unable to load deliverables' });
  }
});

app.post('/api/consultations/:id/deliverables/:deliverableId/translate', authenticate, requireRole('LAWYER'), async (req, res) => {
  const languageCode = String(req.body.language || '').trim();
  const languageName = translationLanguages.get(languageCode);
  if (!languageName) return res.status(400).json({ error: 'Select a supported translation language' });

  try {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.id, lawyer: { userId: req.user.id } },
    });
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const deliverable = await prisma.deliverable.findFirst({
      where: { id: req.params.deliverableId, consultationId: consultation.id },
      include: { document: true },
    });
    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });

    const sourceContent = deliverable.document?.content || deliverable.content;
    if (!sourceContent.trim()) return res.status(400).json({ error: 'The draft has no content to translate' });
    const content = await deepseekChat(
      `You are a precise legal translator. Translate the legal document into ${languageName}. Preserve its meaning, names, dates, citations, placeholders, headings, lists, and GitHub-flavored markdown structure. Do not add, remove, summarize, explain, or provide commentary. Output only the translated document.`,
      sourceContent
    );
    if (!content) return res.status(502).json({ error: 'The translation service returned an empty document' });

    const title = `${deliverable.title} – ${languageName}`.slice(0, 120);
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: { userId: req.user.id, title, content, category: 'consultation', language: languageCode },
      });
      const translatedDeliverable = await tx.deliverable.create({
        data: { consultationId: consultation.id, documentId: document.id, title },
        include: { document: true },
      });
      return { document, deliverable: translatedDeliverable };
    });
    res.status(201).json({
      document: result.document,
      deliverable: serializeDeliverable(result.deliverable, { includeDocument: true }),
    });
  } catch (error) {
    if (error.message?.startsWith('DeepSeek')) return res.status(502).json({ error: error.message });
    res.status(500).json({ error: 'Unable to translate document' });
  }
});

app.post('/api/consultations/:id/deliverables/:deliverableId/deliver', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.id, lawyer: { userId: req.user.id } },
    });
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const deliverable = await prisma.deliverable.findFirst({
      where: { id: req.params.deliverableId, consultationId: consultation.id },
      include: { document: true },
    });
    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });
    if (deliverable.status === 'DELIVERED') return res.status(409).json({ error: 'This document has already been delivered' });
    const updated = await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        content: deliverable.document?.content || deliverable.content,
      },
      include: { document: true },
    });
    notifications.createNotification({
      userId: consultation.userId,
      consultationId: consultation.id,
      type: 'DELIVERABLE_READY',
      title: 'Your document is ready',
      body: `"${deliverable.title}" has been delivered for your consultation.`,
      channels: ['IN_APP', 'EMAIL'],
    }).catch((err) => req.log.error({ err }, '[deliver] Failed to send deliverable notification:'));
    res.json({ deliverable: serializeDeliverable(updated, { includeDocument: true }) });
  } catch {
    res.status(500).json({ error: 'Unable to deliver document' });
  }
});

app.patch('/api/consultations/:id/cancel', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    await payments.cancel(req.params.id, req.user.id);
    res.status(204).end();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to cancel consultation' });
  }
});

const razorpayRequest = (method, path, body, headers = {}) => new Promise((resolve, reject) => {
  const { keyId, keySecret } = razorpayCredentials();
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const url = new URL(path.replace(/^\//, ''), `${(process.env.RAZORPAY_API_URL || 'https://api.razorpay.com').replace(/\/$/, '')}/`);
  const transport = url.protocol === 'http:' ? http : https;
  const request = transport.request(url, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  }, (response) => {
    let data = '';
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        return reject(new Error('Invalid response from Razorpay'));
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(Object.assign(new Error(parsed.error?.description || 'Razorpay request failed'), { providerStatus: response.statusCode }));
      }
      resolve(parsed);
    });
  });
  request.on('error', reject);
  request.setTimeout(10000, () => request.destroy(new Error('Razorpay request timed out')));
  if (body) request.write(JSON.stringify(body));
  request.end();
});

app.post('/api/payments/order', authenticate, requireRole('LAWYER'), async (req, res) => {
  const planKey = String(req.body.plan || '');
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });
  const { keyId, keySecret } = razorpayCredentials();
  if (!keyId || !keySecret) {
    return res.status(500).json({ error: 'Razorpay is not configured' });
  }

  try {
    const order = await razorpayRequest('POST', '/v1/orders', {
      amount: plan.amount,
      currency: 'INR',
      receipt: `law_writer_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      notes: { plan: planKey, userId: req.user.id },
    });
    if (!order.id || order.amount !== plan.amount || order.currency !== 'INR') throw new Error('Invalid Razorpay order');
    await prisma.payment.create({
      data: {
        userId: req.user.id,
        razorpayOrderId: order.id,
        plan: planKey.toUpperCase(),
        amount: plan.amount,
      },
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to create payment order' });
  }
});

app.post('/api/payments/verify', authenticate, requireRole('LAWYER'), async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!payments.verifySignature(orderId, paymentId, signature, razorpayCredentials().keySecret)) return res.status(400).json({ error: 'Invalid payment signature' });
  try {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId, userId: req.user.id, consultationId: null },
      include: { user: true },
    });
    if (!payment) return res.status(400).json({ error: 'Unknown payment order' });
    if (payment.status === 'PAID') return res.status(409).json({ error: 'Payment has already been applied' });

    const entity = await razorpayRequest('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    if (entity.id !== paymentId) return res.status(400).json({ error: 'Payment ID mismatch' });
    const result = await payments.settle(payment, entity);
    if (!result.applied) return res.status(409).json({ error: 'Payment has already been applied' });

    const user = await userWithPayments(req.user.id);
    res.json({ verified: true, plan: payment.plan.toLowerCase(), paymentId, user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002' || error.message === 'Payment has already been applied') {
      return res.status(409).json({ error: 'Payment has already been applied' });
    }
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to verify payment' });
  }
});

app.get('/api/documents', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const documents = await prisma.document.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ documents });
  } catch {
    res.status(500).json({ error: 'Unable to load documents' });
  }
});

app.post('/api/documents', authenticate, requireRole('LAWYER'), async (req, res) => {
  const title = String(req.body.title || '').trim() || 'Untitled Document';
  try {
    const document = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      const timedAccess = hasTimedAccess(user);
      if (!timedAccess) {
        const consumed = await tx.user.updateMany({
          where: { id: user.id, documentCredits: { gt: 0 } },
          data: { documentCredits: { decrement: 1 }, subscriptionPlan: 'SINGLE' },
        });
        if (consumed.count !== 1) throw new Error('ACCESS_REQUIRED');
      }
      return tx.document.create({
        data: {
          userId: user.id,
          title,
          content: String(req.body.content || ''),
          templateId: req.body.templateId || null,
          category: req.body.category || null,
          language: req.body.language || 'en',
        },
      });
    });
    const user = await userWithPayments(req.user.id);
    res.status(201).json({ document, user: serializeUser(user) });
  } catch (error) {
    if (error.message === 'ACCESS_REQUIRED') {
      return res.status(402).json({ error: 'Trial expired. Purchase a document credit or monthly plan.' });
    }
    res.status(500).json({ error: 'Unable to create document' });
  }
});

app.patch('/api/documents/:id', authenticate, requireRole('LAWYER'), async (req, res) => {
  const data = {};
  if (typeof req.body.title === 'string' && req.body.title.trim()) data.title = req.body.title.trim();
  if (typeof req.body.content === 'string') data.content = req.body.content;
  if (typeof req.body.language === 'string') data.language = req.body.language;
  try {
    const updated = await prisma.document.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data,
    });
    if (!updated.count) return res.status(404).json({ error: 'Document not found' });
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    res.json({ document });
  } catch {
    res.status(500).json({ error: 'Unable to update document' });
  }
});

app.post('/api/documents/:id/duplicate', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const source = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!source) return res.status(404).json({ error: 'Document not found' });
    req.body = {
      title: `${source.title} (Copy)`,
      content: source.content,
      templateId: source.templateId,
      category: source.category,
      language: source.language,
    };
    const timedAccess = hasTimedAccess(req.user);
    const document = await prisma.$transaction(async (tx) => {
      if (!timedAccess) {
        const consumed = await tx.user.updateMany({
          where: { id: req.user.id, documentCredits: { gt: 0 } },
          data: { documentCredits: { decrement: 1 }, subscriptionPlan: 'SINGLE' },
        });
        if (consumed.count !== 1) throw new Error('ACCESS_REQUIRED');
      }
      return tx.document.create({ data: { ...req.body, userId: req.user.id } });
    });
    const user = await userWithPayments(req.user.id);
    res.status(201).json({ document, user: serializeUser(user) });
  } catch (error) {
    if (error.message === 'ACCESS_REQUIRED') return res.status(402).json({ error: 'Access required' });
    res.status(500).json({ error: 'Unable to duplicate document' });
  }
});

app.delete('/api/documents/:id', authenticate, requireRole('LAWYER'), async (req, res) => {
  try {
    const deleted = await prisma.document.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!deleted.count) return res.status(404).json({ error: 'Document not found' });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Unable to delete document' });
  }
});

app.get('/api/scribe-token', authenticate, rateLimit((req) => `scribe:${req.user.id}`, 60, 60 * 60 * 1000), async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const err = await response.text();
      req.log.error({ err: new Error('ElevenLabs token request failed'), statusCode: response.status }, 'ElevenLabs token error:');
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.json({ token: data.token });
  } catch (err) {
    req.log.error({ err }, 'Token endpoint error:');
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/translate', authenticate, rateLimit((req) => `translate:${req.user.id}`, 120, 60 * 60 * 1000), async (req, res) => {
  const text = String(req.body.text || '');
  const fromLanguage = String(req.body.fromLanguage || '').trim();
  const toLanguage = String(req.body.toLanguage || '').trim();
  if (!text.trim() || !translationLanguages.has(fromLanguage) || !translationLanguages.has(toLanguage)) {
    return res.status(400).json({ error: 'Text and supported from/to languages are required' });
  }
  if (text.length > 10000) return res.status(400).json({ error: 'Text is too long to translate' });
  if (fromLanguage === toLanguage) return res.json({ text });
  try {
    const translated = await deepseekChat(
      `You are a translator. Translate the user's text from ${translationLanguages.get(fromLanguage)} to ${translationLanguages.get(toLanguage)}. Output only the translated text with no explanations, no quotes, no extra formatting.`,
      text
    );
    res.json({ text: translated || text });
  } catch (err) {
    req.log.error({ err }, 'Translate endpoint error:');
    res.status(502).json({ error: 'Translation service unavailable' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

app.use(errorHandler);

const findChatConsultation = (consultationId, user, { withinWindow = false } = {}) => {
  const now = new Date();
  return prisma.consultation.findFirst({
    where: {
      id: consultationId,
      mode: 'CHAT',
      status: 'BOOKED',
      ...(user.role === 'LAWYER' ? { lawyer: { userId: user.id } } : { userId: user.id }),
      ...(withinWindow ? { startsAt: { lte: new Date(now.getTime() + 10 * 60 * 1000) }, endsAt: { gt: now } } : {}),
    },
    select: { id: true },
  });
};

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: true, credentials: true } });
notifications.setSocketIo(io);

const authenticateSocket = async (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token || !process.env.JWT_SECRET) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  return user?.accountStatus === 'ACTIVE' && (payload.tokenVersion ?? 0) === (user.tokenVersion ?? 0) ? user : null;
};

io.use(async (socket, next) => {
  try {
    const user = await authenticateSocket(socket);
    if (!user) return next(new Error('Invalid or expired authentication token'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired authentication token'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);

  socket.on('chat:leave', async (payload, callback) => {
    const consultationId = payload?.consultationId;
    if (typeof consultationId !== 'string' || !consultationId.trim()) return callback?.({ error: 'Consultation ID is required' });
    await socket.leave(`consultation:${consultationId}`);
    callback?.({ ok: true });
  });

  socket.on('chat:join', async (payload, callback) => {
    try {
      const user = await authenticateSocket(socket);
      if (!user) return callback?.({ error: 'Invalid or expired authentication token' });
      socket.user = user;
      const consultationId = String(payload?.consultationId || '');
      const consultation = await findChatConsultation(consultationId, socket.user);
      if (!consultation) return callback?.({ error: 'Chat consultation not found' });
      socket.join(`consultation:${consultation.id}`);
      callback?.({ ok: true });
    } catch (err) {
      logger.error({ err }, 'chat:join error:');
      callback?.({ error: 'Unable to join chat' });
    }
  });

  socket.on('chat:message', async (payload, callback) => {
    try {
      const user = await authenticateSocket(socket);
      if (!user) return callback?.({ error: 'Invalid or expired authentication token' });
      socket.user = user;
      const consultationId = String(payload?.consultationId || '');
      const content = String(payload?.content || '').trim();
      if (!content || content.length > 2000) return callback?.({ error: 'Message must be between 1 and 2000 characters' });
      const consultation = await findChatConsultation(consultationId, socket.user, { withinWindow: true });
      if (!consultation) return callback?.({ error: 'Chat opens 10 minutes before the booked session and closes when it ends' });
      const message = await prisma.consultationMessage.create({
        data: { consultationId: consultation.id, sender: socket.user.role === 'LAWYER' ? 'LAWYER' : 'USER', content },
      });
      io.to(`consultation:${consultation.id}`).emit('chat:message', { ...message, sender: message.sender.toLowerCase() });

      // Notify the other participant
      const fullConsultation = await prisma.consultation.findUnique({
        where: { id: consultation.id },
        include: { user: { select: { id: true, email: true } }, lawyer: { include: { user: { select: { id: true, email: true } } } } },
      });
      if (fullConsultation) {
        const senderName = socket.user.name || (socket.user.role === 'LAWYER' ? 'Lawyer' : 'Client');
        const recipientUserId = socket.user.role === 'LAWYER' ? fullConsultation.userId : fullConsultation.lawyer?.userId;
        if (recipientUserId) {
          await notifications.createNotification({
            userId: recipientUserId,
            consultationId: fullConsultation.id,
            type: 'CHAT_MESSAGE',
            title: `New message from ${senderName}`,
            body: content.length > 120 ? `${content.slice(0, 120)}...` : content,
            channels: ['IN_APP', 'EMAIL'],
          });
        }
      }

      callback?.({ ok: true });
    } catch (err) {
      logger.error({ err }, 'chat:message error:');
      callback?.({ error: 'Unable to send message' });
    }
  });
});

const ensureDeploymentAdmin = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (isReservedEmail(email)) throw new Error('ADMIN_EMAIL cannot use the reserved deleted.invalid domain');
  if (!email || password.length < 12) throw new Error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required together');
  if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('ADMIN_PASSWORD must be at most 72 UTF-8 bytes');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'ADMIN') throw new Error('ADMIN_EMAIL is already assigned to a non-admin account');
  const passwordChanged = existing && !await bcrypt.compare(password, existing.passwordHash);
  const passwordHash = existing && !passwordChanged ? existing.passwordHash : await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name: process.env.ADMIN_NAME || 'Administrator', passwordHash, role: 'ADMIN', tokenVersion: passwordChanged ? { increment: 1 } : undefined },
    create: { email, name: process.env.ADMIN_NAME || 'Administrator', passwordHash, role: 'ADMIN' },
  });
  if (passwordChanged) io.in(`user:${existing.id}`).disconnectSockets(true);
};

module.exports = { app, server, io, ensureDeploymentAdmin };
