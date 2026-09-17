require('dotenv').config();
const crypto = require('crypto');
const https = require('https');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const PLANS = {
  single: { amount: 1000, name: 'Single document' },
  monthly: { amount: 49900, name: 'Monthly subscription' },
};
const TRIAL_DURATION_MS = 2 * 24 * 60 * 60 * 1000;

app.use(express.json());

const serializeUser = (user) => {
  const expiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  const timedAccess = (user.subscriptionPlan === 'TRIAL' || user.subscriptionPlan === 'MONTHLY')
    && expiry
    && expiry.getTime() > Date.now();
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    subscriptionStatus: timedAccess
      ? (user.subscriptionPlan === 'TRIAL' ? 'trial' : 'active')
      : (user.documentCredits > 0 ? 'active' : 'expired'),
    subscriptionPlan: user.subscriptionPlan.toLowerCase(),
    subscriptionExpiry: expiry,
    documentCredits: user.documentCredits,
    appliedPaymentIds: (user.payments || []).map((payment) => payment.razorpayPaymentId).filter(Boolean),
  };
};

const userWithPayments = (id) => prisma.user.findUnique({
  where: { id },
  include: { payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } } },
});

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !process.env.JWT_SECRET) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid authentication token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
};

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: 'Name, email, and a 6-character password are required' });
  }
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT is not configured' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        subscriptionExpiry: new Date(Date.now() + TRIAL_DURATION_MS),
      },
    });
    res.status(201).json({ token: signToken(user.id), user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists' });
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT is not configured' });
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } } },
    });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user.id), user: serializeUser(user) });
  } catch {
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await userWithPayments(req.user.id);
  res.json({ user: serializeUser(user) });
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
  rating: lawyer.rating,
  reviewCount: lawyer.reviewCount,
  isVerified: lawyer.isVerified,
  avatarUrl: lawyer.avatarUrl,
});

const serializeConsultation = (consultation) => ({
  id: consultation.id,
  startsAt: consultation.startsAt,
  endsAt: consultation.endsAt,
  topic: consultation.topic,
  notes: consultation.notes,
  mode: consultation.mode.toLowerCase(),
  status: consultation.status.toLowerCase(),
  meetingUrl: consultation.meetingUrl,
  lawyer: serializeLawyer(consultation.lawyer),
});

app.get('/api/lawyers', authenticate, async (req, res) => {
  try {
    const lawyers = await prisma.lawyer.findMany({ orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }] });
    res.json({ lawyers: lawyers.map(serializeLawyer) });
  } catch {
    res.status(500).json({ error: 'Unable to load lawyers' });
  }
});

