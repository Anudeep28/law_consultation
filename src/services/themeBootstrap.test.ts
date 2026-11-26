import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';

const source = readFileSync('public/theme.js', 'utf8');
test.each([
  ['dark', false, true], ['light', true, false], ['system', true, true],
  ['system', false, false], ['invalid', true, true], [null, false, false],
])('bootstrap resolves stored %s with system dark=%s before React', (saved, systemDark, expected) => {
  document.documentElement.className = '';
  runInNewContext(source, { document, localStorage: { getItem: () => saved }, window: { matchMedia: () => ({ matches: systemDark }) } });
  expect(document.documentElement.classList.contains('dark')).toBe(expected);
  expect(document.documentElement.style.colorScheme).toBe(expected ? 'dark' : 'light');
});
test('bootstrap tolerates unavailable storage and media queries', () => {
  runInNewContext(source, { document, localStorage: { getItem: () => { throw new Error('Blocked'); } }, window: {} });
  expect(document.documentElement).not.toHaveClass('dark');
});
test('the blocking self-hosted bootstrap precedes the application module', () => {
  const html = readFileSync('index.html', 'utf8');
  expect(html.indexOf('src="/theme.js"')).toBeLessThan(html.indexOf('type="module"'));
  expect(html).not.toMatch(/<script[^>]*(?:async|defer)[^>]*src="\/theme.js"/);
});
