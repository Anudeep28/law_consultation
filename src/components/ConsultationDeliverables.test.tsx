import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConsultationDeliverables } from './ConsultationDeliverables';
import { apiRequest } from '../services/api';

jest.mock('../services/api', () => ({
  apiRequest: jest.fn(),
  ApiError: class ApiError extends Error {},
}));
jest.mock('./ExportOptions', () => ({ ExportOptions: () => null }));

const mockedApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const draft = {
  id: 'deliverable-1',
  consultationId: 'consultation-1',
  documentId: 'document-1',
  title: 'Draft – Property dispute',
  content: '# Petition',
  status: 'draft' as const,
  createdAt: '2026-09-22T10:00:00.000Z',
  document: {
    id: 'document-1',
    title: 'Draft – Property dispute',
    content: '# Petition',
    createdAt: new Date('2026-09-22T10:00:00.000Z'),
    updatedAt: new Date('2026-09-22T10:00:00.000Z'),
    userId: 'lawyer-1',
  },
};

test('allows a lawyer to translate a generated draft into a selected language', async () => {
  mockedApiRequest
    .mockResolvedValueOnce({ deliverables: [draft] })
    .mockResolvedValueOnce({ deliverable: { ...draft, id: 'deliverable-2', title: `${draft.title} – हिन्दी` } })
    .mockResolvedValueOnce({ deliverables: [draft] });

  render(<ConsultationDeliverables consultationId="consultation-1" role="lawyer" />);

  expect(await screen.findByText(draft.title)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(`Translation language for ${draft.title}`), { target: { value: 'hi' } });
  fireEvent.click(screen.getByRole('button', { name: `Translate ${draft.title}` }));

  await waitFor(() => expect(mockedApiRequest).toHaveBeenCalledWith(
    '/api/consultations/consultation-1/deliverables/deliverable-1/translate',
    { method: 'POST', body: JSON.stringify({ language: 'hi' }) }
  ));
});

test('does not expose draft translation controls to clients', async () => {
  mockedApiRequest.mockResolvedValueOnce({ deliverables: [{ ...draft, status: 'delivered' }] });

  render(<ConsultationDeliverables consultationId="consultation-1" role="client" />);

  expect(await screen.findByText(draft.title)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: `Translate ${draft.title}` })).not.toBeInTheDocument();
});