app.get('/api/lawyers/:id/slots', authenticate, async (req, res) => {
  try {
    const lawyer = await prisma.lawyer.findUnique({ where: { id: req.params.id } });
    if (!lawyer) return res.status(404).json({ error: 'Lawyer not found' });
    const from = new Date();
    from.setUTCMinutes(Math.ceil(from.getUTCMinutes() / 10) * 10, 0, 0);
    const until = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const bookings = await prisma.consultation.findMany({
      where: { lawyerId: lawyer.id, status: 'BOOKED', startsAt: { gte: from, lt: until } },
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

app.get('/api/consultations', authenticate, async (req, res) => {
  try {
    const consultations = await prisma.consultation.findMany({
      where: { userId: req.user.id },
      include: { lawyer: true },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ consultations: consultations.map(serializeConsultation) });
  } catch {
    res.status(500).json({ error: 'Unable to load consultations' });
  }
});

app.post('/api/consultations', authenticate, async (req, res) => {
  const lawyerId = String(req.body.lawyerId || '');
  const topic = String(req.body.topic || '').trim();
  const notes = String(req.body.notes || '').trim();
  const mode = String(req.body.mode || 'chat').toUpperCase();
  const startsAt = new Date(req.body.startsAt);
  if (!lawyerId || !['CHAT', 'CALL'].includes(mode) || !topic || topic.length > 100 || notes.length < 10 || notes.length > 1000 || Number.isNaN(startsAt.getTime())) {
    return res.status(400).json({ error: 'Choose a slot and provide a topic and 10–1000 character summary' });
  }
  if (startsAt.getTime() < Date.now() + 5 * 60 * 1000) return res.status(400).json({ error: 'This slot is no longer available' });
  const endsAt = new Date(startsAt.getTime() + 10 * 60 * 1000);
  try {
    const lawyer = await prisma.lawyer.findUnique({ where: { id: lawyerId } });
    if (!lawyer) return res.status(404).json({ error: 'Lawyer not found' });
    const schedule = lawyer.availability;
    const [startHour, startMinute] = schedule.start.split(':').map(Number);
    const [endHour, endMinute] = schedule.end.split(':').map(Number);
    const minuteOfDay = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
    if (!schedule.days.includes(startsAt.getUTCDay()) || minuteOfDay < startHour * 60 + startMinute || minuteOfDay + 10 > endHour * 60 + endMinute || startsAt.getUTCMinutes() % 10 !== 0) {
      return res.status(400).json({ error: 'Invalid consultation slot' });
    }
    const overlapping = await prisma.consultation.findFirst({
      where: { userId: req.user.id, status: 'BOOKED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (overlapping) return res.status(409).json({ error: 'You already have a consultation at this time' });
    const existing = await prisma.consultation.findUnique({ where: { lawyerId_startsAt: { lawyerId, startsAt } } });
    let consultation;
    if (existing?.status === 'CANCELLED') {
      consultation = await prisma.consultation.update({
        where: { id: existing.id },
        data: { userId: req.user.id, endsAt, topic, notes, mode, status: 'BOOKED', meetingUrl: null, messages: { deleteMany: {} } },
        include: { lawyer: true },
      });
    } else if (existing) {
      return res.status(409).json({ error: 'This slot was just booked. Please choose another.' });
    } else {
      consultation = await prisma.consultation.create({
        data: { userId: req.user.id, lawyerId, startsAt, endsAt, topic, notes, mode },
        include: { lawyer: true },
      });
    }
    res.status(201).json({ consultation: serializeConsultation(consultation) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This slot was just booked. Please choose another.' });
    res.status(500).json({ error: 'Unable to book consultation' });
  }
});

app.get('/api/consultations/:id/messages', authenticate, async (req, res) => {
  try {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.id, userId: req.user.id, mode: 'CHAT' },
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
        userId: req.user.id,
        mode: 'CHAT',
        status: 'BOOKED',
        startsAt: { lte: new Date(now.getTime() + 10 * 60 * 1000) },
        endsAt: { gt: now },
      },
      select: { id: true },
    });
    if (!consultation) return res.status(400).json({ error: 'Chat opens 10 minutes before the booked session and closes when it ends' });
    const message = await prisma.consultationMessage.create({
      data: { consultationId: consultation.id, sender: 'USER', content },
    });
    res.status(201).json({ message: { ...message, sender: message.sender.toLowerCase() } });
  } catch {
    res.status(500).json({ error: 'Unable to send message' });
  }
});

app.patch('/api/consultations/:id/cancel', authenticate, async (req, res) => {
  try {
    const cancelled = await prisma.consultation.updateMany({
      where: { id: req.params.id, userId: req.user.id, status: 'BOOKED', startsAt: { gt: new Date() } },
      data: { status: 'CANCELLED' },
    });
    if (!cancelled.count) return res.status(400).json({ error: 'Only upcoming booked consultations can be cancelled' });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Unable to cancel consultation' });
  }
});

const razorpayRequest = (method, path, body) => new Promise((resolve, reject) => {
  const credentials = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const request = https.request({
    hostname: 'api.razorpay.com',
    path,
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
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
        return reject(new Error(parsed.error?.description || 'Razorpay request failed'));
      }
      resolve(parsed);
    });
  });
  request.on('error', reject);
  if (body) request.write(JSON.stringify(body));
  request.end();
});

app.post('/api/payments/order', authenticate, async (req, res) => {
  const planKey = String(req.body.plan || '');
  const plan = PLANS[planKey];
  if (!plan) return res.status(400).json({ error: 'Invalid plan' });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: 'Razorpay is not configured' });
  }

  try {
    const order = await razorpayRequest('POST', '/v1/orders', {
      amount: plan.amount,
      currency: 'INR',
      receipt: `law_writer_${Date.now()}`,
      notes: { plan: planKey, userId: req.user.id },
    });
    await prisma.payment.create({
      data: {
        userId: req.user.id,
        razorpayOrderId: order.id,
        plan: planKey.toUpperCase(),
        amount: plan.amount,
      },
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to create payment order' });
  }
});

app.post('/api/payments/verify', authenticate, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  try {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId, userId: req.user.id },
      include: { user: true },
    });
    if (!payment) return res.status(400).json({ error: 'Unknown payment order' });
    if (payment.status === 'PAID') return res.status(409).json({ error: 'Payment has already been applied' });

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(String(signature || ''));
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'CREATED' },
        data: { status: 'PAID', razorpayPaymentId: paymentId },
      });
      if (claimed.count !== 1) throw new Error('Payment has already been applied');
      if (payment.plan === 'MONTHLY') {
        const currentExpiry = payment.user.subscriptionExpiry?.getTime() || 0;
        await tx.user.update({
          where: { id: req.user.id },
          data: {
            subscriptionPlan: 'MONTHLY',
            subscriptionExpiry: new Date(Math.max(Date.now(), currentExpiry) + 30 * 24 * 60 * 60 * 1000),
          },
        });
      } else {
        const expiry = payment.user.subscriptionExpiry?.getTime() || 0;
        const timedAccess = (payment.user.subscriptionPlan === 'TRIAL' || payment.user.subscriptionPlan === 'MONTHLY')
          && expiry > Date.now();
        await tx.user.update({
          where: { id: req.user.id },
          data: {
            subscriptionPlan: timedAccess ? payment.user.subscriptionPlan : 'SINGLE',
            documentCredits: { increment: 1 },
          },
        });
      }
    });

    const user = await userWithPayments(req.user.id);
    res.json({ verified: true, plan: payment.plan.toLowerCase(), paymentId, user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002' || error.message === 'Payment has already been applied') {
      return res.status(409).json({ error: 'Payment has already been applied' });
    }
    res.status(500).json({ error: 'Unable to verify payment' });
  }
});

