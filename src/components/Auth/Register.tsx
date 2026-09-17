import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface RegisterProps {
  onToggleMode: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onToggleMode }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    const success = await register({ name, email, password });
    if (!success) {
      setError('Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fffaf0] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-[#32151b]">
            Create your Law Writer account
          </h2>
          <p className="mt-2 text-center text-sm text-[#6f5a49]">
            Start your 2-day free trial with professional legal document writing
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#6f5a49]">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 sm:text-sm"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#6f5a49]">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#6f5a49]">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 sm:text-sm"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#6f5a49]">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-[#e6d8c2] placeholder-[#a89580] text-[#32151b] bg-[#fffcf6] rounded-md focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 sm:text-sm"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#701f2f] hover:bg-[#541522] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#f4c95d]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onToggleMode}
              className="text-[#701f2f] hover:text-[#b8862d] text-sm"
            >
              Already have an account? Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
