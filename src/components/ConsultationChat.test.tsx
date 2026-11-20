import { vi, type MockedFunction } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { apiRequest } from '../services/api';
import { Consultation } from '../types';
import { ConsultationChat } from './ConsultationChat';

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../services/socket', () => ({ getSocket: () => mockSocket }));
vi.mock('./ConsultationRecorder', () => ({ ConsultationRecorder: () => null }));
vi.mock('./ConsultationDeliverables', () => ({ ConsultationDeliverables: () => null }));

const mockedApiRequest = apiRequest as MockedFunction<typeof apiRequest>;
const mockSocket = { on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: true };
const consultation: Consultation = {
  id: 'consultation-1', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 600000).toISOString(), topic: 'Lease', notes: 'Lease review request', mode: 'chat', package: 'call_only', status: 'booked',
  lawyer: { id: 'lawyer-1', slug: 'lawyer', name: 'Adv. Test', title: 'Advocate', bio: '', practiceAreas: [], languages: [], experienceYears: 1, barCouncil: 'D', enrollmentNumber: 'D/1/2020', fee: 1000, documentFeePercent: 50, rating: 0, reviewCount: 0, isVerified: true, approvalStatus: 'approved', availability: { days: [1], start: '09:00', end: '17:00' } },
};

beforeEach(() => { vi.clearAllMocks(); mockedApiRequest.mockResolvedValue({ messages: [] }); });

test('shows an ended consultation as read-only history', async () => {
  mockedApiRequest.mockResolvedValueOnce({ messages: [] });
  const consultation = {
    id: 'consultation-1', startsAt: '2026-01-01T10:00:00.000Z', endsAt: '2026-01-01T10:10:00.000Z', topic: 'Lease', notes: 'Lease review request', mode: 'chat' as const, package: 'call_only' as const, status: 'completed' as const,
    lawyer: { id: 'lawyer-1', slug: 'lawyer', name: 'Adv. Test', title: 'Advocate', bio: '', practiceAreas: [], languages: [], experienceYears: 1, barCouncil: 'D', enrollmentNumber: 'D/1/2020', fee: 1000, documentFeePercent: 50, rating: 0, reviewCount: 0, isVerified: true, approvalStatus: 'approved' as const, availability: { days: [1], start: '09:00', end: '17:00' } },
  };
  render(<ConsultationChat consultation={consultation} onClose={vi.fn()} />);

  expect(await screen.findByText('Read-only conversation history')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
});

test('ignores foreign messages, renders this consultation once, and leaves on close', async () => {
  const { unmount } = render(<ConsultationChat consultation={consultation} onClose={vi.fn()} />);
  await screen.findByText(/No messages yet/);
  const onMessage = mockSocket.on.mock.calls.find(([event]) => event === 'chat:message')![1];
  const message = { id: 'message', consultationId: consultation.id, content: 'This conversation only', sender: 'user', createdAt: new Date().toISOString() };
  act(() => {
    onMessage({ ...message, id: 'foreign', consultationId: 'another-consultation', content: 'Other client secret' });
    onMessage(message);
    onMessage(message);
  });
  expect(screen.queryByText('Other client secret')).not.toBeInTheDocument();
  expect(screen.getAllByText('This conversation only')).toHaveLength(1);
  unmount();
  expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { consultationId: consultation.id });
  expect(mockSocket.off).toHaveBeenCalledWith('chat:message', onMessage);
});

test('switching consultations leaves the old room and ignores a late history response', async () => {
  let resolve!: (value: { messages: unknown[] }) => void;
  mockedApiRequest.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const { rerender } = render(<ConsultationChat consultation={consultation} onClose={vi.fn()} />);
  rerender(<ConsultationChat consultation={{ ...consultation, id: 'consultation-2' }} onClose={vi.fn()} />);
  await act(async () => { resolve({ messages: [{ id: 'old', consultationId: consultation.id, content: 'Stale private history', sender: 'user', createdAt: new Date().toISOString() }] }); });
  expect(mockSocket.emit).toHaveBeenCalledWith('chat:leave', { consultationId: consultation.id });
  expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { consultationId: 'consultation-2' }, expect.any(Function));
  expect(screen.queryByText('Stale private history')).not.toBeInTheDocument();
});

test('history failure is shown without displaying messages', async () => {
  mockedApiRequest.mockRejectedValueOnce(new Error('Offline'));
  render(<ConsultationChat consultation={consultation} onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load chat messages.');
  expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
});
