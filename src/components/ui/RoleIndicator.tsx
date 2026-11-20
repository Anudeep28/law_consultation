import React from 'react';
import * as m from 'motion/react-m';
import { useReducedMotion } from './useReducedMotion';
import { spring } from './MotionPrimitives';

export default function RoleIndicator() {
  const reduced = useReducedMotion();
  return <m.span aria-hidden="true" layoutId="login-role" transition={reduced ? { duration: 0 } : spring} className="absolute inset-0 -z-10 rounded-md bg-brand" />;
}
