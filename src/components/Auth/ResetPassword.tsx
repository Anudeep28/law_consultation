import React, { useState } from 'react';
import { resetPassword } from '../../services/notificationService';

interface ResetPasswordProps {
  token: string;
  onDone: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">Choose a new password</h2>
          <p className="mt-2 text-center text-sm text-ink-muted">Enter and confirm your new password below.</p>
        </div>
        {done ? (
          <div className="text-center space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              Your password has been updated. You can sign in with it now.
            </div>
            <button type="button" onClick={onDone} className="text-brand hover:text-accent-dark text-sm">
              Back to sign in
            </button>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="new-password" className="sr-only">New password</label>
                <input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-t-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 focus:z-10 sm:text-sm"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">Confirm password</label>
                <input
                  id="confirm-password"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-b-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 focus:z-10 sm:text-sm"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={submitting}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Updating...' : 'Update password'}
              </button>
            </div>
            <div className="text-center">
              <button type="button" onClick={onDone} className="text-brand hover:text-accent-dark text-sm">
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
