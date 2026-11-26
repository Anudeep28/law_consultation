import React, { useState, useEffect, useRef } from 'react';
import { LegalTemplate, TemplateField } from '../types';
import { Mic, MicOff, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { Modal } from './ui/Modal';

interface TemplateFillerModalProps {
  template: LegalTemplate;
  onComplete: (filledContent: string, title: string, category: string) => void;
  onClose: () => void;
}

export const TemplateFillerModal: React.FC<TemplateFillerModalProps> = ({
  template,
  onComplete,
  onClose,
}) => {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    template.fields.forEach((f) => { initial[f.id] = ''; });
    setFieldValues(initial);
    if (template.fields.length > 0) {
      setActiveFieldId(template.fields[0].id);
    }
  }, [template]);

  const currentFieldIndex = template.fields.findIndex((f) => f.id === activeFieldId);
  const currentField: TemplateField | undefined = template.fields[currentFieldIndex];

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const startVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecordingError('Speech recognition is not supported in this browser.');
      return;
    }
    if (!activeFieldId) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setFieldValues((prev) => ({
        ...prev,
        [activeFieldId]: (prev[activeFieldId] ? prev[activeFieldId] + ' ' : '') + transcript,
      }));
      setIsRecording(false);
    };

    recognition.onerror = (event: any) => {
      setRecordingError('Voice input error: ' + event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingError(null);
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const goNext = () => {
    if (currentFieldIndex < template.fields.length - 1) {
      setActiveFieldId(template.fields[currentFieldIndex + 1].id);
    }
  };

  const goPrev = () => {
    if (currentFieldIndex > 0) {
      setActiveFieldId(template.fields[currentFieldIndex - 1].id);
    }
  };

  const handleGenerate = () => {
    let content = template.content;
    template.fields.forEach((field) => {
      const value = fieldValues[field.id] || `[${field.name}]`;
      content = content.split(`{{${field.id}}}`).join(value);
    });
    onComplete(content, template.name, template.category);
  };

  const allRequiredFilled = template.fields
    .filter((f) => f.required)
    .every((f) => fieldValues[f.id]?.trim());

  const renderFieldInput = (field: TemplateField) => {
    const value = fieldValues[field.id] ?? '';
    const commonClass =
      'w-full px-3 py-2 border border-line-soft rounded-lg bg-cream-raised text-ink placeholder-ink-weakest focus:outline-none focus:border-accent-dark focus:ring-2 focus:ring-accent/30 text-sm';

    if (field.type === 'textarea') {
      return (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={commonClass}
        />
      );
    }
    if (field.type === 'select' && field.options) {
      return (
        <select
          value={value}
          onChange={(e) => handleFieldChange(field.id, e.target.value)}
          className={commonClass}
        >
          <option value="">Select...</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => handleFieldChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        className={commonClass}
      />
    );
  };

  return (
    <Modal open onClose={onClose} title={template.name} subtitle="Fill in the required fields to generate your document" maxWidth="2xl" panelClassName="flex flex-col">
        {/* Progress bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-faint">
              Field {currentFieldIndex + 1} of {template.fields.length}
            </span>
            <span className="text-xs text-ink-faint">
              {template.fields.filter((f) => fieldValues[f.id]?.trim()).length} / {template.fields.length} filled
            </span>
          </div>
          <div className="w-full bg-cream-deep rounded-full h-1.5">
            <div
              className="bg-brand h-1.5 rounded-full transition-all"
              style={{
                width: `${(template.fields.filter((f) => fieldValues[f.id]?.trim()).length / template.fields.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Active field */}
        {currentField && (
          <div className="px-6 py-4 flex-1 overflow-y-auto">
            <div className="bg-brand-soft border border-line rounded-xl p-4 mb-4">
              <div className="flex items-start justify-between mb-2">
                <label className="text-sm font-semibold text-brand">
                  {currentField.name}
                  {currentField.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <button
                  onMouseDown={startVoiceInput}
                  onMouseUp={stopVoiceInput}
                  onTouchStart={startVoiceInput}
                  onTouchEnd={stopVoiceInput}
                  onClick={isRecording ? stopVoiceInput : startVoiceInput}
                  title={isRecording ? 'Stop voice input' : 'Hold to dictate this field'}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    isRecording
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-cream-raised border border-line-soft text-brand hover:bg-cream'
                  }`}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{isRecording ? 'Listening...' : 'Dictate'}</span>
                </button>
              </div>
              {renderFieldInput(currentField)}
              {recordingError && (
                <p className="text-xs text-red-600 mt-1">{recordingError}</p>
              )}
            </div>

            {/* All fields overview */}
            <div className="grid grid-cols-2 gap-2">
              {template.fields.map((field) => (
                <button
                  key={field.id}
                  onClick={() => setActiveFieldId(field.id)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition ${
                    field.id === activeFieldId
                      ? 'border-brand bg-brand-soft'
                      : fieldValues[field.id]?.trim()
                      ? 'border-green-300 bg-green-50'
                      : 'border-line bg-cream hover:bg-cream-hover'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink truncate">{field.name}</span>
                    {fieldValues[field.id]?.trim() && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0 ml-1" />
                    )}
                  </div>
                  {fieldValues[field.id]?.trim() && (
                    <p className="text-ink-muted truncate mt-0.5">{fieldValues[field.id]}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between bg-cream">
          <div className="flex space-x-2">
            <button
              onClick={goPrev}
              disabled={currentFieldIndex === 0}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-ink-muted bg-cream-muted rounded-lg hover:bg-cream-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <button
              onClick={goNext}
              disabled={currentFieldIndex === template.fields.length - 1}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-ink-muted bg-cream-muted rounded-lg hover:bg-cream-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!allRequiredFilled}
            className="flex items-center space-x-2 px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Generate Document</span>
          </button>
        </div>
    </Modal>
  );
};
