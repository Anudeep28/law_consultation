import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./components/DocumentEditor', () => ({
  DocumentEditor: () => <div data-testid="document-editor" />,
}));

beforeEach(() => {
  localStorage.clear();
});

test('renders the login screen when not authenticated', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /client sign in/i })).toBeInTheDocument();
});
