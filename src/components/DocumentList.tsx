import React, { useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { Document } from '../types';
import { FileText, Trash2, Edit, Calendar, Search, Copy } from 'lucide-react';

interface DocumentListProps {
  onNewDocument: () => void;
  onEditDocument: (document: Document) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({ onNewDocument, onEditDocument }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
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

  const handleDeleteDocument = async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this document?')) {
      await deleteDocument(documentId);
    }
  };

  const handleDuplicateDocument = async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy = await duplicateDocument(documentId);
    if (copy) {
      onEditDocument(copy);
    } else {
      window.alert('Your trial has ended. Buy a document credit or monthly subscription to continue.');
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
    <div className="h-full overflow-y-auto bg-[#fffaf0]">
      <div className="max-w-6xl mx-auto px-6 py-7">
        {/* Search and Filter Bar */}
        <div className="rounded-2xl border border-[#eadbc1] bg-white p-4 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-[#8c6b54]" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-[#e6d8c2] bg-[#fffcf6] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'title')}
              className="px-4 py-2 rounded-xl border border-[#e6d8c2] bg-[#fffcf6] text-sm outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30"
            >
              <option value="date">Sort by Date</option>
              <option value="title">Sort by Title</option>
            </select>
          </div>
        </div>

        {/* Documents Grid */}
        {filteredDocuments.length === 0 ? (
          <div className="rounded-2xl border border-[#eadbc1] bg-white p-12 text-center shadow-sm">
            <FileText className="w-16 h-16 text-[#d9c7a8] mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-[#32151b] mb-2">
              {searchTerm ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="text-[#6f5a49] mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Create your first legal document to get started'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={onNewDocument}
                className="rounded-xl bg-[#701f2f] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#541522]"
              >
                Create Document
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDocuments.map((document) => (
              <div
                key={document.id}
                onClick={() => handleOpenDocument(document)}
                className="group overflow-hidden rounded-2xl border border-[#eadbc1] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#32151b] truncate">
                      {document.title}
                    </h3>
                    <div className="flex items-center text-sm text-[#8c6b54] mt-1">
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
                      className="p-1 text-[#8c6b54] hover:text-[#701f2f] transition"
                      title="Open in editor"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDuplicateDocument(document.id, e)}
                      className="p-1 text-[#8c6b54] hover:text-[#b8862d] transition"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteDocument(document.id, e)}
                      className="p-1 text-[#8c6b54] hover:text-red-700 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="text-sm text-[#6f5a49] line-clamp-4">
                  {document.content ? (
                    getDocumentPreview(document.content)
                  ) : (
                    <span className="italic text-[#a89580]">Empty document</span>
                  )}
                </div>
                
                <div className="mt-3 pt-3 border-t border-[#f0e4d2]">
                  <div className="flex items-center justify-between text-xs text-[#6f5a49]">
                    <span>
                      {document.category && (
                        <span className="inline-block rounded-full bg-[#fff4d6] px-2.5 py-1 text-xs font-medium text-[#765116] mr-2">
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
              </div>
            ))}
          </div>
        )}

        {/* Document Stats */}
        {documents.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[#eadbc1] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-[#6f5a49]">
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
    </div>
  );
};
