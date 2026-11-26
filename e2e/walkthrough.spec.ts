import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';

const { fixturesPath } = require('./runtime.cjs');

test('mobile drawer opens all legal policies and the editor new-document control is named', async ({ page, request }) => {
  const { bookingLawyer, password } = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const login = await request.post('/api/auth/login', { data: { email: bookingLawyer.email, password, role: 'lawyer' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(value => localStorage.setItem('law-writer-token', value), token);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const policies = page.getByRole('region', { name: 'Legal policies' });
  for (const name of ['Terms of Service', 'Privacy Policy', 'Refund & Cancellation Policy', 'Disclaimer']) {
    await policies.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog.getByRole('heading', { name, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Document Editor', exact: true }).click();
  const create = page.getByRole('button', { name: 'New Document', exact: true });
  await expect(create).toBeVisible();
  await create.click();
  await expect(page.getByRole('heading', { name: 'Create New Document', exact: true })).toBeVisible();
});
