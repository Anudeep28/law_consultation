import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DecorativeAnimation } from './DecorativeAnimation';
import { LoadingFallback } from './LoadingFallback';

const state = vi.hoisted(() => ({ fail: false }));
vi.mock('./AnimationPlayer', () => ({ default: () => {
  if (state.fail) throw new Error('Animation unavailable');
  return <svg data-testid="local-animation" />;
} }));

test('keeps the loading status while the decorative player loads', async () => {
  render(<LoadingFallback />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  await waitFor(() => expect(screen.getByTestId('local-animation')).toBeInTheDocument());
  expect(screen.getByTestId('local-animation').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
});

test('a failed decorative player does not remove the surrounding status', async () => {
  state.fail = true;
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<div role="status">Saved<DecorativeAnimation kind="success" /></div>);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.queryByTestId('local-animation')).not.toBeInTheDocument();
  } finally {
    state.fail = false;
    error.mockRestore();
  }
});
