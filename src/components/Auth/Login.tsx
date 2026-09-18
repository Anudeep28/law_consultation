import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { UserRole } from '../../types';

interface LoginProps {
  onToggleMode: () => void;
}

export const Login: React.FC<LoginProps> = ({ onToggleMode }) => {
  const [role, setRole] = useState<UserRole>('client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const success = await login(email, password, role);
    if (!success) {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fffaf0] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-[#32151b]">
            {role === 'lawyer' ? 'Lawyer sign in' : role === 'admin' ? 'Administrator sign in' : 'Client sign in'}
          </h2>
          <p className="mt-2 text-center text-sm text-[#6f5a49]">
            {role === 'lawyer' ? 'Manage your profile, consultations, and legal documents' : role === 'admin' ? 'Review and approve lawyer profiles' : 'Connect with verified lawyers for legal guidance'}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 rounded-lg border border-[#e6d8c2] bg-white p-1">
            {(['client', 'lawyer', 'admin'] as UserRole[]).map((accountRole) => (
              <button key={accountRole} type="button" onClick={() => setRole(accountRole)} className={`rounded-md px-2 py-2 text-xs font-semibold ${role === accountRole ? 'bg-[#701f2f] text-white' : 'text-[#6f5a49]'}`}>
                {accountRole === 'client' ? 'Client' : accountRole === 'lawyer' ? 'Lawyer' : 'Admin'}
              </button>
            ))}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
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
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-t-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 focus:z-10 sm:text-sm"
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
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-b-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 focus:z-10 sm:text-sm"
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
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#701f2f] hover:bg-[#541522] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f4c95d]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onToggleMode}
              className="text-[#701f2f] hover:text-[#b8862d] text-sm"
            >
              Don't have an account? Sign up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
