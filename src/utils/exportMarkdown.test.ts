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

test('raw HTML and Markdown images cannot add executable markup or network requests', () => {
  const { html } = parseExportMarkdown('<img src="https://example.test/a" onerror="alert(1)">\n\n![Description](https://example.test/b)\n\n<script>alert(1)</script>');
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('img, script, link, [onerror]')).toBeNull();
  expect(document.body.textContent).toContain('Description');
});
