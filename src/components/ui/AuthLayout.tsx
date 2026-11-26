import React, { lazy, Suspense } from 'react';
import { BadgeCheck, CreditCard, FileText, Scale } from 'lucide-react';
import { ThemeControl } from './ThemeControl';

const AuthHeroIllustration = lazy(() => import('./AuthHeroIllustration').then(module => ({ default: module.AuthHeroIllustration })));

class HeroBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="auth-art" aria-hidden="true" /> : this.props.children; }
}

export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="auth-scene">
    <div className="absolute right-3 top-3 z-10"><ThemeControl /></div>
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="auth-wordmark"><span className="auth-symbol"><Scale aria-hidden="true" className="h-6 w-6" /></span>Law Writer</div>
        <h1>Professional Legal Documents</h1>
        <ul className="auth-features" aria-label="Platform features">
          <li><BadgeCheck aria-hidden="true" />Verified lawyers</li>
          <li><CreditCard aria-hidden="true" />Secure payments</li>
          <li><FileText aria-hidden="true" />Legal documents</li>
        </ul>
        <HeroBoundary><Suspense fallback={<div className="auth-art" aria-hidden="true" />}><AuthHeroIllustration /></Suspense></HeroBoundary>
      </section>
      <section className="auth-card">{children}</section>
    </div>
  </main>
);
