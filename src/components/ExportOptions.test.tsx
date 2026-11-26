import { vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportOptions } from './ExportOptions';
import { Document } from '../types';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Toasts, useToastStore } from './ui/Toasts';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('jspdf', () => {
  return { jsPDF: vi.fn(function () { return {
    internal: { pageSize: { height: 297, width: 210 } },
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    splitTextToSize: vi.fn((text: string) => [text]),
    text: vi.fn(),
    save: vi.fn(),
    addPage: vi.fn(),
    getNumberOfPages: vi.fn(() => 1),
    setPage: vi.fn(),
    setTextColor: vi.fn(),
    addImage: vi.fn(),
    line: vi.fn(),
    setDrawColor: vi.fn(),
  }; }) };
});
vi.mock('html2canvas', () => ({ default: vi.fn().mockResolvedValue({ width: 600, height: 600, toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' }) }));

const mockDocument = (language = 'en'): Document => ({
  id: 'doc-1',
  title: 'Test Document',
  content: '# Heading\n\nBody text with **bold**.',
  language,
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-1',
});

describe('ExportOptions', () => {
  const formattedContent = '# **AFFIDAVIT** {{full_name}}\n\n## *Details*\n\n---\n\n- **First** item\n\n3. _Second_ item\n\nPlain *italics* and **bold**.';

  it('renders heading inline formatting, rules and list text in DOCX without leaking Markdown', async () => {
    const onClose = vi.fn();
    render(<ExportOptions document={{ ...mockDocument(), content: formattedContent }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const packed = (Packer.toBlob as Mock).mock.calls[0][0] as unknown as { sections: { children: { props: { children: { props: { text?: string; bold?: boolean; italics?: boolean } }[]; border?: unknown } }[] }[] };
    const paragraphs = packed.sections[0].children.map(paragraph => paragraph.props);
    const text = paragraphs.map(paragraph => paragraph.children.map(run => run.props.text || '').join('')).join('\n');
    expect(text).toContain('AFFIDAVIT {{full_name}}');
    expect(text).not.toMatch(/\*\*|---|_Second_/);
    expect(paragraphs[0].children.some(run => run.props.bold)).toBe(true);
    expect(paragraphs.some(paragraph => paragraph.children.some(run => run.props.italics))).toBe(true);
    expect(paragraphs.some(paragraph => paragraph.border)).toBe(true);
    expect(text).toContain('3. Second item');
  });

  it('renders vector PDF headings, rules and list content without literal Markdown', async () => {
    const onClose = vi.fn();
    render(<ExportOptions document={{ ...mockDocument(), content: formattedContent }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const pdf = (jsPDF as unknown as Mock).mock.results[0].value;
    const text = pdf.text.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(text).toContain('AFFIDAVIT {{full_name}}');
    expect(text).toContain('3. Second item');
    expect(text).not.toMatch(/\*\*|---|_Second_/);
    expect(pdf.line).toHaveBeenCalled();
  });

  it('uses semantic, inert Markdown HTML for the non-Latin PDF renderer', async () => {
    const onClose = vi.fn();
    render(<ExportOptions document={{ ...mockDocument('mr'), content: formattedContent + '\n\n<img src="https://example.test/image" onerror="alert(1)">\n\n![Local description](https://example.test/image)' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const container = (html2canvas as Mock).mock.calls[0][0] as HTMLElement;
    expect(container.querySelector('h1 strong')).toHaveTextContent('AFFIDAVIT');
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('ol li em')).toHaveTextContent('Second');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('{{full_name}}');
  });

  it('exports empty Markdown without packing a DOCX or rendering a PDF', async () => {
    const onClose = vi.fn();
    render(<ExportOptions document={{ ...mockDocument(), content: '' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /Markdown/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.md'));
    expect(Packer.toBlob).not.toHaveBeenCalled();
    expect(jsPDF).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it.each(['docx', 'pdf'])('exports an empty %s document', async format => {
    const onClose = vi.fn();
    render(<ExportOptions document={{ ...mockDocument(), content: '' }} onClose={onClose} />);
    if (format === 'pdf') fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    if (format === 'docx') expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.docx');
    else expect((jsPDF as unknown as Mock).mock.results[0].value.save).toHaveBeenCalledWith('Test Document.pdf');
  });

  it('keeps the export modal open and announces PDF renderer failures', async () => {
    useToastStore.setState({ toasts: [] });
    (jsPDF as unknown as Mock).mockImplementationOnce(() => { throw new Error('PDF renderer failed'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(<><ExportOptions document={mockDocument()} onClose={onClose} /><Toasts /></>);
    fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each(['en', 'mr'])('exports %s PDF after loading its renderer', async language => {
    const onClose = vi.fn();
    render(<ExportOptions document={mockDocument(language)} onClose={onClose} />);
    fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(jsPDF).toHaveBeenCalled();
    expect(html2canvas).toHaveBeenCalledTimes(language === 'en' ? 0 : 1);
    expect(Packer.toBlob).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    (Packer.toBlob as Mock).mockResolvedValue(new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  });

  it('exports DOCX with Times New Roman for English', async () => {
    render(<ExportOptions document={mockDocument('en')} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBlob).toHaveBeenCalled());
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.docx');
  });

  it('exports DOCX with Kruti Dev for Marathi', async () => {
    render(<ExportOptions document={mockDocument('mr')} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBlob).toHaveBeenCalled());
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.docx');
  });

  it('keeps the export modal open and announces packing failures', async () => {
    useToastStore.setState({ toasts: [] });
    (Packer.toBlob as Mock).mockRejectedValueOnce(new Error('Packing failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(<><ExportOptions document={mockDocument()} onClose={onClose} /><Toasts /></>);
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