app.get('/api/documents', authenticate, async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ documents });
});

app.post('/api/documents', authenticate, async (req, res) => {
  const title = String(req.body.title || '').trim() || 'Untitled Document';
  try {
    const document = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: req.user.id } });
      const expiry = user.subscriptionExpiry?.getTime() || 0;
      const timedAccess = (user.subscriptionPlan === 'TRIAL' || user.subscriptionPlan === 'MONTHLY')
        && expiry > Date.now();
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

app.patch('/api/documents/:id', authenticate, async (req, res) => {
  const data = {};
  if (typeof req.body.title === 'string' && req.body.title.trim()) data.title = req.body.title.trim();
  if (typeof req.body.content === 'string') data.content = req.body.content;
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

app.post('/api/documents/:id/duplicate', authenticate, async (req, res) => {
  const source = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!source) return res.status(404).json({ error: 'Document not found' });
  req.body = {
    title: `${source.title} (Copy)`,
    content: source.content,
    templateId: source.templateId,
    category: source.category,
  };
  const expiry = req.user.subscriptionExpiry?.getTime() || 0;
  const timedAccess = (req.user.subscriptionPlan === 'TRIAL' || req.user.subscriptionPlan === 'MONTHLY')
    && expiry > Date.now();
  try {
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

app.delete('/api/documents/:id', authenticate, async (req, res) => {
  const deleted = await prisma.document.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  if (!deleted.count) return res.status(404).json({ error: 'Document not found' });
  res.status(204).end();
});

app.get('/api/scribe-token', async (req, res) => {
  try {
    const apiKey = process.env.REACT_APP_ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs token error:', err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.json({ token: data.token });
  } catch (err) {
    console.error('Token endpoint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
