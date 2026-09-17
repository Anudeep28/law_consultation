import React, { useState } from 'react';
import { Check, Clock, FileText, Loader2 } from 'lucide-react';
import { checkout } from '../services/razorpayService';
import { useAuthStore } from '../stores/authStore';
import { PaidPlan } from '../types';

export const SubscriptionView: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [processingPlan, setProcessingPlan] = useState<PaidPlan | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!user) return null;

  const expiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  const trialActive = user.subscriptionPlan === 'trial' && Boolean(expiry && expiry.getTime() > Date.now());
  const monthlyActive = user.subscriptionPlan === 'monthly' && Boolean(expiry && expiry.getTime() > Date.now());

  const handleCheckout = async (plan: PaidPlan) => {
    setProcessingPlan(plan);
    setMessage(null);
    try {
      const updatedUser = await checkout(plan, user);
      setUser(updatedUser);
      setMessage({
        type: 'success',
        text: plan === 'monthly' ? 'Monthly subscription activated.' : 'One document credit added.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Payment failed' });
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-[#fffaf0]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-[#32151b]">Choose your access</h3>
          <p className="text-[#6f5a49] mt-1">Secure payments powered by Razorpay</p>
        </div>

        {message && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className={`rounded-2xl border-2 bg-white p-6 shadow-sm ${trialActive ? 'border-[#f4c95d]' : 'border-[#eadbc1]'}`}>
            <Clock className="w-8 h-8 text-[#b8862d] mb-4" />
            <h4 className="text-lg font-semibold text-[#32151b]">New user trial</h4>
            <p className="text-3xl font-bold text-[#32151b] mt-2">Free</p>
            <p className="text-sm text-[#8c6b54] mt-2">Available once for 2 days after registration</p>
            <div className="mt-5 space-y-2 text-sm text-[#6f5a49]">
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> Unlimited documents during trial</p>
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> All templates and exports</p>
            </div>
            <div className="mt-6 text-sm font-medium text-[#b8862d]">
              {trialActive && expiry ? `Active until ${expiry.toLocaleDateString()}` : 'Trial unavailable or expired'}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#eadbc1] bg-white p-6 shadow-sm">
            <FileText className="w-8 h-8 text-[#701f2f] mb-4" />
            <h4 className="text-lg font-semibold text-[#32151b]">Single document</h4>
            <p className="text-3xl font-bold text-[#32151b] mt-2">₹10</p>
            <p className="text-sm text-[#8c6b54] mt-2">Pay only when you need a document</p>
            <div className="mt-5 space-y-2 text-sm text-[#6f5a49]">
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> One new document</p>
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> Credit does not expire</p>
            </div>
            <button
              onClick={() => handleCheckout('single')}
              disabled={processingPlan !== null}
              className="mt-6 w-full flex justify-center items-center gap-2 rounded-lg bg-[#3f1420] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2a0d16] disabled:opacity-50 transition"
            >
              {processingPlan === 'single' && <Loader2 className="w-4 h-4 animate-spin" />}
              Buy one document
            </button>
            <p className="mt-3 text-center text-xs text-[#8c6b54]">Credits available: {user.documentCredits}</p>
          </div>

          <div className={`rounded-2xl border-2 bg-white p-6 shadow-sm ${monthlyActive ? 'border-[#701f2f]' : 'border-[#eadbc1]'}`}>
            <div className="inline-flex rounded-full bg-[#fff4d6] px-2.5 py-1 text-xs font-semibold text-[#765116] mb-3">Best value</div>
            <h4 className="text-lg font-semibold text-[#32151b]">Monthly</h4>
            <p className="text-3xl font-bold text-[#32151b] mt-2">₹499<span className="text-sm font-normal text-[#8c6b54]"> / month</span></p>
            <p className="text-sm text-[#8c6b54] mt-2">Unlimited document creation for 30 days</p>
            <div className="mt-5 space-y-2 text-sm text-[#6f5a49]">
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> Unlimited documents</p>
              <p className="flex gap-2"><Check className="w-4 h-4 text-green-600" /> All templates and exports</p>
            </div>
            <button
              onClick={() => handleCheckout('monthly')}
              disabled={processingPlan !== null}
              className="mt-6 w-full flex justify-center items-center gap-2 rounded-lg bg-[#701f2f] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#541522] disabled:opacity-50 transition"
            >
              {processingPlan === 'monthly' && <Loader2 className="w-4 h-4 animate-spin" />}
              {monthlyActive ? 'Extend by 30 days' : 'Subscribe monthly'}
            </button>
            {monthlyActive && expiry && <p className="mt-3 text-center text-xs text-green-700">Active until {expiry.toLocaleDateString()}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
