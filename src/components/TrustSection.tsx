import React from 'react';
import { ShieldCheck, Lock, BadgeCheck, FileText, Scale, Star } from 'lucide-react';

const trustPoints = [
  {
    icon: Scale,
    title: 'Verified legal professionals',
    description: 'Every advocate is verified through bar council registration and enrollment numbers before they can serve clients.',
  },
  {
    icon: Lock,
    title: 'Private & confidential',
    description: 'Your consultation notes, chat, and call transcripts are protected and only visible to you and your lawyer.',
  },
  {
    icon: BadgeCheck,
    title: 'Transparent pricing',
    description: 'See the exact fee and total cost before you book. No hidden charges, no surprises.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure payments',
    description: 'Payments are processed through Razorpay with industry-standard encryption and fraud protection.',
  },
  {
    icon: FileText,
    title: 'Legal documents delivered',
    description: 'Choose "Call + Document" and receive a professionally drafted legal document after your consultation.',
  },
  {
    icon: Star,
    title: 'Rated by real clients',
    description: 'Read verified reviews and ratings from clients who have consulted the lawyer before.',
  },
];

export const TrustSection: React.FC = () => {
  return (
    <section className="rounded-2xl border border-[#eadbc1] bg-white p-6 shadow-sm">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-[#32151b]">Why Law Writer?</h2>
        <p className="mt-1 text-sm text-[#6f5a49]">
          Consult with verified lawyers securely, transparently, and confidently.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {trustPoints.map((point) => {
          const Icon = point.icon;
          return (
            <div
              key={point.title}
              className="flex flex-col items-start rounded-xl border border-[#f0e4d2] bg-[#fffaf0] p-4 transition hover:border-[#eadbc1] hover:shadow-sm"
            >
              <div className="mb-3 rounded-lg bg-[#fff4d6] p-2.5 text-[#765116]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-[#32151b]">{point.title}</h3>
              <p className="mt-1 text-xs leading-5 text-[#6f5a49]">{point.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
