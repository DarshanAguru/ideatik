/**
 * OfflineAiModelService.ts
 *
 * Manages the download, validation, and deletion of the two optional
 * on-device AI models used by Ideatik:
 *
 *   - Embedding model (BGE base-en-v1.5 Q4_K_M, ~110 MB)
 *     Used by LocalVectorIndex to embed note text and search queries
 *     into 768-dimensional vectors for semantic search.
 *
 *   - LLM model (Qwen 2.5 1.5B Instruct Q4_K_M, ~986 MB)
 *     Used by SmartRagService to answer natural-language questions
 *     about the user's notes.
 *
 * Both models are user-supplied GGUF files. Users can either:
 *   a) Download from the recommended HuggingFace URLs below, or
 *   b) Import a local GGUF file via the document picker.
 *
 * Models are stored in <DocumentDirectory>/files/models/.
 * The Whisper transcription model is managed by WhisperService directly
 * but its deletion is exposed here for convenience via `deleteWhisperModel`.
 */
import RNFS from 'react-native-fs';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { LocalVectorIndex } from './LocalVectorIndex';

/** Metadata for a downloadable/importable GGUF model. */
export interface AiModelConfig {
  name: string;      // Human-readable display name shown in Settings
  filename: string;  // Filename used when storing on disk
  sizeMB: number;    // Approximate size in MB (for UI display only)
  url: string;       // HuggingFace direct download URL
}

/**
 * Recommended embedding model.
 * BGE base-en-v1.5 in 4-bit quantized GGUF format.
 * Produces 768-dim vectors; balances quality and size well for mobile.
 */
export const RECOMMENDED_EMBEDDING_MODEL: AiModelConfig = {
  name: 'BGE Base EN (v1.5)',
  filename: 'bge-base-en-v1.5-q4_k_m.gguf',
  sizeMB: 110,
  url: 'https://huggingface.co/CompendiumLabs/bge-base-en-v1.5-gguf/resolve/main/bge-base-en-v1.5-q4_k_m.gguf',
};

/**
 * Recommended LLM model.
 * Qwen 2.5 1.5B Instruct in 4-bit quantized GGUF format.
 * Small enough to fit in RAM on most mid-range Android devices (≥4 GB RAM).
 */
export const RECOMMENDED_LLM_MODEL: AiModelConfig = {
  name: 'Qwen 2.5 1.5B Instruct Q4_K_M',
  filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  sizeMB: 986,
  url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
};

class OfflineAiModelServiceClass {
  /** Returns the absolute path to the models storage directory. */
  getModelsDirectory(): string {
    return `${RNFS.DocumentDirectoryPath}/files/models`;
  }

  /** Returns the absolute path where the recommended model of the given kind is stored. */
  getModelPath(kind: 'embedding' | 'llm'): string {
    const filename =
      kind === 'embedding'
        ? RECOMMENDED_EMBEDDING_MODEL.filename
        : RECOMMENDED_LLM_MODEL.filename;
    return `${this.getModelsDirectory()}/${filename}`;
  }

  /**
   * Checks whether a valid (non-empty) model file is installed on disk.
   *
   * Two possible locations are checked in order:
   *   1. The URI saved in settings (set when user downloads or imports a model)
   *   2. The default recommended model path
   *
   * A minimum size threshold is enforced to avoid false positives from
   * partial downloads or zero-byte placeholder files:
   *   - Embedding: > 10 MB
   *   - LLM:       > 100 MB
   *
   * @returns true if a valid model file exists at either location.
   */
  async checkModelExists(kind: 'embedding' | 'llm'): Promise<boolean> {
    const customUri =
      kind === 'embedding'
        ? useSettingsStore.getState().embeddingModelUri
        : useSettingsStore.getState().llmModelUri;

    // Minimum size sanity check — prevents partial downloads being shown as installed
    const minSize = kind === 'embedding' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;

    // First check the custom/imported URI saved in settings
    if (customUri && customUri.trim() !== '') {
      const cleanPath = customUri.replace('file://', '');
      const exists = await RNFS.exists(cleanPath);
      if (exists) {
        const stat = await RNFS.stat(cleanPath).catch(() => null);
        if (stat && stat.size > minSize) {
          return true;
        }
      }
    }

    // Fall back to the default download path
    const defaultPath = this.getModelPath(kind);
    const defaultExists = await RNFS.exists(defaultPath);
    if (!defaultExists) return false;
    const stat = await RNFS.stat(defaultPath).catch(() => null);
    return Boolean(stat && stat.size > minSize);
  }

