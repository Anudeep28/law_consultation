import { test, expect } from '@playwright/test';

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
