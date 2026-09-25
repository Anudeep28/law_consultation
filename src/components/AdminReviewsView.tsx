import React, { useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../services/api';

interface ModeratedReview { id: string; rating: number; comment: string; isVisible: boolean; moderationReason: string; createdAt: string; clientName: string; lawyerName: string }

export const AdminReviewsView: React.FC = () => {
  const [reviews, setReviews] = useState<ModeratedReview[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { apiRequest<{ reviews: ModeratedReview[] }>('/api/admin/reviews').then((result) => setReviews(result.reviews)).catch(() => setError('Unable to load reviews.')).finally(() => setLoading(false)); }, []);
  const moderate = async (review: ModeratedReview, isVisible: boolean) => {
    const reason = reasons[review.id]?.trim() || '';
    if (!isVisible && reason.length < 10) { setError('Provide a moderation reason of at least 10 characters.'); return; }
    setError('');
    try {
      await apiRequest(`/api/admin/reviews/${review.id}/moderation`, { method: 'PATCH', body: JSON.stringify({ isVisible, reason }) });
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, isVisible, moderationReason: isVisible ? '' : reason } : item));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to moderate this review.');
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center text-gray-500">Loading reviews...</div>;
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-5xl"><h1 className="text-2xl font-bold text-[#32151b]">Review moderation</h1><p className="text-sm text-[#6f5a49]">Hide reviews that violate platform rules and restore them when appropriate.</p>{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-5 space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-[#eadbc1] bg-white p-4"><div className="flex justify-between gap-3"><div><h2 className="font-semibold text-[#32151b]">{review.clientName} reviewed {review.lawyerName}</h2><p className="text-sm font-semibold text-[#b8862d]">{review.rating}/5</p></div><span className="text-xs font-semibold uppercase text-gray-500">{review.isVisible ? 'Visible' : 'Hidden'}</span></div>{review.comment && <p className="mt-3 text-sm text-gray-700">{review.comment}</p>}{review.moderationReason && <p className="mt-2 text-sm text-red-700">Reason: {review.moderationReason}</p>}<label className="mt-3 block text-sm font-medium">Moderation reason<input value={reasons[review.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} maxLength={500} className="mt-1 w-full rounded-lg border border-[#e6d8c2] px-3 py-2" /></label><div className="mt-3 flex gap-2">{review.isVisible ? <button onClick={() => moderate(review, false)} className="rounded-lg border border-red-400 px-3 py-2 text-sm text-red-700">Hide review</button> : <button onClick={() => moderate(review, true)} className="rounded-lg bg-[#701f2f] px-3 py-2 text-sm text-white">Restore review</button>}</div></article>)}</div></div></div>;
};
