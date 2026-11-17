import React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';

const MAX_WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '6xl': 'max-w-6xl',
} as const;

const MOBILE_MAX_WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl', '6xl': 'sm:max-w-6xl' } as const;

type MaxWidth = keyof typeof MAX_WIDTHS;

interface ModalProps {
  open: boolean;
  fullScreenOnMobile?: boolean;
  onClose: () => void;
  /** When set, renders the standard header (title, subtitle, close button). */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  maxWidth?: MaxWidth;
  /** Extra classes merged onto the panel — e.g. `flex h-[75vh] flex-col`. */
  panelClassName?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  fullScreenOnMobile = false,
  onClose,
  title,
  subtitle,
  maxWidth = 'lg',
  panelClassName = '',
  children,
}) => (
  <Dialog open={open} onClose={onClose} className="relative z-[60]">
    <DialogBackdrop className="fixed inset-0 bg-black/50" />
    <div className={`fixed inset-0 flex items-center justify-center ${fullScreenOnMobile ? 'p-0 sm:p-4' : 'p-4'}`}>
      <DialogPanel
        className={`w-full ${fullScreenOnMobile ? `max-w-none ${MOBILE_MAX_WIDTHS[maxWidth]} h-[100dvh] sm:h-[75vh] max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-2xl` : `${MAX_WIDTHS[maxWidth]} max-h-[90vh] rounded-2xl`} overflow-hidden border border-line bg-white shadow-2xl ${panelClassName}`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-line bg-cream px-6 py-4">
            <div>
              <DialogTitle className="text-lg font-bold text-ink">{title}</DialogTitle>
              {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-ink-faint hover:text-ink-muted"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </DialogPanel>
    </div>
  </Dialog>
);
