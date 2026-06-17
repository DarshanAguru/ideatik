import { initWhisper, WhisperContext } from 'whisper.rn';
import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';

// ggml-base.en-q5_1 — fastest accurate model (~60MB) for mobile.
// 5-bit quantized English-only base model: ~60MB, ~2x faster than small model.
const MODEL_NAME = 'ggml-base.en-q5_1.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;

// Chunk large WAV files into segments so the offline model doesn't load the entire
// file into memory at once. Chunks are transcribed sequentially and merged.
const MAX_CHUNK_DURATION_SEC = 30;

async function chunkWavFile(audioUri: string): Promise<string[]> {
  try {
    const cleanPath = audioUri.replace(/^file:\/\//, '');
    if (!(await RNFS.exists(cleanPath))) return [audioUri];

    const base64Data = await RNFS.readFile(cleanPath, 'base64');
    const fileBuffer = Buffer.from(base64Data, 'base64');
    if (fileBuffer.length <= 44) return [audioUri];

    const sampleRate   = fileBuffer.readUInt32LE(24);
    const channels     = fileBuffer.readUInt16LE(22);
    const bitsPerSample = fileBuffer.readUInt16LE(34);
    const byteRate     = fileBuffer.readUInt32LE(28);
    const blockAlign   = fileBuffer.readUInt16LE(32);

    const pcmData = fileBuffer.subarray(44);
    const chunkBytesLimit =
      Math.floor((MAX_CHUNK_DURATION_SEC * byteRate) / blockAlign) * blockAlign;

    if (pcmData.length <= chunkBytesLimit) return [audioUri]; // short enough — no chunking

    console.log(
      `WhisperService: Chunking ${Math.round(pcmData.length / byteRate)}s audio into ${MAX_CHUNK_DURATION_SEC}s segments...`
    );

    const chunkPaths: string[] = [];
    let offset = 0;
    let chunkIdx = 0;

    while (offset < pcmData.length) {
      const chunkPcm = pcmData.subarray(offset, offset + chunkBytesLimit);
      if (chunkPcm.length === 0) break;
      offset += chunkPcm.length;

      const header = Buffer.alloc(44);
      header.write('RIFF', 0, 4, 'ascii');
      header.writeUInt32LE(chunkPcm.length + 36, 4);
      header.write('WAVE', 8, 4, 'ascii');
      header.write('fmt ', 12, 4, 'ascii');
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(channels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36, 4, 'ascii');
      header.writeUInt32LE(chunkPcm.length, 40);

      const newWav = Buffer.concat([header, chunkPcm]);
      const chunkPath = `${cleanPath}_chunk_${chunkIdx}.wav`;
      await RNFS.writeFile(chunkPath, newWav.toString('base64'), 'base64');
      chunkPaths.push(`file://${chunkPath}`);
      chunkIdx++;
    }

    return chunkPaths;
  } catch (err) {
    console.warn('WhisperService: Chunking failed, using original file:', err);
    return [audioUri];
  }
}

class WhisperServiceClass {
  private context: WhisperContext | null = null;
  private downloadJobId: number | null = null;

  getModelDirectory(): string {
    return `${RNFS.DocumentDirectoryPath}/models`;
  }

  getModelPath(): string {
    return `${this.getModelDirectory()}/${MODEL_NAME}`;
  }

  async checkModelExists(): Promise<boolean> {
    const path = this.getModelPath();
    return RNFS.exists(path);
  }

  async downloadModel(onProgress: (progress: number) => void): Promise<void> {
    const modelDir = this.getModelDirectory();
    const modelPath = this.getModelPath();

    await RNFS.mkdir(modelDir);

    if (this.downloadJobId !== null) {
      RNFS.stopDownload(this.downloadJobId);
      this.downloadJobId = null;
    }

    const downloadOptions = {
      fromUrl: MODEL_URL,
      toFile: modelPath,
      progressInterval: 250,
      progress: (res: any) => {
        const percentage = (res.bytesWritten / res.contentLength) * 100;
        onProgress(Math.min(99, Math.round(percentage)));
      },
    };

    try {
      const result = RNFS.downloadFile(downloadOptions);
      this.downloadJobId = result.jobId;
      await result.promise;
      this.downloadJobId = null;
      onProgress(100);
    } catch (err) {
      this.downloadJobId = null;
      await RNFS.unlink(modelPath).catch(() => {});
      throw err;
    }
  }

  async loadContext(): Promise<WhisperContext> {
    if (this.context) return this.context;

    const exists = await this.checkModelExists();
    if (!exists) {
      throw new Error('MODEL_NOT_FOUND');
    }

    const modelPath = this.getModelPath();
    this.context = await initWhisper({ filePath: modelPath });
    return this.context;
  }

  async transcribeFile(
    audioUri: string
  ): Promise<{ text: string; isOnline: boolean }> {
    const whisperContext = await this.loadContext();

    const options = {
      language: 'en',
      initialPrompt:
        'A clean, well-punctuated transcription with correct capitalization, periods, commas, and numeric lists.',
      beamSize: 5,
      threads: 2, // Limit CPU threads to prevent UI/JS lag
    };

    // Chunk large recordings to avoid memory pressure on mobile
    const chunkUris = await chunkWavFile(audioUri);
    const transcripts: string[] = [];

    for (let i = 0; i < chunkUris.length; i++) {
      const chunkUri = chunkUris[i];
      const path = chunkUri.replace(/^file:\/\//, '');

      if (chunkUris.length > 1) {
        console.log(`WhisperService: Transcribing chunk ${i + 1}/${chunkUris.length}...`);
      } else {
        console.log(`WhisperService: Transcribing with ${MODEL_NAME}...`);
      }

      const { result } = await whisperContext.transcribe(path, options).promise;
      if (result && result.trim()) {
        transcripts.push(result.trim());
      }
    }

    // Clean up temp chunk files (skip index 0 if it equals the original)
    if (chunkUris.length > 1) {
      chunkUris.forEach((uri) => {
        const p = uri.replace(/^file:\/\//, '');
        RNFS.unlink(p).catch(() => {});
      });
    }

    const text = transcripts.join(' ').trim();
    console.log(`WhisperService: Transcription complete (${chunkUris.length} chunk(s)).`);
    return { text, isOnline: false };
  }

  async release() {
    try {
      if (this.context) {
        await this.context.release().catch(() => {});
        this.context = null;
      }
    } catch (e) {
      console.warn('WhisperService.release error:', e);
    }
  }

  resetContext() {
    this.context = null;
  }
}

export const WhisperService = new WhisperServiceClass();
