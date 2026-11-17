import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';

const { fixturesPath, secret } = require('./runtime.cjs');
const prisma = new PrismaClient();
type Account = { id: string; email: string };
type Fixtures = {
  password: string;
  client: Account;
  dismissClient: Account;
  tamperClient: Account;
  monthlyLawyer: Account;
  singleLawyer: Account;
  lawyer: { id: string; name: string };
};
let fixtures: Fixtures;

test.beforeAll(() => { fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')); });
test.afterAll(async () => { await prisma.$disconnect(); });

async function fakeCheckout(page: Page, scenario: 'paid' | 'dismiss' | 'tamper' = 'paid') {
  await page.route('https://checkout.razorpay.com/**', (route) => route.abort());
  await page.exposeFunction('e2eSignPayment', (orderId: string, paymentId: string) =>
    createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex'));
  await page.addInitScript((mode) => {
    type Options = {
      order_id: string;
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => Promise<void>;
      modal: { ondismiss: () => void };
    };
    const browser = window as unknown as {
      Razorpay: unknown;
      e2eSignPayment: (orderId: string, paymentId: string) => Promise<string>;
    };
    browser.Razorpay = class {
      constructor(private options: Options) {}
      async open() {
        if (mode === 'dismiss') return this.options.modal.ondismiss();
        const orderId = this.options.order_id;
        const paymentId = `pay_e2e_${orderId}`;
        const signature = await browser.e2eSignPayment(orderId, paymentId);
        await this.options.handler({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: mode === 'tamper' ? '0'.repeat(64) : signature,
        });
      }
    };
  }, scenario);
}

async function login(page: Page, account: Account, role: 'Client' | 'Lawyer') {
  await page.goto('/');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(fixtures.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account & Privacy', exact: true })).toBeVisible();
}

async function book(page: Page, account: Account, offset: number) {
  await login(page, account, 'Client');
  const card = page.getByRole('article').filter({ hasText: fixtures.lawyer.name });
  const slotsResponse = page.waitForResponse((response) => response.url().endsWith(`/api/lawyers/${fixtures.lawyer.id}/slots`) && response.ok());
  await card.getByRole('button', { name: 'Chat', exact: true }).click();
  const { slots } = await (await slotsResponse).json() as { slots: string[] };
  const slot = slots.filter((value) => new Date(value).getTime() > Date.now() + 3600_000)[offset];
  expect(slot, 'A slot at least one hour in the future must exist').toBeTruthy();
  const label = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(slot));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: label, exact: true }).click();
  const topic = `E2E payment ${account.id}`;
  await dialog.getByPlaceholder('e.g. Review a rental dispute').fill(topic);
  await dialog.getByPlaceholder('Share the key facts and your questions. Avoid unnecessary sensitive information.').fill('Please review this isolated test contract before signing.');
  const orderResponse = page.waitForResponse((response) => response.url().endsWith('/api/consultations') && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: /^Pay .* & book$/ }).click();
  const response = await orderResponse;
  expect(response.status()).toBe(201);
  const order = await response.json();
  expect(order.order.orderId).toMatch(/^order_e2e_/);
  return { id: order.consultation.id as string, topic };
}

test('lawyer buys monthly access', async ({ page }) => {
  await fakeCheckout(page);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.monthlyLawyer.id } });
  await login(page, fixtures.monthlyLawyer, 'Lawyer');
  await page.getByRole('button', { name: 'Subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Subscribe monthly', exact: true }).click();
  await expect(page.getByText('Monthly subscription activated.', { exact: true })).toBeVisible();
  const after = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
  expect(after.subscriptionPlan).toBe('MONTHLY');
  expect(after.subscriptionExpiry!.getTime()).toBeGreaterThan(Math.max(Date.now(), before.subscriptionExpiry!.getTime()));
  const payments = await prisma.payment.findMany({ where: { userId: before.id } });
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ status: 'PAID', plan: 'MONTHLY', amount: 49900 });
  expect(payments[0].razorpayOrderId).toMatch(/^order_e2e_/);
});

test('lawyer buys a single credit without losing the trial', async ({ page }) => {
  await fakeCheckout(page);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: fixtures.singleLawyer.id } });
  await login(page, fixtures.singleLawyer, 'Lawyer');
  await page.getByRole('button', { name: 'Subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Buy one document', exact: true }).click();
  await expect(page.getByText('One document credit added.', { exact: true })).toBeVisible();
  await expect(page.getByText(`Credits available: ${before.documentCredits + 1}`, { exact: true })).toBeVisible();
  const after = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
  expect(after.documentCredits).toBe(before.documentCredits + 1);
  expect(after.subscriptionPlan).toBe('TRIAL');
  const payments = await prisma.payment.findMany({ where: { userId: before.id } });
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ status: 'PAID', plan: 'SINGLE', amount: 1000 });
  expect(payments[0].razorpayOrderId).toMatch(/^order_e2e_/);
});

test('client pays and sees a booked consultation', async ({ page }) => {
  await fakeCheckout(page);
  const booking = await book(page, fixtures.client, 0);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const card = page.getByRole('article').filter({ hasText: booking.topic });
  await expect(card).toBeVisible();
  await expect(card.getByText('booked', { exact: true })).toBeVisible();
  const consultation = await prisma.consultation.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } });
  expect(consultation.status).toBe('BOOKED');
  expect(consultation.userId).toBe(fixtures.client.id);
  expect(consultation.payment).toMatchObject({ status: 'PAID', plan: 'CONSULTATION', amount: 25000 });
});

for (const [scenario, accountKey, offset, message] of [
  ['dismiss', 'dismissClient', 1, 'Unable to book consultation.'],
  ['tamper', 'tamperClient', 2, 'Invalid payment signature'],
] as const) {
  test(`client ${scenario === 'dismiss' ? 'dismisses checkout' : 'sends a tampered signature'}`, async ({ page }) => {
    await fakeCheckout(page, scenario);
    const account = fixtures[accountKey];
    const booking = await book(page, account, offset);
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(message);
    const consultation = await prisma.consultation.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } });
    expect(consultation.status).toBe('PENDING_PAYMENT');
    expect(consultation.payment).toMatchObject({ status: 'CREATED', razorpayPaymentId: null });
    expect(await prisma.consultation.count({ where: { userId: account.id, status: 'BOOKED' } })).toBe(0);
    expect(await prisma.payment.count({ where: { userId: account.id, status: 'PAID' } })).toBe(0);
  });
}
