import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AnimationPlayer from './AnimationPlayer';

const { play, stop, renderPlayer } = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), renderPlayer: vi.fn(), }));
vi.mock('lottie-react', () => ({ LottieLight: (props: any) => {
  renderPlayer(props);
  props.lottieRef.current = { play, pause: vi.fn(), seek: stop };
  return <svg aria-hidden="true" data-lottie="local" />;
} }));
vi.mock('motion/react', () => ({ useReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches }));

beforeEach(() => {
  play.mockClear(); stop.mockClear(); renderPlayer.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

test.each(['success', 'empty', 'loading'] as const)('renders the local %s SVG decoratively', async kind => {
  const { container } = render(<AnimationPlayer kind={kind} />);
  await waitFor(() => expect(container.querySelector('svg')).toBeInTheDocument());
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  const props = renderPlayer.mock.lastCall![0];
  expect(props.renderer).toBe('svg');
  expect(props.src.assets).toEqual([]);
  expect(props.loop).toBe(kind === 'loading');
  props.subscriptions.ready();
  expect(play).toHaveBeenCalled();
});

test('uses the final static frame under reduced motion', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  render(<AnimationPlayer kind="loading" />);
  await waitFor(() => expect(renderPlayer).toHaveBeenCalled());
  const props = renderPlayer.mock.lastCall![0];
  expect(props.autoplay).toBe(false);
  expect(props.loop).toBe(false);
  props.subscriptions.ready();
  expect(stop).toHaveBeenCalledWith({ frame: props.src.op - props.src.ip - 1 });
  expect(play).not.toHaveBeenCalled();
});
