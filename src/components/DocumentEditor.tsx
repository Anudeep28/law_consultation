import { notify } from './ui/Toasts';
import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { supportedLanguages } from '../data/languages';
import { getDocumentFontFamily } from '../utils/documentFonts';
import { LoadingFallback } from './ui/LoadingFallback';
import { TranscriptionControls } from './TranscriptionControls';
import { Printer } from 'lucide-react';

const TemplateSelector = lazy(() => import('./TemplateSelector').then(module => ({ default: module.TemplateSelector })));
const TemplateFillerModal = lazy(() => import('./TemplateFillerModal').then(module => ({ default: module.TemplateFillerModal })));
const ExportOptions = lazy(() => import('./ExportOptions').then(module => ({ default: module.ExportOptions })));
const MarkdownPreview = lazy(() => import('./MarkdownPreview'));

interface DocumentEditorProps {
  openTemplateSelector?: boolean;
  onTemplateSelectorOpened?: () => void;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ openTemplateSelector, onTemplateSelectorOpened }) => {
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  const {
    currentDocument,
    updateDocument,
    updateDocumentLanguage,
    renameDocument,
    createDocument,
    selectionStart,
    selectionEnd,
    setSelection,
  } = useDocumentStore();

  const prevContentRef = useRef(currentDocument?.content || '');
  useEffect(() => {
    const doc = useDocumentStore.getState().currentDocument;
    if (!textareaRef.current || !doc) return;
    const prevContent = prevContentRef.current;
    const newContent = doc.content;
    if (newContent.length > prevContent.length && newContent.startsWith(prevContent)) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
    prevContentRef.current = newContent;
  }, [currentDocument?.content]);

  useEffect(() => {
    if (!textareaRef.current) return;
    if (
      textareaRef.current.selectionStart !== selectionStart ||
      textareaRef.current.selectionEnd !== selectionEnd
    ) {
      textareaRef.current.selectionStart = selectionStart;
      textareaRef.current.selectionEnd = selectionEnd;
    }
  }, [selectionStart, selectionEnd]);

  useEffect(() => {
    const doc = useDocumentStore.getState().currentDocument;
    if (doc) {
      setSelection(doc.content.length, doc.content.length);
    }
  }, [currentDocument?.id, setSelection]);

  useEffect(() => {
    if (openTemplateSelector) {
      setIsTemplateSelectorOpen(true);
      onTemplateSelectorOpened?.();
    }
  }, [openTemplateSelector, onTemplateSelectorOpened]);

  // Ctrl+R shortcut for voice recording
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        (window as any).__toggleVoiceRecording?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Track save timestamp whenever document updates
  const updatedAt = currentDocument?.updatedAt;
  useEffect(() => {
    if (updatedAt) setSavedAt(new Date());
  }, [updatedAt]);

  const handleSelectionChange = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (start !== selectionStart || end !== selectionEnd) {
        setSelection(start, end);
      }
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (currentDocument) {
      updateDocument(currentDocument.id, e.target.value);
    }
  };

  const handleTitleDoubleClick = () => {
    if (currentDocument) {
      setTitleDraft(currentDocument.title);
      setIsEditingTitle(true);
      setTimeout(() => titleInputRef.current?.select(), 0);
    }
  };

  const commitRename = () => {
    if (currentDocument && titleDraft.trim()) {
      renameDocument(currentDocument.id, titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setIsEditingTitle(false);
  };

  const handlePrint = () => {
    const existing = window.document.getElementById('__print_area__');
    if (existing) existing.remove();
    const div = window.document.createElement('div');
    div.id = '__print_area__';
    div.className = 'print-area';
    div.setAttribute('data-language', currentDocument?.language || 'en');
    // Convert markdown to basic HTML for printing
    const html = (currentDocument?.content || '')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^---+$/gm, '<hr/>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
    div.innerHTML = `<p>${html}</p>`;
    window.document.body.appendChild(div);
    window.print();
    setTimeout(() => div.remove(), 1000);
  };

  const wordCount = currentDocument
    ? currentDocument.content.trim() === ''
      ? 0
      : currentDocument.content.trim().split(/\s+/).length
    : 0;

  const formatSavedAt = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleNewDocument = async () => {
    const document = await createDocument('Untitled Document');
    if (!document) {
      notify('Your trial has ended. Buy a document credit or monthly subscription to continue.');
    }
  };

  const handleTemplateSelect = () => {
    setIsTemplateSelectorOpen(true);
  };

  const handleTemplateSelected = (template: any) => {
    setIsTemplateSelectorOpen(false);
    setSelectedTemplate(template);
  };

  const handleTemplateFilled = async (filledContent: string, title: string, category: string) => {
    const doc = await createDocument(title, selectedTemplate?.id, category);
    if (doc) {
      updateDocument(doc.id, filledContent);
      setSelectedTemplate(null);
    } else {
      notify('Your trial has ended. Buy a document credit or monthly subscription to continue.');
    }
  };

  const handleExport = () => {
    setIsExportOptionsOpen(true);
  };

  const insertText = (text: string) => {
    if (textareaRef.current && currentDocument) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newContent = 
        currentDocument.content.substring(0, start) +
        text +
        currentDocument.content.substring(end);
      
      updateDocument(currentDocument.id, newContent);
      setSelection(start + text.length, start + text.length);
      
      // Restore focus after the toolbar button click
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const insertMarkdown = (markdown: string) => {
    insertText(markdown);
  };

  const templateModals = (
    <>
      {/* Template Selector Modal */}
      {isTemplateSelectorOpen && (
        <Suspense fallback={<LoadingFallback />}>
        <TemplateSelector
          onSelectTemplate={handleTemplateSelected}
          onClose={() => setIsTemplateSelectorOpen(false)}
        />
        </Suspense>
      )}
  
      {/* Template Filler Modal */}
      {selectedTemplate && (
        <Suspense fallback={<LoadingFallback />}>
        <TemplateFillerModal
          template={selectedTemplate}
          onComplete={handleTemplateFilled}
          onClose={() => setSelectedTemplate(null)}
        />
        </Suspense>
      )}
    </>
  );

  if (!currentDocument) {
    return (
      <div className="flex items-center justify-center h-full bg-cream">
        <div className="editor-empty text-center bg-white rounded-2xl border border-line p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-ink mb-4">No Document Open</h2>
          <p className="text-ink-muted mb-6">Create a new document or select a template to get started</p>
          <div className="space-x-4">
            <button
              onClick={handleNewDocument}
              className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
            >
              New Document
            </button>
            <button
              onClick={handleTemplateSelect}
              className="rounded-xl border-2 border-brand px-6 py-2.5 text-sm font-bold text-brand transition hover:bg-brand-soft"
            >
              Use Template
            </button>
          </div>
        </div>
        {templateModals}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col h-full bg-cream">
      {/* Document Title Bar */}
      <div className="bg-white border-b border-line px-4 py-2 flex flex-wrap items-center gap-3">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleTitleKeyDown}
            className="min-w-0 basis-full sm:basis-auto flex-1 text-base font-semibold text-ink border border-accent-dark rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        ) : (
          <h2
            className="min-w-0 basis-full sm:basis-auto flex-1 text-base font-semibold text-ink truncate cursor-pointer hover:text-brand"
            onDoubleClick={handleTitleDoubleClick}
            title="Double-click to rename"
          >
            {currentDocument.title}
          </h2>
        )}
        {currentDocument.category && (
          <span className="rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning-ink">
            {currentDocument.category}
          </span>
        )}
        <select
          value={currentDocument.language || 'en'}
          onChange={(e) => updateDocumentLanguage(currentDocument.id, e.target.value)}
          className="text-xs border border-line-soft rounded-lg bg-cream-raised text-ink px-2 py-1 focus:outline-none focus:border-accent-dark"
          aria-label="Document language"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
          ))}
        </select>
        <span className="text-xs text-ink-faint whitespace-nowrap">
          {wordCount} word{wordCount !== 1 ? 's' : ''}
        </span>
        {savedAt && (
          <span className="text-xs text-green-700 whitespace-nowrap">
            ✓ Saved {formatSavedAt(savedAt)}
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-line px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleNewDocument}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              New
            </button>
            <button
              onClick={handleTemplateSelect}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              Template
            </button>
            <div className="border-l border-line h-6 mx-2"></div>
            <button
              onClick={() => insertMarkdown('**Bold Text**')}
              className="px-3 py-1.5 text-sm font-bold rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              B
            </button>
            <button
              onClick={() => insertMarkdown('*Italic Text*')}
              className="px-3 py-1.5 text-sm italic rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              I
            </button>
            <button
              onClick={() => insertMarkdown('# Heading')}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              H1
            </button>
            <button
              onClick={() => insertMarkdown('## Heading')}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              H2
            </button>
            <button
              onClick={() => insertMarkdown('- List item')}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              • List
            </button>
            <button
              onClick={() => insertMarkdown('1. Numbered item')}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover transition"
            >
              1. List
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`px-3 py-1.5 text-sm rounded-lg transition ${
                isPreviewMode 
                  ? 'bg-brand text-white'
                  : 'bg-cream-muted text-brand-darker hover:bg-cream-hover'
              }`}
            >
              {isPreviewMode ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 text-sm rounded-lg bg-cream-muted text-brand-darker hover:bg-cream-hover flex items-center space-x-1 transition"
              title="Print / Print to PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-sm rounded-lg bg-brand text-white hover:bg-brand-dark transition"
            >
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="flex-1 flex overflow-hidden">
        {isPreviewMode ? (
          <div className="flex-1 p-6 overflow-y-auto bg-cream-raised">
            <div
              className="max-w-4xl mx-auto prose prose-lg max-w-none legal-document"
              style={{ fontFamily: getDocumentFontFamily(currentDocument.language) }}
            >
              <Suspense fallback={<LoadingFallback />}><MarkdownPreview>
                {currentDocument.content}
              </MarkdownPreview></Suspense>
            </div>
          </div>
        ) : (
          <textarea
            aria-label="Document content"
            ref={textareaRef}
            value={currentDocument.content}
            onChange={handleContentChange}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onClick={handleSelectionChange}
            onFocus={handleSelectionChange}
            placeholder="Start typing your legal document here, or use voice transcription..."
            className="min-w-0 placeholder:text-ink-muted flex-1 p-6 border-0 resize-none focus:outline-none text-sm bg-cream-raised h-full overflow-y-auto"
            style={{ fontFamily: getDocumentFontFamily(currentDocument.language) }}
          />
        )}
      </div>

      {/* Transcription Controls */}
      <TranscriptionControls />

      {templateModals}

      {/* Export Options Modal */}
      {isExportOptionsOpen && (
        <Suspense fallback={<LoadingFallback />}>
        <ExportOptions
          document={currentDocument}
          onClose={() => setIsExportOptionsOpen(false)}
        />
        </Suspense>
      )}
    </div>
  );
};
