import { initLlama } from 'llama.rn';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { SystemNotificationService } from '../notifications/SystemNotificationService';
import { LocalVectorIndex, RetrievedChunk } from './LocalVectorIndex';

export type RagAnswer = {
  answer: string;
  sources: RetrievedChunk[];
};

/**
 * Strict local RAG. The LLM is given only retrieved note chunks and instructed
 * to decline anything not present in them; it is never a general chatbot.
 */
class StrictRagServiceClass {
  async answer(query: string): Promise<RagAnswer> {
    const sources = await LocalVectorIndex.search(query, 5);
    if (sources.length === 0) {
      return { answer: "I couldn't find that in your notes.", sources: [] };
    }

    const model = useSettingsStore.getState().llmModelUri;
    if (!model) {
      throw new Error('LLM_MODEL_NOT_CONFIGURED');
    }
    const context = await initLlama({
      model,
      n_ctx: 2048,
      n_threads: 2,
      n_gpu_layers: 0,
      use_mlock: false,
    });
    try {
      const retrievedContext = sources.map((source, index) =>
        `[Source ${index + 1}, note ${source.noteId}]\n${source.text}`
      ).join('\n\n');
      const result = await context.completion({
        messages: [{
          role: 'system',
          content: 'Answer ONLY using the retrieved note context. Do not use outside knowledge, assumptions, or general advice. If the answer is absent, say exactly: "I couldn\'t find that in your notes." For totals, calculate only numbers explicitly present in the context. Be concise and cite source numbers.',
        }, {
          role: 'user',
          content: `Retrieved note context:\n${retrievedContext}\n\nQuestion: ${query}`,
        }],
        n_predict: 220,
        temperature: 0,
        top_k: 1,
        top_p: 1,
      });
      const answer = result.text.trim() || "I couldn't find that in your notes.";
      await SystemNotificationService.notify({
        title: 'Offline AI response ready',
        body: answer.slice(0, 160),
        noteId: sources[0].noteId,
      });
      return { answer, sources };
    } finally {
      await context.release();
    }
  }
}

export const StrictRagService = new StrictRagServiceClass();
