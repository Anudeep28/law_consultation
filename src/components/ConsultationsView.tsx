import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Calendar, Clock, Languages, MessageCircle, Phone, Search, ShieldCheck, Star, Video, X } from 'lucide-react';
import { apiRequest, ApiError } from '../services/api';
import { Consultation, Lawyer } from '../types';
import { ConsultationChat } from './ConsultationChat';

const formatFee = (fee: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(fee / 100);
const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export const ConsultationsView: React.FC = () => {
  const [tab, setTab] = useState<'lawyers' | 'bookings'>('lawyers');
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selectedLawyer, setSelectedLawyer] = useState<Lawyer | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [mode, setMode] = useState<'chat' | 'call'>('chat');
  const [activeChat, setActiveChat] = useState<Consultation | null>(null);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [practiceArea, setPracticeArea] = useState('All practice areas');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadConsultations = async () => {
    const result = await apiRequest<{ consultations: Consultation[] }>('/api/consultations');
    setConsultations(result.consultations);
  };

  useEffect(() => {
    Promise.all([
      apiRequest<{ lawyers: Lawyer[] }>('/api/lawyers'),
      apiRequest<{ consultations: Consultation[] }>('/api/consultations'),
    ]).then(([lawyerResult, consultationResult]) => {
      setLawyers(lawyerResult.lawyers);
      setConsultations(consultationResult.consultations);
    }).catch(() => setError('Unable to load consultations right now.')).finally(() => setIsLoading(false));
  }, []);

  const practiceAreas = useMemo(() => ['All practice areas', ...Array.from(new Set(lawyers.flatMap((lawyer) => lawyer.practiceAreas))).sort()], [lawyers]);
  const filteredLawyers = lawyers.filter((lawyer) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [lawyer.name, lawyer.title, ...lawyer.practiceAreas, ...lawyer.languages].some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (practiceArea === 'All practice areas' || lawyer.practiceAreas.includes(practiceArea));
  });

  const openBooking = async (lawyer: Lawyer, consultationMode: 'chat' | 'call') => {
    setSelectedLawyer(lawyer);
    setMode(consultationMode);
    setSelectedSlot('');
    setTopic('');
    setNotes('');
    setSlots([]);
    setError('');
    try {
      const result = await apiRequest<{ slots: string[] }>(`/api/lawyers/${lawyer.id}/slots`);
      setSlots(result.slots);
    } catch {
      setError('Unable to load this lawyer’s availability.');
    }
  };

  const bookConsultation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedLawyer || !selectedSlot) return;
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({ lawyerId: selectedLawyer.id, startsAt: selectedSlot, topic, notes, mode }),
      });
      await loadConsultations();
      setSelectedLawyer(null);
      setTab('bookings');
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to book consultation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelConsultation = async (id: string) => {
    setError('');
    try {
      await apiRequest(`/api/consultations/${id}/cancel`, { method: 'PATCH' });
      await loadConsultations();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to cancel consultation.');
    }
  };

  if (isLoading) return <div className="h-full flex items-center justify-center text-gray-500">Loading consultations...</div>;

  return (
    <div className="h-full overflow-y-auto bg-[#fffaf0]">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#3f1420] via-[#701f2f] to-[#9b2c37] px-6 py-10 text-white">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#f4c95d] opacity-20" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full border-[30px] border-white opacity-5" />
        <div className="relative mx-auto max-w-6xl">
          <span className="inline-flex items-center rounded-full border border-[#f4c95d]/50 bg-white/10 px-3 py-1 text-xs font-semibold text-[#ffe7a3]">VERIFIED LEGAL PROFESSIONALS</span>
          <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-tight md:text-4xl">Clear legal guidance, when you need it</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-rose-100 md:text-base">Choose a lawyer by expertise and language, then book a private 10-minute chat or call.</p>
          <div className="mt-6 flex flex-wrap gap-5 text-xs text-rose-100"><span><strong className="block text-lg text-white">{lawyers.length}</strong>Verified lawyers</span><span><strong className="block text-lg text-white">10 min</strong>Focused sessions</span><span><strong className="block text-lg text-white">Private</strong>Confidential intake</span></div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="mb-6 flex w-fit gap-1 rounded-full border border-[#eadbc1] bg-white p-1 shadow-sm">
          <button onClick={() => setTab('lawyers')} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === 'lawyers' ? 'bg-[#701f2f] text-white shadow' : 'text-gray-600 hover:bg-[#fff6e3]'}`}>Consult lawyers</button>
          <button onClick={() => setTab('bookings')} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === 'bookings' ? 'bg-[#701f2f] text-white shadow' : 'text-gray-600 hover:bg-[#fff6e3]'}`}>My consultations ({consultations.length})</button>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}

        {tab === 'lawyers' ? (
          <>
            <div className="mb-6 rounded-2xl border border-[#eadbc1] bg-white p-4 shadow-sm">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-4 w-4 text-[#8c6b54]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by lawyer, legal issue, or language" className="w-full rounded-xl border border-[#e6d8c2] bg-[#fffcf6] py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30" />
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {practiceAreas.map((area) => <button key={area} onClick={() => setPracticeArea(area)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${practiceArea === area ? 'bg-[#f4c95d] text-[#3f1420]' : 'bg-[#f8f1e5] text-[#6f5a49] hover:bg-[#f2e4cc]'}`}>{area}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredLawyers.map((lawyer) => (
                <article key={lawyer.id} className="group overflow-hidden rounded-2xl border border-[#eadbc1] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[#fff1c7] bg-gradient-to-br from-[#f4c95d] to-[#d69f37] text-lg font-bold text-[#3f1420] shadow-sm">{lawyer.name.replace('Adv. ', '').split(' ').map((part) => part[0]).join('')}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5"><h3 className="font-bold text-[#32151b]">{lawyer.name}</h3>{lawyer.isVerified && <BadgeCheck className="h-4 w-4 text-[#b8862d]" />}</div>
                      <p className="text-sm font-semibold text-[#8a2637]">{lawyer.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-600"><span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />{lawyer.rating} ({lawyer.reviewCount})</span><span>{lawyer.experienceYears} years experience</span></div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-4 leading-6">{lawyer.bio}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{lawyer.practiceAreas.map((area) => <span key={area} className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-xs font-medium text-[#765116]">{area}</span>)}</div>
                  <div className="mt-4 border-t border-[#f0e4d2] pt-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="flex items-center gap-1 text-xs text-gray-500"><Languages className="w-3.5 h-3.5" />{lawyer.languages.join(', ')}</p>
                      <p className="font-semibold text-gray-900">{formatFee(lawyer.fee / 10)}<span className="font-normal text-xs text-gray-500">/min</span></p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => openBooking(lawyer, 'chat')} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#701f2f] px-3 py-2.5 text-sm font-bold text-[#701f2f] transition hover:bg-[#fff1f3]"><MessageCircle className="h-4 w-4" />Chat</button>
                      <button onClick={() => openBooking(lawyer, 'call')} className="flex items-center justify-center gap-2 rounded-xl bg-[#701f2f] px-3 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#541522]"><Phone className="h-4 w-4" />Call</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!filteredLawyers.length && <div className="text-center py-16 text-gray-500">No lawyers match these filters.</div>}
          </>
        ) : (
          <div className="space-y-4">
            {!consultations.length && <div className="bg-white border rounded-xl p-10 text-center"><Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" /><h3 className="font-semibold text-gray-900">No consultations yet</h3><p className="text-sm text-gray-500 mt-1">Book a 10-minute session with a verified lawyer.</p></div>}
            {consultations.map((consultation) => {
              const now = Date.now();
              const upcoming = consultation.status === 'booked' && new Date(consultation.startsAt).getTime() > now;
              const canOpenChat = consultation.mode === 'chat' && consultation.status === 'booked' && new Date(consultation.startsAt).getTime() - 10 * 60 * 1000 <= now && new Date(consultation.endsAt).getTime() > now;
              return <article key={consultation.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#f4c95d] text-[#3f1420] flex items-center justify-center font-bold">{consultation.lawyer.name.replace('Adv. ', '').split(' ').map((part) => part[0]).join('')}</div>
                <div className="flex-1"><div className="flex items-center gap-2"><h3 className="font-semibold text-gray-900">{consultation.lawyer.name}</h3><span className={`text-xs px-2 py-0.5 rounded-full ${consultation.status === 'booked' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{consultation.status}</span><span className="text-xs capitalize text-gray-500 flex items-center gap-1">{consultation.mode === 'chat' ? <MessageCircle className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}{consultation.mode}</span></div><p className="text-sm text-gray-700 mt-1">{consultation.topic}</p><p className="flex items-center gap-1 text-sm text-gray-500 mt-2"><Clock className="w-4 h-4" />{formatDateTime(consultation.startsAt)} · 10 minutes</p></div>
                <div className="flex gap-2">{canOpenChat && <button onClick={() => setActiveChat(consultation)} className="flex items-center gap-1.5 px-3 py-2 bg-[#701f2f] text-white text-sm rounded-lg"><MessageCircle className="w-4 h-4" />Open chat</button>}{upcoming && consultation.mode === 'call' && consultation.meetingUrl && <a href={consultation.meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-[#701f2f] text-white text-sm rounded-lg"><Video className="w-4 h-4" />Join call</a>}{upcoming && <button onClick={() => cancelConsultation(consultation.id)} className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">Cancel</button>}</div>
              </article>;
            })}
          </div>
        )}
      </div>

      {selectedLawyer && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <form onSubmit={bookConsultation} className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between"><div><h2 className="font-bold text-lg text-gray-900">Book a {mode} with {selectedLawyer.name}</h2><p className="text-sm text-gray-500">{formatFee(selectedLawyer.fee / 10)}/min · 10 minutes · {formatFee(selectedLawyer.fee)} total</p></div><button type="button" onClick={() => setSelectedLawyer(null)}><X className="w-5 h-5 text-gray-500" /></button></div>
            <div className="p-5 space-y-5">
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Select a time</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">{slots.map((slot) => <button key={slot} type="button" onClick={() => setSelectedSlot(slot)} className={`p-2 rounded-lg border text-xs ${selectedSlot === slot ? 'border-[#701f2f] bg-[#fff1f3] text-[#701f2f]' : 'border-[#eadbc1] hover:border-[#b8862d]'}`}>{formatDateTime(slot)}</button>)}</div>{!slots.length && <p className="text-sm text-gray-500">No slots available in the next 14 days.</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">What do you need help with?</label><input required maxLength={100} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Review a rental dispute" className="w-full px-3 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Brief matter summary</label><textarea required minLength={10} maxLength={1000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Share the key facts and your questions. Avoid unnecessary sensitive information." className="w-full px-3 py-2 border rounded-lg" /><p className="text-xs text-gray-500 mt-1">Booking does not create a lawyer-client relationship. The lawyer may need to complete a conflict check.</p></div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center text-xs text-gray-600"><span className="flex items-center justify-center gap-1"><ShieldCheck className="w-4 h-4 text-green-600" />Private</span><span className="flex items-center justify-center gap-1"><BadgeCheck className="w-4 h-4 text-blue-600" />Verified</span><span className="flex items-center justify-center gap-1"><Clock className="w-4 h-4 text-[#b8862d]" />10 minutes</span></div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="p-5 border-t flex justify-end gap-3"><button type="button" onClick={() => setSelectedLawyer(null)} className="px-4 py-2 border rounded-lg text-sm">Close</button><button disabled={!selectedSlot || notes.length < 10 || isSubmitting} className="px-4 py-2 bg-[#701f2f] text-white rounded-lg text-sm disabled:opacity-50">{isSubmitting ? 'Booking...' : 'Confirm booking'}</button></div>
          </form>
        </div>
      )}

      {activeChat && <ConsultationChat consultation={activeChat} onClose={() => setActiveChat(null)} />}
    </div>
  );
};
