import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';

const { fixturesPath } = require('./runtime.cjs');
const JSZip = require('jszip');

test('DOCX and PDF preserve clause numbers, chronology lines and link destinations', async ({ page, request }, testInfo) => {
  const { bookingLawyer, password } = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const login = await request.post('/api/auth/login', { data: { email: bookingLawyer.email, password, role: 'lawyer' } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  await page.addInitScript(value => localStorage.setItem('law-writer-token', value), token);
  const content = '# **AFFIDAVIT** {{full_name}}\n\n1. First\n2. Second\n5. Fifth\n\n01 Jan: Filed\n02 Jan: Served\n03 Jan: Heard\n\n[Court filing](https://example.test/case)\n\nadvocate@example.test\n\n[+919876543210](tel:+919876543210)\n\nhttps://example.test/contact';
  await page.route('**/api/documents', route => route.fulfill({ json: { documents: [{
    id: 'export-regression', title: 'Export regression fixture', content, language: 'en', userId: bookingLawyer.id,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: /^My Documents/ }).click();
  await page.getByText('Export regression fixture', { exact: true }).click();
  await expect(page.getByLabel('Document content')).toHaveValue(content);
  for (const format of ['docx', 'pdf']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export Document' });
    if (format === 'pdf') await dialog.getByRole('radio', { name: /PDF/ }).click();
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const path = testInfo.outputPath(`affidavit.${format}`);
    await (await downloaded).saveAs(path);
    const bytes = readFileSync(path);
    if (format === 'docx') {
      const archive = await JSZip.loadAsync(bytes);
      const xml: string = await archive.file('word/document.xml').async('string');
      const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)].map(match => match[1]).join('');
      expect(text).toContain('5. Fifth');
      expect(text).not.toContain('3. Fifth');
      expect(text).toContain('Court filing (https://example.test/case)');
      expect(text).toContain('AFFIDAVIT {{full_name}}');
      expect(xml.match(/<w:br\s*\/>/g)).toHaveLength(2);
      expect(text).not.toContain('**');
      expect(text.match(/advocate@example\.test/g)).toHaveLength(1);
      expect(text.match(/\+919876543210/g)).toHaveLength(1);
      expect(text.match(/https:\/\/example\.test\/contact/g)).toHaveLength(1);
      const relationships: string = await archive.file('word/_rels/document.xml.rels').async('string');
      expect(relationships).toContain('Target="mailto:advocate@example.test"');
      expect(relationships).toContain('Target="tel:+919876543210"');
    } else {
      const lines = [...bytes.toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
        .map(match => match[1].replace(/\\([\\()])/g, '$1'));
      expect(lines).toEqual(expect.arrayContaining([
        '5. Fifth', '01 Jan: Filed', '02 Jan: Served', '03 Jan: Heard', 'Court filing (https://example.test/case)',
        'advocate@example.test', '+919876543210', 'https://example.test/contact',
      ]));
      expect(lines.join('\n')).not.toContain('**');
      expect(lines.join('\n')).not.toContain('mailto:');
      expect(lines.join('\n')).not.toContain('tel:');
    }
  }
});
