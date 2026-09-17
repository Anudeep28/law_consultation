import { apiRequest } from './api';
import { PaidPlan, User } from '../types';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

const loadCheckout = () => new Promise<void>((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('Unable to load Razorpay checkout'));
  document.body.appendChild(script);
});

export const checkout = async (plan: PaidPlan, user: User): Promise<User> => {
  await loadCheckout();
  const order = await apiRequest<{ orderId: string; amount: number; currency: string; keyId: string }>(
    '/api/payments/order',
    { method: 'POST', body: JSON.stringify({ plan }) },
  );

  return new Promise((resolve, reject) => {
    const razorpay = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Law Writer',
      description: plan === 'monthly' ? 'Monthly subscription' : 'Single document credit',
      order_id: order.orderId,
      prefill: { name: user.name, email: user.email },
      theme: { color: '#4f46e5' },
      handler: async (payment) => {
        try {
          const result = await apiRequest<{ verified: boolean; plan: PaidPlan; paymentId: string; user: User }>(
            '/api/payments/verify',
            { method: 'POST', body: JSON.stringify(payment) },
          );
          if (!result.verified || result.plan !== plan) throw new Error('Payment verification failed');
          resolve(result.user);
        } catch (error) {
          reject(error);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled')) },
    });
    razorpay.open();
  });
};
