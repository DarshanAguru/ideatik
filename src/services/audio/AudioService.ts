import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

import { pushAudioChunk } from './CustomAudioStreamAdapter';

export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Ideatik needs access to your microphone to record voice notes.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Microphone permission request failed:', err);
    return false;
  }
};

class AudioServiceClass {
  private currentSegmentIndex = 0;
  private segmentPaths: string[] = [];
  private noteId = '';
  private isRecording = false;
  private onDataCallback?: (base64Chunk: string) => void;
  private dataListenerRegistered = false;

  // Reset state for safety
  reset() {
    this.isRecording = false;
    this.onDataCallback = undefined;
    this.segmentPaths = [];
    this.noteId = '';
    this.currentSegmentIndex = 0;
    this.dataListenerRegistered = false;
    try {
      (AudioRecord as any).removeAllListeners?.();
    } catch (e) {
      console.warn('Error resetting AudioService:', e);
    }
  }

  async start(noteId: string, onData?: (base64Chunk: string) => void) {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      throw new Error('Microphone permission not granted');
    }

    this.noteId = noteId;
    this.currentSegmentIndex = 0;
    this.segmentPaths = [];
    this.onDataCallback = onData;
    this.dataListenerRegistered = false;

    // Create directories if they don't exist
    const audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;
    await RNFS.mkdir(audioDir);
    const notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
    await RNFS.mkdir(notesDir);

    // Remove any old listeners first
    try {
      (AudioRecord as any).removeAllListeners?.();
    } catch (e_) {
      console.warn('Could not remove old listeners:', e_);
    }

    // Register the PCM data listener ONCE per recording session.
    // Must not be placed inside startNewSegment() which is called on every
    // pause/resume cycle — doing so piles up duplicate listeners.
    if (!this.dataListenerRegistered) {
      AudioRecord.on('data', (data: string) => {
        try {
          pushAudioChunk(data);
          if (this.onDataCallback && this.isRecording) {
            this.onDataCallback(data);
          }
        } catch (e) {
          console.error('Error in audio data listener:', e);
        }
      });
      this.dataListenerRegistered = true;
    }

    await this.startNewSegment();
  }

  private async startNewSegment() {
    const segmentFileName = `seg_${this.noteId}_${this.currentSegmentIndex}.wav`;
    // On Android, react-native-audio-record saves files to the root of DocumentDirectoryPath by default
    const segmentPath = `${RNFS.DocumentDirectoryPath}/${segmentFileName}`;
    this.segmentPaths.push(segmentPath);

    const options = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 1, // MIC (universally compatible, avoids hardware lock crashes)
      wavFile: segmentFileName,
    };

    AudioRecord.init(options);
    AudioRecord.start();
    this.isRecording = true;
  }

  async pause() {
    if (!this.isRecording) return;
    this.isRecording = false;
    await AudioRecord.stop();
  }

  async resume() {
    if (this.isRecording) return;
    this.currentSegmentIndex++;
    await this.startNewSegment();
  }

  async stop(): Promise<{ audioUri: string; duration: number }> {
    try {
      if (this.isRecording) {
        this.isRecording = false;
        await AudioRecord.stop();
      }

      // Safely remove all listeners to prevent memory accumulation
      try {
        (AudioRecord as any).removeAllListeners?.();
      } catch (e_) {
        console.warn('Error removing audio listeners:', e_);
      }
      
      this.dataListenerRegistered = false;
      this.onDataCallback = undefined;

      const finalPath = `${RNFS.DocumentDirectoryPath}/files/audio/${this.noteId}.wav`;
      
      // Concatenate all segment WAV files into a single master WAV file
      const totalDuration = await this.concatenateSegments(finalPath);

      return {
        audioUri: `file://${finalPath}`,
        duration: totalDuration,
      };
    } catch (err) {
      console.error('Error in AudioService.stop():', err);
      throw err;
    }
  }

  private findDataChunkOffsetAndSize(fileBuffer: Buffer): { offset: number; size: number } | null {
    if (fileBuffer.length < 12) return null;
    
    const riff = fileBuffer.toString('ascii', 0, 4);
    const wave = fileBuffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      return null;
    }

    let offset = 12;
    while (offset + 8 <= fileBuffer.length) {
      const chunkId = fileBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = fileBuffer.readUInt32LE(offset + 4);
      
      if (chunkId === 'data') {
        return {
          offset: offset + 8,
          size: chunkSize
        };
      }
      
      offset += 8 + chunkSize;
    }
    
    return null;
  }

  private async concatenateSegments(outputPath: string): Promise<number> {
    try {
      const pcmBuffers: Uint8Array[] = [];
      let totalPcmLength = 0;

      for (const path of this.segmentPaths) {
        const exists = await RNFS.exists(path);
        if (!exists) continue;

        const base64Data = await RNFS.readFile(path, 'base64');
        const fileBuffer = Buffer.from(base64Data, 'base64');

        // Extract PCM data (dynamically locate 'data' chunk)
        const chunkInfo = this.findDataChunkOffsetAndSize(fileBuffer);
        if (chunkInfo) {
          const pcmData = fileBuffer.subarray(chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
          pcmBuffers.push(pcmData);
          totalPcmLength += pcmData.length;
        } else if (fileBuffer.length > 44) {
          // Fallback if dynamic parsing is not applicable
          const pcmData = fileBuffer.subarray(44);
          pcmBuffers.push(pcmData);
          totalPcmLength += pcmData.length;
        }

        // Clean up temporary segment file
        await RNFS.unlink(path).catch(() => {});
      }

      // Generate a new 44-byte WAV header for the combined PCM length
      const headerBuffer = this.generateWavHeader(totalPcmLength);
      
      // Combine header and PCM contents
      const finalBuffer = Buffer.concat([headerBuffer, ...pcmBuffers]);

      // Save base64-encoded combined WAV file
      await RNFS.writeFile(outputPath, finalBuffer.toString('base64'), 'base64');

      // Duration: total PCM bytes / (sampleRate * channels * bytesPerSample)
      // 16000 samples/sec * 1 channel * 2 bytes/sample = 32000 bytes/sec
      const durationSeconds = Math.round(totalPcmLength / 32000);

      return durationSeconds;
    } catch (err) {
      console.error('Error concatenating audio segments:', err);
      throw err;
    }
  }

  private generateWavHeader(dataLength: number): Buffer {
    const buffer = Buffer.alloc(44);

    // RIFF identifier
    buffer.write('RIFF', 0);
    // File length (36 + dataLength)
    buffer.writeUInt32LE(36 + dataLength, 4);
    // RIFF type
    buffer.write('WAVE', 8);
    // Format chunk identifier
    buffer.write('fmt ', 12);
    // Format chunk length
    buffer.writeUInt32LE(16, 16);
    // Sample format (1 = PCM)
    buffer.writeUInt16LE(1, 20);
    // Channel count (1 = mono)
    buffer.writeUInt16LE(1, 22);
    // Sample rate (16000)
    buffer.writeUInt32LE(16000, 24);
    // Byte rate (16000 * 2 = 32000)
    buffer.writeUInt32LE(32000, 28);
    // Block align (1 * 2 = 2)
    buffer.writeUInt16LE(2, 32);
    // Bits per sample (16)
    buffer.writeUInt16LE(16, 34);
    // Data chunk identifier
    buffer.write('data', 36);
    // Data chunk length
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
  }
}

export const AudioService = new AudioServiceClass();
