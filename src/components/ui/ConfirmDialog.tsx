import React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} maxWidth="sm">
    <div className="px-6 py-4 text-sm text-ink-body">{message}</div>
    <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg bg-cream-muted px-4 py-2 text-sm text-ink-muted hover:bg-cream-hover"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
