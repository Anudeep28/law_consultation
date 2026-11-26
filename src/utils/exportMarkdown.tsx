import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ExportRun { text: string; bold: boolean; italics: boolean; href?: string }
export interface ExportBlock {
  kind: 'paragraph' | 'heading' | 'rule';
  runs: ExportRun[];
  level?: number;
  prefix?: string;
  depth?: number;
}

interface MarkdownNode { type: string; value?: string; children?: MarkdownNode[] }

const preserveLineBreaks = () => (tree: MarkdownNode) => {
  const visit = (node: MarkdownNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap(child => {
      if (child.type === 'text' && child.value?.includes('\n')) {
        return child.value.split('\n').flatMap((value, index) => [
          ...(index ? [{ type: 'break' }] : []), { type: 'text', value },
        ]);
      }
      visit(child);
      return [child];
    });
  };
  visit(tree);
};

const linkLabel = (children: React.ReactNode): string => React.Children.toArray(children).map(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? linkLabel(child.props.children) : String(child)
).join('');

export const parseExportMarkdown = (content: string): { html: string; blocks: ExportBlock[] } => {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm, preserveLineBreaks]} urlTransform={url => /^tel:/i.test(url) ? url : defaultUrlTransform(url)} components={{
    img: ({ alt }) => <>{alt}</>,
    a: ({ href, children }) => {
      const label = linkLabel(children);
      const duplicate = label === href || label === href?.replace(/^(?:mailto:|tel:)/i, '');
      return href ? <a href={href}>{children}{duplicate ? '' : ` (${href})`}</a> : <>{children}</>;
    },
    li: ({ node, ...props }) => {
      const offset = node?.position?.start.offset;
      const number = offset === undefined ? undefined : content.slice(offset).match(/^\s*(\d+)[.)]\s+/)?.[1];
      return <li {...props} value={number === undefined ? undefined : Number(number)} data-export-number={number} />;
    },
  }}>{content}</ReactMarkdown>);
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const blocks: ExportBlock[] = [];
  const inline = (nodes: Node[], bold = false, italics = false): ExportRun[] => nodes.flatMap(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.previousSibling?.nodeName === 'BR' ? (node.textContent || '').replace(/^\n/, '') : node.textContent || '';
      return [{ text: text.replace(/\n/g, ' '), bold, italics }];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const element = node as Element;
    if (['UL', 'OL'].includes(element.tagName)) return [];
    if (element.tagName === 'BR') return [{ text: '\n', bold, italics }];
    if (element.tagName === 'A' && element.getAttribute('href')) return inline([...node.childNodes], bold, italics).map(run => ({ ...run, href: element.getAttribute('href')! }));
    return inline([...node.childNodes], bold || element.tagName === 'STRONG', italics || element.tagName === 'EM');
  });
  const walk = (element: Element, depth = 0) => {
    if (element.tagName === 'HR') { blocks.push({ kind: 'rule', runs: [] }); return; }
    if (['UL', 'OL'].includes(element.tagName)) {
      const start = Number(element.getAttribute('start') || 1);
      [...element.children].forEach((item, index) => {
        blocks.push({ kind: 'paragraph', prefix: element.tagName === 'OL' ? `${item.getAttribute('data-export-number') || start + index}. ` : '• ', depth, runs: inline([...item.childNodes]) });
        [...item.children].filter(child => ['UL', 'OL'].includes(child.tagName)).forEach(child => walk(child, depth + 1));
      });
      return;
    }
    if (element.tagName === 'BLOCKQUOTE') { [...element.children].forEach(child => walk(child, depth)); return; }
    if (element.tagName === 'TABLE') {
      element.querySelectorAll('tr').forEach(row => blocks.push({ kind: 'paragraph', runs: [...row.children].flatMap((cell, index) => [...(index ? [{ text: ' | ', bold: false, italics: false }] : []), ...inline([...cell.childNodes])]) }));
      return;
    }
    const heading = /^H([1-6])$/.exec(element.tagName);
    blocks.push({ kind: heading ? 'heading' : 'paragraph', ...(heading ? { level: Number(heading[1]) } : {}), runs: inline([...element.childNodes]) });
  };
  [...body.children].forEach(element => walk(element));
  return { html, blocks };
};
