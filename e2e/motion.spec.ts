import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';

const { fixturesPath } = require('./runtime.cjs');

test('navigation stays usable while the lazy Motion features are loading', async ({ page, request }) => {
  const { client, password } = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const login = await request.post('/api/auth/login', { data: { email: client.email, password, role: 'client' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('law-writer-token', value), token);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/motionFeatures(?:\.ts|-[^/]+\.js)(?:\?.*)?$/, async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Account & Privacy', exact: true }).click();
    await expect(page.getByText(/10–128 characters/)).toBeVisible();
  } finally { release(); }
  await page.getByRole('button', { name: 'Consult a Lawyer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clear legal guidance, when you need it' })).toBeVisible();
});
