import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthLayout } from './AuthLayout';

vi.mock('./AuthHeroIllustration', () => ({ AuthHeroIllustration: () => {
  throw new Error('Illustration unavailable');
} }));

test('a failed decorative illustration leaves the authentication form usable', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<AuthLayout><form aria-label="Sign in"><label>Email<input type="email" /></label></form></AuthLayout>);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeVisible();
    expect(screen.getByLabelText('Email')).toBeEnabled();
    expect(screen.getByRole('list', { name: 'Platform features' })).toBeVisible();
  } finally {
    error.mockRestore();
  }
});
