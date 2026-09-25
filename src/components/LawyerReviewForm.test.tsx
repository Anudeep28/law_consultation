import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiRequest } from '../services/api';
import { LawyerReviewForm } from './LawyerReviewForm';

jest.mock('../services/api', () => ({ apiRequest: jest.fn(), ApiError: class ApiError extends Error {} }));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

test('submits one rating for an eligible consultation', async () => {
  mockedApiRequest.mockResolvedValueOnce({ review: { id: 'review-1', rating: 5, comment: 'Clear and practical advice.' } });
  render(<LawyerReviewForm consultationId="consultation-1" onSaved={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: '5 stars' }));
  fireEvent.change(screen.getByLabelText('Review'), { target: { value: 'Clear and practical advice.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

  await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith('/api/consultations/consultation-1/review', {
    method: 'POST',
    body: JSON.stringify({ rating: 5, comment: 'Clear and practical advice.' }),
  }));
});
