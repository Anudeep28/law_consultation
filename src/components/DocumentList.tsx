import { AnimatedCard, PrimaryButton } from './ui/MotionPrimitives';
import { DecorativeAnimation } from './ui/DecorativeAnimation';
import { notify } from './ui/Toasts';
import React, { useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { Document } from '../types';
import { FileText, Trash2, Edit, Calendar, Search, Copy } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface DocumentListProps {
  onNewDocument: () => void;
  onEditDocument: (document: Document) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({ onNewDocument, onEditDocument }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
  const { documents, setCurrentDocument, deleteDocument, duplicateDocument } = useDocumentStore();

  const filteredDocuments = documents
    .filter(doc => 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      } else {
        return a.title.localeCompare(b.title);
      }
    });

  const handleOpenDocument = (document: Document) => {
    setCurrentDocument(document);
    onEditDocument(document);
  };

  const handleDeleteDocument = async () => {
    if (pendingDelete) {
      await deleteDocument(pendingDelete.id);
      setPendingDelete(null);
    }
  };

  const handleDuplicateDocument = async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy = await duplicateDocument(documentId);
    if (copy) {
      onEditDocument(copy);
    } else {
      notify('Your trial has ended. Buy a document credit or monthly subscription to continue.');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes === 0 ? 'Just now' : `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      }
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return new Date(date).toLocaleDateString();
    }
  };

  const getDocumentPreview = (content: string) => {
    const plainText = content.replace(/[#*`_~[\]()]/g, '').replace(/\n+/g, ' ').trim();
    return plainText.length > 150 ? plainText.substring(0, 150) + '...' : plainText;
  };

  return (
    <div className="h-full overflow-y-auto bg-cream">
      <div className="max-w-6xl mx-auto px-6 py-7">
        {/* Search and Filter Bar */}
        <div className="rounded-2xl border border-line bg-white p-4 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-ink-faint" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-line-soft bg-cream-raised py-3 pl-11 pr-4 text-sm outline-none transition focus:border-accent-dark focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'title')}
              className="px-4 py-2 rounded-xl border border-line-soft bg-cream-raised text-sm outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30"
            >
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Title</option>
            </select>
          </div>
        </div>

        {/* Documents Grid */}
        {filteredDocuments.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white p-12 text-center shadow-sm">
            <DecorativeAnimation kind="empty" />
            <h3 className="text-lg font-semibold text-ink mb-2">
              {searchTerm ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="text-ink-muted mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Create your first legal document to get started'
              }
            </p>
            {!searchTerm && (
              <PrimaryButton
                onClick={onNewDocument}
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
              >
                Create Document
              </PrimaryButton>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDocuments.map((document, index) => (
              <AnimatedCard index={index}
                key={document.id}
                onClick={() => handleOpenDocument(document)}
                className="group overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-sm hover:shadow-xl cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-ink truncate">
                      {document.title}
                    </h3>
                    <div className="flex items-center text-sm text-ink-faint mt-1">
                      <Calendar className="w-4 h-4 mr-1" />
                      {formatDate(document.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDocument(document);
                      }}
                      className="p-1 text-ink-faint hover:text-brand transition"
                      aria-label="Open in editor" title="Open in editor"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDuplicateDocument(document.id, e)}
                      className="p-1 text-ink-faint hover:text-accent-dark transition"
                      aria-label="Duplicate" title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingDelete(document); }}
                      className="p-1 text-ink-faint hover:text-red-700 transition"
                      aria-label="Delete" title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="text-sm text-ink-muted line-clamp-4">
                  {document.content ? (
                    getDocumentPreview(document.content)
                  ) : (
                    <span className="italic text-ink-weakest">Empty document</span>
                  )}
                </div>
                
                <div className="mt-3 pt-3 border-t border-cream-deep">
                  <div className="flex items-center justify-between text-xs text-ink-muted">
                    <span>
                      {document.category && (
                        <span className="inline-block rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning-ink mr-2">
                          {document.category}
                        </span>
                      )}
                      {document.content.trim() === '' ? 0 : document.content.trim().split(/\s+/).length} word{(document.content.trim() === '' ? 0 : document.content.trim().split(/\s+/).length) !== 1 ? 's' : ''}
                    </span>
                    <span>
                      {document.content.split('\n').length} line{document.content.split('\n').length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </AnimatedCard>
            ))}
          </div>
        )}

        {/* Document Stats */}
        {documents.length > 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>
                Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
              </span>
              <span>
                Total characters: {documents.reduce((sum, doc) => sum + doc.content.length, 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete document"
        message={pendingDelete ? `Delete "${pendingDelete.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteDocument()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
