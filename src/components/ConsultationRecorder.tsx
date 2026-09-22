import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { ElevenLabsService } from '../services/elevenLabsService';
import { apiRequest, ApiError } from '../services/api';
import { supportedLanguages } from '../data/languages';

interface ConsultationRecorderProps {
  consultationId: string;
  onSaved?: (transcript: string) => void;
}

export const ConsultationRecorder: React.FC<ConsultationRecorderProps> = ({ consultationId, onSaved }) => {
  const [language, setLanguage] = useState('en');
  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [buffer, setBuffer] = useState('');
  const [error, setError] = useState('');
  const serviceRef = useRef<ElevenLabsService | null>(null);

  useEffect(() => {
    const service = new ElevenLabsService();
    serviceRef.current = service;
    service.onTranscription((result) => {
      if (result.is_final && result.text.trim()) {
        apiRequest<{ transcript: string }>(`/api/consultations/${consultationId}/transcript`, {
          method: 'POST',
          body: JSON.stringify({ text: result.text.trim() }),
        })
          .then((response) => onSaved?.(response.transcript))
          .catch((requestError) => setError(requestError instanceof ApiError ? requestError.message : 'Unable to save transcript.'));
        setBuffer('');
      } else if (result.text.trim()) {
        setBuffer(result.text);
      }
    });
    service.onError((message) => {
      setError(message);
      setIsRecording(false);
      setIsStopping(false);
    });
    return () => service.disconnect();
  }, [consultationId, onSaved]);

  const toggleRecording = async () => {
    const service = serviceRef.current;
    if (!service) return;
    setError('');
    if (!isRecording) {
      await service.connect('', language);
      const started = await service.startRecording();
      setIsRecording(started);
    } else {
      setIsStopping(true);
      await service.stopRecordingAndTranscribe();
      setIsRecording(false);
      setIsStopping(false);
      setBuffer('');
    }
  };

  return (
    <div className="rounded-lg border border-[#eadbc1] bg-[#fffcf6] p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isStopping}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${isRecording ? 'bg-[#3f1420]' : 'bg-[#701f2f] hover:bg-[#541522]'}`}
        >
          {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isRecording ? (isStopping ? 'Stopping...' : 'Stop recording') : 'Record consultation'}
        </button>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          disabled={isRecording}
          className="rounded-lg border border-[#e6d8c2] bg-white px-2 py-1.5 text-sm text-[#32151b] disabled:opacity-50"
        >
          {supportedLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
          ))}
        </select>
        {isRecording && (
          <span className="flex items-center text-xs text-red-600">
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording...
          </span>
        )}
      </div>
      {buffer && <p className="mt-2 text-xs italic text-[#765116]">{buffer}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
};
