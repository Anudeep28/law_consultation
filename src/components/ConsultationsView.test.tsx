import { fireEvent, render, screen, within } from '@testing-library/react';
import { ApiError, apiRequest } from '../services/api';
import { consultationCheckout } from '../services/razorpayService';
import { useAuthStore } from '../stores/authStore';
import { User } from '../types';
import { ConsultationsView } from './ConsultationsView';

jest.mock('../services/api', () => ({ ...jest.requireActual('../services/api'), apiRequest: jest.fn() }));
jest.mock('../services/razorpayService', () => ({ consultationCheckout: jest.fn() }));
jest.mock('./ConsultationChat', () => ({ ConsultationChat: () => null }));
jest.mock('./ConsultationDeliverables', () => ({ ConsultationDeliverables: () => null }));
jest.mock('./LawyerReviewForm', () => ({ LawyerReviewForm: () => null }));
jest.mock('./TrustSection', () => ({ TrustSection: () => null }));

const user: User = {
  id: 'client-1', name: 'Client', email: 'client@example.test', role: 'client', accountStatus: 'active',
  isPhoneVerified: true, isEmailVerified: true, subscriptionStatus: 'trial', subscriptionPlan: 'trial',
  documentCredits: 0, appliedPaymentIds: [],
};

beforeEach(() => {
  useAuthStore.setState({ user });
  (apiRequest as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/api/lawyers') return { lawyers: [{
      id: 'lawyer-1', name: 'Test Lawyer', title: 'Advocate', bio: 'Legal guidance',
      practiceAreas: ['Contracts'], languages: ['English'], rating: 5, reviewCount: 0,
      experienceYears: 5, isVerified: true, fee: 25000,
    }] };
    if (path.endsWith('/slots')) return { slots: ['2030-01-01T10:00:00.000Z'] };
    return { consultations: [] };
  });
});

afterEach(() => { useAuthStore.setState({ user: null }); });

test.each([
  [new Error('Payment was cancelled'), 'Payment was cancelled. Your booking was not confirmed.'],
  [new ApiError('Invalid payment signature', 400), 'Invalid payment signature'],
  [new Error('Network failure'), 'Unable to book consultation.'],
])('shows the appropriate checkout error for %s', async (error, message) => {
  (consultationCheckout as jest.Mock).mockRejectedValueOnce(error);
  render(<ConsultationsView />);
  fireEvent.click(await screen.findByRole('button', { name: 'Chat' }));
  const slotLabel = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2030-01-01T10:00:00.000Z'));
  fireEvent.click(await screen.findByRole('button', { name: slotLabel }));
  fireEvent.change(screen.getByPlaceholderText('e.g. Review a rental dispute'), { target: { value: 'Contract review' } });
  fireEvent.change(screen.getByPlaceholderText('Share the key facts and your questions. Avoid unnecessary sensitive information.'), { target: { value: 'Please review this contract.' } });
  fireEvent.click(screen.getByRole('button', { name: /^Pay .* & book$/ }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
