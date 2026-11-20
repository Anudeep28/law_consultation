import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AuthLayout } from './AuthLayout';

test('keeps the auth form accessible alongside three existing platform features', async () => {
  const { container } = render(<AuthLayout><form aria-label="Sign in"><label>Email<input type="email" /></label></form></AuthLayout>);
  expect(screen.getByRole('heading', { name: 'Professional Legal Documents' })).toBeInTheDocument();
  expect(within(screen.getByRole('form')).getByLabelText('Email')).toBeInTheDocument();
  const features = screen.getByRole('list', { name: 'Platform features' });
  expect(within(features).getAllByRole('listitem')).toHaveLength(3);
  expect(features).toHaveTextContent('Verified lawyers');
  expect(features).toHaveTextContent('Secure payments');
  expect(features).toHaveTextContent('Legal documents');
  await waitFor(() => expect(container.querySelector('.auth-art > svg')).toBeInTheDocument());
});

test('hero artwork and floating chips are decorative and use no remote assets', async () => {
  const { container } = render(<AuthLayout><p>Form content</p></AuthLayout>);
  await waitFor(() => expect(container.querySelector('.auth-art > svg')).toBeInTheDocument());
  const art = container.querySelector('.auth-art');
  expect(art).toHaveAttribute('aria-hidden', 'true');
  expect(art?.querySelector('svg')).toHaveAttribute('focusable', 'false');
  expect(art?.querySelectorAll('.auth-feature-chip')).toHaveLength(3);
  expect(art?.querySelectorAll('image, foreignObject, script')).toHaveLength(0);
  expect(art).toHaveTextContent('Private & confidential');
});
