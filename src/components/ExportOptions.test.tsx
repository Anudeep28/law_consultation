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
