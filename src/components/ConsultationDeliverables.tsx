import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Languages, Send, Sparkles } from 'lucide-react';
import { apiRequest, ApiError } from '../services/api';
import { supportedLanguages } from '../data/languages';
import { Deliverable, Document } from '../types';
import { ExportOptions } from './ExportOptions';

interface ConsultationDeliverablesProps {
  consultationId: string;
  role: 'lawyer' | 'client';
  onOpenDocument?: (document: Document) => void;
}

export const ConsultationDeliverables: React.FC<ConsultationDeliverablesProps> = ({ consultationId, role, onOpenDocument }) => {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [error, setError] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [deliveringId, setDeliveringId] = useState('');
  const [translatingId, setTranslatingId] = useState('');
  const [translationLanguages, setTranslationLanguages] = useState<Record<string, string>>({});
  const [exportTarget, setExportTarget] = useState<Deliverable | null>(null);

  const load = useCallback(() => {
    apiRequest<{ deliverables: Deliverable[] }>(`/api/consultations/${consultationId}/deliverables`)
      .then((result) => setDeliverables(result.deliverables))
      .catch(() => {});
  }, [consultationId]);

  useEffect(() => { load(); }, [load]);

  const createDraft = async () => {
    setIsDrafting(true);
    setError('');
    try {
      const result = await apiRequest<{ document: Document; deliverable: Deliverable }>(`/api/consultations/${consultationId}/draft`, { method: 'POST' });
      load();
      if (result.document) onOpenDocument?.(result.document);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to generate draft.');
    } finally {
      setIsDrafting(false);
    }
  };

  const translate = async (deliverable: Deliverable) => {
    setTranslatingId(deliverable.id);
    setError('');
    try {
      const language = translationLanguages[deliverable.id] || 'en';
      await apiRequest(`/api/consultations/${consultationId}/deliverables/${deliverable.id}/translate`, {
        method: 'POST',
        body: JSON.stringify({ language }),
      });
      load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to translate document.');
    } finally {
      setTranslatingId('');
    }
  };

  const deliver = async (deliverable: Deliverable) => {
    setDeliveringId(deliverable.id);
    setError('');
    try {
      await apiRequest(`/api/consultations/${consultationId}/deliverables/${deliverable.id}/deliver`, { method: 'POST' });
      load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to deliver document.');
    } finally {
      setDeliveringId('');
    }
  };

  if (role === 'client' && !deliverables.length) return null;

  const toDocument = (deliverable: Deliverable): Document => ({
    id: deliverable.id,
    title: deliverable.title,
    content: deliverable.content,
    language: deliverable.document?.language,
    createdAt: new Date(deliverable.createdAt),
    updatedAt: new Date(deliverable.deliveredAt || deliverable.createdAt),
    userId: '',
  });

  return (
    <div className="mt-3 rounded-lg border border-line bg-cream-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FileText className="h-4 w-4 text-ink-faint" />
          {role === 'lawyer' ? 'Documents for client' : 'Documents from your lawyer'}
        </h4>
        {role === 'lawyer' && (
          <button
            type="button"
            onClick={createDraft}
            disabled={isDrafting}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isDrafting ? 'Drafting...' : 'Draft from consultation'}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}

      {deliverables.length > 0 && (
        <ul className="mt-2 space-y-2">
          {deliverables.map((deliverable) => (
            <li key={deliverable.id} className="flex items-center justify-between gap-3 rounded-lg border border-cream-deep bg-cream-raised px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{deliverable.title}</p>
                <p className="text-xs capitalize text-ink-faint">{deliverable.status === 'delivered' ? `Delivered ${deliverable.deliveredAt ? new Date(deliverable.deliveredAt).toLocaleDateString() : ''}` : 'Draft'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role === 'lawyer' && deliverable.document && (
                  <>
                    <select
                      aria-label={`Translation language for ${deliverable.title}`}
                      value={translationLanguages[deliverable.id] || 'en'}
                      onChange={(event) => setTranslationLanguages((current) => ({ ...current, [deliverable.id]: event.target.value }))}
                      disabled={translatingId === deliverable.id}
                      className="rounded-lg border border-line-soft bg-cream-raised px-2 py-1.5 text-xs text-ink disabled:opacity-50"
                    >
                      {supportedLanguages.map((language) => <option key={language.code} value={language.code}>{language.nativeName}</option>)}
                    </select>
                    <button
                      type="button"
                      aria-label={`Translate ${deliverable.title}`}
                      onClick={() => translate(deliverable)}
                      disabled={translatingId === deliverable.id}
                      className="flex items-center gap-1 rounded-lg border border-accent-dark px-3 py-1.5 text-xs font-semibold text-warning-ink hover:bg-warning-bg disabled:opacity-50"
                    >
                      <Languages className="h-3 w-3" />
                      {translatingId === deliverable.id ? 'Translating...' : 'Translate'}
                    </button>
                  </>
                )}
                {role === 'lawyer' && deliverable.status === 'draft' && deliverable.document && onOpenDocument && (
                  <button type="button" onClick={() => onOpenDocument(deliverable.document!)} className="rounded-lg border border-brand px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft">
                    Edit draft
                  </button>
                )}
                {role === 'lawyer' && deliverable.status === 'draft' && (
                  <button type="button" onClick={() => deliver(deliverable)} disabled={deliveringId === deliverable.id} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                    <Send className="h-3 w-3" />
                    {deliveringId === deliverable.id ? 'Delivering...' : 'Deliver'}
                  </button>
                )}
                {role === 'client' && (
                  <button type="button" onClick={() => setExportTarget(deliverable)} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
                    <Download className="h-3 w-3" />
                    Export
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {exportTarget && <ExportOptions document={toDocument(exportTarget)} onClose={() => setExportTarget(null)} />}
    </div>
  );
};
