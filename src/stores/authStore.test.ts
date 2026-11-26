import { useAuthStore } from './authStore';
import { useDocumentStore } from './documentStore';
import { notify, useToastStore } from '../components/ui/Toasts';
import { apiRequest, getAuthToken, setAuthToken } from '../services/api';
import { Document } from '../types';

jest.mock('../services/api', () => ({
  apiRequest: jest.fn(), getAuthToken: jest.fn(), setAuthToken: jest.fn(),
}));

const document: Document = { id: 'private', userId: 'previous-user', title: 'Private document', content: 'Confidential', createdAt: new Date(), updatedAt: new Date() };

afterEach(() => {
  useDocumentStore.getState().clearDocuments();
  jest.useRealTimers();
});

test('logout clears documents, transcription, selections, notifications and pending saves', () => {
  jest.useFakeTimers();
  useDocumentStore.setState({ documents: [document], currentDocument: document, selectionStart: 2, selectionEnd: 4 });
  useDocumentStore.getState().startTranscription(document.id, 'key', 'en', 'en');
  useDocumentStore.getState().updateDocument(document.id, 'Updated private content');
  notify('Private account notification');
  useAuthStore.getState().logout();
  expect(useDocumentStore.getState()).toMatchObject({ documents: [], currentDocument: null, transcriptionSession: null, selectionStart: 0, selectionEnd: 0 });
  expect(useToastStore.getState().toasts).toEqual([]);
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, isLoading: false });
  expect(setAuthToken).toHaveBeenCalledWith(null);
  jest.runAllTimers();
  expect(apiRequest).not.toHaveBeenCalled();
});

test('a document request completed after logout cannot repopulate private state', async () => {
  let resolve!: (value: { documents: Document[] }) => void;
  (apiRequest as jest.Mock).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const loading = useDocumentStore.getState().loadDocuments();
  useAuthStore.getState().logout();
  resolve({ documents: [document] });
  await loading;
  expect(useDocumentStore.getState().documents).toEqual([]);
});

test('logging out with empty state is safe', () => {
  useDocumentStore.getState().clearDocuments();
  useAuthStore.getState().logout();
  expect(useDocumentStore.getState().currentDocument).toBeNull();
  expect(getAuthToken).not.toHaveBeenCalled();
});
