import { test, expect } from '@playwright/test';
import { PrismaClient, ConsultationStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const jwt = require('jsonwebtoken');
const { fixturesPath, backendEnv } = require('./runtime.cjs');
const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });

test('cancelled and expired reservations retain private history while active slots stay unique', async ({ request }) => {
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const startsAt = new Date(Date.now() + 3 * 86400000);
  startsAt.setUTCHours(12, 0, 0, 0);
  const base = { lawyerId: fixtures.lawyer.id, startsAt, endsAt: new Date(startsAt.getTime() + 600000), topic: 'Privacy fixture', notes: 'Private previous client notes' };
  const old = await prisma.consultation.create({ data: {
    ...base, userId: fixtures.dismissClient.id, status: 'CANCELLED', transcript: 'Confidential original transcript',
    messages: { create: { sender: 'USER', content: 'Confidential original message' } },
    deliverables: { create: { title: 'Private original document', content: 'Confidential original document', status: 'DELIVERED' } },
    payment: { create: { userId: fixtures.dismissClient.id, razorpayOrderId: `order_history_${randomUUID()}`, amount: 25000, plan: 'CONSULTATION', status: 'REFUNDED' } },
  }, include: { messages: true, deliverables: true, payment: true } });
  const expired = await prisma.consultation.create({ data: {
    ...base, userId: fixtures.client.id, status: 'PENDING_PAYMENT', createdAt: new Date(Date.now() - 16 * 60000),
  } });
  const response = await request.post('http://localhost:3002/api/consultations', {
    headers: { Authorization: `Bearer ${jwt.sign({ userId: fixtures.client.id }, backendEnv.JWT_SECRET)}` },
    data: { lawyerId: fixtures.lawyer.id, startsAt: startsAt.toISOString(), topic: 'Fresh booking', notes: 'A different client legal matter', mode: 'chat' },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.consultation.id).not.toBe(old.id);
  expect(body.consultation.id).not.toBe(expired.id);
  expect(body.consultation.transcript).toBe('');
  expect(await prisma.consultation.findUnique({ where: { id: old.id }, include: { messages: true, deliverables: true, payment: true } })).toEqual(old);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe('CANCELLED');
  const duplicate = await request.post('http://localhost:3002/api/consultations', {
    headers: { Authorization: `Bearer ${jwt.sign({ userId: fixtures.tamperClient.id }, backendEnv.JWT_SECRET)}` },
    data: { lawyerId: fixtures.lawyer.id, startsAt: startsAt.toISOString(), topic: 'Collision', notes: 'A competing booking request', mode: 'chat' },
  });
  expect(duplicate.status()).toBe(409);

  for (const status of ['PENDING_PAYMENT', 'BOOKED', 'COMPLETED'] as ConsultationStatus[]) {
    const slot = new Date(startsAt.getTime() + (['PENDING_PAYMENT', 'BOOKED', 'COMPLETED'].indexOf(status) + 1) * 600000);
    const data = { ...base, startsAt: slot, endsAt: new Date(slot.getTime() + 600000), userId: fixtures.client.id, status };
    await prisma.consultation.create({ data });
    const collisions = await Promise.allSettled([0, 1].map(() => prisma.consultation.create({ data: { ...data, userId: fixtures.tamperClient.id } })));
    for (const result of collisions) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason.code).toBe('P2002');
    }
    await prisma.consultation.create({ data: { ...data, status: 'CANCELLED' } });
  }
});
