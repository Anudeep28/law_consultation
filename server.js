require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server: SocketServer } = require('socket.io');
const prisma = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const PENDING_PAYMENT_TTL_MS = 15 * 60 * 1000;

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

const allowOtpRequest = (userId) => {
  const now = Date.now();
  const attempts = (otpRequests.get(userId) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (attempts.length >= 5 || (attempts.length && now - attempts[attempts.length - 1] < 60 * 1000)) return false;
  otpRequests.set(userId, [...attempts, now]);
  return true;
};

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
    role: user.role.toLowerCase(),
    phone: user.phone || undefined,
    isPhoneVerified: Boolean(user.phoneVerifiedAt),
    lawyerProfile: user.lawyerProfile ? serializeLawyer(user.lawyerProfile) : undefined,
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
  include: {
    payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } },
    lawyerProfile: true,
  },
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

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: `${role.toLowerCase()} access required` });
  next();
};

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const phone = normalizeIndianPhone(req.body.phone);
  const role = String(req.body.role || 'client').toUpperCase();
  const barCouncil = String(req.body.barCouncil || '').trim();
  const enrollmentNumber = String(req.body.enrollmentNumber || '').trim();
  if (!name || !email || !phone || password.length < 6 || !['CLIENT', 'LAWYER'].includes(role)) {
    return res.status(400).json({ error: 'Name, email, valid Indian mobile number, account type, and a 6-character password are required' });
  }
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
    res.status(201).json({ token: signToken(user.id), user: serializeUser(user) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email or enrollment number already exists' });
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'client').toUpperCase();
  if (!['CLIENT', 'LAWYER', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Invalid account type' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ error: 'JWT is not configured' });
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        payments: { where: { status: 'PAID' }, select: { razorpayPaymentId: true } },
        lawyerProfile: true,
      },
    });
    if (!user || user.role !== role || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email, password, or account type' });
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
  meetingUrl: consultation.meetingUrl,
  transcript: consultation.transcript || '',
  lawyer: serializeLawyer(consultation.lawyer),
  client: consultation.user ? { id: consultation.user.id, name: consultation.user.name, email: consultation.user.email } : undefined,
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

app.get('/api/lawyers', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    const lawyers = await prisma.lawyer.findMany({ where: { isVerified: true }, orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }] });
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
      include: { lawyer: true },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ consultations: consultations.map(serializeConsultation) });
  } catch {
    res.status(500).json({ error: 'Unable to load consultations' });
  }
});

app.post('/api/consultations', authenticate, requireRole('CLIENT'), async (req, res) => {
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
  const endsAt = new Date(startsAt.getTime() + 10 * 60 * 1000);
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
    const overlapping = await prisma.consultation.findFirst({
      where: { userId: req.user.id, status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
    if (overlapping) return res.status(409).json({ error: 'You already have a consultation at this time' });
    await expireStalePendingConsultations();
    const existing = await prisma.consultation.findUnique({ where: { lawyerId_startsAt: { lawyerId, startsAt } } });
    let consultation;
    if (existing?.status === 'CANCELLED') {
      consultation = await prisma.consultation.update({
        where: { id: existing.id },
        data: { userId: req.user.id, endsAt, topic, notes, mode, package: consultationPackage, status: 'PENDING_PAYMENT', meetingUrl: null, messages: { deleteMany: {} } },
        include: { lawyer: true },
      });
    } else if (existing) {
      return res.status(409).json({ error: 'This slot was just booked. Please choose another.' });
    } else {
      consultation = await prisma.consultation.create({
        data: { userId: req.user.id, lawyerId, startsAt, endsAt, topic, notes, mode, package: consultationPackage, status: 'PENDING_PAYMENT' },
        include: { lawyer: true },
      });
    }

    const { keyId, keySecret } = razorpayCredentials();
    if (!keyId || !keySecret) return res.status(500).json({ error: 'Razorpay is not configured' });
    const order = await razorpayRequest('POST', '/v1/orders', {
      amount: totalFee,
      currency: 'INR',
      receipt: `consultation_${consultation.id}`,
      notes: { consultationId: consultation.id, userId: req.user.id },
    });
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
    if (error.code === 'P2002') return res.status(409).json({ error: 'This slot was just booked. Please choose another.' });
    res.status(500).json({ error: 'Unable to book consultation' });
  }
});

app.post('/api/consultations/:id/verify-payment', authenticate, requireRole('CLIENT'), async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  try {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId, userId: req.user.id, consultationId: req.params.id },
      include: { consultation: { include: { lawyer: true } } },
    });
    if (!payment || !payment.consultation) return res.status(400).json({ error: 'Unknown payment order' });
    if (payment.consultation.status === 'BOOKED') {
      return res.json({ verified: true, consultation: serializeConsultation(payment.consultation) });
    }

    const { keySecret } = razorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(String(signature || ''));
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const meetingUrl = payment.consultation.mode === 'CALL'
      ? `https://meet.jit.si/law-writer-${crypto.randomBytes(12).toString('hex')}`
      : null;
    const consultation = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: 'CREATED' },
        data: { status: 'PAID', razorpayPaymentId: paymentId },
      });
      if (claimed.count !== 1) throw new Error('Payment has already been applied');
      return tx.consultation.update({
        where: { id: payment.consultation.id, status: 'PENDING_PAYMENT' },
        data: { status: 'BOOKED', meetingUrl },
        include: { lawyer: true },
      });
    });
    res.json({ verified: true, consultation: serializeConsultation(consultation) });
  } catch (error) {
    if (error.code === 'P2002' || error.code === 'P2025' || error.message === 'Payment has already been applied') {
      return res.status(409).json({ error: 'Payment has already been applied' });
    }
    res.status(500).json({ error: 'Unable to verify payment' });
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
    res.json({ deliverable: serializeDeliverable(updated, { includeDocument: true }) });
  } catch {
    res.status(500).json({ error: 'Unable to deliver document' });
  }
});

