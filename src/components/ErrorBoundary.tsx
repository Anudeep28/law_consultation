import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportBoundaryError } from '../services/monitoring';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReload?: () => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportBoundaryError(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center p-6">
        <section role="alert" className="max-w-md rounded-xl border border-line bg-cream-raised p-8 text-center text-ink">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-ink-faint">We couldn’t display this page. Please reload to try again.</p>
          <button type="button" onClick={this.props.onReload || (() => window.location.reload())} className="mt-6 rounded-lg bg-brand px-4 py-2 font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Reload page</button>
        </section>
      </main>
    );
  }
}
