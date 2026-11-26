import React from 'react';
import * as m from 'motion/react-m';
import { AnimatePresence } from 'motion/react';
import { useReducedMotion } from './useReducedMotion';
import { spring } from './MotionPrimitives';

export default function ToastMotion({ children }: { children: React.ReactElement[] }) {
  const reduced = useReducedMotion();
  return <AnimatePresence>{children.map(child => (
    <m.div key={child.key} layout initial={reduced ? false : { opacity: 0, x: 20, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: reduced ? 0 : 16, scale: reduced ? 1 : 0.98 }} transition={reduced ? { duration: 0 } : spring}>
      {child}
    </m.div>
  ))}</AnimatePresence>;
}
