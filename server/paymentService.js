const crypto = require('crypto');

const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const paymentError = (message, status = 400) => Object.assign(new Error(message), { status });

module.exports = ({ prisma, request, meetings, notifications, logger, pendingTtl }) => {
  const verifySignature = (orderId, paymentId, signature, secret) => {
    if (!validId(orderId) || !validId(paymentId) || typeof signature !== 'string' || !secret) return false;
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex'));
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  };

  const refund = async (id, onClaim) => {
    const attemptId = crypto.randomUUID();
    const claim = db => db.payment.updateMany({
      where: { id, status: 'PAID', ...(onClaim ? { OR: [{ refundStatus: null }, { refundStatus: { in: ['REQUIRED', 'FAILED'] } }] } : { refundStatus: { in: ['REQUIRED', 'FAILED'] } }) },
      data: { refundStatus: 'PENDING', refundError: null, refundId: null, refundAttemptId: attemptId, refundRequestedAt: new Date() },
    });
    const claimed = onClaim ? await prisma.$transaction(async tx => {
      const result = await claim(tx);
      if (result.count !== 1) throw paymentError('Payment is ineligible, already refunded, pending or requires review', 409);
      await onClaim(tx);
      return result;
    }) : await claim(prisma);
    if (claimed.count !== 1) return;
    const payment = await prisma.payment.findUnique({ where: { id }, include: { user: true } });
    let result;
    try {
      result = await request('POST', `/v1/payments/${encodeURIComponent(payment.razorpayPaymentId)}/refund`, { amount: payment.amount, notes: { refundAttemptId: attemptId } }, { 'X-Refund-Idempotency': attemptId });
    } catch (err) {
      const retryable = err.providerStatus >= 400 && err.providerStatus < 500;
      await prisma.payment.updateMany({
        where: { id, status: 'PAID', refundStatus: 'PENDING', refundAttemptId: attemptId },
        data: { refundStatus: retryable ? 'FAILED' : 'REVIEW', refundError: retryable ? 'Provider rejected refund; retry is available.' : 'Refund outcome unknown. Reconcile with Razorpay before retrying.' },
      });
      logger.error({ err, paymentId: id }, 'Consultation refund failed:');
      throw paymentError('Refund requires retry or reconciliation. Please contact support.', 502);
    }
    if (!validId(result.id) || result.payment_id !== payment.razorpayPaymentId || result.amount !== payment.amount || result.currency !== payment.currency || result.notes?.refundAttemptId !== attemptId || !['pending', 'processed', 'failed'].includes(result.status)) {
      await prisma.payment.updateMany({ where: { id, refundStatus: 'PENDING', refundAttemptId: attemptId }, data: { refundStatus: 'REVIEW', refundError: 'Unexpected refund response. Reconcile with Razorpay before retrying.' } });
      throw paymentError('Refund requires reconciliation. Please contact support.', 502);
    }
    // A refund webhook can arrive before the initiating API response.
    await prisma.payment.updateMany({
      where: { id, refundStatus: 'PENDING', refundAttemptId: attemptId },
      data: { refundId: result.id },
    });
    await refundEvent(result);
    const current = await prisma.payment.findUnique({ where: { id } });
    if (current?.refundStatus === 'FAILED') throw paymentError('Refund failed. Please retry or contact support.', 502);
    if (current?.refundAttemptId !== attemptId || current?.refundId !== result.id || !['PENDING', 'PROCESSED'].includes(current?.refundStatus)) throw paymentError('Refund requires reconciliation. Please contact support.', 502);
    try {
      await notifications.sendEmail({
        to: payment.user.email, subject: 'Consultation refund initiated',
        text: `Your full consultation refund of ${payment.currency} ${(payment.amount / 100).toFixed(2)} has been initiated. Bank processing typically takes 5–10 business days. Reference: ${result.id}.`,
      });
    } catch (err) {
      logger.error({ err, paymentId: id }, 'Refund confirmation email failed');
    }
  };

  const refundEvent = async (entity, orderId) => {
    if (!validId(entity.id) || !validId(entity.payment_id)) throw paymentError('Malformed refund payload');
    let payment = await prisma.payment.findUnique({ where: { razorpayPaymentId: entity.payment_id } });
    if (!payment && validId(orderId)) payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
    if (!payment || payment.status === 'REFUNDED') return;
    if (payment.razorpayPaymentId && payment.razorpayPaymentId !== entity.payment_id) throw paymentError('Refund payment ID mismatch');
    if (!payment.refundAttemptId || !entity.notes?.refundAttemptId) {
      const fullyRefunded = entity.status === 'processed' && entity.amount === payment.amount && entity.currency === payment.currency;
      const unfulfilled = payment.status === 'CREATED';
      await prisma.$transaction(async tx => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: payment.status, refundStatus: payment.refundStatus ?? null },
          data: { status: fullyRefunded ? 'REFUNDED' : payment.status, razorpayPaymentId: entity.payment_id, refundStatus: 'REVIEW', refundId: entity.id, refundError: 'Refund outside tracked attempts. Reconcile provider status and access entitlement.' },
        });
        if (claimed.count !== 1) throw paymentError('Refund state changed; retry delivery', 503);
        if (unfulfilled && fullyRefunded && payment.consultationId) await tx.consultation.updateMany({ where: { id: payment.consultationId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      });
      return;
    }
    if (entity.amount !== payment.amount || entity.currency !== payment.currency) throw paymentError('Refund amount or currency mismatch');
    if (entity.notes?.refundAttemptId !== payment.refundAttemptId) return;
    if (payment.refundId && payment.refundId !== entity.id) return;
    const status = { processed: 'PROCESSED', failed: 'FAILED', pending: 'PENDING' }[entity.status];
    if (!status) throw paymentError('Invalid refund status');
    if (status === 'PENDING') return;
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'PAID', refundAttemptId: payment.refundAttemptId, refundStatus: { in: ['PENDING', 'FAILED', 'REVIEW'] }, OR: [{ refundId: null }, { refundId: entity.id }] },
      data: { refundId: entity.id, refundStatus: status, status: status === 'PROCESSED' ? 'REFUNDED' : 'PAID', refundError: status === 'FAILED' ? 'Provider reported refund failure; retry is available.' : null },
    });
  };

  const settle = async (payment, entity) => {
    if (!validId(entity.id) || entity.order_id !== payment.razorpayOrderId || entity.amount !== payment.amount || entity.currency !== payment.currency || entity.status !== 'captured') {
      await prisma.payment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { refundStatus: 'REVIEW', refundError: 'Captured payment validation failed. Reconcile amount, currency and order with Razorpay.' } });
      throw paymentError('Payment amount, currency, order or capture status mismatch');
    }
    if (payment.razorpayPaymentId && payment.razorpayPaymentId !== entity.id) throw paymentError('Payment ID mismatch');
    if (payment.status !== 'CREATED') {
      if (['REQUIRED', 'FAILED'].includes(payment.refundStatus)) await refund(payment.id);
      return { applied: false };
    }
    if (payment.refundStatus === 'REVIEW' && payment.refundId) throw paymentError('Payment refund requires reconciliation before access can be granted', 409);
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: 'CREATED', refundId: null }, data: { status: 'PAID', razorpayPaymentId: entity.id, refundStatus: null, refundError: null } });
      if (claimed.count !== 1) return { applied: false };
      if (payment.consultationId) {
        const now = new Date();
        const booked = await tx.consultation.updateMany({
          where: { id: payment.consultationId, status: 'PENDING_PAYMENT', createdAt: { gte: new Date(now.getTime() - pendingTtl) }, startsAt: { gt: now } },
          data: { status: 'BOOKED', meetingUrl: payment.consultation.mode === 'CALL' ? meetings.createMeetingLocation() : null },
        });
        if (booked.count !== 1) {
          await tx.consultation.updateMany({ where: { id: payment.consultationId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
          await tx.payment.update({ where: { id: payment.id }, data: { refundStatus: 'REQUIRED', refundError: 'Payment captured after reservation became unavailable.' } });
          return { applied: true, unavailable: true };
        }
        return { applied: true, consultation: await tx.consultation.findUnique({ where: { id: payment.consultationId }, include: { lawyer: { include: { user: true } }, user: true } }) };
      }
      // Lock the account before reading expiry so two different paid orders both extend access.
      await tx.user.updateMany({ where: { id: payment.userId }, data: { updatedAt: new Date() } });
      const user = await tx.user.findUnique({ where: { id: payment.userId } });
      const expiry = user.subscriptionExpiry?.getTime() || 0;
      const timedAccess = ['TRIAL', 'MONTHLY'].includes(user.subscriptionPlan) && expiry > Date.now();
      await tx.user.update({ where: { id: user.id }, data: payment.plan === 'MONTHLY'
        ? { subscriptionPlan: 'MONTHLY', subscriptionExpiry: new Date(Math.max(Date.now(), expiry) + 30 * 86400000) }
        : { subscriptionPlan: timedAccess ? user.subscriptionPlan : 'SINGLE', documentCredits: { increment: 1 } } });
      return { applied: true };
    });
    const current = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (['REQUIRED', 'FAILED'].includes(current?.refundStatus)) await refund(payment.id);
    if (result.consultation?.lawyer?.userId) {
      const consultation = result.consultation;
      try {
        await notifications.createNotification({ userId: consultation.lawyer.userId, consultationId: consultation.id, type: 'CONSULTATION_BOOKED', title: 'New consultation booked', body: `A ${consultation.mode.toLowerCase()} consultation "${consultation.topic}" was booked for ${new Date(consultation.startsAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`, channels: ['IN_APP', 'EMAIL'] });
      } catch (err) {
        logger.error({ err, consultationId: consultation.id }, 'Booking notification failed');
      }
    }
    return result;
  };

  const cancel = async (id, userId) => {
    const paymentId = await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { consultationId: id, userId }, data: { updatedAt: new Date() } });
      const consultation = await tx.consultation.findFirst({ where: { id, userId }, include: { payment: true } });
      if (!consultation || (consultation.status !== 'CANCELLED' && (!['BOOKED', 'PENDING_PAYMENT'].includes(consultation.status) || consultation.startsAt <= new Date()))) throw paymentError('Only upcoming booked consultations can be cancelled');
      if (consultation.status !== 'CANCELLED') await tx.consultation.update({ where: { id }, data: { status: 'CANCELLED' } });
      if (!consultation.payment) return null;
      await tx.payment.updateMany({ where: { id: consultation.payment.id, status: 'PAID', refundStatus: null }, data: { refundStatus: 'REQUIRED' } });
      return consultation.payment.id;
    });
    if (paymentId) await refund(paymentId);
  };

  const adminRefund = async (consultationId, adminId, reason, note) => {
    const payment = await prisma.payment.findUnique({ where: { consultationId }, include: { consultation: { include: { lawyer: true } } } });
    if (!payment || !payment.consultation || !payment.razorpayPaymentId) throw paymentError('No eligible consultation payment found', 409);
    let failure;
    let accepted = false;
    try {
      await refund(payment.id, async tx => {
        const now = new Date();
        await tx.consultation.updateMany({ where: { id: consultationId, startsAt: { gt: now } }, data: { status: 'CANCELLED' } });
        await tx.consultation.updateMany({ where: { id: consultationId, startsAt: { lte: now }, status: { in: ['BOOKED', 'PENDING_PAYMENT'] } }, data: { status: 'COMPLETED' } });
        await tx.adminAuditLog.create({ data: { adminId, targetUserId: payment.userId, action: 'CONSULTATION_REFUND', reason: JSON.stringify({ reason, note, amount: payment.amount, currency: payment.currency, paymentId: payment.id, consultationId }) } });
      });
      accepted = true;
    } catch (error) {
      if (error.status !== 502) throw error;
      accepted = true;
      failure = error;
    }
    if (accepted) {
      for (const userId of [payment.userId, payment.consultation.lawyer.userId]) {
        try {
          await notifications.createNotification({ userId, consultationId, type: 'CONSULTATION_REFUND', title: failure ? 'Consultation refund needs attention' : 'Consultation refund initiated', body: `An administrator requested a full refund of ${payment.currency} ${(payment.amount / 100).toFixed(2)} for ${reason.toLowerCase().replaceAll('_', ' ')}.${failure ? ' Processing requires retry or reconciliation; support will follow up.' : ' Check the payment status for processing updates.'}`, channels: ['IN_APP', 'EMAIL'] });
        } catch (err) { logger.error({ err, consultationId }, 'Admin refund notification failed'); }
      }
    }
    if (failure) throw failure;
    return prisma.payment.findUnique({ where: { id: payment.id }, select: { id: true, status: true, refundStatus: true, refundError: true } });
  };

  return { verifySignature, settle, refundEvent, cancel, adminRefund };
};
