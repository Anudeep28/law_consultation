import React, { useState } from 'react';
import { Document } from '../types';
import { saveAs } from 'file-saver';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { getDocumentFontName } from '../utils/documentFonts';

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

  const exportAsPdf = () => {
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
        pdf.setFont(document.language === 'mr' ? 'helvetica' : 'times', style);
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

      pdf.save(`${filename}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export as PDF. Please try again.');
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
          exportAsPdf();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-[#eadbc1] max-w-md w-full p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-[#32151b] mb-4">Export Document</h2>
        
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
    </div>
  );
};
