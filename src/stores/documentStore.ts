import { create } from 'zustand';
import { apiRequest } from '../services/api';
import { Document, TranscriptionSession, User } from '../types';
import { useAuthStore } from './authStore';

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const normalizeDocument = (document: Document): Document => ({
  ...document,
  createdAt: new Date(document.createdAt),
  updatedAt: new Date(document.updatedAt),
});

interface DocumentState {
  documents: Document[];
  currentDocument: Document | null;
  transcriptionSession: TranscriptionSession | null;
  selectionStart: number;
  selectionEnd: number;

  // Document actions
  loadDocuments: () => Promise<void>;
  createDocument: (title: string, templateId?: string, category?: string) => Promise<Document | null>;
  updateDocument: (id: string, content: string) => void;
  renameDocument: (id: string, title: string) => void;
  duplicateDocument: (id: string) => Promise<Document | null>;
  deleteDocument: (id: string) => Promise<void>;
  setCurrentDocument: (document: Document | null) => void;
  clearDocuments: () => void;

  // Editor selection
  setSelection: (start: number, end: number) => void;

  // Transcription actions
  startTranscription: (documentId: string, apiKey: string, language: string, outputLanguage: string) => void;
  stopTranscription: () => void;
  pauseTranscription: () => void;
  resumeTranscription: () => void;
  updateTranscriptionText: (text: string) => void;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
      documents: [],
      currentDocument: null,
      transcriptionSession: null,
      selectionStart: 0,
      selectionEnd: 0,

      loadDocuments: async () => {
        try {
          const result = await apiRequest<{ documents: Document[] }>('/api/documents');
          set({ documents: result.documents.map(normalizeDocument) });
        } catch {
          set({ documents: [], currentDocument: null });
        }
      },

      createDocument: async (title: string, templateId?: string, category?: string) => {
        try {
          const result = await apiRequest<{ document: Document; user: User }>('/api/documents', {
            method: 'POST',
            body: JSON.stringify({ title, templateId, category }),
          });
          useAuthStore.getState().setUser(result.user);
          const document = normalizeDocument(result.document);
          set((state) => ({
            documents: [document, ...state.documents],
            currentDocument: document,
          }));
          return document;
        } catch {
          return null;
        }
      },

      renameDocument: (id: string, title: string) => {
        set((state) => ({
          documents: state.documents.map((doc) =>
            doc.id === id ? { ...doc, title, updatedAt: new Date() } : doc
          ),
          currentDocument:
            state.currentDocument?.id === id
              ? { ...state.currentDocument, title, updatedAt: new Date() }
              : state.currentDocument,
        }));
        void apiRequest(`/api/documents/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        });
      },

      duplicateDocument: async (id: string) => {
        try {
          const result = await apiRequest<{ document: Document; user: User }>(`/api/documents/${id}/duplicate`, {
            method: 'POST',
          });
          useAuthStore.getState().setUser(result.user);
          const document = normalizeDocument(result.document);
          set((state) => ({
            documents: [document, ...state.documents],
            currentDocument: document,
          }));
          return document;
        } catch {
          return null;
        }
      },

      updateDocument: (id: string, content: string) => {
        set((state) => ({
          documents: state.documents.map((doc) =>
            doc.id === id
              ? { ...doc, content, updatedAt: new Date() }
              : doc
          ),
          currentDocument:
            state.currentDocument?.id === id
              ? { ...state.currentDocument, content, updatedAt: new Date() }
              : state.currentDocument,
        }));
        const existingTimer = saveTimers.get(id);
        if (existingTimer) clearTimeout(existingTimer);
        saveTimers.set(id, setTimeout(() => {
          void apiRequest(`/api/documents/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
          });
          saveTimers.delete(id);
        }, 500));
      },

      deleteDocument: async (id: string) => {
        await apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
        set((state) => ({
          documents: state.documents.filter((doc) => doc.id !== id),
          currentDocument:
            state.currentDocument?.id === id ? null : state.currentDocument,
        }));
      },

      setCurrentDocument: (document: Document | null) => {
        set({ currentDocument: document });
      },

      clearDocuments: () => set({ documents: [], currentDocument: null }),

      setSelection: (start: number, end: number) => {
        set({ selectionStart: start, selectionEnd: end });
      },

      startTranscription: (documentId: string, apiKey: string, language: string, outputLanguage: string) => {
        const session: TranscriptionSession = {
          id: Date.now().toString(),
          documentId,
          isRecording: true,
          isPaused: false,
          language,
          outputLanguage,
          apiKey,
        };
        set({ transcriptionSession: session });
      },

      stopTranscription: () => {
        set({ transcriptionSession: null });
      },

      pauseTranscription: () => {
        set((state) => ({
          transcriptionSession: state.transcriptionSession
            ? { ...state.transcriptionSession, isPaused: true }
            : null,
        }));
      },

      resumeTranscription: () => {
        set((state) => ({
          transcriptionSession: state.transcriptionSession
            ? { ...state.transcriptionSession, isPaused: false }
            : null,
        }));
      },

      updateTranscriptionText: (text: string) => {
        const { currentDocument, selectionStart, selectionEnd } = get();
        if (currentDocument) {
          const start = Math.min(Math.max(selectionStart, 0), currentDocument.content.length);
          const end = Math.min(Math.max(selectionEnd, 0), currentDocument.content.length);
          const updatedContent =
            currentDocument.content.substring(0, start) +
            text +
            currentDocument.content.substring(end);
          get().updateDocument(currentDocument.id, updatedContent);
          set({ selectionStart: start + text.length, selectionEnd: start + text.length });
        }
      },
    }));
