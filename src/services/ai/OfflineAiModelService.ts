import RNFS from 'react-native-fs';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { LocalVectorIndex } from './LocalVectorIndex';

export interface AiModelConfig {
  name: string;
  filename: string;
  sizeMB: number;
  url: string;
}

export const RECOMMENDED_EMBEDDING_MODEL: AiModelConfig = {
  name: 'BGE Base EN (v1.5)',
  filename: 'bge-base-en-v1.5-q4_k_m.gguf',
  sizeMB: 110,
  url: 'https://huggingface.co/CompendiumLabs/bge-base-en-v1.5-gguf/resolve/main/bge-base-en-v1.5-q4_k_m.gguf',
};

export const RECOMMENDED_LLM_MODEL: AiModelConfig = {
  name: 'Qwen 2.5 1.5B Instruct Q4_K_M',
  filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
  sizeMB: 986,
  url: 'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
};

class OfflineAiModelServiceClass {
  getModelsDirectory(): string {
    return `${RNFS.DocumentDirectoryPath}/files/models`;
  }

  getModelPath(kind: 'embedding' | 'llm'): string {
    const filename =
      kind === 'embedding'
        ? RECOMMENDED_EMBEDDING_MODEL.filename
        : RECOMMENDED_LLM_MODEL.filename;
    return `${this.getModelsDirectory()}/${filename}`;
  }

  async checkModelExists(kind: 'embedding' | 'llm'): Promise<boolean> {
    const customUri =
      kind === 'embedding'
        ? useSettingsStore.getState().embeddingModelUri
        : useSettingsStore.getState().llmModelUri;

    if (customUri) {
      const exists = await RNFS.exists(customUri.replace('file://', ''));
      if (exists) return true;
    }

    const defaultPath = this.getModelPath(kind);
    return await RNFS.exists(defaultPath);
  }

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

    await RNFS.mkdir(modelsDir);

    const downloadResult = RNFS.downloadFile({
      fromUrl: config.url,
      toFile: destPath,
      begin: () => onProgress(1),
      progress: (res) => {
        if (res.contentLength > 0) {
          const percent = Math.round((res.bytesWritten / res.contentLength) * 100);
          onProgress(percent);
        }
      },
    });

    const res = await downloadResult.promise;
    if (res.statusCode !== 200 && res.statusCode !== 304) {
      await RNFS.unlink(destPath).catch(() => undefined);
      throw new Error(`Download failed with HTTP status ${res.statusCode}`);
    }

    if (kind === 'embedding') {
      useSettingsStore.getState().setEmbeddingModelUri(destPath);
      await LocalVectorIndex.scheduleAll();
    } else {
      useSettingsStore.getState().setLlmModelUri(destPath);
    }

    return destPath;
  }

  async deleteModel(kind: 'embedding' | 'llm'): Promise<void> {
    const customUri =
      kind === 'embedding'
        ? useSettingsStore.getState().embeddingModelUri
        : useSettingsStore.getState().llmModelUri;

    const path = customUri ? customUri.replace('file://', '') : this.getModelPath(kind);
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path).catch(() => undefined);
    }

    if (kind === 'embedding') {
      useSettingsStore.getState().setEmbeddingModelUri('');
      await LocalVectorIndex.clearAll();
    } else {
      useSettingsStore.getState().setLlmModelUri('');
    }
  }

  async deleteWhisperModel(): Promise<void> {
    const { WhisperService } = require('../whisper/WhisperService');
    const path = WhisperService.getModelPath();
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path).catch(() => undefined);
    }
  }
}

export const OfflineAiModelService = new OfflineAiModelServiceClass();
