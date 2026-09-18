import React, { useEffect, useState } from 'react';
import { Calendar, Clock, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../services/api';
import { Consultation } from '../types';
import { ConsultationChat } from './ConsultationChat';

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export const LawyerConsultationsView: React.FC = () => {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [activeChat, setActiveChat] = useState<Consultation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ consultations: Consultation[] }>('/api/lawyer/consultations')
      .then((result) => setConsultations(result.consultations))
      .catch(() => setError('Unable to load your consultations.'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="h-full flex items-center justify-center text-gray-500">Loading consultations...</div>;

  return <div className="h-full overflow-y-auto bg-[#fffaf0] p-6">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#3f1420] to-[#701f2f] p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-[#ffe7a3]"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">LAWYER WORKSPACE</span></div>
        <h1 className="mt-2 text-2xl font-bold">Client consultations</h1>
        <p className="mt-1 text-sm text-rose-100">Review upcoming matters and join active consultation chats.</p>
      </div>
      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!consultations.length && <div className="rounded-xl border border-[#eadbc1] bg-white p-10 text-center"><Calendar className="mx-auto mb-3 h-10 w-10 text-gray-300" /><h3 className="font-semibold">No consultations assigned</h3><p className="mt-1 text-sm text-gray-500">Bookings will appear after your profile is verified and clients schedule with you.</p></div>}
      <div className="space-y-4">
        {consultations.map((consultation) => {
          const now = Date.now();
          const canOpenChat = consultation.mode === 'chat' && consultation.status === 'booked' && new Date(consultation.startsAt).getTime() - 10 * 60 * 1000 <= now && new Date(consultation.endsAt).getTime() > now;
          return <article key={consultation.id} className="rounded-xl border border-[#eadbc1] bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div><div className="flex items-center gap-2"><h3 className="font-semibold text-[#32151b]">{consultation.client?.name || 'Client'}</h3><span className="rounded-full bg-[#f8f1e5] px-2 py-0.5 text-xs capitalize text-[#6f5a49]">{consultation.status}</span></div><p className="mt-1 text-sm font-medium text-gray-700">{consultation.topic}</p><p className="mt-2 max-w-2xl text-sm text-gray-500">{consultation.notes}</p><p className="mt-3 flex items-center gap-1 text-sm text-gray-500"><Clock className="h-4 w-4" />{formatDateTime(consultation.startsAt)} · 10 minutes</p></div>
              <div className="flex items-center gap-2"><span className="flex items-center gap-1 text-sm capitalize text-gray-500">{consultation.mode === 'chat' ? <MessageCircle className="h-4 w-4" /> : <Phone className="h-4 w-4" />}{consultation.mode}</span>{canOpenChat && <button onClick={() => setActiveChat(consultation)} className="rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white">Open chat</button>}</div>
            </div>
          </article>;
        })}
      </div>
    </div>
    {activeChat && <ConsultationChat consultation={activeChat} onClose={() => setActiveChat(null)} />}
  </div>;
};
