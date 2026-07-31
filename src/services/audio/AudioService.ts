/**
 * AudioService.ts
 *
 * Manages the full lifecycle of voice recording for a single note session:
 *   start → [pause → resume]* → stop
 *
 * Each recording session is broken into sequential WAV segments on disk
 * (one per start/resume call). On stop, all segments are concatenated into a
 * single master WAV file and the temporary segment files are removed.
 *
 * Why segments?
 *   react-native-audio-record writes a new file every time AudioRecord.init()
 *   is called, so pause/resume creates multiple files that must be merged.
 *
 * Why 16 kHz / 16-bit / mono?
 *   whisper.rn (llama.cpp backend) expects 16 kHz PCM audio for transcription.
 *   Stereo or different sample rates would produce garbled transcripts.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import AudioRecord from 'react-native-audio-record';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

import { pushAudioChunk } from './CustomAudioStreamAdapter';

/**
 * Requests RECORD_AUDIO permission on Android.
 * iOS permission is handled by the system dialog triggered automatically.
 */
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
  // Index of the current segment being recorded (increments on each resume)
  private currentSegmentIndex = 0;

  // Ordered list of absolute paths for all recorded WAV segments in this session
  private segmentPaths: string[] = [];

  // ID of the note this session belongs to (used to name segment files)
  private noteId = '';

  // True only when AudioRecord is actively writing PCM data
  private isRecording = false;

  // Optional callback forwarding raw PCM base64 chunks to real-time consumers
  private onDataCallback?: (base64Chunk: string) => void;

  // Guard: ensures we register the 'data' listener exactly once per session
  private dataListenerRegistered = false;

  /**
   * Resets all internal state and removes any dangling AudioRecord listeners.
   * Call this on app resume or if a previous session ended unexpectedly.
   */
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

  /**
   * Begins a new recording session for the given note ID.
   *
   * @param noteId   - The note this audio belongs to; used to name segment files.
   * @param onData   - Optional callback invoked with each raw PCM base64 chunk
   *                   (used for real-time waveform animation in RecordingScreen).
   */
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

    // Ensure storage directories exist before writing segment files
    const audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;
    await RNFS.mkdir(audioDir);
    const notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
    await RNFS.mkdir(notesDir);

    // Clear any listeners left over from a previous crashed session
    try {
      (AudioRecord as any).removeAllListeners?.();
    } catch (e_) {
      console.warn('Could not remove old listeners:', e_);
    }

    // Register the PCM data listener ONCE per recording session.
    // Must not be placed inside startNewSegment() which is called on every
    // pause/resume cycle — doing so piles up duplicate listeners that each
    // fire for every chunk, multiplying memory and CPU cost.
    if (!this.dataListenerRegistered) {
      AudioRecord.on('data', (data: string) => {
        try {
          // Forward chunk to Whisper's real-time stream buffer
          pushAudioChunk(data);
          // Also forward to UI waveform visualiser, but only while actively recording
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

  /**
   * Initialises and starts a new WAV segment file.
   * Called on session start and on every resume after a pause.
   *
   * Segment files are named: seg_<noteId>_<index>.wav
   * react-native-audio-record places them in the root DocumentDirectoryPath.
   */
  private async startNewSegment() {
    const segmentFileName = `seg_${this.noteId}_${this.currentSegmentIndex}.wav`;
    // On Android, react-native-audio-record saves files to the root of DocumentDirectoryPath by default
    const segmentPath = `${RNFS.DocumentDirectoryPath}/${segmentFileName}`;
    this.segmentPaths.push(segmentPath);

    const options = {
      sampleRate: 16000,    // whisper.rn requires 16 kHz input
      channels: 1,          // Mono — halves file size vs stereo
      bitsPerSample: 16,    // Standard PCM16 format
      audioSource: 1,       // MIC — most universally compatible source on Android
      wavFile: segmentFileName,
    };

    AudioRecord.init(options);
    AudioRecord.start();
    this.isRecording = true;
  }

  /**
   * Pauses recording by stopping the current segment.
   * The session remains open; call resume() to continue.
   */
  async pause() {
    if (!this.isRecording) return;
    this.isRecording = false;
    await AudioRecord.stop();
  }

  /**
   * Resumes a paused session by starting a new segment file.
   * The segment index is incremented so the new file doesn't overwrite the previous one.
   */
  async resume() {
    if (this.isRecording) return;
    this.currentSegmentIndex++;
    await this.startNewSegment();
  }

  /**
   * Finalises the recording session.
   *
   * Steps:
   *   1. Stops AudioRecord if still active.
   *   2. Removes all PCM data listeners to prevent memory leaks.
   *   3. Concatenates all WAV segment files into a single master WAV.
   *   4. Returns the file URI and duration.
   *
   * @returns { audioUri, duration } — URI to the final WAV file and its duration in seconds.
   */
  async stop(): Promise<{ audioUri: string; duration: number }> {
    try {
      if (this.isRecording) {
        this.isRecording = false;
        await AudioRecord.stop();
      }

      // Remove all PCM listeners to prevent memory accumulation across sessions
      try {
        (AudioRecord as any).removeAllListeners?.();
      } catch (e_) {
        console.warn('Error removing audio listeners:', e_);
      }

      this.dataListenerRegistered = false;
      this.onDataCallback = undefined;

      const finalPath = `${RNFS.DocumentDirectoryPath}/files/audio/${this.noteId}.wav`;

      // Merge all recorded segments into one WAV file
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

  /**
   * Parses a WAV file buffer to find the byte offset and byte length of the
   * raw PCM 'data' chunk.
   *
   * WAV files follow the RIFF chunk format. After the 12-byte RIFF header,
   * there can be multiple sub-chunks (e.g. 'fmt ', 'LIST', 'data'). We scan
   * forward until we find the 'data' chunk rather than assuming a fixed 44-byte
   * offset — some encoders insert extra metadata chunks before the audio data.
   *
   * @returns { offset, size } where offset is the byte position of the first
   *          PCM sample, or null if the buffer is not a valid WAV file.
   */
  private findDataChunkOffsetAndSize(fileBuffer: Buffer): { offset: number; size: number } | null {
    if (fileBuffer.length < 12) return null;

    const riff = fileBuffer.toString('ascii', 0, 4);
    const wave = fileBuffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      return null;
    }

    // Walk the chunk list starting at byte 12 (after RIFF header)
    let offset = 12;
    while (offset + 8 <= fileBuffer.length) {
      const chunkId = fileBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = fileBuffer.readUInt32LE(offset + 4);

      if (chunkId === 'data') {
        return {
          offset: offset + 8, // +8 to skip the 4-byte id and 4-byte size fields
          size: chunkSize,
        };
      }

      // Advance past this chunk (8-byte header + payload)
      offset += 8 + chunkSize;
    }

    return null;
  }

  /**
   * Reads all recorded WAV segment files, extracts their raw PCM payloads,
   * concatenates them, writes a fresh WAV header, and saves the result to
   * `outputPath`. Temporary segment files are deleted after being read.
   *
   * Duration is calculated from the combined PCM byte count divided by the
   * byteRate field read from the first valid segment header. This avoids
   * hard-coding a sample rate and works correctly even if the hardware records
   * at a different rate than the one requested (some Android devices override
   * the requested sample rate).
   *
   * @returns Duration of the combined audio in whole seconds.
   */
  private async concatenateSegments(outputPath: string): Promise<number> {
    try {
      const pcmBuffers: Uint8Array[] = [];
      let totalPcmLength = 0;

      // First pass: extract PCM payloads and delete temp files
      for (const path of this.segmentPaths) {
        const exists = await RNFS.exists(path);
        if (!exists) continue;

        const base64Data = await RNFS.readFile(path, 'base64');
        const fileBuffer = Buffer.from(base64Data, 'base64');

        // Dynamically locate the 'data' chunk rather than assuming 44-byte offset
        const chunkInfo = this.findDataChunkOffsetAndSize(fileBuffer);
        if (chunkInfo) {
          const pcmData = fileBuffer.subarray(chunkInfo.offset, chunkInfo.offset + chunkInfo.size);
          pcmBuffers.push(pcmData);
          totalPcmLength += pcmData.length;
        } else if (fileBuffer.length > 44) {
          // Fallback: skip the standard 44-byte WAV header if chunk scan failed
          const pcmData = fileBuffer.subarray(44);
          pcmBuffers.push(pcmData);
          totalPcmLength += pcmData.length;
        }

        // Remove the temporary segment file immediately after reading to free disk space
        await RNFS.unlink(path).catch(() => {});
      }

      // Second pass: read byteRate from the first available segment header.
      // This handles devices that record at a sample rate different from what
      // was requested (e.g. hardware upsampling from 16 kHz to 44.1 kHz).
      // WAV header byte offset 28 = byteRate (4 bytes, little-endian).
      let byteRate = 32000; // safe default: 16000 Hz * 1 ch * 2 bytes/sample
      for (const path of this.segmentPaths) {
        const exists = await RNFS.exists(path);
        if (!exists) continue;
        try {
          const headBase64 = await RNFS.readFile(path, 'base64');
          const buf = Buffer.from(headBase64, 'base64');
          if (buf.length >= 32) {
            const br = buf.readUInt32LE(28);
            // Sanity-check: only accept values in the plausible range for audio
            if (br >= 8000 && br <= 384000) {
              byteRate = br;
              break;
            }
          }
        } catch (e) {
          // If header read fails, fall back to the default byteRate
        }
      }

      // Build the final WAV file: fresh header + concatenated PCM payloads
      const headerBuffer = this.generateWavHeader(totalPcmLength);
      const finalBuffer = Buffer.concat([headerBuffer, ...pcmBuffers]);

      // Write as base64 — RNFS handles the encoding transparently
      await RNFS.writeFile(outputPath, finalBuffer.toString('base64'), 'base64');

      // Duration = total bytes of raw PCM / bytes per second
      const durationSeconds = Math.max(1, Math.round(totalPcmLength / byteRate));

      return durationSeconds;
    } catch (err) {
      console.error('Error concatenating audio segments:', err);
      throw err;
    }
  }

  /**
   * Generates a standard 44-byte WAV RIFF header for 16 kHz, 16-bit, mono PCM.
   *
   * Header layout (offsets are decimal byte positions):
   *   0–3   RIFF identifier
   *   4–7   File size − 8 (36 + dataLength)
   *   8–11  WAVE identifier
   *   12–15 fmt  chunk identifier
   *   16–19 fmt  chunk length (16 for PCM)
   *   20–21 Audio format (1 = PCM)
   *   22–23 Number of channels (1 = mono)
   *   24–27 Sample rate (16000 Hz)
   *   28–31 Byte rate (sampleRate × channels × bitsPerSample / 8 = 32000)
   *   32–33 Block align (channels × bitsPerSample / 8 = 2)
   *   34–35 Bits per sample (16)
   *   36–39 data chunk identifier
   *   40–43 data chunk size (= dataLength)
   *
   * @param dataLength - Total bytes of raw PCM audio that follows this header.
   */
  private generateWavHeader(dataLength: number): Buffer {
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4); // Total file size − 8
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);       // fmt chunk length (always 16 for PCM)
    buffer.writeUInt16LE(1, 20);        // Audio format: 1 = uncompressed PCM
    buffer.writeUInt16LE(1, 22);        // Channels: 1 = mono
    buffer.writeUInt32LE(16000, 24);    // Sample rate: 16 kHz
    buffer.writeUInt32LE(32000, 28);    // Byte rate: 16000 × 1 × 2
    buffer.writeUInt16LE(2, 32);        // Block align: 1 ch × 2 bytes/sample
    buffer.writeUInt16LE(16, 34);       // Bits per sample: 16
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40); // PCM payload size

    return buffer;
  }
}

export const AudioService = new AudioServiceClass();
