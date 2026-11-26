import { AnimatedArticle, PrimaryButton } from './ui/MotionPrimitives';
import React, { useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from '../services/api';
import { Modal } from './ui/Modal';
import { notify } from './ui/Toasts';

interface Payment {
  id: string; amount: number; currency: string; status: string; plan: string;
  refundStatus: string | null; refundError: string | null; refundId: string | null;
  razorpayPaymentId?: string | null; razorpayOrderId?: string; refundAttemptId?: string | null; refundRequestedAt?: string | null;
  user: { name: string; email: string };
  consultation: { id: string; status: string; startsAt: string; lawyer: { name: string } } | null;
}
const amount = (payment: Payment) => `${payment.currency} ${(payment.amount / 100).toFixed(2)}`;

export const AdminPaymentsView: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Payment | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [validation, setValidation] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [resolving, setResolving] = useState<Payment | null>(null);
  const [outcome, setOutcome] = useState('');
  const requestId = useRef(0);

  const load = async (search: string, onlyReview = reviewOnly) => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const result = await apiRequest<{ payments: Payment[]; reviewCount?: number }>(`/api/admin/payments${onlyReview ? '/review' : ''}?q=${encodeURIComponent(search.trim())}`);
      if (id !== requestId.current) return;
      setPayments(result.payments);
      setReviewCount(result.reviewCount ?? result.payments.filter(payment => payment.refundStatus === 'REVIEW').length);
    } catch { if (id === requestId.current) setError('Unable to load payments. Please refresh.'); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  useEffect(() => { void load(''); }, []);

  const reviewAction = async (payment: Payment, resolution?: { outcome: string; note: string }) => {
    if (busy) return;
    setBusy(true); setValidation('');
    try {
      const result = await apiRequest<{ message: string }>(`/api/admin/payments/${payment.id}/${resolution ? 'resolve' : 'reconcile'}`, { method: 'POST', ...(resolution ? { body: JSON.stringify(resolution) } : {}) });
      notify(result.message, 'success'); setResolving(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to resolve payment review. Please refresh and retry.';
      setValidation(message); notify(message, 'error');
    } finally { setBusy(false); await load(query); }
  };

  const refund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    if (!reason || note.trim().length < 10 || note.trim().length > 500) {
      setValidation('Choose a reason and enter a note of 10–500 characters.'); return;
    }
    setBusy(true); setValidation('');
    try {
      const result = await apiRequest<{ payment: Pick<Payment, 'refundStatus'> }>(`/api/admin/consultations/${selected.consultation!.id}/refund`, { method: 'POST', body: JSON.stringify({ reason, note: note.trim() }) });
      notify(result.payment.refundStatus === 'PROCESSED' ? 'Full refund processed.' : 'Full refund pending processing.', 'success');
      setSelected(null);
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : 'Unable to request refund. Check the payment status before retrying.';
      setValidation(message); notify(message, 'error');
    } finally { setBusy(false); await load(query); }
  };

  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl">
    <h1 className="text-2xl font-bold text-ink">Payments &amp; Refunds</h1>
    <p className="text-sm text-ink-muted">Full consultation refunds only. Showing up to 100 most recently updated payments; search to narrow results.</p>
    <div className="mt-4 flex gap-2" role="group" aria-label="Payment filter">
      <button type="button" aria-pressed={!reviewOnly} disabled={busy} onClick={() => { setReviewOnly(false); void load(query, false); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${!reviewOnly ? 'bg-brand text-white' : 'bg-cream-muted text-ink'}`}>All payments</button>
      <button type="button" aria-pressed={reviewOnly} disabled={busy} onClick={() => { setReviewOnly(true); void load(query, true); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${reviewOnly ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>Needs review <span className="ml-1 rounded-full bg-white/20 px-2" aria-label={`${reviewCount} payments need review`}>{reviewCount}</span></button>
    </div>
    <form onSubmit={event => { event.preventDefault(); void load(query); }} className="mt-5 flex flex-wrap gap-2">
      <input aria-label="Search payments" placeholder="Client email, lawyer or consultation ID" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2" />
      <PrimaryButton className="rounded-lg bg-brand px-4 py-2 text-white" disabled={loading}>Search</PrimaryButton>
      <button type="button" onClick={() => void load(query)} disabled={loading} className="rounded-lg border border-line px-4 py-2 text-ink">Refresh</button>
    </form>
    {error && <p role="alert" className="mt-4 rounded-lg bg-brand-soft p-3 text-brand">{error}</p>}
    {loading ? <p role="status" className="mt-4 text-ink-muted">Loading payments…</p> : !error && payments.length === 0 ? <p className="mt-4 text-ink-muted">No payments found.</p> : <div className="mt-5 space-y-3">{payments.map((payment, index) => <AnimatedArticle index={index} key={payment.id} className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 break-words"><h2 className="font-bold text-ink">{payment.user.email}</h2><p className="text-sm text-ink-muted">{payment.consultation?.lawyer.name || payment.plan} · {amount(payment)}</p><p className="text-xs text-ink-faint">Payment: {payment.id}</p>{payment.consultation && <p className="text-xs text-ink-faint">Consultation: {payment.consultation.id} · {payment.consultation.status}</p>}</div><span className="h-fit rounded-full bg-cream-muted px-3 py-1 text-sm font-semibold text-ink">{payment.refundStatus || payment.status}</span></div>
      {payment.refundStatus === 'REVIEW' && <p className="mt-2 font-semibold text-brand">Needs review — reconcile with Razorpay before retrying.</p>}
      {payment.refundError && <p className="mt-2 text-sm text-brand">{payment.refundError}</p>}
      {payment.refundId && <p className="mt-2 break-all text-xs text-ink-muted">Refund: {payment.refundId}</p>}
      {payment.refundStatus === 'REVIEW' && <div className="mt-3 space-y-2">
        <p className="break-all text-xs text-ink-muted">Provider order: {payment.razorpayOrderId || 'Unavailable'} · Payment: {payment.razorpayPaymentId || 'Unavailable'}</p>
        <p className="break-all text-xs text-ink-muted">Attempt: {payment.refundAttemptId || 'Untracked'} · Last refund attempt: {payment.refundRequestedAt ? new Date(payment.refundRequestedAt).toLocaleString() : 'Not recorded'}</p>
        <div className="flex flex-wrap gap-2"><PrimaryButton disabled={busy} onClick={() => void reviewAction(payment)} aria-label={`Check with Razorpay for payment ${payment.id}`} className="rounded-lg bg-brand px-4 py-2 text-sm text-white">Check with Razorpay</PrimaryButton><button type="button" disabled={busy} aria-label={`Mark payment ${payment.id} resolved`} onClick={() => { setResolving(payment); setOutcome(''); setNote(''); setValidation(''); }} className="rounded-lg border border-line px-4 py-2 text-sm text-ink">Mark resolved</button></div>
      </div>}
      {payment.consultation && payment.status === 'PAID' && (!payment.refundStatus || ['FAILED', 'REQUIRED'].includes(payment.refundStatus)) && <PrimaryButton onClick={() => { setSelected(payment); setReason(''); setNote(''); setValidation(''); }} aria-label={`Refund consultation ${payment.consultation.id}`} className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">{payment.refundStatus === 'FAILED' ? 'Retry refund' : 'Refund'}</PrimaryButton>}
    </AnimatedArticle>)}</div>}
    <Modal open={selected !== null} onClose={() => { if (!busy) setSelected(null); }} title="Confirm full refund" panelClassName="overflow-y-auto">
      {selected && <form onSubmit={refund} noValidate className="space-y-4 p-6">
        <p className="font-semibold text-ink">Full amount: {amount(selected)}</p><p className="text-sm text-brand">This cannot be undone. Upcoming consultations will be cancelled; past records will be retained.</p>
        <label className="block text-sm font-medium text-ink">Refund reason<select aria-label="Refund reason" value={reason} onChange={event => setReason(event.target.value)} disabled={busy} required className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Choose a reason</option><option value="LAWYER_NO_SHOW">Lawyer no-show</option><option value="TECHNICAL_FAILURE">Technical failure</option><option value="OTHER">Other</option></select></label>
        <label className="block text-sm font-medium text-ink">Administrative note (10–500 characters)<textarea aria-label="Administrative note" value={note} onChange={event => setNote(event.target.value)} required minLength={10} maxLength={500} disabled={busy} rows={4} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        {validation && <p role="alert" className="text-sm text-brand">{validation}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setSelected(null)} className="rounded-lg border border-line px-4 py-2 text-ink">Cancel</button><PrimaryButton type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Requesting refund…' : 'Confirm refund'}</PrimaryButton></div>
      </form>}
    </Modal>
    <Modal open={resolving !== null} onClose={() => { if (!busy) setResolving(null); }} title="Resolve payment review" panelClassName="overflow-y-auto">
      {resolving && <form noValidate className="space-y-4 p-6" onSubmit={event => {
        event.preventDefault();
        if (!outcome || note.trim().length < 10 || note.trim().length > 500) { setValidation('Choose an outcome and enter a note of 10–500 characters.'); return; }
        void reviewAction(resolving, { outcome, note: note.trim() });
      }}>
        <p className="font-semibold text-ink">Full amount: {amount(resolving)}</p><p className="text-sm text-brand">This cannot be undone. This records an external resolution; it does not send money or change access entitlements. Verify the provider records first.</p>
        <label className="block text-sm font-medium text-ink">Resolution outcome<select aria-label="Resolution outcome" required disabled={busy} value={outcome} onChange={event => setOutcome(event.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Choose an outcome</option><option value="REFUNDED">Refunded outside the app</option><option value="NO_REFUND_NEEDED">No refund needed</option></select></label>
        <label className="block text-sm font-medium text-ink">Resolution note (10–500 characters)<textarea aria-label="Resolution note" required minLength={10} maxLength={500} disabled={busy} value={note} onChange={event => setNote(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
        {validation && <p role="alert" className="text-sm text-brand">{validation}</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setResolving(null)} className="rounded-lg border border-line px-4 py-2">Cancel</button><PrimaryButton type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-white">{busy ? 'Resolving…' : 'Confirm resolution'}</PrimaryButton></div>
      </form>}
    </Modal>
  </div></div>;
};
