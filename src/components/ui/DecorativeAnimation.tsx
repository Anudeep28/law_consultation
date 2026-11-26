import React, { Component, lazy, Suspense } from 'react';

export type AnimationKind = 'success' | 'empty' | 'loading';
const AnimationPlayer = lazy(() => import('./AnimationPlayer'));

class AnimationBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export const DecorativeAnimation = ({ kind, className = 'mx-auto h-24 w-24' }: { kind: AnimationKind; className?: string }) => (
  <span aria-hidden="true" className={`pointer-events-none block shrink-0 ${className}`}>
    <AnimationBoundary><Suspense fallback={null}><AnimationPlayer kind={kind} /></Suspense></AnimationBoundary>
  </span>
);
