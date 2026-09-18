import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Send, ShieldCheck, X } from 'lucide-react';
import { apiRequest, ApiError } from '../services/api';
import { Consultation, ConsultationMessage } from '../types';
import { useAuthStore } from '../stores/authStore';

interface ConsultationChatProps {
  consultation: Consultation;
  onClose: () => void;
}

const remainingTime = (endsAt: string) => Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000));
const formatRemaining = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

export const ConsultationChat: React.FC<ConsultationChatProps> = ({ consultation, onClose }) => {
  const role = useAuthStore((state) => state.user?.role);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [content, setContent] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(() => remainingTime(consultation.endsAt));
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const result = await apiRequest<{ messages: ConsultationMessage[] }>(`/api/consultations/${consultation.id}/messages`);
      setMessages(result.messages);
    } catch {
      setError('Unable to load chat messages.');
    }
  }, [consultation.id]);

  useEffect(() => {
    void loadMessages();
    const messageTimer = window.setInterval(() => void loadMessages(), 5000);
    const countdownTimer = window.setInterval(() => setSecondsLeft(remainingTime(consultation.endsAt)), 1000);
    return () => {
      window.clearInterval(messageTimer);
      window.clearInterval(countdownTimer);
    };
  }, [consultation.endsAt, loadMessages]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim() || !secondsLeft) return;
    setIsSending(true);
    setError('');
    try {
      const result = await apiRequest<{ message: ConsultationMessage }>(`/api/consultations/${consultation.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setMessages((current) => [...current, result.message]);
      setContent('');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="overflow-hidden rounded-2xl border border-[#eadbc1] bg-white shadow-2xl w-full max-w-2xl h-[75vh] flex flex-col overflow-hidden">
        <header className="p-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#f4c95d] text-[#3f1420] flex items-center justify-center font-bold">{consultation.lawyer.name.replace('Adv. ', '').split(' ').map((part) => part[0]).join('')}</div>
          <div className="flex-1"><div className="flex items-center gap-1.5"><h2 className="font-semibold text-gray-900">{consultation.lawyer.name}</h2><ShieldCheck className="w-4 h-4 text-blue-600" /></div><p className="text-xs text-gray-500">Private legal consultation</p></div>
          <div className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium ${secondsLeft ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}><Clock className="w-4 h-4" />{formatRemaining(secondsLeft)}</div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </header>

        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-800">Do not share passwords, OTPs, payment details, or unnecessary identity documents in chat.</div>
        <main className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fffaf0]">
          <div className="mx-auto max-w-md rounded-lg bg-white border p-3 text-center text-xs text-gray-600">Your 10-minute consultation is about <strong>{consultation.topic}</strong>. Messages are stored with this booking.</div>
          {messages.map((message) => {
            const isOwn = message.sender === role;
            return <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isOwn ? 'bg-[#701f2f] text-white' : 'bg-white border text-gray-800'}`}><p>{message.content}</p><p className={`mt-1 text-[10px] ${isOwn ? 'text-rose-200' : 'text-gray-400'}`}>{message.sender === 'lawyer' ? consultation.lawyer.name : consultation.client?.name || 'Client'} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
            </div>;
          })}
          {!messages.length && <p className="text-center text-sm text-gray-400 pt-8">No messages yet. Send your first question when the lawyer joins.</p>}
        </main>

        {error && <p className="px-4 py-2 text-sm text-red-600 border-t">{error}</p>}
        <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
          <input value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} disabled={!secondsLeft} placeholder={secondsLeft ? 'Type your message...' : 'This consultation has ended'} className="flex-1 px-3 py-2 border rounded-lg disabled:bg-gray-100" />
          <button disabled={!content.trim() || !secondsLeft || isSending} className="flex items-center gap-2 px-4 py-2 bg-[#701f2f] text-white rounded-lg disabled:opacity-50"><Send className="w-4 h-4" />Send</button>
        </form>
      </div>
    </div>
  );
};
