import { render, screen } from '@testing-library/react';
import { apiRequest } from '../services/api';
import { ConsultationChat } from './ConsultationChat';

jest.mock('../services/api', () => ({ apiRequest: jest.fn() }));
jest.mock('../services/socketService', () => ({ connectSocket: () => ({ on: jest.fn(), off: jest.fn(), emit: jest.fn(), connect: jest.fn(), disconnect: jest.fn() }) }));
jest.mock('./ConsultationRecorder', () => ({ ConsultationRecorder: () => null }));
jest.mock('./ConsultationDeliverables', () => ({ ConsultationDeliverables: () => null }));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

test('shows an ended consultation as read-only history', async () => {
  mockedApiRequest.mockResolvedValueOnce({ messages: [] });
  const consultation = {
    id: 'consultation-1', startsAt: '2026-01-01T10:00:00.000Z', endsAt: '2026-01-01T10:10:00.000Z', topic: 'Lease', notes: 'Lease review request', mode: 'chat' as const, package: 'call_only' as const, status: 'completed' as const,
    lawyer: { id: 'lawyer-1', slug: 'lawyer', name: 'Adv. Test', title: 'Advocate', bio: '', practiceAreas: [], languages: [], experienceYears: 1, barCouncil: 'D', enrollmentNumber: 'D/1/2020', fee: 1000, documentFeePercent: 50, rating: 0, reviewCount: 0, isVerified: true, approvalStatus: 'approved' as const, availability: { days: [1], start: '09:00', end: '17:00' } },
  };
  render(<ConsultationChat consultation={consultation} onClose={jest.fn()} />);

  expect(await screen.findByText('Read-only conversation history')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
});
