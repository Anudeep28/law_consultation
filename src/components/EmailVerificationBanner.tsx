import React, { useState } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { sendVerificationEmail } from '../services/notificationService';

export const EmailVerificationBanner: React.FC = () => {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!user || user.isEmailVerified) return null;

  const handleSend = async () => {
    setStatus('sending');
    setMessage('');
    try {
      await sendVerificationEmail();
      setStatus('sent');
      setMessage('Verification email sent. Please check your inbox.');
    } catch {
      setStatus('error');
      setMessage('Unable to send verification email. Please try again later.');
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Verify your email address</p>
            <p className="text-xs text-amber-800">
              {status === 'sent'
                ? message
                : 'Please verify your email to receive consultation reminders and updates.'}
            </p>
          </div>
        </div>
        {status !== 'sent' && (
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'sending'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {status === 'sending' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {status === 'sending' ? 'Sending...' : status === 'error' ? 'Try again' : 'Resend verification email'}
          </button>
        )}
      </div>
    </div>
  );
};
