import React, { useState, useEffect, useRef } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { elevenLabsService } from '../services/elevenLabsService';
import { translateText } from '../services/deepseekService';
import { supportedLanguages } from '../data/languages';
import { Mic, Pause, Play, Square, Undo2 } from 'lucide-react';

const ELEVENLABS_API_KEY = process.env.REACT_APP_ELEVENLABS_API_KEY || '';

export const TranscriptionControls: React.FC = () => {
  const [inputLanguage, setInputLanguage] = useState('en');
  const [outputLanguage, setOutputLanguage] = useState('en');
  const [isConnected, setIsConnected] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const updateTranscriptionTextRef = useRef(useDocumentStore.getState().updateTranscriptionText);
  const inputLanguageRef = useRef(inputLanguage);
  const outputLanguageRef = useRef(outputLanguage);
  const transcriptBufferRef = useRef(transcriptBuffer);
  const finalTranscriptReceivedRef = useRef(false);

  useEffect(() => { inputLanguageRef.current = inputLanguage; }, [inputLanguage]);
  useEffect(() => { outputLanguageRef.current = outputLanguage; }, [outputLanguage]);
  useEffect(() => { transcriptBufferRef.current = transcriptBuffer; }, [transcriptBuffer]);

  const {
    currentDocument,
    transcriptionSession,
    startTranscription,
    stopTranscription,
    pauseTranscription,
    resumeTranscription,
  } = useDocumentStore();

  useEffect(() => {
    (window as any).__toggleVoiceRecording = () => {
      if (!isConnected) {
        handleStart();
      } else {
        handleStop();
      }
    };
    return () => { delete (window as any).__toggleVoiceRecording; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    elevenLabsService.onTranscription(async (result) => {
      if (result.is_final && result.text.trim()) {
        finalTranscriptReceivedRef.current = true;
        const from = inputLanguageRef.current;
        const to = outputLanguageRef.current;
        let finalText = result.text;
        if (from !== to) {
          try {
            finalText = await translateText(result.text, from, to);
          } catch (err) {
            console.error('Translation failed, using original text:', err);
          }
        }
        updateTranscriptionTextRef.current(finalText + ' ');
        setTranscriptBuffer('');
      } else if (result.text.trim()) {
        setTranscriptBuffer(result.text);
      }
    });

    elevenLabsService.onError((error) => {
      console.error('Transcription error:', error);
      setErrorMessage(error);
      setIsConnected(false);
      setIsTranscribing(false);
    });

    return () => {
      elevenLabsService.disconnect();
    };
  }, []);

  const handleStart = async () => {
    setErrorMessage('');
    if (!currentDocument) {
      setErrorMessage('Please create or open a document first.');
      return;
    }

    try {
      const connected = await elevenLabsService.connect(ELEVENLABS_API_KEY, inputLanguage);
      if (connected) {
        const recording = await elevenLabsService.startRecording();
        if (recording) {
          setIsConnected(true);
          startTranscription(currentDocument.id, ELEVENLABS_API_KEY, inputLanguage, outputLanguage);
        }
      }
    } catch (error) {
      console.error('Failed to start transcription:', error);
      setErrorMessage('Failed to start. Check microphone permissions.');
    }
  };

  const handleStop = async () => {
    setIsTranscribing(true);
    const bufferSnapshot = transcriptBufferRef.current;
    finalTranscriptReceivedRef.current = false;
    try {
      await elevenLabsService.stopRecordingAndTranscribe();
      // Fallback: if the server never sent a committed transcript, append the live buffer
      if (!finalTranscriptReceivedRef.current && bufferSnapshot.trim()) {
        const from = inputLanguageRef.current;
        const to = outputLanguageRef.current;
        let finalText = bufferSnapshot;
        if (from !== to) {
          try {
            finalText = await translateText(bufferSnapshot, from, to);
          } catch (err) {
            console.error('Translation failed, using original text:', err);
          }
        }
        updateTranscriptionTextRef.current(finalText + ' ');
      }
    } catch (err) {
      console.error('Error stopping transcription:', err);
    } finally {
      setTranscriptBuffer('');
      stopTranscription();
      setIsConnected(false);
      setIsTranscribing(false);
    }
  };

  const handlePause = () => {
    elevenLabsService.pauseRecording();
    pauseTranscription();
  };

  const handleResume = () => {
    elevenLabsService.resumeRecording();
    resumeTranscription();
  };

  const handleUndo = () => {
    if (currentDocument && currentDocument.content.length > 0) {
      const newContent = currentDocument.content.replace(/\s+[^\s]*\s*$/, '');
      useDocumentStore.getState().updateDocument(currentDocument.id, newContent);
    }
  };

  const isRecording = transcriptionSession?.isRecording && !transcriptionSession?.isPaused;
  const isPaused = transcriptionSession?.isPaused;

  return (
    <div className="bg-white border-t border-[#eadbc1] px-4 pt-3 pb-4">
      {/* Language selectors — always visible */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-medium text-[#8c6b54] whitespace-nowrap">🎙 Speak in</label>
          <select
            value={inputLanguage}
            onChange={(e) => setInputLanguage(e.target.value)}
            disabled={isConnected}
            className="flex-1 px-2 py-1.5 text-sm border border-[#e6d8c2] rounded-lg bg-[#fffcf6] text-[#32151b] focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 disabled:opacity-50"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-medium text-[#8c6b54] whitespace-nowrap">📄 Output in</label>
          <select
            value={outputLanguage}
            onChange={(e) => setOutputLanguage(e.target.value)}
            disabled={isConnected}
            className="flex-1 px-2 py-1.5 text-sm border border-[#e6d8c2] rounded-lg bg-[#fffcf6] text-[#32151b] focus:outline-none focus:border-[#b8862d] focus:ring-2 focus:ring-[#f4c95d]/30 disabled:opacity-50"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-red-400 hover:text-red-600 ml-2 text-xs">✕</button>
        </div>
      )}

      {/* Live Transcription Buffer */}
      {transcriptBuffer && (
        <div className="mb-3 p-2 bg-[#fff4d6] border border-[#f4c95d] rounded-lg">
          <span className="text-sm text-[#765116] italic">{transcriptBuffer}</span>
        </div>
      )}

      {/* Recording controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {!isConnected ? (
            <button
              onClick={handleStart}
              className="flex items-center space-x-2 px-4 py-2 bg-[#701f2f] text-white rounded-lg hover:bg-[#541522] transition"
            >
              <Mic className="w-5 h-5" />
              <span>Start Recording</span>
            </button>
          ) : (
            <>
              <button
                onClick={isPaused ? handleResume : handlePause}
                className="flex items-center space-x-2 px-4 py-2 bg-[#b8862d] text-white rounded-lg hover:bg-[#9a7328] transition"
              >
                {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                onClick={handleStop}
                disabled={isTranscribing}
                className="flex items-center space-x-2 px-4 py-2 bg-[#3f1420] text-white rounded-lg hover:bg-[#2a0d16] disabled:opacity-50 transition"
              >
                <Square className="w-5 h-5" />
                <span>{isTranscribing ? 'Transcribing...' : 'Stop'}</span>
              </button>
              <button
                onClick={handleUndo}
                className="flex items-center space-x-2 px-4 py-2 bg-[#8c6b54] text-white rounded-lg hover:bg-[#6f5a49] transition"
              >
                <Undo2 className="w-5 h-5" />
                <span>Undo</span>
              </button>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2 text-sm text-[#8c6b54]">
          {isRecording && (
            <span className="flex items-center text-red-600">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
              Recording...
            </span>
          )}
          {isPaused && (
            <span className="flex items-center text-[#b8862d]">
              <span className="w-2 h-2 bg-[#b8862d] rounded-full mr-2"></span>
              Paused
            </span>
          )}
          {isTranscribing && (
            <span className="flex items-center text-[#701f2f]">
              <span className="w-2 h-2 bg-[#701f2f] rounded-full mr-2 animate-pulse"></span>
              Transcribing...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
