import React, { useState } from 'react';
import { BadgeCheck, Clock, UserCircle } from 'lucide-react';
import { ApiError, apiRequest } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { Lawyer, User } from '../types';
import { LawyerProfileErrors, LawyerProfileInput, validateLawyerProfile } from './lawyerProfileValidation';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export const LawyerProfileView: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const profile = user?.lawyerProfile;
  const [form, setForm] = useState<LawyerProfileInput>({
    name: profile?.name || user?.name || '', title: profile?.title || 'Advocate', bio: profile?.bio === 'Lawyer profile pending verification.' ? '' : profile?.bio || '',
    practiceAreas: profile?.practiceAreas || [], languages: profile?.languages || [], experienceYears: profile?.experienceYears || 0,
    barCouncil: profile?.barCouncil || '', enrollmentNumber: profile?.enrollmentNumber || '', fee: profile?.fee || 0,
    avatarUrl: profile?.avatarUrl || '', availability: profile?.availability || { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  });
  const [errors, setErrors] = useState<LawyerProfileErrors>({});
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const setField = <K extends keyof LawyerProfileInput>(key: K, value: LawyerProfileInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLawyerProfile(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setIsSaving(true);
    setMessage('');
    try {
      const result = await apiRequest<{ lawyer: Lawyer; user: User }>('/api/lawyer/profile', { method: 'PUT', body: JSON.stringify(form) });
      setUser(result.user);
      setMessage(result.lawyer.approvalStatus === 'approved' ? 'Profile updated and remains live.' : 'Profile submitted for administrator approval.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Unable to save your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const status = profile?.approvalStatus || 'draft';
  const inputClass = 'mt-1 w-full rounded-lg border border-[#e6d8c2] bg-white px-3 py-2 text-sm focus:border-[#b8862d] focus:outline-none focus:ring-2 focus:ring-[#f4c95d]/30';
  return <div className="h-full overflow-y-auto p-6"><form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
    <div className="rounded-2xl border border-[#eadbc1] bg-white p-6 shadow-sm"><div className="flex items-start gap-4"><UserCircle className="h-12 w-12 text-[#701f2f]" /><div><h1 className="text-2xl font-bold text-[#32151b]">Professional profile</h1><p className="mt-1 text-sm text-[#6f5a49]">This information appears to clients after administrator approval.</p><span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-3 py-1 text-xs font-semibold uppercase text-[#765116]"><BadgeCheck className="h-4 w-4" />{status}</span>{profile?.rejectionReason && <p className="mt-3 text-sm text-red-700">Review note: {profile.rejectionReason}</p>}</div></div></div>
    <section className="grid gap-5 rounded-2xl border border-[#eadbc1] bg-white p-6 shadow-sm md:grid-cols-2">
      <label className="text-sm font-medium">Professional name<input className={inputClass} value={form.name} onChange={(e) => setField('name', e.target.value)} />{errors.name && <small className="text-red-600">{errors.name}</small>}</label>
      <label className="text-sm font-medium">Professional title<input className={inputClass} value={form.title} onChange={(e) => setField('title', e.target.value)} />{errors.title && <small className="text-red-600">{errors.title}</small>}</label>
      <label className="text-sm font-medium md:col-span-2">Professional biography<textarea className={inputClass} rows={5} maxLength={2000} value={form.bio} onChange={(e) => setField('bio', e.target.value)} />{errors.bio && <small className="text-red-600">{errors.bio}</small>}</label>
      <label className="text-sm font-medium">Practice areas (comma separated)<input className={inputClass} value={form.practiceAreas.join(', ')} onChange={(e) => setField('practiceAreas', splitList(e.target.value))} />{errors.practiceAreas && <small className="text-red-600">{errors.practiceAreas}</small>}</label>
      <label className="text-sm font-medium">Languages (comma separated)<input className={inputClass} value={form.languages.join(', ')} onChange={(e) => setField('languages', splitList(e.target.value))} />{errors.languages && <small className="text-red-600">{errors.languages}</small>}</label>
      <label className="text-sm font-medium">Years of experience<input type="number" min="0" max="80" className={inputClass} value={form.experienceYears} onChange={(e) => setField('experienceYears', Number(e.target.value))} />{errors.experienceYears && <small className="text-red-600">{errors.experienceYears}</small>}</label>
      <label className="text-sm font-medium">10-minute consultation fee (₹)<input type="number" min="1" className={inputClass} value={form.fee / 100} onChange={(e) => setField('fee', Math.round(Number(e.target.value) * 100))} />{errors.fee && <small className="text-red-600">{errors.fee}</small>}</label>
      <label className="text-sm font-medium">Bar Council<input className={inputClass} value={form.barCouncil} onChange={(e) => setField('barCouncil', e.target.value)} />{errors.barCouncil && <small className="text-red-600">{errors.barCouncil}</small>}</label>
      <label className="text-sm font-medium">Enrollment number<input className={inputClass} value={form.enrollmentNumber} onChange={(e) => setField('enrollmentNumber', e.target.value)} />{errors.enrollmentNumber && <small className="text-red-600">{errors.enrollmentNumber}</small>}</label>
      <label className="text-sm font-medium md:col-span-2">Profile photo URL<input type="url" placeholder="https://..." className={inputClass} value={form.avatarUrl} onChange={(e) => setField('avatarUrl', e.target.value)} />{errors.avatarUrl && <small className="text-red-600">{errors.avatarUrl}</small>}</label>
    </section>
    <section className="rounded-2xl border border-[#eadbc1] bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-[#32151b]"><Clock className="h-5 w-5" />Weekly availability</h2><div className="mt-4 flex flex-wrap gap-2">{weekdays.map((day, index) => <button type="button" key={day} onClick={() => setField('availability', { ...form.availability, days: form.availability.days.includes(index) ? form.availability.days.filter((value) => value !== index) : [...form.availability.days, index] })} className={`rounded-full px-4 py-2 text-sm font-semibold ${form.availability.days.includes(index) ? 'bg-[#701f2f] text-white' : 'bg-[#f8f1e5] text-[#6f5a49]'}`}>{day}</button>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Start time<input type="time" className={inputClass} value={form.availability.start} onChange={(e) => setField('availability', { ...form.availability, start: e.target.value })} /></label><label className="text-sm font-medium">End time<input type="time" className={inputClass} value={form.availability.end} onChange={(e) => setField('availability', { ...form.availability, end: e.target.value })} /></label></div>{errors.availability && <small className="text-red-600">{errors.availability}</small>}</section>
    {message && <p className={`rounded-lg px-4 py-3 text-sm ${message.includes('Unable') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message}</p>}
    <div className="flex justify-end"><button disabled={isSaving} className="rounded-lg bg-[#701f2f] px-6 py-3 font-semibold text-white disabled:opacity-50">{isSaving ? 'Saving...' : status === 'approved' ? 'Save changes' : 'Submit for approval'}</button></div>
  </form></div>;
};
