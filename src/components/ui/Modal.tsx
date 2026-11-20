import React from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from 'lucide-react';
import * as m from 'motion/react-m';
import { AnimatePresence, useIsPresent } from 'motion/react';
import { useReducedMotion } from './useReducedMotion';
import { spring } from './MotionPrimitives';

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

const ModalDialog: React.FC<ModalProps> = ({
  fullScreenOnMobile = false,
  onClose,
  title,
  subtitle,
  maxWidth = 'lg',
  panelClassName = '',
  children,
}) => {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const blockWhileExiting = (event: React.SyntheticEvent) => {
    if (!present) { event.preventDefault(); event.stopPropagation(); }
  };
  return <Dialog static open onClose={onClose} className="relative z-[60]">
    <DialogBackdrop as={m.div} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.18 } }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.18 } }} className="dialog-backdrop fixed inset-0 bg-slate-950/45 backdrop-blur-sm" />
    <div className={`fixed inset-0 flex items-center justify-center ${fullScreenOnMobile ? 'p-0 sm:p-4' : 'p-4'}`}>
      <DialogPanel
        as={m.div}
        inert={!present}
        onClickCapture={blockWhileExiting}
        onSubmitCapture={blockWhileExiting}
        onKeyDownCapture={blockWhileExiting}
        onPointerDownCapture={blockWhileExiting}
        initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: 0 } : spring }}
        exit={{ opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.98, transition: reduced ? { duration: 0 } : spring }}
        className={`dialog-panel w-full ${fullScreenOnMobile ? `max-w-none ${MOBILE_MAX_WIDTHS[maxWidth]} h-[100dvh] sm:h-[75vh] max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-2xl` : `${MAX_WIDTHS[maxWidth]} max-h-[90vh] rounded-2xl`} overflow-hidden border border-line bg-white shadow-2xl ${panelClassName}`}
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
              className="dialog-close text-ink-faint hover:bg-cream-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </DialogPanel>
    </div>
  </Dialog>;
};

export const Modal: React.FC<ModalProps> = props => (
  <AnimatePresence propagate>{props.open && <ModalDialog {...props} />}</AnimatePresence>
);
