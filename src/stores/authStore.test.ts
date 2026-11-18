import { useAuthStore } from './authStore';
import { useDocumentStore } from './documentStore';
import { notify, useToastStore } from '../components/ui/Toasts';
import { apiRequest, ApiError, getAuthToken, setAuthToken } from '../services/api';
import { Document, User } from '../types';
import { waitFor } from '@testing-library/react';

jest.mock('../services/api', () => ({
  ...jest.requireActual('../services/api'),
  apiRequest: jest.fn(), getAuthToken: jest.fn(), setAuthToken: jest.fn(),
}));

const signedInUser: User = { id: 'other-account', name: 'Other Account', email: 'other@example.test', role: 'client', accountStatus: 'active', subscriptionStatus: 'trial', subscriptionPlan: 'trial', documentCredits: 0, appliedPaymentIds: [], isEmailVerified: true, isPhoneVerified: true };

test.each([new ApiError('Temporary database failure', 500), new Error('Network offline')])('session refresh preserves another account on transient failure: %s', async (error) => {
  (getAuthToken as jest.Mock).mockReturnValue('other-account-token');
  (apiRequest as jest.Mock).mockRejectedValueOnce(error);
  useAuthStore.setState({ user: signedInUser, isAuthenticated: true });
  await useAuthStore.getState().refreshUser();
  expect(useAuthStore.getState()).toMatchObject({ user: signedInUser, isAuthenticated: true, isLoading: false });
  expect(setAuthToken).not.toHaveBeenCalled();
});

test.each([401, 403])('session refresh still clears authentication after genuine rejection: %s', async (status) => {
  (getAuthToken as jest.Mock).mockReturnValue('revoked-token');
  (apiRequest as jest.Mock).mockRejectedValueOnce(new ApiError('Session rejected', status));
  useAuthStore.setState({ user: signedInUser, isAuthenticated: true });
  await useAuthStore.getState().refreshUser();
  expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, isLoading: false });
  expect(setAuthToken).toHaveBeenCalledWith(null);
});

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
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const pushManagerDescriptor = Object.getOwnPropertyDescriptor(window, 'PushManager');
const unsubscribe = jest.fn();
const getSubscription = jest.fn();
const subscription = { endpoint: 'https://push.example.test/previous-user', unsubscribe };

const enablePush = () => {
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue(subscription);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription } }) } });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} });
  (getAuthToken as jest.Mock).mockReturnValue('previous-user-token');
  (apiRequest as jest.Mock).mockResolvedValue(undefined);
  useAuthStore.setState({ isAuthenticated: true });
};

afterEach(() => {
  if (serviceWorkerDescriptor) Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
  if (pushManagerDescriptor) Object.defineProperty(window, 'PushManager', pushManagerDescriptor);
  else Reflect.deleteProperty(window, 'PushManager');
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('logout immediately clears auth and removes push using the departing account token', async () => {
  enablePush();
  useAuthStore.getState().logout();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(setAuthToken).toHaveBeenCalledWith(null);
  (getAuthToken as jest.Mock).mockReturnValue('next-user-token');
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  expect(apiRequest).toHaveBeenCalledWith('/api/notifications/subscribe', {
    method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }), headers: { Authorization: 'Bearer previous-user-token' },
  });
});

test('logout succeeds without push support', () => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(window, 'PushManager');
  useAuthStore.setState({ isAuthenticated: true });
  expect(() => useAuthStore.getState().logout()).not.toThrow();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(apiRequest).not.toHaveBeenCalled();
});

test('logout with no push subscription does not request deletion', async () => {
  enablePush();
  getSubscription.mockResolvedValue(null);
  useAuthStore.getState().logout();
  await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(1));
  expect(apiRequest).not.toHaveBeenCalled();
});

test.each(['browser', 'server', 'lookup'])('logout still succeeds after a %s push failure', async (failure) => {
  enablePush();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  if (failure === 'browser') unsubscribe.mockRejectedValue(new Error('Browser unsubscribe failed'));
  if (failure === 'server') (apiRequest as jest.Mock).mockRejectedValue(new Error('Offline'));
  if (failure === 'lookup') getSubscription.mockRejectedValue(new Error('Unavailable'));
  useAuthStore.getState().logout();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(1));
  if (failure !== 'lookup') {
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications/subscribe', expect.objectContaining({ method: 'DELETE' }));
  }
});
