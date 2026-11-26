const crypto = require('crypto');

const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const paymentError = (message, status = 400) => Object.assign(new Error(message), { status });
const REFUND_REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  const applyRefundStatus = (db, payment, entity) => db.payment.updateMany({
    where: { id: payment.id, status: payment.status, refundAttemptId: payment.refundAttemptId ?? null, refundStatus: { in: ['PENDING', 'FAILED', 'REVIEW'] }, OR: [{ refundId: payment.refundId ?? null }, { refundId: entity.id }] },
    data: { refundId: entity.id, refundStatus: { processed: 'PROCESSED', failed: 'FAILED', pending: 'PENDING' }[entity.status], status: entity.status === 'processed' ? 'REFUNDED' : payment.status, refundError: entity.status === 'failed' ? 'Provider reported refund failure; retry is available.' : null },
  });

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
    await applyRefundStatus(prisma, payment, entity);
  };

  const reviewState = payment => ({ status: payment.status, refundStatus: payment.refundStatus, refundId: payment.refundId, refundAttemptId: payment.refundAttemptId, refundError: payment.refundError });
  const reviewNotification = async payment => {
    if (payment.refundStatus !== 'PROCESSED') return;
    for (const userId of new Set([payment.userId, payment.consultation?.lawyer?.userId].filter(Boolean))) {
      try {
        await notifications.createNotification({ userId, consultationId: payment.consultationId || undefined, type: 'CONSULTATION_REFUND', title: 'Refund processed', body: `A full refund of ${payment.currency} ${(payment.amount / 100).toFixed(2)} has been confirmed. Bank processing typically takes 5–10 business days.`, channels: ['IN_APP', 'EMAIL'] });
      } catch (err) { logger.error({ err, paymentId: payment.id }, 'Reconciled refund notification failed'); }
    }
  };

  const reconcile = async (id, adminId, resolution) => {
    const result = await prisma.$transaction(async tx => {
      // Serialize provider checks, manual overrides and webhook writes on this payment.
      const locked = await tx.payment.updateMany({ where: { id }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw paymentError('Payment not found', 404);
      const payment = await tx.payment.findUnique({ where: { id }, include: { consultation: { include: { lawyer: true } } } });
      const before = reviewState(payment);
      let provider = { result: 'already_reconciled' }, failure, autoRefund = false;
      if (resolution && payment.refundStatus !== 'REVIEW') throw paymentError('Only review-required payments can be resolved', 409);
      if (payment.refundStatus === 'REVIEW') {
        try {
          if (resolution) {
            provider = { result: 'manual_override', outcome: resolution.outcome };
            await tx.payment.updateMany({ where: { id, refundStatus: 'REVIEW' }, data: { status: resolution.outcome === 'REFUNDED' ? 'REFUNDED' : payment.status, refundStatus: resolution.outcome === 'REFUNDED' ? 'PROCESSED' : null, refundError: null } });
          } else {
            if (!validId(payment.razorpayPaymentId)) throw paymentError('Provider payment ID is unavailable; manual review is required.', 502);
            let entity;
            if (payment.refundId) {
              try { entity = await request('GET', `/v1/refunds/${encodeURIComponent(payment.refundId)}`); }
              catch (error) { if (error.providerStatus !== 404) throw error; }
              if (entity && entity.id !== payment.refundId) throw paymentError('Provider refund ID mismatch; review retained.', 502);
            }
            const replacedFailure = entity?.status === 'failed' && payment.refundAttemptId && entity.notes?.refundAttemptId !== payment.refundAttemptId;
            if (!entity || replacedFailure) {
              const items = [];
              for (let page = 0; ; page++) {
                if (page === 5) throw paymentError('Provider refund history exceeds the review limit; manual review is required.', 502);
                const list = await request('GET', `/v1/payments/${encodeURIComponent(payment.razorpayPaymentId)}/refunds?count=100&skip=${page * 100}`);
                if (!Array.isArray(list?.items)) throw paymentError('Invalid provider refund list; review retained.', 502);
                items.push(...list.items);
                if (list.items.length < 100) break;
              }
              const exact = items.filter(item => payment.refundAttemptId && item.notes?.refundAttemptId === payment.refundAttemptId);
              if (exact.length === 1 && !items.some(item => item !== exact[0] && item.status !== 'failed')) entity = exact[0];
              else if (items.length === 1 && !items[0].notes?.refundAttemptId) entity = items[0];
              else if (items.length || replacedFailure) throw paymentError('Ambiguous provider refund history; review retained.', 502);
            }
            if (entity) {
              if (!validId(entity.id) || entity.payment_id !== payment.razorpayPaymentId || entity.amount !== payment.amount || entity.currency !== payment.currency || !['processed', 'pending', 'failed'].includes(entity.status)) throw paymentError('Provider refund validation failed; review retained.', 502);
              if (entity.status === 'failed' && payment.refundAttemptId && entity.notes?.refundAttemptId !== payment.refundAttemptId) throw paymentError('Failed provider refund is outside the original attempt; review retained.', 502);
              provider = { result: entity.status, refundId: entity.id, paymentId: entity.payment_id, amount: entity.amount, currency: entity.currency };
              const applied = await applyRefundStatus(tx, payment, entity);
              if (applied.count !== 1) throw paymentError('Refund state changed; retry reconciliation.', 409);
            } else {
              const capture = await request('GET', `/v1/payments/${encodeURIComponent(payment.razorpayPaymentId)}`);
              if (capture?.id !== payment.razorpayPaymentId || capture.order_id !== payment.razorpayOrderId || capture.amount !== payment.amount || capture.currency !== payment.currency || capture.status !== 'captured' || capture.amount_refunded !== 0) throw paymentError('Provider capture validation failed; review retained.', 502);
              const requestedAt = payment.refundRequestedAt ? new Date(payment.refundRequestedAt).getTime() : NaN;
              const reviewRetained = Boolean(payment.refundAttemptId) && (!Number.isFinite(requestedAt) || Date.now() < requestedAt + REFUND_REVIEW_WINDOW_MS);
              autoRefund = !reviewRetained && payment.status === 'PAID' && payment.consultation?.status === 'CANCELLED';
              provider = { result: 'no_refund_found', paymentId: capture.id, autoRefund, reviewRetained, retryAfter: reviewRetained && Number.isFinite(requestedAt) ? new Date(requestedAt + REFUND_REVIEW_WINDOW_MS).toISOString() : null };
              await tx.payment.updateMany({ where: { id, refundStatus: 'REVIEW' }, data: { refundStatus: reviewRetained ? 'REVIEW' : autoRefund ? 'REQUIRED' : 'FAILED', refundError: reviewRetained ? 'No provider refund found yet. Original attempt remains under review; allow at least 24 hours before retrying.' : 'No refund found at provider; retry is available.', ...(reviewRetained ? {} : { refundId: null }) } });
            }
          }
          const current = await tx.payment.findUnique({ where: { id } });
          if (current.refundStatus === 'PROCESSED' && payment.consultationId) await tx.consultation.updateMany({ where: { id: payment.consultationId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
        } catch (error) {
          failure = paymentError(error.status ? error.message : 'Unable to check Razorpay; review retained.', error.status || 502);
          provider = { result: 'error', message: failure.message, providerStatus: error.providerStatus || null };
        }
      }
      const after = await tx.payment.findUnique({ where: { id } });
      const audit = await tx.adminAuditLog.create({ data: { adminId, targetUserId: payment.userId, action: resolution ? 'PAYMENT_REVIEW_RESOLVE' : 'PAYMENT_RECONCILE', reason: JSON.stringify({ paymentId: id, before, after: reviewState(after), provider, note: resolution?.note || null }) } });
      return { payment: { ...after, consultation: payment.consultation }, changed: before.refundStatus === 'REVIEW' && after.refundStatus !== 'REVIEW', failure, autoRefund, auditId: audit.id, before, provider };
    }, { maxWait: 10000, timeout: 65000 });
    if (result.autoRefund && !result.failure) {
      try { await refund(id); } catch (error) { result.failure = error; }
      result.payment = await prisma.payment.findUnique({ where: { id }, include: { consultation: { include: { lawyer: true } } } });
      await prisma.adminAuditLog.update({ where: { id: result.auditId }, data: { reason: JSON.stringify({ paymentId: id, before: result.before, after: reviewState(result.payment), provider: { ...result.provider, refundStatus: result.payment.refundStatus }, note: null }) } });
    }
    if (result.changed) await reviewNotification(result.payment);
    if (result.failure) throw result.failure;
    return { payment: result.payment, message: result.autoRefund ? 'Late payment refund requested.' : result.provider.result === 'already_reconciled' ? 'Payment already reconciled.' : result.provider.reviewRetained ? 'No provider refund found yet. Original attempt remains under review.' : result.provider.result === 'no_refund_found' ? 'No provider refund found. Refund can be retried.' : resolution ? 'Payment review resolved.' : `Provider refund is ${result.provider.result}.` };
  };

  const canResumeRefund = payment => payment?.consultation?.status === 'CANCELLED' && (payment.refundStatus === 'REQUIRED' || payment.refundStatus === 'FAILED' && Boolean(payment.refundAttemptId));

  const settle = async (payment, entity) => {
    if (!validId(entity.id) || entity.order_id !== payment.razorpayOrderId || entity.amount !== payment.amount || entity.currency !== payment.currency || entity.status !== 'captured') {
      await prisma.payment.updateMany({ where: { id: payment.id, status: 'CREATED' }, data: { refundStatus: 'REVIEW', refundError: 'Captured payment validation failed. Reconcile amount, currency and order with Razorpay.' } });
      throw paymentError('Payment amount, currency, order or capture status mismatch');
    }
    if (payment.razorpayPaymentId && payment.razorpayPaymentId !== entity.id) throw paymentError('Payment ID mismatch');
    if (payment.status !== 'CREATED') {
      if (canResumeRefund(payment)) await refund(payment.id);
      return { applied: false };
    }
    if (payment.refundStatus === 'REVIEW' && payment.refundId) throw paymentError('Payment refund requires reconciliation before access can be granted', 409);
    const result = await prisma.$transaction(async (tx) => {
      const failedRefund = payment.refundStatus === 'FAILED';
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: 'CREATED', refundId: payment.refundId ?? null, ...(failedRefund ? { refundStatus: 'FAILED' } : { refundId: null }) }, data: { status: 'PAID', razorpayPaymentId: entity.id, ...(failedRefund ? { refundId: null } : {}), refundStatus: null, refundError: null } });
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
    const current = await prisma.payment.findUnique({ where: { id: payment.id }, include: { consultation: true } });
    if (canResumeRefund(current)) await refund(payment.id);
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

  return { verifySignature, settle, refundEvent, cancel, adminRefund, reconcile };
};
