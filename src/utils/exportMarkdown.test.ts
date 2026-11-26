import { expect, test } from 'vitest';
import { parseExportMarkdown } from './exportMarkdown';

test('uses preview Markdown semantics while preserving template placeholders and nested lists', () => {
  const { blocks } = parseExportMarkdown('# **AFFIDAVIT** {{full_name}}\n\n*Italic* and **bold**\n\n---\n\n3. First\n4. Second\n   - Child {{address}}');
  expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, runs: [{ text: 'AFFIDAVIT', bold: true }, { text: ' {{full_name}}' }] });
  expect(blocks[1].runs[0]).toMatchObject({ text: 'Italic', italics: true });
  expect(blocks[2].kind).toBe('rule');
  expect(blocks[3].prefix).toBe('3. ');
  expect(blocks[4].prefix).toBe('4. ');
  expect(blocks[5]).toMatchObject({ prefix: '• ', depth: 1, runs: [{ text: 'Child {{address}}' }] });
});

test('empty Markdown produces an empty export model', () => {
  expect(parseExportMarkdown('')).toEqual({ html: '', blocks: [] });
});

test('preserves skipped and nested clause numbers in the export model and HTML', () => {
  const { blocks, html } = parseExportMarkdown('1. First\n2. Second\n5. Fifth\n   1. Nested first\n   4. Nested fourth');
  expect(blocks.map(block => block.prefix)).toEqual(['1. ', '2. ', '5. ', '1. ', '4. ']);
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect([...document.querySelectorAll('ol > li')].map(item => item.getAttribute('value'))).toEqual(['1', '2', '5', '1', '4']);
});

test('preserves consecutive single lines and explicit Markdown breaks in export text and HTML', () => {
  const { blocks, html } = parseExportMarkdown('01 Jan: Filed\n02 Jan: Served\n03 Jan: Heard\n\n**Signed**  \n{{signature}}');
  expect(blocks[0].runs.map(run => run.text).join('')).toBe('01 Jan: Filed\n02 Jan: Served\n03 Jan: Heard');
  expect(blocks[1].runs.map(run => run.text).join('')).toBe('Signed\n{{signature}}');
  expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('br')).toHaveLength(3);
});

test('preserves destinations for named and reference links without duplicating autolink URLs', () => {
  const { blocks, html } = parseExportMarkdown('[**Court filing**](https://example.test/case?x=1&y=2) and [registry][ref]\n\n[ref]: https://example.test/registry\n\n<https://example.test/contact>');
  expect(blocks[0].runs.map(run => run.text).join('')).toBe('Court filing (https://example.test/case?x=1&y=2) and registry (https://example.test/registry)');
  expect(blocks[1].runs.map(run => run.text).join('')).toBe('https://example.test/contact');
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.body.textContent).toContain('Court filing (https://example.test/case?x=1&y=2)');
  expect(document.querySelector('strong')?.textContent).toBe('Court filing');
});

test('deduplicates URL, email and telephone labels while retaining hyperlink targets', () => {
  const { blocks, html } = parseExportMarkdown('advocate@example.test\n\n[**advocate@example.test**](mailto:advocate@example.test)\n\n[+919876543210](tel:+919876543210)\n\n<https://example.test/contact>');
  expect(blocks.map(block => block.runs.map(run => run.text).join(''))).toEqual([
    'advocate@example.test', 'advocate@example.test', '+919876543210', 'https://example.test/contact',
  ]);
  expect(blocks.map(block => block.runs[0].href)).toEqual([
    'mailto:advocate@example.test', 'mailto:advocate@example.test', 'tel:+919876543210', 'https://example.test/contact',
  ]);
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelectorAll('a')).toHaveLength(4);
  expect(document.body.textContent).not.toContain('(mailto:');
  expect(document.body.textContent).not.toContain('(tel:');
});

test.each(['+91 98765-43210', '+91 (98765) 43210', '+91.98765.43210'])('prints the formatted telephone label %s once', label => {
  const { blocks, html } = parseExportMarkdown(`[${label}](tel:+919876543210)`);
  expect(blocks[0].runs.map(run => run.text).join('')).toBe(label);
  expect(blocks[0].runs[0].href).toBe('tel:+919876543210');
  expect(new DOMParser().parseFromString(html, 'text/html').body.textContent).toBe(label);
});

test('raw HTML and Markdown images cannot add executable markup or network requests', () => {
  const { html } = parseExportMarkdown('<img src="https://example.test/a" onerror="alert(1)">\n\n![Description](https://example.test/b)\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert%281%29)');
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('img, script, link, [onerror], a[href^="javascript:"]')).toBeNull();
  expect(document.body.textContent).toContain('Description');
});