app.patch('/api/consultations/:id/cancel', authenticate, requireRole('CLIENT'), async (req, res) => {
  try {
    const cancelled = await prisma.consultation.updateMany({
      where: { id: req.params.id, userId: req.user.id, status: { in: ['BOOKED', 'PENDING_PAYMENT'] }, startsAt: { gt: new Date() } },
      data: { status: 'CANCELLED' },
    });
    if (!cancelled.count) return res.status(400).json({ error: 'Only upcoming booked consultations can be cancelled' });
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Unable to cancel consultation' });
  }
});

const razorpayRequest = (method, path, body) => new Promise((resolve, reject) => {
  const { keyId, keySecret } = razorpayCredentials();
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
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
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to create payment order' });
  }
});

app.post('/api/payments/verify', authenticate, requireRole('LAWYER'), async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  try {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId, userId: req.user.id },
      include: { user: true },
    });
    if (!payment) return res.status(400).json({ error: 'Unknown payment order' });
    if (payment.status === 'PAID') return res.status(409).json({ error: 'Payment has already been applied' });

    const { keySecret } = razorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
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

app.get('/api/documents', authenticate, requireRole('LAWYER'), async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ documents });
});

app.post('/api/documents', authenticate, requireRole('LAWYER'), async (req, res) => {
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
  const source = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!source) return res.status(404).json({ error: 'Document not found' });
  req.body = {
    title: `${source.title} (Copy)`,
    content: source.content,
    templateId: source.templateId,
    category: source.category,
    language: source.language,
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

app.delete('/api/documents/:id', authenticate, requireRole('LAWYER'), async (req, res) => {
  const deleted = await prisma.document.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  if (!deleted.count) return res.status(404).json({ error: 'Document not found' });
  res.status(204).end();
});

app.get('/api/scribe-token', async (req, res) => {
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

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

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

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || !process.env.JWT_SECRET) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return next(new Error('Invalid authentication token'));
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired authentication token'));
  }
});

io.on('connection', (socket) => {
  socket.on('chat:join', async (payload, callback) => {
    const consultationId = String(payload?.consultationId || '');
    const consultation = await findChatConsultation(consultationId, socket.user);
    if (!consultation) return callback?.({ error: 'Chat consultation not found' });
    socket.join(`consultation:${consultation.id}`);
    callback?.({ ok: true });
  });

  socket.on('chat:message', async (payload, callback) => {
    const consultationId = String(payload?.consultationId || '');
    const content = String(payload?.content || '').trim();
    if (!content || content.length > 2000) return callback?.({ error: 'Message must be between 1 and 2000 characters' });
    const consultation = await findChatConsultation(consultationId, socket.user, { withinWindow: true });
    if (!consultation) return callback?.({ error: 'Chat opens 10 minutes before the booked session and closes when it ends' });
    const message = await prisma.consultationMessage.create({
      data: { consultationId: consultation.id, sender: socket.user.role === 'LAWYER' ? 'LAWYER' : 'USER', content },
    });
    io.to(`consultation:${consultation.id}`).emit('chat:message', { ...message, sender: message.sender.toLowerCase() });
    callback?.({ ok: true });
  });
});

const ensureDeploymentAdmin = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (!email || password.length < 12) throw new Error('ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required together');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'ADMIN') throw new Error('ADMIN_EMAIL is already assigned to a non-admin account');
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { name: process.env.ADMIN_NAME || 'Administrator', passwordHash, role: 'ADMIN' },
    create: { email, name: process.env.ADMIN_NAME || 'Administrator', passwordHash, role: 'ADMIN' },
  });
};

ensureDeploymentAdmin()
  .then(() => server.listen(PORT, () => {
    console.log(`API + realtime server running on http://localhost:${PORT}`);
  }))
  .catch((error) => {
    console.error(`Server startup failed: ${error.message}`);
    process.exitCode = 1;
  });
