import React, { useState } from 'react';
import { Video } from 'lucide-react';
import { apiRequest } from '../services/api';
import { Consultation } from '../types';

interface JoinCallButtonProps {
  consultation: Pick<Consultation, 'id' | 'meetingUrl' | 'meetingProvider'>;
  className: string;
  onError: (message: string) => void;
}

export const JoinCallButton: React.FC<JoinCallButtonProps> = ({ consultation, className, onError }) => {
  const [isOpening, setIsOpening] = useState(false);
  if (consultation.meetingProvider !== 'jaas') {
    return consultation.meetingUrl ? <a href={consultation.meetingUrl} target="_blank" rel="noreferrer" className={className}><Video className="h-4 w-4" />Join call</a> : null;
  }

  const join = async () => {
    onError('');
    const popup = window.open('', '_blank');
    if (!popup) {
      onError('Please allow pop-ups to join your call.');
      return;
    }
    popup.opener = null;
    setIsOpening(true);
    try {
      const { url } = await apiRequest<{ url: string }>(`/api/consultations/${consultation.id}/meeting`);
      popup.location.replace(url);
    } catch (error) {
      popup.close();
      onError(error instanceof Error ? error.message : 'Unable to join the call. Please try again.');
    } finally {
      setIsOpening(false);
    }
  };

  return <button type="button" onClick={join} disabled={isOpening} className={className}><Video className="h-4 w-4" />{isOpening ? 'Opening call…' : 'Join call'}</button>;
};