  /**
   * Downloads the recommended model for the given kind from HuggingFace.
   *
   * Progress is reported via `onProgress` as an integer 0–100.
   * On success, the model URI is saved to settings and, for the embedding
   * model, all existing notes are scheduled for re-indexing.
   *
   * If the HTTP response is not 200/304, the partial file is deleted to
   * prevent a corrupted file being mistaken for a valid model.
   *
   * @param kind       - 'embedding' or 'llm'
   * @param onProgress - Called repeatedly with download progress (0–100)
   * @returns Absolute path to the saved model file.
   */
  async downloadModel(
    kind: 'embedding' | 'llm',
    onProgress: (progress: number) => void
  ): Promise<string> {
    const config =
      kind === 'embedding'
        ? RECOMMENDED_EMBEDDING_MODEL
        : RECOMMENDED_LLM_MODEL;

    const modelsDir = this.getModelsDirectory();
    const destPath = this.getModelPath(kind);

    // Ensure the models directory exists before writing
    await RNFS.mkdir(modelsDir);

    const downloadResult = RNFS.downloadFile({
      fromUrl: config.url,
      toFile: destPath,
      begin: () => onProgress(1), // signal that transfer has started
      progress: (res) => {
        if (res.contentLength > 0) {
          const percent = Math.round((res.bytesWritten / res.contentLength) * 100);
          onProgress(percent);
        }
      },
    });

    const res = await downloadResult.promise;

    // Clean up incomplete download on HTTP error
    if (res.statusCode !== 200 && res.statusCode !== 304) {
      await RNFS.unlink(destPath).catch(() => undefined);
      throw new Error(`Download failed with HTTP status ${res.statusCode}`);
    }

    // Persist the model path to settings so it's found on next launch
    if (kind === 'embedding') {
      useSettingsStore.getState().setEmbeddingModelUri(destPath);
      // Trigger background indexing of all existing notes with the new model
      await LocalVectorIndex.scheduleAll();
    } else {
      useSettingsStore.getState().setLlmModelUri(destPath);
    }

    return destPath;
  }

  /**
   * Deletes a model file from disk and clears its URI from settings.
   *
   * For the embedding model, all stored vectors are also cleared since they
   * were produced by that model and would no longer match future queries
   * encoded by a different (or re-installed) model.
   *
   * @param kind - 'embedding' or 'llm'
   */
  async deleteModel(kind: 'embedding' | 'llm'): Promise<void> {
    const customUri =
      kind === 'embedding'
        ? useSettingsStore.getState().embeddingModelUri
        : useSettingsStore.getState().llmModelUri;

    // Prefer the saved URI path; fall back to the default path
    const path = customUri ? customUri.replace('file://', '') : this.getModelPath(kind);
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path).catch(() => undefined);
    }

    if (kind === 'embedding') {
      useSettingsStore.getState().setEmbeddingModelUri('');
      // Stale vectors are invalid without the embedding model, so clear them
      await LocalVectorIndex.clearAll();
    } else {
      useSettingsStore.getState().setLlmModelUri('');
    }
  }

  /**
   * Deletes the Whisper speech transcription model from disk.
   * The Whisper model path is determined by WhisperService; this method
   * delegates to it rather than duplicating the path logic here.
   */
  async deleteWhisperModel(): Promise<void> {
    const { WhisperService } = require('../whisper/WhisperService');
    const path = WhisperService.getModelPath();
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path).catch(() => undefined);
    }
  }
}

export const OfflineAiModelService = new OfflineAiModelServiceClass();
