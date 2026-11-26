import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../services/api';
import { Consultation } from '../types';
import { JoinCallButton } from './JoinCallButton';
import { ConsultationsView } from './ConsultationsView';
import { LawyerConsultationsView } from './LawyerConsultationsView';

jest.mock('../services/api', () => ({ ...jest.requireActual('../services/api'), apiRequest: jest.fn() }));
jest.mock('./ConsultationChat', () => ({ ConsultationChat: () => null }));
jest.mock('./ConsultationRecorder', () => ({ ConsultationRecorder: () => null }));
jest.mock('./ConsultationDeliverables', () => ({ ConsultationDeliverables: () => null }));
jest.mock('./LawyerReviewForm', () => ({ LawyerReviewForm: () => null }));
jest.mock('./TrustSection', () => ({ TrustSection: () => null }));

const consultation: Consultation = {
  id: 'private-call', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 600000).toISOString(), topic: 'Lease', notes: 'Lease review', mode: 'call', package: 'call_only', status: 'booked', meetingProvider: 'jaas',
  lawyer: { id: 'lawyer', slug: 'lawyer', name: 'Adv. Test', title: 'Advocate', bio: '', practiceAreas: [], languages: [], experienceYears: 1, barCouncil: 'D', enrollmentNumber: 'D/1/2020', fee: 1000, documentFeePercent: 50, rating: 0, reviewCount: 0, isVerified: true, approvalStatus: 'approved', availability: { days: [1], start: '09:00', end: '17:00' } },
};
let popup: { opener: unknown; location: { replace: jest.Mock }; close: jest.Mock };
const url = 'https://8x8.vc/test-app/private-room?jwt=requester-token';

beforeEach(() => {
  jest.clearAllMocks();
  popup = { opener: {}, location: { replace: jest.fn() }, close: jest.fn() };
  jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
    if (path.endsWith('/meeting')) return { url };
    if (path === '/api/lawyers') return { lawyers: [] };
    return { consultations: [consultation] };
  });
});
afterEach(() => jest.restoreAllMocks());

test('fetches a fresh authenticated URL on click and navigates a pre-opened tab without an opener', async () => {
  render(<JoinCallButton consultation={consultation} className="" onError={jest.fn()} />);
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
  expect(window.open).toHaveBeenCalledWith('', '_blank');
  expect(popup.opener).toBeNull();
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledWith(url));
  expect(apiRequest).toHaveBeenCalledWith('/api/consultations/private-call/meeting');
});

test('closes the empty tab and reports server rejections', async () => {
  (apiRequest as jest.Mock).mockRejectedValueOnce(new Error('Meeting has not opened yet'));
  const onError = jest.fn();
  render(<JoinCallButton consultation={consultation} className="" onError={onError} />);
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith('Meeting has not opened yet'));
  expect(popup.close).toHaveBeenCalledTimes(1);
  expect(popup.location.replace).not.toHaveBeenCalled();
});

test('reports blocked pop-ups without minting a token', () => {
  jest.mocked(window.open).mockReturnValue(null);
  const onError = jest.fn();
  render(<JoinCallButton consultation={consultation} className="" onError={onError} />);
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }));
  expect(onError).toHaveBeenCalledWith('Please allow pop-ups to join your call.');
  expect(apiRequest).not.toHaveBeenCalled();
});

test('keeps legacy links unchanged and renders nothing without a meeting', () => {
  const { rerender } = render(<JoinCallButton consultation={{ id: 'legacy', meetingUrl: 'https://meet.jit.si/legacy' }} className="" onError={jest.fn()} />);
  expect(screen.getByRole('link', { name: 'Join call' })).toHaveAttribute('href', 'https://meet.jit.si/legacy');
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noreferrer');
  expect(apiRequest).not.toHaveBeenCalled();
  rerender(<JoinCallButton consultation={{ id: 'no-meeting' }} className="" onError={jest.fn()} />);
  expect(screen.queryByText('Join call')).not.toBeInTheDocument();
});

test.each(['client', 'lawyer'])('%s consultation view joins JaaS without a stored public URL', async (role) => {
  render(role === 'client' ? <ConsultationsView /> : <LawyerConsultationsView />);
  if (role === 'client') fireEvent.click(await screen.findByRole('button', { name: /My consultations/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Join call' }));
  await waitFor(() => expect(popup.location.replace).toHaveBeenCalledWith(url));
});
