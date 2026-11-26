import { test, expect, APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { readFileSync } from 'fs';

const jwt = require('jsonwebtoken');
const { apiUrl, secret, backendEnv, fixturesPath } = require('./runtime.cjs');
const prisma = new PrismaClient();
let lawyerId: string;
let client: string;
let otherClient: string;
let lawyer: string;
const headers = (id: string) => ({ Authorization: `Bearer ${jwt.sign({ userId: id }, backendEnv.JWT_SECRET)}` });
const signature = (orderId: string, paymentId: string) => createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
const captured = (order: { orderId: string; amount: number; currency: string }) => ({ id: `pay_e2e_${order.orderId}`, order_id: order.orderId, amount: order.amount, currency: order.currency, status: 'captured' });
const webhook = (request: APIRequestContext, entity: object) => {
  const data = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity } } });
  return request.post(`${apiUrl}/api/payments/webhook`, { data, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': createHmac('sha256', backendEnv.RAZORPAY_WEBHOOK_SECRET).update(data).digest('hex') } });
};
const checkout = (order: { orderId: string }) => ({ razorpay_order_id: order.orderId, razorpay_payment_id: `pay_e2e_${order.orderId}`, razorpay_signature: signature(order.orderId, `pay_e2e_${order.orderId}`) });

test.beforeAll(async () => {
  lawyerId = JSON.parse(readFileSync(fixturesPath, 'utf8')).lawyer.id;
  const run = randomUUID();
  const users = await Promise.all(['client', 'other', 'lawyer'].map(label => prisma.user.create({ data: { email: `${label}-${run}@example.test`, name: `Payment edge ${label}`, passwordHash: 'unused-jwt-only-fixture', role: label === 'lawyer' ? 'LAWYER' : 'CLIENT', emailVerifiedAt: new Date(), emailNotifications: false, pushNotifications: false, subscriptionPlan: 'SINGLE' } })));
  [client, otherClient, lawyer] = users.map(user => user.id);
});
test.afterAll(async () => { await prisma.$disconnect(); });

async function book(request: APIRequestContext, minute: number, userId = client) {
  const startsAt = new Date(Date.now() + 7 * 86400000);
  startsAt.setUTCHours(12, minute, 0, 0);
  const response = await request.post(`${apiUrl}/api/consultations`, { headers: headers(userId), data: { lawyerId, startsAt, mode: 'chat', topic: 'Payment edge', notes: 'Synthetic payment edge booking.' } });
  expect(response.status()).toBe(201);
  return response.json();
}

test('real DB: duplicate webhook and verify racing grant exactly one credit', async ({ request }) => {
  const response = await request.post(`${apiUrl}/api/payments/order`, { headers: headers(lawyer), data: { plan: 'single' } });
  expect(response.ok()).toBeTruthy();
  const order = await response.json();
  const responses = await Promise.all([webhook(request, captured(order)), webhook(request, captured(order)), request.post(`${apiUrl}/api/payments/verify`, { headers: headers(lawyer), data: checkout(order) })]);
  expect(responses.slice(0, 2).map(r => r.status())).toEqual([200, 200]);
  expect([200, 409]).toContain(responses[2].status());
  expect((await prisma.user.findUniqueOrThrow({ where: { id: lawyer } })).documentCredits).toBe(1);
  expect(await prisma.payment.count({ where: { userId: lawyer, status: 'PAID' } })).toBe(1);
});

test('real DB: two different monthly orders extend access twice', async ({ request }) => {
  const initialExpiry = new Date(Date.now() + 86400000);
  await prisma.user.update({ where: { id: lawyer }, data: { subscriptionPlan: 'MONTHLY', subscriptionExpiry: initialExpiry } });
  const orders = await Promise.all([0, 1].map(async () => {
    const response = await request.post(`${apiUrl}/api/payments/order`, { headers: headers(lawyer), data: { plan: 'monthly' } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }));
  const responses = await Promise.all(orders.map(order => webhook(request, captured(order))));
  expect(responses.map(r => r.status())).toEqual([200, 200]);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: lawyer } })).subscriptionExpiry).toEqual(new Date(initialExpiry.getTime() + 60 * 86400000));
});

