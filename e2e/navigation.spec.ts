import { expect, test, type Route } from '@playwright/test';
import { randomInt, randomUUID } from 'crypto';

test.use({ reducedMotion: 'no-preference' });

for (const loadBeforeNavigation of [false, true]) {
  test(loadBeforeNavigation
    ? 'account navigation completes after consultation data has loaded'
    : 'account navigation completes when consultation data arrives during the previous view exit', async ({ page, request }) => {
    const registered = await request.post('/api/auth/register', { data: {
      name: 'Navigation Exit Test', email: `navigation-${randomUUID()}@example.test`,
      phone: String(randomInt(7000000000, 9999999999)), password: 'Cedar-8!xz', role: 'client',
    } });
    expect(registered.status()).toBe(201);
    const { token } = await registered.json();
    await page.addInitScript(value => localStorage.setItem('law-writer-token', value), token);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const requestStarted = new Promise<void>(resolve => { requested = resolve; });
    const deferData = async (route: Route) => {
      requested();
      await gate;
      await route.continue();
    };
    await page.route('**/api/lawyers', deferData);
    await page.route('**/api/consultations', deferData);
    try {
      await page.goto('/');
      await requestStarted;
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 1000));
      const directory = page.getByRole('heading', { name: 'Clear legal guidance, when you need it' });
      if (loadBeforeNavigation) {
        release();
        await expect(directory).toBeAttached();
      }
      await page.getByRole('button', { name: 'Account & Privacy', exact: true }).dispatchEvent('click');
      await expect(page.getByRole('heading', { name: 'Account & Privacy', exact: true, level: 2 })).toBeVisible();
      if (!loadBeforeNavigation) {
        release();
        await expect(directory).toBeAttached();
      }
      await page.clock.runFor(1000);
      await page.clock.resume();
      await expect(page.getByText(/10–128 characters/)).toBeVisible();
      await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
      await expect(directory).toHaveCount(0);
    } finally { release(); }
  });
}
