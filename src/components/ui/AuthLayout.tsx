import React from 'react';
import { Scale } from 'lucide-react';

export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="auth-scene">
    <div className="auth-layout">
      <section className="auth-hero">
        <div className="auth-wordmark"><span className="auth-symbol"><Scale aria-hidden="true" className="h-6 w-6" /></span>Law Writer</div>
        <h1>Professional Legal Documents</h1>
        <div className="auth-art" aria-hidden="true" />
      </section>
      <section className="auth-card">{children}</section>
    </div>
  </main>
);