test('real DB: verify/webhook and concurrent cancellations book once and refund once', async ({ request }) => {
  const booking = await book(request, 0);
  const responses = await Promise.all([webhook(request, captured(booking.order)), request.post(`${apiUrl}/api/consultations/${booking.consultation.id}/verify-payment`, { headers: headers(client), data: checkout(booking.order) })]);
  expect(responses.map(r => r.status())).toEqual([200, 200]);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('BOOKED');
  const cancellations = await Promise.all([0, 1].map(() => request.patch(`${apiUrl}/api/consultations/${booking.consultation.id}/cancel`, { headers: headers(client) })));
  expect(cancellations.map(r => r.status())).toEqual([204, 204]);
  expect(await prisma.payment.findUniqueOrThrow({ where: { consultationId: booking.consultation.id } })).toMatchObject({ status: 'REFUNDED', refundStatus: 'PROCESSED', refundId: expect.stringMatching(/^rfnd_e2e_/) });
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('CANCELLED');
});

test('real DB: expired reservation taken by another client is refunded without resurrecting history', async ({ request }) => {
  const booking = await book(request, 10);
  await prisma.consultation.update({ where: { id: booking.consultation.id }, data: { createdAt: new Date(Date.now() - 16 * 60000) } });
  const replacement = await book(request, 10, otherClient);
  expect((await webhook(request, captured(booking.order))).status()).toBe(200);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('CANCELLED');
  expect(await prisma.payment.findUniqueOrThrow({ where: { consultationId: booking.consultation.id } })).toMatchObject({ status: 'REFUNDED', refundStatus: 'PROCESSED' });
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: replacement.consultation.id } })).status).toBe('PENDING_PAYMENT');
});

test('real DB: late capture expires a stale reservation even without a cleanup request', async ({ request }) => {
  const booking = await book(request, 20);
  await prisma.consultation.update({ where: { id: booking.consultation.id }, data: { createdAt: new Date(Date.now() - 16 * 60000) } });
  expect((await webhook(request, captured(booking.order))).status()).toBe(200);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('CANCELLED');
  expect((await prisma.payment.findUniqueOrThrow({ where: { consultationId: booking.consultation.id } })).status).toBe('REFUNDED');
});

test('real DB: cancelling while a capture webhook arrives never loses a paid refund', async ({ request }) => {
  const booking = await book(request, 30);
  const responses = await Promise.all([webhook(request, captured(booking.order)), request.patch(`${apiUrl}/api/consultations/${booking.consultation.id}/cancel`, { headers: headers(client) })]);
  expect(responses.map(r => r.status())).toEqual([200, 204]);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('CANCELLED');
  expect((await prisma.payment.findUniqueOrThrow({ where: { consultationId: booking.consultation.id } })).status).toBe('REFUNDED');
});

test('real DB: a last document credit is consumed once under concurrent creation', async ({ request }) => {
  await prisma.user.update({ where: { id: lawyer }, data: { subscriptionPlan: 'SINGLE', subscriptionExpiry: null, documentCredits: 1 } });
  const responses = await Promise.all([0, 1].map(() => request.post(`${apiUrl}/api/documents`, { headers: headers(lawyer), data: { title: 'Last credit document' } })));
  expect(responses.map(r => r.status()).sort()).toEqual([201, 402]);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: lawyer } })).documentCredits).toBe(0);
  expect(await prisma.document.count({ where: { userId: lawyer } })).toBe(1);
});

test('real DB: provider refund delivered before capture cannot resurrect a refunded booking', async ({ request }) => {
  const booking = await book(request, 40);
  const entity = captured(booking.order);
  const data = JSON.stringify({ event: 'refund.processed', payload: { payment: { entity }, refund: { entity: { id: `rfnd_external_${randomUUID()}`, payment_id: entity.id, amount: entity.amount, currency: entity.currency, status: 'processed' } } } });
  const response = await request.post(`${apiUrl}/api/payments/webhook`, { data, headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': createHmac('sha256', backendEnv.RAZORPAY_WEBHOOK_SECRET).update(data).digest('hex') } });
  expect(response.status()).toBe(200);
  expect((await webhook(request, entity)).status()).toBe(200);
  expect((await prisma.consultation.findUniqueOrThrow({ where: { id: booking.consultation.id } })).status).toBe('CANCELLED');
  expect(await prisma.payment.findUniqueOrThrow({ where: { consultationId: booking.consultation.id } })).toMatchObject({ status: 'REFUNDED', refundStatus: 'REVIEW' });
});
