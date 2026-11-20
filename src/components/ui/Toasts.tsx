import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { DecorativeAnimation } from './DecorativeAnimation';

const ToastMotion = lazy(() => import('./ToastMotion'));

type Variant = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; variant: Variant; expiresAt: number }
let nextId = 0;
export const useToastStore = create<{
  toasts: Toast[];
  add: (message: string, variant?: Variant) => void;
  dismiss: (id: number) => void;
}>((set) => ({
  toasts: [],
  add: (message, variant = 'info') => set((state) => ({
    toasts: [...state.toasts, { id: ++nextId, message, variant, expiresAt: Date.now() + (variant === 'error' ? 8000 : 5000) }],
  })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const notify = (message: string, variant: Variant = 'info') => useToastStore.getState().add(message, variant);

const styles: Record<Variant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-indigo-200 bg-brand-soft text-brand-dark',
};

const ToastMessage: React.FC<{ toast: Toast }> = ({ toast }) => {
  const dismiss = useToastStore((state) => state.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), Math.max(0, toast.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id, toast.expiresAt]);
  return (
    <div role={toast.variant === 'error' ? 'alert' : 'status'} className={`toast-message pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg ${styles[toast.variant]}`}>
      {toast.variant === 'success' && <DecorativeAnimation kind="success" className="h-10 w-10" />}
      <p className="min-w-0 flex-1 break-words text-sm">{toast.message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const Toasts: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  const [activated, setActivated] = useState(false);
  useEffect(() => { if (toasts.length) setActivated(true); }, [toasts.length]);
  const messages = toasts.map(toast => <ToastMessage key={toast.id} toast={toast} />);
  return createPortal(
    <div aria-live="polite" aria-label="Notifications" className="toast-stack pointer-events-none fixed inset-x-4 top-4 z-[100] ml-auto flex max-h-[90dvh] max-w-sm flex-col gap-3 overflow-y-auto">
      {(activated || toasts.length > 0) && <Suspense fallback={messages}><ToastMotion>{messages}</ToastMotion></Suspense>}
    </div>,
    document.body
  );
};
