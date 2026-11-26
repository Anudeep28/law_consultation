import React, { lazy, Suspense, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { requestPasswordReset } from '../../services/notificationService';
import { UserRole } from '../../types';
import { AuthLayout } from '../ui/AuthLayout';

const RoleIndicator = lazy(() => import('../ui/RoleIndicator'));

interface LoginProps {
  onToggleMode: () => void;
}

export const Login: React.FC<LoginProps> = ({ onToggleMode }) => {
  const [role, setRole] = useState<UserRole>('client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { login, isLoading } = useAuthStore();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotLoading(true);
    try {
      await requestPasswordReset(email);
      setForgotSent(true);
    } catch {
      setError('Unable to send the reset email. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (forgotMode) {
    return (
      <AuthLayout>
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">Reset your password</h2>
            <p className="mt-2 text-center text-sm text-ink-muted">Enter your account email and we'll send you a reset link.</p>
          </div>
          {forgotSent ? (
            <div className="text-center space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                If an account exists for that email, a reset link is on its way.
              </div>
              <button type="button" onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-brand hover:text-accent-dark text-sm">
                Back to sign in
              </button>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={handleForgot}>
              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="forgot-email" className="sr-only">Email address</label>
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 sm:text-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {forgotLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </div>
              <div className="text-center">
                <button type="button" onClick={() => setForgotMode(false)} className="text-brand hover:text-accent-dark text-sm">
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const success = await login(email, password, role);
    if (!success) {
      setError('Invalid email or password');
    }
  };

  return (
    <AuthLayout>
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">
            {role === 'lawyer' ? 'Lawyer sign in' : role === 'admin' ? 'Administrator sign in' : 'Client sign in'}
          </h2>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {role === 'lawyer' ? 'Manage your profile, consultations, and legal documents' : role === 'admin' ? 'Review and approve lawyer profiles' : 'Connect with verified lawyers for legal guidance'}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 rounded-lg border border-line-soft bg-cream-raised p-1">
            {(['client', 'lawyer', 'admin'] as UserRole[]).map((accountRole) => (
              <button key={accountRole} type="button" onClick={() => setRole(accountRole)} className={`relative isolate rounded-md px-2 py-2 text-xs font-semibold ${role === accountRole ? 'text-on-brand' : 'text-ink-muted'}`}>
                {role === accountRole && <Suspense fallback={<span aria-hidden="true" className="absolute inset-0 -z-10 rounded-md bg-brand" />}><RoleIndicator /></Suspense>}
                {accountRole === 'client' ? 'Client' : accountRole === 'lawyer' ? 'Lawyer' : 'Admin'}
              </button>
            ))}
          </div>
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-t-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-b-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center space-y-2">
            <div>
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="text-ink-muted hover:text-accent-dark text-sm"
              >
                Forgot your password?
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={onToggleMode}
                className="text-brand hover:text-accent-dark text-sm"
              >
                Don't have an account? Sign up
              </button>
            </div>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
};
