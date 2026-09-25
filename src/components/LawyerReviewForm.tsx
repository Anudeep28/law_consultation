import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { ApiError, apiRequest } from '../services/api';
import { LawyerReview } from '../types';

export const LawyerReviewForm: React.FC<{ consultationId: string; onSaved: (review: LawyerReview) => void }> = ({ consultationId, onSaved }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) return;
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest<{ review: LawyerReview }>(`/api/consultations/${consultationId}/review`, { method: 'POST', body: JSON.stringify({ rating, comment: comment.trim() }) });
      onSaved(result.review);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to save your review.');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={submit} className="mt-4 rounded-xl border border-[#eadbc1] bg-[#fffaf0] p-4">
    <p className="text-sm font-semibold text-[#32151b]">Rate this consultation</p>
    <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)}><Star className={`h-6 w-6 ${value <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} /></button>)}</div>
    <label className="mt-3 block text-sm font-medium">Review<textarea aria-label="Review" maxLength={2000} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} className="mt-1 w-full rounded-lg border border-[#e6d8c2] p-2" /></label>
    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    <button disabled={!rating || saving} className="mt-3 rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Submit review'}</button>
  </form>;
};
