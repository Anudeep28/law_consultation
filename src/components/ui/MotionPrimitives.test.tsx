import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AnimatedArticle, AnimatedCard, NavButton, PrimaryButton } from './MotionPrimitives';

test('decorative card gestures do not add tab stops to non-interactive cards', () => {
  render(<><AnimatedArticle>Consultation</AnimatedArticle><AnimatedCard data-testid="document">Document</AnimatedCard></>);
  expect(screen.getByRole('article')).toHaveAttribute('tabindex', '-1');
  expect(screen.getByTestId('document')).toHaveAttribute('tabindex', '-1');
});

test('retains native navigation button behavior and text', () => {
  const onClick = vi.fn();
  render(<NavButton onClick={onClick} className="bg-warning-bg">Account &amp; Privacy</NavButton>);
  fireEvent.click(screen.getByRole('button', { name: 'Account & Privacy' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button').querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});

test('disabled primary controls keep native disabled semantics', () => {
  const onClick = vi.fn();
  render(<PrimaryButton disabled onClick={onClick}>Pay &amp; book</PrimaryButton>);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toBeDisabled();
  expect(onClick).not.toHaveBeenCalled();
});
