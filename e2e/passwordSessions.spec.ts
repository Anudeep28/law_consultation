import { expect, test } from '@playwright/test';
import { randomInt, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });

test('password change preserves this browser while revoking old sessions, then logout-all revokes it too', async ({ page, request }) => {
  const password = 'Cedar-8!xz';
  const email = `session-${randomUUID()}@example.test`;
  const registered = await request.post('/api/auth/register', { data: {
    name: 'Password Session Test', email,
    phone: String(randomInt(7000000000, 9999999999)), password, role: 'client',
  } });
  expect(registered.status()).toBe(201);
  const { token: oldToken, user } = await registered.json();
  await page.addInitScript((token: string) => localStorage.setItem('law-writer-token', token), oldToken);
  await page.goto('/');
  await page.getByRole('button', { name: 'Account & Privacy', exact: true }).click();
  await expect(page.getByText(/10–128 characters/)).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill('Copper-47-river!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Copper-47-river!');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('Password changed. Your other sessions have been signed out.')).toBeVisible();
  const freshToken = await page.evaluate(() => localStorage.getItem('law-writer-token'));
  expect(freshToken).toBeTruthy();
  expect(freshToken).not.toBe(oldToken);
  expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${oldToken}` } })).status()).toBe(401);
  expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${freshToken}` } })).status()).toBe(200);
  await page.getByRole('button', { name: 'Log out of all devices', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('law-writer-token'))).toBeNull();
  expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${freshToken}` } })).status()).toBe(401);

  const login = await request.post('/api/auth/login', { data: { email, password: 'Copper-47-river!', role: 'client' } });
  expect(login.status()).toBe(200);
  const beforeReset = (await login.json()).token;
  expect((await request.post('/api/auth/forgot-password', { data: { email } })).status()).toBe(200);
  const reset = await prisma.passwordResetToken.findUniqueOrThrow({ where: { userId: user.id } });
  await page.goto(`/reset-password?token=${reset.token}`);
  await page.getByLabel('New password', { exact: true }).fill('Meadow-28-copper!');
  await page.getByLabel('Confirm password', { exact: true }).fill('Meadow-28-copper!');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Your password has been updated. You can sign in with it now.')).toBeVisible();
  expect((await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${beforeReset}` } })).status()).toBe(401);
  expect((await request.post('/api/auth/reset-password', { data: { token: reset.token, password: 'Another-new-password!' } })).status()).toBe(400);
  expect((await request.post('/api/auth/login', { data: { email, password: 'Meadow-28-copper!', role: 'client' } })).status()).toBe(200);
});
