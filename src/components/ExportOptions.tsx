import { notify } from './ui/Toasts';
import React, { useState } from 'react';
import { Document } from '../types';
import type { jsPDF } from 'jspdf';
import { getDocumentFontName, getDocumentFontFamily } from '../utils/documentFonts';
import { Modal } from './ui/Modal';
import { parseExportMarkdown } from '../utils/exportMarkdown';

interface ExportOptionsProps {
  document: Document;
  onClose: () => void;
}

export const ExportOptions: React.FC<ExportOptionsProps> = ({ document, onClose }) => {
  const [format, setFormat] = useState<'docx' | 'pdf' | 'markdown'>('docx');
  const [filename, setFilename] = useState(document.title);
  const [isExporting, setIsExporting] = useState(false);

  const exportAsMarkdown = async () => {
    const { saveAs } = await import('file-saver');
    const blob = new Blob([document.content], { type: 'text/markdown' });
    saveAs(blob, `${filename}.md`);
  };

  const documentFont = getDocumentFontName(document.language);

  const exportAsDocx = async () => {
    try {
      const [{ Document: DocxDocument, Packer, Paragraph, TextRun }, { saveAs }] = await Promise.all([
        import('docx'), import('file-saver'),
      ]);
      const { blocks } = parseExportMarkdown(document.content);
      const paragraphs = blocks.map(block => {
        if (block.kind === 'rule') return new Paragraph({ children: [], border: { bottom: { color: '999999', style: 'single', size: 6, space: 1 } } });
        const heading = block.kind === 'heading';
        const size = heading ? block.level === 1 ? 32 : block.level === 2 ? 28 : 24 : undefined;
        return new Paragraph({
          children: [
            ...(block.prefix ? [new TextRun({ text: block.prefix, font: documentFont })] : []),
            ...block.runs.map(run => new TextRun({ ...run, bold: heading || run.bold, size, font: documentFont })),
          ],
          ...(heading ? { heading: block.level === 1 ? 'Title' : block.level === 2 ? 'Heading1' : 'Heading2' } : {}),
          ...(block.depth ? { indent: { left: block.depth * 360 } } : {}),
          spacing: { after: 160 },
        });
      });
      if (!paragraphs.length) paragraphs.push(new Paragraph({ children: [new TextRun({ text: '', font: documentFont })] }));

      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${filename}.docx`);
    } catch (error) {
      console.error('Error exporting DOCX:', error);
      throw error;
    }
  };

  const isNonLatinDocument = document.language && document.language !== 'en';

  const addPageNumbers = (pdf: jsPDF) => {
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(128, 128, 128);
      pdf.text(
        `Page ${i} of ${totalPages}`,
        pdf.internal.pageSize.width / 2,
        pdf.internal.pageSize.height - 10,
        { align: 'center' }
      );
      pdf.setTextColor(0, 0, 0);
    }
  };

  const exportAsPdfCanvas = async () => {
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas'),
      ]);
      const fontFamily = getDocumentFontFamily(document.language);
      const { html: htmlContent } = parseExportMarkdown(document.content);

      const container = window.document.createElement('div');
      container.style.cssText = `
        position: absolute; left: -9999px; top: 0;
        width: 640px; padding: 40px;
        font-family: ${fontFamily};
        font-size: 14px; line-height: 1.7; color: #000;
        background: #fff; color-scheme: light;
      `;
      container.className = 'document-export';
      container.innerHTML = `
        <style>
          .document-export h1 { font-size: 22px; font-weight: bold; margin: 16px 0 8px; }
          .document-export h2 { font-size: 18px; font-weight: bold; margin: 14px 0 6px; }
          .document-export h3 { font-size: 16px; font-weight: bold; margin: 12px 0 4px; }
          .document-export p { margin: 8px 0; }
          .document-export ul { list-style: disc; padding-left: 20px; }
          .document-export ol { list-style: decimal; padding-left: 20px; }
          .document-export li { margin: 4px 0; }
          .document-export hr { border-top: 1px solid #999; margin: 12px 0; }
        </style>
        ${htmlContent}
      `;
      window.document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      window.document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.width;
      const pageHeight = pdf.internal.pageSize.height;
      const margin = 15;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2 - 10; // leave room for page number

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const scaledHeight = (usableWidth / imgWidth) * imgHeight;

      if (scaledHeight <= usableHeight) {
        pdf.addImage(imgData, 'JPEG', margin, margin, usableWidth, scaledHeight);
      } else {
        // Split across pages
        const pageImgHeight = (usableHeight / usableWidth) * imgWidth;
        let srcY = 0;
        let pageIndex = 0;

        while (srcY < imgHeight) {
          if (pageIndex > 0) pdf.addPage();
          const sliceHeight = Math.min(pageImgHeight, imgHeight - srcY);
          const sliceCanvas = window.document.createElement('canvas');
          sliceCanvas.width = imgWidth;
          sliceCanvas.height = sliceHeight;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, imgWidth, sliceHeight);
            ctx.drawImage(canvas, 0, srcY, imgWidth, sliceHeight, 0, 0, imgWidth, sliceHeight);
          }
          const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
          const renderedHeight = (usableWidth / imgWidth) * sliceHeight;
          pdf.addImage(sliceData, 'JPEG', margin, margin, usableWidth, renderedHeight);
          srcY += sliceHeight;
          pageIndex++;
        }
      }

      addPageNumbers(pdf);
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      throw error;
    }
  };

  const exportAsPdfText = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const { blocks } = parseExportMarkdown(document.content);
      let yPosition = 25;
      const lineHeight = 7;
      const pageHeight = pdf.internal.pageSize.height;
      const marginLeft = 25;
      const marginRight = 25;
      const pageWidth = pdf.internal.pageSize.width;
      const maxWidth = pageWidth - marginLeft - marginRight;
      const bottomMargin = 25;

      const addWrappedText = (text: string, fontSize: number, style: string, extraSpacing = 0) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('times', style);
        const wrapped = pdf.splitTextToSize(text, maxWidth);
        wrapped.forEach((wrappedLine: string) => {
          if (yPosition > pageHeight - bottomMargin) {
            pdf.addPage();
            yPosition = 25;
          }
          pdf.text(wrappedLine, marginLeft, yPosition);
          yPosition += lineHeight;
        });
        yPosition += extraSpacing;
      };

      blocks.forEach(block => {
        if (block.kind === 'rule') {
          if (yPosition > pageHeight - bottomMargin) { pdf.addPage(); yPosition = 25; }
          pdf.setDrawColor(153, 153, 153);
          pdf.line(marginLeft, yPosition, pageWidth - marginRight, yPosition);
          yPosition += lineHeight;
          return;
        }
        const text = (block.prefix || '') + block.runs.map(run => run.text).join('');
        const heading = block.kind === 'heading';
        addWrappedText(text, heading ? block.level === 1 ? 20 : block.level === 2 ? 16 : 14 : 12, heading ? 'bold' : 'normal', lineHeight * (heading ? 0.5 : 0.25));
      });

      addPageNumbers(pdf);
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      throw error;
    }
  };

  const exportAsPdf = async () => {
    if (isNonLatinDocument) {
      await exportAsPdfCanvas();
    } else {
      await exportAsPdfText();
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      switch (format) {
        case 'markdown':
          await exportAsMarkdown();
          break;
        case 'docx':
          await exportAsDocx();
          break;
        case 'pdf':
          await exportAsPdf();
          break;
      }
      onClose();
    } catch (error) {
      console.error('Export error:', error);
      notify('Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Export Document" maxWidth="md">
      <div className="p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1">
              Filename
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 border border-line-soft rounded-lg bg-cream-raised text-ink focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-muted mb-1">
              Export Format
            </label>
            <div className="space-y-2">
              <label className="flex items-center text-ink-muted">
                <input
                  type="radio"
                  value="docx"
                  checked={format === 'docx'}
                  onChange={(e) => setFormat(e.target.value as 'docx')}
                  className="mr-2 accent-brand"
                />
                <span>Microsoft Word (.docx)</span>
              </label>
              <label className="flex items-center text-ink-muted">
                <input
                  type="radio"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={(e) => setFormat(e.target.value as 'pdf')}
                  className="mr-2 accent-brand"
                />
                <span>PDF (.pdf)</span>
              </label>
              <label className="flex items-center text-ink-muted">
                <input
                  type="radio"
                  value="markdown"
                  checked={format === 'markdown'}
                  onChange={(e) => setFormat(e.target.value as 'markdown')}
                  className="mr-2 accent-brand"
                />
                <span>Markdown (.md)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-ink-muted bg-cream-muted rounded-lg hover:bg-cream-hover disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark disabled:opacity-50 transition"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
