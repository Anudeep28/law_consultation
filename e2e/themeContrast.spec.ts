import { test, expect } from '@playwright/test';

const contrast = (foreground: number[], background: number[]) => {
  const luminance = (color: number[]) => color.map(value => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
};

test('lawyer workspace banner copy contrasts with every gradient stop in dark mode', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('law-writer-theme', 'dark'); localStorage.setItem('law-writer-token', 'banner-test'); });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'banner-lawyer', name: 'Banner Lawyer', email: 'banner@example.test', role: 'lawyer', emailVerified: true, phoneVerified: true, subscriptionPlan: 'trial' } } }));
  await page.route('**/api/documents', route => route.fulfill({ json: { documents: [] } }));
  await page.route('**/api/notifications**', route => route.fulfill({ json: { notifications: [], unreadCount: 0 } }));
  await page.route('**/api/lawyers/me', route => route.fulfill({ json: { lawyer: null } }));
  await page.route('**/api/lawyer/consultations', route => route.fulfill({ json: { consultations: [] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Client Consultations', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Client consultations', exact: true });
  await expect(heading).toBeVisible();
  const colors = await heading.evaluate(element => {
    const banner = element.parentElement!;
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    return {
      stops: [...getComputedStyle(banner).backgroundImage.matchAll(/rgba?\(([^)]+)\)/g)].map(match => rgb(match[1])),
      foregrounds: [element, banner.querySelector('p')!, banner.querySelector('span')!].map(node => rgb(getComputedStyle(node).color)),
    };
  });
  expect(colors.stops.length).toBeGreaterThanOrEqual(2);
  for (const stop of colors.stops) for (const foreground of colors.foregrounds) expect(contrast(foreground, stop)).toBeGreaterThanOrEqual(4.5);
});

const fills = [
  ['Primary', 'bg-brand hover:bg-brand-dark'],
  ['Buy one document / Stop', 'bg-brand-darker hover:bg-brand-dark'],
  ['Pause / Resume', 'bg-accent-dark hover:bg-warning-ink'],
  ['Undo', 'bg-ink-faint hover:bg-ink-muted'],
  ['Amber highlight', 'bg-accent'],
  ['Destructive recording', 'bg-red-600'],
  ['Recording indicator', 'bg-red-500'],
] as const;

test('dark filled control labels meet AA at rest and on hover', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('law-writer-theme', 'dark'); });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Client sign in' }).waitFor();
  await page.evaluate(fills => {
    const fixture = document.createElement('section');
    fixture.setAttribute('aria-label', 'Contrast regression controls');
    fixture.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgb(var(--cream));padding:2rem';
    for (const [label, classes] of fills) {
      const button = document.createElement('button');
      button.className = `text-white p-4 m-2 ${classes}`;
      button.textContent = label;
      fixture.append(button);
    }
    document.getElementById('root')!.append(fixture);
  }, fills);
  const controls = page.getByRole('region', { name: 'Contrast regression controls' });
  for (const [label] of fills) {
    const button = controls.getByRole('button', { name: label, exact: true });
    for (const state of ['rest', 'hover']) {
      if (state === 'hover') await button.hover();
      await expect.poll(() => button.evaluate(element => {
        const style = getComputedStyle(element);
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
            const s = value / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      }), { message: `${label} (${state}) text contrast` }).toBeGreaterThanOrEqual(4.5);
    }
  }
});
