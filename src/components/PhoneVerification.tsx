import React, { useState } from 'react';
import { CheckCircle, Smartphone } from 'lucide-react';
import { ApiError, apiRequest } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { User } from '../types';

export const PhoneVerification: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [phone, setPhone] = useState(user?.phone || '');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!user || user.isPhoneVerified) return null;

  const sendOtp = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      await apiRequest('/api/auth/phone/send-otp', { method: 'POST', body: JSON.stringify({ phone }) });
      setOtpSent(true);
      setMessage('OTP sent. It may take a moment to arrive.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to send OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    setIsLoading(true);
    setMessage('');
    try {
      const result = await apiRequest<{ user: User }>('/api/auth/phone/verify-otp', { method: 'POST', body: JSON.stringify({ otp }) });
      setUser(result.user);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to verify OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div><p className="text-sm font-semibold text-amber-900">Verify your mobile number</p><p className="text-xs text-amber-800">OTP verification helps secure your account.</p></div>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row">
          <input aria-label="Mobile number" type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={otpSent} className="min-w-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" placeholder="10-digit mobile" />
          {otpSent && <input aria-label="One-time password" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm min-[420px]:w-32" placeholder="OTP" />}
          <button type="button" disabled={isLoading} onClick={otpSent ? verifyOtp : sendOtp} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{otpSent && <CheckCircle className="h-4 w-4" />}{isLoading ? 'Please wait...' : otpSent ? 'Verify OTP' : 'Send OTP'}</button>
        </div>
      </div>
      {message && <p className="mx-auto mt-2 max-w-5xl text-xs text-amber-900">{message}</p>}
    </div>
  );
};
