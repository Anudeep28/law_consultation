const webPush = require('web-push');
const prisma = require('../db');

let ioInstance = null;

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL || 'notifications@lawwriter.app';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@lawwriter.app';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function setSocketIo(io) {
  ioInstance = io;
}

async function sendEmail({ to, subject, html, text }) {
  if (!resendApiKey) {
    console.warn('[notifications] RESEND_API_KEY not configured; email skipped');
    return { ok: false, skipped: true };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
        text,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[notifications] Resend error:', data);
      return { ok: false, error: data };
    }
    return { ok: true, id: data.id };
  } catch (error) {
    console.error('[notifications] Email send failed:', error);
    return { ok: false, error: error.message };
  }
}

async function sendPush(subscription, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('[notifications] VAPID keys not configured; push skipped');
    return { ok: false, skipped: true };
  }
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    console.error('[notifications] Push send failed:', error);
    // Remove expired subscriptions
    if (error.statusCode === 410 || error.statusCode === 404) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
    }
    return { ok: false, error: error.message };
  }
}

function emitInAppNotification(userId, notification) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit('notification:new', notification);
  }
}

async function createNotification({
  userId,
  consultationId,
  type,
  title,
  body,
  data,
  channels = ['IN_APP'],
}) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      consultationId,
      type,
      channels,
      title,
      body,
      data: data || {},
    },
  });

  emitInAppNotification(userId, notification);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { pushSubscriptions: true },
  });
  if (!user) return notification;

  const payload = { title, body, data, tag: type };

  if (channels.includes('EMAIL') && user.emailNotifications) {
    await sendEmail({
      to: user.email,
      subject: title,
      html: `<p>${body}</p>`,
      text: body,
    });
  }
  if (channels.includes('PUSH') && user.pushNotifications) {
    for (const sub of user.pushSubscriptions) {
      await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    }
  }

  return notification;
}

async function notifyConsultationParticipants(consultationId, options) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: { user: true, lawyer: { include: { user: true } } },
  });
  if (!consultation) return;

  const channels = options.channels || ['IN_APP'];

  await createNotification({
    userId: consultation.userId,
    consultationId,
    type: options.type,
    title: options.title,
    body: options.body,
    data: options.data,
    channels,
  });

  if (consultation.lawyer?.userId) {
    await createNotification({
      userId: consultation.lawyer.userId,
      consultationId,
      type: options.type,
      title: options.title,
      body: options.body,
      data: options.data,
      channels,
    });
  }
}

function buildReminderBody(consultation, minutes) {
  const startTime = new Date(consultation.startsAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const mode = consultation.mode.toLowerCase();
  const linkText = consultation.meetingUrl ? ` Join here: ${consultation.meetingUrl}` : '';
  return `Your ${mode} consultation "${consultation.topic}" starts ${minutes === 0 ? 'now' : `in ${minutes} minutes`} (${startTime}).${linkText}`;
}

async function sendDueReminders() {
  const now = Date.now();
  const tenMinWindowStart = new Date(now + 9 * 60 * 1000);
  const tenMinWindowEnd = new Date(now + 11 * 60 * 1000);
  const dayWindowStart = new Date(now + 23 * 60 * 60 * 1000);
  const dayWindowEnd = new Date(now + 25 * 60 * 60 * 1000);

  const due10Min = await prisma.consultation.findMany({
    where: {
      status: 'BOOKED',
      reminder10MinSentAt: null,
      startsAt: { gte: tenMinWindowStart, lte: tenMinWindowEnd },
    },
    include: { user: true, lawyer: { include: { user: true } } },
  });

  const due24Hour = await prisma.consultation.findMany({
    where: {
      status: 'BOOKED',
      reminder24HourSentAt: null,
      startsAt: { gte: dayWindowStart, lte: dayWindowEnd },
    },
    include: { user: true, lawyer: { include: { user: true } } },
  });

  for (const consultation of due10Min) {
    const body = buildReminderBody(consultation, 10);
    await notifyConsultationParticipants(consultation.id, {
      type: 'CONSULTATION_REMINDER',
      title: 'Consultation starting in 10 minutes',
      body,
      channels: ['IN_APP', 'EMAIL', 'PUSH'],
    });
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { reminder10MinSentAt: new Date() },
    });
  }

  for (const consultation of due24Hour) {
    const body = buildReminderBody(consultation, 24 * 60);
    await notifyConsultationParticipants(consultation.id, {
      type: 'CONSULTATION_REMINDER',
      title: 'Upcoming consultation tomorrow',
      body,
      channels: ['IN_APP', 'EMAIL', 'PUSH'],
    });
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { reminder24HourSentAt: new Date() },
    });
  }
}

function startReminderScheduler() {
  const intervalMs = 60 * 1000;
  const timer = setInterval(async () => {
    try {
      await sendDueReminders();
    } catch (error) {
      console.error('[notifications] Reminder scheduler error:', error);
    }
  }, intervalMs);

  // Run once shortly after startup to catch any missed reminders
  setTimeout(() => sendDueReminders().catch((error) => console.error('[notifications] Initial reminder error:', error)), 5000);

  return timer;
}

module.exports = {
  setSocketIo,
  sendEmail,
  sendPush,
  emitInAppNotification,
  createNotification,
  notifyConsultationParticipants,
  sendDueReminders,
  startReminderScheduler,
};
