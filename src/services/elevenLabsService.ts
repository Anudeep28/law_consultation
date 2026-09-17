export interface TranscriptionResult {
  text: string;
  is_final: boolean;
  language?: string;
}

export class ElevenLabsService {
  private apiKey: string = '';
  private language: string = 'en';
  private connected: boolean = false;
  private recording: boolean = false;
  private paused: boolean = false;

  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private onTranscriptionCallback?: (result: TranscriptionResult) => void;
  private onErrorCallback?: (error: string) => void;

  onTranscription(callback: (result: TranscriptionResult) => void) {
    this.onTranscriptionCallback = callback;
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallback = callback;
  }

  async connect(apiKey: string, language: string = 'en'): Promise<boolean> {
    this.apiKey = apiKey;
    this.language = language;
    this.connected = true;
    return true;
  }

  async startRecording(): Promise<boolean> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });

      await this._openWebSocket();

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      await this.audioContext.audioWorklet.addModule('/pcm-processor.js');
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

      this.workletNode.port.onmessage = (e) => {
        if (!this.recording || this.paused) return;
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        const bytes = new Uint8Array(e.data as ArrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        this.ws.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: base64,
          commit: false,
          sample_rate: 16000,
        }));
      };

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);

      this.recording = true;
      this.paused = false;
      return true;
    } catch (error: any) {
      console.error('Error starting recording:', error);
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        this.onErrorCallback?.('Microphone access denied. Please allow microphone permission.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        this.onErrorCallback?.('No microphone found. Please connect a microphone and try again.');
      } else if (error?.message?.includes('scribe token') || error?.message?.includes('SyntaxError')) {
        this.onErrorCallback?.('Failed to get auth token. Make sure the proxy server is running (npm run server).');
      } else {
        this.onErrorCallback?.(`Failed to start: ${error?.message || error?.name || 'Unknown error'}`);
      }
      return false;
    }
  }

  private async _openWebSocket(): Promise<void> {
    const tokenRes = await fetch('/api/scribe-token');
    if (!tokenRes.ok) {
      throw new Error('Failed to get scribe token');
    }
    const { token } = await tokenRes.json();

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model_id: 'scribe_v2_realtime',
        token,
        language_code: this.language && this.language !== 'auto' ? this.language : 'en',
        vad_threshold: '0.4',
        vad_silence_threshold_secs: '0.8',
      });
      const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error('WebSocket error', e);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = (e) => {
        console.log('WebSocket closed', e.code, e.reason);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[ElevenLabs WS]', msg.message_type, msg);
          if (msg.message_type === 'partial_transcript') {
            const text: string = msg.transcript || msg.text || '';
            if (text.trim()) {
              this.onTranscriptionCallback?.({ text, is_final: false });
            }
          } else if (msg.message_type === 'committed_transcript') {
            const text: string = msg.transcript || msg.text || '';
            if (text.trim()) {
              this.onTranscriptionCallback?.({ text, is_final: true });
            }
          }
        } catch {
          // ignore non-JSON frames
        }
      };
    });
  }

  pauseRecording() {
    this.paused = true;
  }

  resumeRecording() {
    this.paused = false;
  }

  async stopRecordingAndTranscribe(): Promise<void> {
    this.recording = false;
    this.paused = false;
    this._teardownAudio();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 10000);

        const prevOnMessage = this.ws!.onmessage;
        this.ws!.onmessage = (event) => {
          // Keep processing transcripts until committed
          if (prevOnMessage) (prevOnMessage as any).call(this.ws, event);
          try {
            const msg = JSON.parse(event.data);
            if (msg.message_type === 'committed_transcript') {
              clearTimeout(timeout);
              resolve();
            }
          } catch {}
        };

        this.ws!.send(JSON.stringify({ message_type: 'commit' }));
      });

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
    }
    this.ws = null;
  }

  private _teardownAudio() {
    try {
      this.workletNode?.disconnect();
      this.sourceNode?.disconnect();
      this.audioContext?.close();
    } catch {}
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.workletNode = null;
    this.sourceNode = null;
    this.audioContext = null;
    this.mediaStream = null;
  }

  disconnect() {
    this.recording = false;
    this.paused = false;
    this._teardownAudio();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isRecording(): boolean {
    return this.recording && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }
}

// Singleton instance
export const elevenLabsService = new ElevenLabsService();
