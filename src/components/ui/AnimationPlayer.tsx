import React, { useEffect, useRef, useState } from 'react';
import { LottieLight, type LottieHandle } from 'lottie-react';
import { useReducedMotion } from './useReducedMotion';
import type { AnimationKind } from './DecorativeAnimation';

const animations = {
  success: () => import('../../assets/animations/success.json'),
  empty: () => import('../../assets/animations/empty.json'),
  loading: () => import('../../assets/animations/loading.json'),
};
type AnimationData = { ip: number; op: number };

export default function AnimationPlayer({ kind }: { kind: AnimationKind }) {
  const reduced = useReducedMotion();
  const player = useRef<LottieHandle>(null);
  const [data, setData] = useState<AnimationData | null>(null);
  const settle = () => {
    if (reduced && data) {
      player.current?.pause();
      player.current?.seek({ frame: data.op - data.ip - 1 });
    } else {
      player.current?.play();
    }
  };
  useEffect(() => {
    let mounted = true;
    setData(null);
    void animations[kind]().then(module => { if (mounted) setData(module.default); }).catch(() => {});
    return () => { mounted = false; };
  }, [kind]);
  useEffect(settle, [data, reduced]);

  return <span aria-hidden="true" className="block h-full w-full" data-animation={kind} data-playback={reduced ? 'static' : 'animated'}>
    {data && <LottieLight src={data} renderer="svg" lottieRef={player} autoplay={false} loop={!reduced && kind === 'loading'} subscriptions={{ ready: settle }} className="h-full w-full" />}
  </span>;
}
