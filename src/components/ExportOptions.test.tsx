import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportOptions } from './ExportOptions';
import { Document } from '../types';
import { Packer } from 'docx';

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
  it('exports DOCX with Times New Roman for English', async () => {
    render(<ExportOptions document={mockDocument('en')} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBuffer).toHaveBeenCalled());
  });

  it('exports DOCX with Kruti Dev for Marathi', async () => {
    render(<ExportOptions document={mockDocument('mr')} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    await waitFor(() => expect(Packer.toBuffer).toHaveBeenCalled());
  });
});
