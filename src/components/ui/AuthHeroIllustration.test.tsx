import React from 'react';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthHeroIllustration } from './AuthHeroIllustration';

const { renderChip } = vi.hoisted(() => ({ renderChip: vi.fn() }));
vi.mock('./MotionProvider', () => ({ useMotionReady: () => true }));
vi.mock('motion/react-m', () => ({ div: ({ initial, animate, transition, ...props }: any) => {
  renderChip({ initial, animate, transition });
  return <div {...props} />;
} }));

test('starts gentle repeating motion without suppressing the initial animation', () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  const { container } = render(<AuthHeroIllustration />);
  expect(container.firstChild).toHaveAttribute('data-motion', 'floating');
  const chip = renderChip.mock.calls[0][0];
  expect(chip.initial).toEqual({ y: 0, x: 0 });
  expect(chip.animate.y).toEqual([0, -6, 0]);
  expect(chip.transition.repeat).toBe(Infinity);
});

test('live reduced motion stops all floating chips immediately', () => {
  let matches = false;
  let change = () => {};
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() { return matches; },
    addEventListener: (_event: string, listener: () => void) => { change = listener; },
    removeEventListener: vi.fn(),
  });
  const { container } = render(<AuthHeroIllustration />);
  act(() => { matches = true; change(); });
  expect(container.firstChild).toHaveAttribute('data-motion', 'static');
  expect(renderChip.mock.lastCall![0]).toEqual({ initial: { y: 0, x: 0 }, animate: { y: 0, x: 0 }, transition: { duration: 0 } });
});
