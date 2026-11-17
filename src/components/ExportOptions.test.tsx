import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportOptions } from './ExportOptions';
import { Document } from '../types';
import { Packer } from 'docx';
import { saveAs } from 'file-saver';
import { Toasts, useToastStore } from './ui/Toasts';

jest.mock('file-saver', () => ({ saveAs: jest.fn() }));
jest.mock('jspdf', () => {
  return jest.fn().mockImplementation(() => ({
    internal: { pageSize: { height: 297, width: 210 } },
    setFontSize: jest.fn(),
    setFont: jest.fn(),
    splitTextToSize: jest.fn((text: string) => [text]),
    text: jest.fn(),
    save: jest.fn(),
    addPage: jest.fn(),
  }));
});

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
  beforeEach(() => {
    (Packer.toBlob as jest.Mock).mockResolvedValue(new Blob([], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  });

  it('exports DOCX with Times New Roman for English', async () => {
    render(<ExportOptions document={mockDocument('en')} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBlob).toHaveBeenCalled());
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.docx');
  });

  it('exports DOCX with Kruti Dev for Marathi', async () => {
    render(<ExportOptions document={mockDocument('mr')} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBlob).toHaveBeenCalled());
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'Test Document.docx');
  });

  it('keeps the export modal open and announces packing failures', async () => {
    useToastStore.setState({ toasts: [] });
    (Packer.toBlob as jest.Mock).mockRejectedValueOnce(new Error('Packing failed'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = jest.fn();
    render(<><ExportOptions document={mockDocument()} onClose={onClose} /><Toasts /></>);
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export failed. Please try again.');
    expect(onClose).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
