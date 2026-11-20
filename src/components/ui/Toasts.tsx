import React, { useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { create } from 'zustand';
import { X } from 'lucide-react';

type Variant = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; variant: Variant }
let nextId = 0;
export const useToastStore = create<{
  toasts: Toast[];
  add: (message: string, variant?: Variant) => void;
  dismiss: (id: number) => void;
}>((set) => ({
  toasts: [],
  add: (message, variant = 'info') => set((state) => ({
    toasts: [...state.toasts, { id: ++nextId, message, variant }],
  })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

const transitionToast = (update: () => void) => {
  if (typeof document.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void document.startViewTransition(() => flushSync(update)).finished.catch(() => {});
  } else {
    update();
  }
};

export const notify = (message: string, variant: Variant = 'info') => transitionToast(() => useToastStore.getState().add(message, variant));

const styles: Record<Variant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-indigo-200 bg-brand-soft text-brand-dark',
};

const ToastMessage: React.FC<{ toast: Toast }> = ({ toast }) => {
  const dismiss = useToastStore((state) => state.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => transitionToast(() => dismiss(toast.id)), toast.variant === 'error' ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id, toast.variant]);
  return (
    <div role={toast.variant === 'error' ? 'alert' : 'status'} className={`toast-message pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg ${styles[toast.variant]}`}>
      <p className="min-w-0 flex-1 break-words text-sm">{toast.message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={() => transitionToast(() => dismiss(toast.id))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const Toasts: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);
  return createPortal(
    <div aria-live="polite" aria-label="Notifications" className="toast-stack pointer-events-none fixed inset-x-4 top-4 z-[100] ml-auto flex max-h-[90dvh] max-w-sm flex-col gap-3 overflow-y-auto">
      {toasts.map((toast) => <ToastMessage key={toast.id} toast={toast} />)}
    </div>,
    document.body
  );
};
