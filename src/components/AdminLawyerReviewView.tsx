import React, { useEffect, useState } from 'react';
import { BadgeCheck, Languages, XCircle } from 'lucide-react';
import { ApiError, apiRequest } from '../services/api';
import { Lawyer } from '../types';

export const AdminLawyerReviewView: React.FC = () => {
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = () =>
    apiRequest<{ lawyers: Lawyer[] }>('/api/admin/lawyers')
      .then((result) => setLawyers(result.lawyers))
      .catch(() => setError('Unable to load lawyer applications.'))
      .finally(() => setIsLoading(false));

  useEffect(() => { void load(); }, []);

  const review = async (lawyer: Lawyer, decision: 'approved' | 'rejected') => {
    setError('');
    try {
      const result = await apiRequest<{ lawyer: Lawyer }>(
        `/api/admin/lawyers/${lawyer.id}/review`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            decision,
            rejectionReason: reasons[lawyer.id] || '',
          }),
        },
      );
      setLawyers((current) =>
        current.map((item) => (item.id === lawyer.id ? result.lawyer : item)),
      );
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to review this application.',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading applications...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#32151b]">Lawyer applications</h1>
          <p className="text-sm text-[#6f5a49]">
            Review professional details and credentials before making profiles public.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <div className="space-y-4">
          {lawyers.map((lawyer) => (
            <article
              key={lawyer.id}
              className="rounded-2xl border border-[#eadbc1] bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-[#32151b]">{lawyer.name}</h2>
                    <span className="rounded-full bg-[#fff4d6] px-2 py-1 text-xs font-semibold uppercase text-[#765116]">
                      {lawyer.approvalStatus}
                    </span>
                  </div>
                  <p className="font-semibold text-[#8a2637]">{lawyer.title}</p>
                </div>
                <p className="text-sm font-semibold">
                  ₹{(lawyer.fee / 100).toLocaleString('en-IN')} / 10 min
                </p>
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-700">{lawyer.bio}</p>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                <p><strong>Experience:</strong> {lawyer.experienceYears} years</p>
                <p className="flex items-center gap-1">
                  <Languages className="h-4 w-4" />
                  <strong>Languages:</strong> {lawyer.languages.join(', ') || 'Not supplied'}
                </p>
                <p>
                  <strong>Practice areas:</strong>{' '}
                  {lawyer.practiceAreas.join(', ') || 'Not supplied'}
                </p>
                <p>
                  <strong>Credentials:</strong> {lawyer.barCouncil} · {lawyer.enrollmentNumber}
                </p>
              </div>

              {lawyer.avatarUrl && (
                <a
                  className="mt-3 inline-block text-sm text-[#701f2f] underline"
                  href={lawyer.avatarUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View profile photo
                </a>
              )}

              <div className="mt-5 border-t border-[#f0e4d2] pt-4">
                {lawyer.approvalStatus === 'pending' ? (
                  <>
                    <textarea
                      value={reasons[lawyer.id] || ''}
                      onChange={(e) =>
                        setReasons((current) => ({
                          ...current,
                          [lawyer.id]: e.target.value,
                        }))
                      }
                      placeholder="Reason required when rejecting (at least 10 characters)"
                      className="w-full rounded-lg border border-[#e6d8c2] px-3 py-2 text-sm"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => review(lawyer, 'rejected')}
                        className="flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => review(lawyer, 'approved')}
                        className="flex items-center gap-2 rounded-lg bg-[#701f2f] px-4 py-2 text-sm font-semibold text-white"
                      >
                        <BadgeCheck className="h-4 w-4" />
                        Approve
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-600">
                    {lawyer.approvalStatus === 'draft'
                      ? 'Profile is incomplete. The lawyer must complete and save their profile before it can be reviewed.'
                      : `This application has already been ${lawyer.approvalStatus}.`}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};
