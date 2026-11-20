import React, { useState } from 'react';
import { AuthLayout } from '../ui/AuthLayout';
import { useAuthStore } from '../../stores/authStore';
import { UserRole } from '../../types';
import { PasswordRules } from './PasswordRules';

interface RegisterProps {
  onToggleMode: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onToggleMode }) => {
  const [role, setRole] = useState<UserRole>('client');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [barCouncil, setBarCouncil] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const { register, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    const result = await register({ name, email, phone, password, role, barCouncil, enrollmentNumber });
    if (result !== true) {
      setError(result);
    }
  };

  return (
    <AuthLayout>
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-ink">
            Create a {role} account
          </h2>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {role === 'lawyer' ? 'Your credentials will be reviewed before clients can book you' : 'Find and consult verified legal professionals'}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-lg border border-line-soft bg-white p-1">
            {(['client', 'lawyer'] as UserRole[]).map((accountRole) => (
              <button key={accountRole} type="button" onClick={() => setRole(accountRole)} className={`rounded-md px-3 py-2 text-sm font-semibold ${role === accountRole ? 'bg-brand text-white' : 'text-ink-muted'}`}>
                {accountRole === 'client' ? 'Public / Client' : 'Lawyer'}
              </button>
            ))}
          </div>
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-ink-muted">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 sm:text-sm"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-muted">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-ink-muted">Mobile number</label>
              <input id="phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" required className="mt-1 block w-full rounded-md border border-line-soft bg-cream-raised px-3 py-2 text-ink focus:border-accent-dark focus:outline-none" placeholder="10-digit Indian mobile number" value={phone} onChange={(event) => setPhone(event.target.value)} />
              <p className="mt-1 text-xs text-ink-faint">We will verify this number with an OTP after registration.</p>
            </div>
            {role === 'lawyer' && <>
              <div>
                <label htmlFor="barCouncil" className="block text-sm font-medium text-ink-muted">Bar Council</label>
                <input id="barCouncil" required value={barCouncil} onChange={(event) => setBarCouncil(event.target.value)} className="mt-1 block w-full px-3 py-2 border border-line-soft text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark" placeholder="e.g. Bar Council of Delhi" />
              </div>
              <div>
                <label htmlFor="enrollmentNumber" className="block text-sm font-medium text-ink-muted">Enrollment Number</label>
                <input id="enrollmentNumber" required value={enrollmentNumber} onChange={(event) => setEnrollmentNumber(event.target.value)} className="mt-1 block w-full px-3 py-2 border border-line-soft text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark" placeholder="Your bar enrollment number" />
              </div>
            </>}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-muted">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 sm:text-sm"
                placeholder="Password (10–128 characters)"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-muted">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-line-soft placeholder-ink-weakest text-ink bg-cream-raised rounded-md focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 sm:text-sm"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <PasswordRules />
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-brand hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onToggleMode}
              className="text-brand hover:text-accent-dark text-sm"
            >
              Already have an account? Sign in
            </button>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
};
