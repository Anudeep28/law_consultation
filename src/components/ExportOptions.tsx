import React, { useState } from 'react';
import { Document } from '../types';
import { saveAs } from 'file-saver';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { getDocumentFontName, getDocumentFontFamily } from '../utils/documentFonts';
import { Modal } from './ui/Modal';

interface ExportOptionsProps {
  document: Document;
  onClose: () => void;
}

export const ExportOptions: React.FC<ExportOptionsProps> = ({ document, onClose }) => {
  const [format, setFormat] = useState<'docx' | 'pdf' | 'markdown'>('docx');
  const [filename, setFilename] = useState(document.title);
  const [isExporting, setIsExporting] = useState(false);

  const exportAsMarkdown = () => {
    const blob = new Blob([document.content], { type: 'text/markdown' });
    saveAs(blob, `${filename}.md`);
  };

  const documentFont = getDocumentFontName(document.language);

  const parseInlineRuns = (text: string): TextRun[] => {
    const runs: TextRun[] = [];
    const regex = /\*\*(.*?)\*\*|\*(.*?)\*/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) {
        runs.push(new TextRun({ text: text.substring(last, match.index), font: documentFont }));
      }
      if (match[1] !== undefined) {
        runs.push(new TextRun({ text: match[1], bold: true, font: documentFont }));
      } else if (match[2] !== undefined) {
        runs.push(new TextRun({ text: match[2], italics: true, font: documentFont }));
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) runs.push(new TextRun({ text: text.substring(last), font: documentFont }));
    return runs.length ? runs : [new TextRun({ text, font: documentFont })];
  };

  const exportAsDocx = async () => {
    try {
      const lines = document.content.split('\n');
      const paragraphs = lines.map(line => {
        if (line.startsWith('# ')) {
          return new Paragraph({
            children: [new TextRun({ text: line.substring(2), bold: true, size: 32, font: documentFont })],
            heading: 'Title',
          });
        } else if (line.startsWith('## ')) {
          return new Paragraph({
            children: [new TextRun({ text: line.substring(3), bold: true, size: 28, font: documentFont })],
            heading: 'Heading1',
          });
        } else if (line.startsWith('### ')) {
          return new Paragraph({
            children: [new TextRun({ text: line.substring(4), bold: true, size: 24, font: documentFont })],
            heading: 'Heading2',
          });
        } else if (line.startsWith('- ')) {
          return new Paragraph({
            children: parseInlineRuns(line.substring(2)),
            bullet: { level: 0 },
          });
        } else if (line.match(/^\d+\. /)) {
          return new Paragraph({
            children: parseInlineRuns(line),
          });
        } else if (line.trim() === '') {
          return new Paragraph({ children: [new TextRun({ text: '', font: documentFont })] });
        } else {
          return new Paragraph({ children: parseInlineRuns(line) });
        }
      });

      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      saveAs(blob, `${filename}.docx`);
    } catch (error) {
      console.error('Error exporting DOCX:', error);
      alert('Failed to export as DOCX. Please try again.');
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

  const markdownToHtml = (content: string): string => {
    return content
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li style="margin-left:20px">• $1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li style="margin-left:20px">$1</li>')
      .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #ccc;margin:12px 0"/>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  };

  const exportAsPdfCanvas = async () => {
    try {
      const fontFamily = getDocumentFontFamily(document.language);
      const htmlContent = markdownToHtml(document.content);

      const container = window.document.createElement('div');
      container.style.cssText = `
        position: absolute; left: -9999px; top: 0;
        width: 640px; padding: 40px;
        font-family: ${fontFamily};
        font-size: 14px; line-height: 1.7; color: #000;
        background: #fff;
      `;
      container.innerHTML = `
        <style>
          h1 { font-size: 22px; font-weight: bold; margin: 16px 0 8px; }
          h2 { font-size: 18px; font-weight: bold; margin: 14px 0 6px; }
          h3 { font-size: 16px; font-weight: bold; margin: 12px 0 4px; }
          li { margin: 4px 0; }
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
      alert('Failed to export as PDF. Please try again.');
    }
  };

  const exportAsPdfText = () => {
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const contentLines = document.content.split('\n');
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

      contentLines.forEach((line) => {
        if (line.startsWith('# ')) {
          addWrappedText(line.substring(2), 20, 'bold', lineHeight * 0.5);
        } else if (line.startsWith('## ')) {
          addWrappedText(line.substring(3), 16, 'bold', lineHeight * 0.25);
        } else if (line.startsWith('### ')) {
          addWrappedText(line.substring(4), 14, 'bold', lineHeight * 0.25);
        } else if (line.startsWith('- ')) {
          const clean = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
          addWrappedText('• ' + clean.substring(2), 12, 'normal');
        } else if (line.trim() === '') {
          yPosition += lineHeight * 0.5;
        } else {
          const clean = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
          addWrappedText(clean, 12, 'normal');
        }
      });

      addPageNumbers(pdf);
      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export as PDF. Please try again.');
    }
  };

  const exportAsPdf = async () => {
    if (isNonLatinDocument) {
      await exportAsPdfCanvas();
    } else {
      exportAsPdfText();
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      switch (format) {
        case 'markdown':
          exportAsMarkdown();
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
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Export Document" maxWidth="md">
      <div className="p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#6f5a49] mb-1">
              Filename
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 border border-[#e6d8c2] rounded-lg bg-[#fffcf6] text-[#32151b] focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#6f5a49] mb-1">
              Export Format
            </label>
            <div className="space-y-2">
              <label className="flex items-center text-[#6f5a49]">
                <input
                  type="radio"
                  value="docx"
                  checked={format === 'docx'}
                  onChange={(e) => setFormat(e.target.value as 'docx')}
                  className="mr-2 accent-[#701f2f]"
                />
                <span>Microsoft Word (.docx)</span>
              </label>
              <label className="flex items-center text-[#6f5a49]">
                <input
                  type="radio"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={(e) => setFormat(e.target.value as 'pdf')}
                  className="mr-2 accent-[#701f2f]"
                />
                <span>PDF (.pdf)</span>
              </label>
              <label className="flex items-center text-[#6f5a49]">
                <input
                  type="radio"
                  value="markdown"
                  checked={format === 'markdown'}
                  onChange={(e) => setFormat(e.target.value as 'markdown')}
                  className="mr-2 accent-[#701f2f]"
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
            className="px-4 py-2 text-[#6f5a49] bg-[#f8f1e5] rounded-lg hover:bg-[#f2e4cc] disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-[#701f2f] text-white rounded-lg hover:bg-[#541522] disabled:opacity-50 transition"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
