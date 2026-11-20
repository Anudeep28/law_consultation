import { DecorativeAnimation } from './DecorativeAnimation';

export const LoadingFallback = () => (
  <div role="status" aria-live="polite" className="mx-auto max-w-lg p-8 text-center text-ink-muted">
    <span>Loading…</span>
    <DecorativeAnimation kind="loading" className="mx-auto h-16 w-24" />
    <div aria-hidden="true" className="mt-5 space-y-3">
      <div className="skeleton-bar w-full" /><div className="skeleton-bar w-4/5" /><div className="skeleton-bar w-3/5" />
    </div>
  </div>
);
