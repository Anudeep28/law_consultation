import React from 'react';
import { Modal } from './ui/Modal';

interface PolicyModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({ title, content, onClose }) => {
  return (
    <Modal open onClose={onClose} title={title} maxWidth="2xl">
      <div className="max-h-[70vh] overflow-y-auto p-6 text-sm leading-6 text-[#4a3b32]">
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
      <div className="border-t border-[#eadbc1] px-5 py-3 text-right">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#541522]"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};
