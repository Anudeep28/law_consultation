import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AnimationPlayer from './AnimationPlayer';

const { play, pause, stop, renderPlayer } = vi.hoisted(() => ({ play: vi.fn(), pause: vi.fn(), stop: vi.fn(), renderPlayer: vi.fn(), }));
vi.mock('lottie-react', () => ({ LottieLight: (props: any) => {
  renderPlayer(props);
  props.lottieRef.current = { play, pause, seek: stop };
  return <svg aria-hidden="true" data-lottie="local" />;
} }));

beforeEach(() => {
  play.mockClear(); pause.mockClear(); stop.mockClear(); renderPlayer.mockClear();
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

test('stops a running loop on a live media change and resumes when disabled', async () => {
  let matches = false;
  const listeners = new Set<() => void>();
  const remove = vi.fn((_event: string, listener: () => void) => listeners.delete(listener));
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() { return matches; },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: remove,
  });
  const { container, unmount } = render(<AnimationPlayer kind="loading" />);
  await waitFor(() => expect(renderPlayer).toHaveBeenCalled());
  expect(renderPlayer.mock.lastCall![0].loop).toBe(true);
  act(() => { matches = true; listeners.forEach(listener => listener()); });
  const props = renderPlayer.mock.lastCall![0];
  expect(container.firstChild).toHaveAttribute('data-playback', 'static');
  expect(props.loop).toBe(false);
  expect(pause).toHaveBeenCalled();
  expect(stop).toHaveBeenLastCalledWith({ frame: props.src.op - props.src.ip - 1 });
  play.mockClear();
  act(() => { matches = false; listeners.forEach(listener => listener()); });
  expect(renderPlayer.mock.lastCall![0].loop).toBe(true);
  expect(play).toHaveBeenCalled();
  unmount();
  expect(remove).toHaveBeenCalled();
  expect(listeners.size).toBe(0);
});
