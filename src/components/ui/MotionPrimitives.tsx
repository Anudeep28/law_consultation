import React from 'react';
import * as m from 'motion/react-m';
import { type HTMLMotionProps } from 'motion/react';
import { useReducedMotion } from './useReducedMotion';
import { useMotionReady } from './MotionProvider';

export const spring = { type: 'spring', stiffness: 420, damping: 32 } as const;

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & { children?: React.ReactNode };

export const PrimaryButton = ({ children, ...props }: ButtonProps) => {
  const reduced = useReducedMotion();
  return <m.button {...props} whileHover={reduced || props.disabled ? undefined : { y: -1 }} whileTap={reduced || props.disabled ? undefined : { scale: 0.98 }}>{children}</m.button>;
};

const useCardMotion = (index: number) => {
  const reduced = useReducedMotion();
  const ready = useMotionReady();
  return {
    initial: reduced || !ready ? false as const : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.22, delay: reduced ? 0 : Math.min(index, 8) * 0.035 },
    whileHover: reduced ? undefined : { y: -3 },
    whileTap: reduced ? undefined : { scale: 0.995 },
  };
};

export const AnimatedCard = ({ index = 0, ...props }: HTMLMotionProps<'div'> & { index?: number }) => (
  <m.div tabIndex={-1} {...useCardMotion(index)} {...props} />
);
export const AnimatedArticle = ({ index = 0, ...props }: HTMLMotionProps<'article'> & { index?: number }) => (
  <m.article tabIndex={-1} {...useCardMotion(index)} {...props} />
);

export const NavButton = ({ children, className = '', ...props }: ButtonProps) => {
  const reduced = useReducedMotion();
  return <m.button {...props} aria-current={className.includes('bg-warning-bg') ? 'page' : undefined} className={`relative isolate ${className}`} whileTap={reduced ? undefined : { scale: 0.98 }}>
    {children}
    {className.includes('bg-warning-bg') && <m.span aria-hidden="true" layoutId="active-navigation" transition={reduced ? { duration: 0 } : spring} className="absolute inset-0 -z-10 !m-0 rounded-xl bg-brand-soft ring-1 ring-brand/10" />}
  </m.button>;
};
