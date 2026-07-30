import { InteractionManager } from 'react-native';
import { initLlama } from 'llama.rn';
import { DatabaseService } from '../database/DatabaseService';
import { NoteRepository } from '../database/NoteRepository';
import { StructuredNoteService } from '../notes/StructuredNoteService';
import { useSettingsStore } from '../../features/settings/settingsStore';

export type RetrievedChunk = {
  noteId: string;
  text: string;
  score: number;
  title?: string;
  type?: 'note' | 'list' | 'finance';
};

const normalize = (vector: number[]) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
};

/**
 * Opens the small embedding model for one bounded job and always releases it.
 * A batch shares one context, avoiding repeated allocations, heat, and disk I/O.
 */
const withEmbeddingContext = async <T>(work: (context: any) => Promise<T>): Promise<T> => {
  const model = useSettingsStore.getState().embeddingModelUri;
  if (!model) throw new Error('EMBEDDING_MODEL_NOT_CONFIGURED');
  const context = await initLlama({
    model,
    embedding: true,
    n_ctx: 768,
    n_threads: 2,
    n_gpu_layers: 0,
  });
  try {
    return await work(context);
  } finally {
    await context.release();
  }
};

const embedWithContext = async (context: any, text: string): Promise<number[]> => {
  const result = await context.embedding(text);
  return normalize(result.embedding);
};

const fingerprint = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${hash >>> 0}:${text.length}`;
};

const splitIntoChunks = (text: string, size = 560): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = '';
  for (const word of words) {
    if (chunk.length + word.length + 1 > size && chunk) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += `${chunk ? ' ' : ''}${word}`;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
};

class LocalVectorIndexClass {
  private pending = new Set<string>();
  private active = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  schedule(noteId: string): void {
    this.pending.add(noteId);
    void DatabaseService.initialize()
      .then(() => DatabaseService.execute(
        'INSERT OR REPLACE INTO vector_index_jobs (noteId, queuedAt) VALUES (?, ?);',
        [noteId, Date.now()]
      ))
      .catch((error) => console.warn('LocalVectorIndex: failed to queue index job', error));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      InteractionManager.runAfterInteractions(() => this.flush());
    }, 500);
  }

  async scheduleAll(): Promise<void> {
    const notes = await NoteRepository.findAll();
    notes.forEach((note) => this.pending.add(note.id));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      InteractionManager.runAfterInteractions(() => this.flush());
    }, 0);
  }

  async resumePending(): Promise<void> {
    await DatabaseService.initialize();
    const jobs = await DatabaseService.execute('SELECT noteId FROM vector_index_jobs ORDER BY queuedAt ASC;');
    jobs.forEach((job) => this.pending.add(job.noteId));
    if (jobs.length > 0) InteractionManager.runAfterInteractions(() => this.flush());
  }

  private async flush(): Promise<void> {
    const noteIds = [...this.pending];
    this.pending.clear();
    for (const noteId of noteIds) {
      this.active.add(noteId);
      try {
        await this.indexNote(noteId);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'EMBEDDING_MODEL_NOT_CONFIGURED') {
          console.warn('LocalVectorIndex: failed to index note', noteId, error);
        }
      } finally {
        this.active.delete(noteId);
        try {
          await DatabaseService.execute('DELETE FROM vector_index_jobs WHERE noteId = ?;', [noteId]);
        } catch {}
      }
    }
  }

  async clearAll(): Promise<void> {
    await DatabaseService.initialize();
    await DatabaseService.execute('DELETE FROM note_vectors;');
    await DatabaseService.execute('DELETE FROM vector_index_jobs;');
    this.pending.clear();
    this.active.clear();
  }

  /** Returns the set of noteIds that have at least one vector chunk stored.
   *  Used by the UI to show a silent "AI-ready" indicator on each card.
   */
  async getIndexedNoteIds(): Promise<Set<string>> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT DISTINCT noteId FROM note_vectors;');
    return new Set<string>(rows.map((r: any) => r.noteId as string));
  }

  /** Returns the set of noteIds currently queued or actively being indexed into vector DB. */
  async getPendingNoteIds(): Promise<Set<string>> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT noteId FROM vector_index_jobs;');
    const set = new Set<string>(rows.map((r: any) => r.noteId as string));
    this.pending.forEach((id) => set.add(id));
    this.active.forEach((id) => set.add(id));
    return set;
  }

  async indexNote(noteId: string): Promise<void> {
    await DatabaseService.initialize();
    const note = await NoteRepository.findById(noteId);
    if (!note || note.isDeleted || note.isLocked) {
      await DatabaseService.execute('DELETE FROM note_vectors WHERE noteId = ?;', [noteId]);
      return;
    }
    const structured = StructuredNoteService.fromNote(note);
    const itemText = StructuredNoteService.items(structured)
      .map((item) => `${item.checked ? 'completed' : 'open'} ${item.text}${item.amount === undefined ? '' : ` ${item.amount}`}`)
      .join('\n');
    const refs = [
      ...(note.references || []),
      ...(structured.referenceIds || []).map((r) => r.title),
    ].filter(Boolean);
    const refText = refs.length > 0 ? `Cross-References: ${refs.join(', ')}` : '';
    const source = [note.title, StructuredNoteService.bodyText(structured), itemText, refText].filter(Boolean).join('\n\n');
    const contentHash = fingerprint(source);
    const existing = await DatabaseService.execute('SELECT contentHash FROM note_vectors WHERE noteId = ? LIMIT 1;', [noteId]);
    if (existing.length > 0 && existing[0].contentHash === contentHash) return;

    await DatabaseService.execute('DELETE FROM note_vectors WHERE noteId = ?;', [noteId]);
    const chunks = splitIntoChunks(source);
    await withEmbeddingContext(async (context) => {
      for (let index = 0; index < chunks.length; index += 1) {
        const vector = await embedWithContext(context, chunks[index]);
        await DatabaseService.execute(
          'INSERT INTO note_vectors (chunkId, noteId, text, vectorJson, contentHash, updatedAt) VALUES (?, ?, ?, ?, ?, ?);',
          [`${noteId}:${index}`, noteId, chunks[index], JSON.stringify(vector), contentHash, Date.now()]
        );
      }
    });
  }

  async search(query: string, limit = 6): Promise<RetrievedChunk[]> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT noteId, text, vectorJson FROM note_vectors;');
    const keywords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);

    return withEmbeddingContext(async (context) => {
      const queryVector = await embedWithContext(context, query);
      const results = rows.map((row) => {
        const vector = JSON.parse(row.vectorJson) as number[];
        const vectorScore = vector.reduce((sum, value, index) => sum + value * queryVector[index], 0);

        // Keyword score: check how many keywords appear in chunk text
        const textLower = row.text.toLowerCase();
        let keywordHits = 0;
        for (const kw of keywords) {
          if (textLower.includes(kw)) keywordHits += 1;
        }
        const keywordScore = keywords.length > 0 ? keywordHits / keywords.length : 0;

        // Final hybrid score combining vector similarity & exact keyword overlap
        const finalScore = (vectorScore * 0.65) + (keywordScore * 0.35);
        return { noteId: row.noteId, text: row.text, score: finalScore };
      });

      return results
        .filter((result) => result.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    });
  }
}

export const LocalVectorIndex = new LocalVectorIndexClass();
