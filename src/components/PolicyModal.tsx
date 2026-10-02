import React from 'react';
import { X } from 'lucide-react';

interface PolicyModalProps {
  title: string;
  content: string;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({ title, content, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[#eadbc1] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eadbc1] px-5 py-4">
          <h2 className="text-lg font-bold text-[#32151b]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#6f5a49] hover:bg-[#fffaf0]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-6 text-sm leading-6 text-[#4a3b32]">
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
      </div>
    </div>
  );
};
