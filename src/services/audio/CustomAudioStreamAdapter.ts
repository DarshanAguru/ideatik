import type { AudioStreamInterface, AudioStreamConfig, AudioStreamData } from 'whisper.rn/realtime-transcription';
import { Buffer } from 'buffer';

export class CustomAudioStreamAdapter implements AudioStreamInterface {
  private recording = false;
  private isInitialized = false;
  private config: AudioStreamConfig | null = null;
  private dataCallback?: (data: AudioStreamData) => void;
  private errorCallback?: (error: string) => void;
  private statusCallback?: (isRecording: boolean) => void;

  async initialize(config: AudioStreamConfig): Promise<void> {
    this.config = config;
    this.isInitialized = true;
    activeAdapter = this;
  }

  handleAudioChunk(base64Data: string) {
    if (this.dataCallback && this.recording) {
      try {
        const buffer = Buffer.from(base64Data, 'base64');
        const uint8Array = new Uint8Array(buffer);
        this.dataCallback({
          data: uint8Array,
          sampleRate: this.config?.sampleRate || 16000,
          channels: this.config?.channels || 1,
          timestamp: Date.now(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown audio slice error';
        this.errorCallback?.(msg);
      }
    }
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Adapter not initialized');
    }
    if (this.recording) return;
    this.recording = true;
    this.statusCallback?.(true);
  }

  async stop(): Promise<void> {
    if (!this.recording) return;
    this.recording = false;
    this.statusCallback?.(false);
  }

  isRecording(): boolean {
    return this.recording;
  }

  onData(callback: (data: AudioStreamData) => void): void {
    this.dataCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  onStatusChange(callback: (isRecording: boolean) => void): void {
    this.statusCallback = callback;
  }

  async release(): Promise<void> {
    if (this.recording) {
      await this.stop();
    }
    this.isInitialized = false;
    this.config = null;
    this.dataCallback = undefined;
    this.errorCallback = undefined;
    this.statusCallback = undefined;
    if (activeAdapter === this) {
      activeAdapter = null;
    }
  }
}

let activeAdapter: CustomAudioStreamAdapter | null = null;

export const pushAudioChunk = (base64Data: string) => {
  if (activeAdapter && activeAdapter.isRecording()) {
    activeAdapter.handleAudioChunk(base64Data);
  }
};
