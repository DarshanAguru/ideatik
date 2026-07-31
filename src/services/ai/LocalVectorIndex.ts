/**
 * LocalVectorIndex.ts
 *
 * On-device semantic search index built on top of llama.rn embeddings.
 *
 * How it works:
 *   1. When a note is saved, `schedule(noteId)` is called.
 *   2. After a 500 ms debounce, `flush()` runs the pending queue off the
 *      main thread via InteractionManager.
 *   3. Each note's text is split into ~560-character word-boundary chunks.
 *   4. Each chunk is embedded using the user-supplied GGUF embedding model
 *      (e.g. BGE base-en-v1.5 Q4_K_M).
 *   5. Vectors are stored in SQLite as compact base64-encoded Float32 binary
 *      (~4× smaller than JSON arrays).
 *   6. At search time, the query is embedded and scored against all stored
 *      vectors using cosine similarity, blended with a keyword hit ratio.
 *
 * Content hashing:
 *   A FNV-1a fingerprint of the full note text is stored with every chunk.
 *   If the note hasn't changed since the last index run, no re-embedding
 *   occurs — skipping expensive model inference.
 *
 * Model lifecycle:
 *   `withEmbeddingContext` opens the model, runs the requested work, then
 *   always releases the context. This keeps peak RAM low and avoids
 *   the device staying hot between indexing jobs.
 */
import { InteractionManager } from 'react-native';
import { initLlama } from 'llama.rn';
import { Buffer } from 'buffer';
import { DatabaseService } from '../database/DatabaseService';
import { NoteRepository } from '../database/NoteRepository';
import { StructuredNoteService } from '../notes/StructuredNoteService';
import { useSettingsStore } from '../../features/settings/settingsStore';

/**
 * Encode a float32 number array as a base64 binary string.
 *
 * Rationale: JSON.stringify([...768 floats]) produces ~12 KB per chunk.
 * A Float32 binary buffer for the same vector is only 3072 bytes, and
 * base64-encoding that adds ~33% overhead → ~4 KB. ~3–4× storage saving.
 */
const encodeVector = (v: number[]): string => {
  const buf = Buffer.allocUnsafe(v.length * 4);
  for (let i = 0; i < v.length; i++) buf.writeFloatLE(v[i], i * 4);
  return buf.toString('base64');
};

/**
 * Decode a base64 binary string back to a float32 number array.
 * Inverse of `encodeVector`.
 */
const decodeVector = (b64: string): number[] => {
  const buf = Buffer.from(b64, 'base64');
  const len = Math.floor(buf.length / 4); // 4 bytes per float32
  const v: number[] = new Array(len);
  for (let i = 0; i < len; i++) v[i] = buf.readFloatLE(i * 4);
  return v;
};

export type RetrievedChunk = {
  noteId: string;
  text: string;
  score: number;
  title?: string;
  type?: 'note' | 'list' | 'finance';
};

/**
 * L2-normalises a vector so cosine similarity can be computed with a
 * simple dot product (dot product of two unit vectors = cosine similarity).
 */
const normalize = (vector: number[]) => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
};

/**
 * Opens the embedding model, executes `work` with the context, then always
 * releases the context — even if `work` throws. This keeps peak RAM low
 * because the model is only loaded when actively needed.
 *
 * Throws `EMBEDDING_MODEL_NOT_CONFIGURED` if no model URI is set, which the
 * caller uses as a signal to silently skip indexing (model not downloaded yet).
 */
const withEmbeddingContext = async <T>(work: (context: any) => Promise<T>): Promise<T> => {
  const model = useSettingsStore.getState().embeddingModelUri;
  if (!model) throw new Error('EMBEDDING_MODEL_NOT_CONFIGURED');
  const context = await initLlama({
    model,
    embedding: true,
    n_ctx: 768,       // context window (enough for a single ~560-char chunk)
    n_threads: 2,     // limit threads to avoid thermal throttling
    n_gpu_layers: 0,  // CPU-only — no GPU on most Android devices
  });
  try {
    return await work(context);
  } finally {
    await context.release();
  }
};

/**
 * Embeds a single text string and returns the L2-normalised vector.
 * Reuses an already-open `context` to avoid model reload overhead.
 */
const embedWithContext = async (context: any, text: string): Promise<number[]> => {
  const result = await context.embedding(text);
  return normalize(result.embedding);
};

/**
 * Fast non-cryptographic FNV-1a hash of a string, used as a content
 * fingerprint to detect whether a note has changed since the last index run.
 *
 * Format: "<hash>:<length>" — including text length makes collisions harder.
 */
const fingerprint = (text: string) => {
  let hash = 2166136261; // FNV offset basis
  for (let index = 0; index < text.length; index += 1)
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); // FNV prime
  return `${hash >>> 0}:${text.length}`;
};

/**
 * Splits a long text into overlapping word-boundary chunks of at most `size`
 * characters. Chunk boundaries fall on word edges, not mid-word, to preserve
 * semantic coherence for the embedding model.
 *
 * @param size - Approximate max character count per chunk (default 560,
 *               chosen to fit comfortably in the 768-token context window
 *               of the BGE base model at ~4 chars/token).
 */
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
  // In-memory set of noteIds waiting to be embedded
  private pending = new Set<string>();

  // In-memory set of noteIds currently being embedded (for status reporting)
  private active = new Set<string>();

  // Debounce timer handle — resets on every `schedule()` call
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Queues a single note for (re-)indexing after a 500 ms debounce.
   *
   * The debounce prevents a rapid sequence of saves (e.g. autosave every 5 s
   * during recording) from triggering N separate embedding runs. The job is
   * also persisted to SQLite so it survives an app restart.
   */
  schedule(noteId: string): void {
    this.pending.add(noteId);

    // Persist the job so it's recovered on next app launch if we crash
    void DatabaseService.initialize()
      .then(() => DatabaseService.execute(
        'INSERT OR REPLACE INTO vector_index_jobs (noteId, queuedAt) VALUES (?, ?);',
        [noteId, Date.now()]
      ))
      .catch((error) => console.warn('LocalVectorIndex: failed to queue index job', error));

    // Debounce: reset the timer so rapid saves don't trigger many embeddings
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      // Run after UI interactions to avoid frame drops
      InteractionManager.runAfterInteractions(() => this.flush());
    }, 500);
  }

  /**
   * Queues all existing notes for re-indexing.
   * Called when the embedding model is first installed so all pre-existing
   * notes get indexed without the user having to edit each one.
   */
  async scheduleAll(): Promise<void> {
    const notes = await NoteRepository.findAll();
    notes.forEach((note) => this.pending.add(note.id));
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      InteractionManager.runAfterInteractions(() => this.flush());
    }, 0);
  }

  /**
   * Restores any jobs that were queued but not yet completed when the app
   * was last closed. Called once on app startup from BackgroundTaskManager.
   */
  async resumePending(): Promise<void> {
    await DatabaseService.initialize();
    const jobs = await DatabaseService.execute('SELECT noteId FROM vector_index_jobs ORDER BY queuedAt ASC;');
    jobs.forEach((job) => this.pending.add(job.noteId));
    if (jobs.length > 0) InteractionManager.runAfterInteractions(() => this.flush());
  }

  /**
   * Processes all pending index jobs sequentially.
   * Running them one at a time avoids multiple concurrent model loads
   * which would cause OOM crashes on low-RAM devices.
   *
   * If the embedding model is not configured, jobs are silently dropped
   * (the user hasn't downloaded the model yet — not an error).
   */
  private async flush(): Promise<void> {
    const noteIds = [...this.pending];
    this.pending.clear();
    for (const noteId of noteIds) {
      this.active.add(noteId);
      try {
        await this.indexNote(noteId);
      } catch (error) {
        // Silently skip if the model isn't installed yet
        if (!(error instanceof Error) || error.message !== 'EMBEDDING_MODEL_NOT_CONFIGURED') {
          console.warn('LocalVectorIndex: failed to index note', noteId, error);
        }
      } finally {
        this.active.delete(noteId);
        // Remove the job from the persistence queue regardless of success/failure
        try {
          await DatabaseService.execute('DELETE FROM vector_index_jobs WHERE noteId = ?;', [noteId]);
        } catch {}
      }
    }
  }

  /** Removes all stored vectors and pending jobs. Used by "Wipe Local Data". */
  async clearAll(): Promise<void> {
    await DatabaseService.initialize();
    await DatabaseService.execute('DELETE FROM note_vectors;');
    await DatabaseService.execute('DELETE FROM vector_index_jobs;');
    this.pending.clear();
    this.active.clear();
  }

  /**
   * Removes all vector chunks for a specific note and cancels any pending
   * index job for it. Called when a note is deleted so vector storage doesn't
   * grow unboundedly with stale data.
   */
  async removeNote(noteId: string): Promise<void> {
    await DatabaseService.initialize();
    await DatabaseService.execute('DELETE FROM note_vectors WHERE noteId = ?;', [noteId]);
    await DatabaseService.execute('DELETE FROM vector_index_jobs WHERE noteId = ?;', [noteId]);
    this.pending.delete(noteId);
    this.active.delete(noteId);
  }

  /**
   * Returns the set of noteIds that have at least one vector chunk stored.
   * Used by the UI to show a silent "AI-ready ✨" indicator on note cards.
   */
  async getIndexedNoteIds(): Promise<Set<string>> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT DISTINCT noteId FROM note_vectors;');
    return new Set<string>(rows.map((r: any) => r.noteId as string));
  }

  /** Returns noteIds currently queued or actively being embedded. */
  async getPendingNoteIds(): Promise<Set<string>> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT noteId FROM vector_index_jobs;');
    const set = new Set<string>(rows.map((r: any) => r.noteId as string));
    // Include in-memory state too — DB jobs might not be persisted yet
    this.pending.forEach((id) => set.add(id));
    this.active.forEach((id) => set.add(id));
    return set;
  }

  /**
   * Embeds a single note and stores all its chunks in the vector DB.
   *
   * The note's full searchable text is assembled from:
   *   - Title
   *   - Body text (plain text extracted from structured content)
   *   - Checklist / finance item labels
   *   - Linked reference titles
   *
   * If the content fingerprint hasn't changed, this is a no-op (no
   * re-embedding needed). Deleted or locked notes have their vectors
   * removed instead.
   */
  async indexNote(noteId: string): Promise<void> {
    await DatabaseService.initialize();
    const note = await NoteRepository.findById(noteId);

    // Remove vectors for deleted/locked notes — they shouldn't be searchable
    if (!note || note.isDeleted || note.isLocked) {
      await DatabaseService.execute('DELETE FROM note_vectors WHERE noteId = ?;', [noteId]);
      return;
    }

    const structured = StructuredNoteService.fromNote(note);

    // Build a human-readable string for each checklist/finance item
    const itemText = StructuredNoteService.items(structured)
      .map((item) => `${item.checked ? 'completed' : 'open'} ${item.text}${item.amount === undefined ? '' : ` ${item.amount}`}`)
      .join('\n');

    // Flatten all linked reference titles into a single searchable string
    const refs = [
      ...(note.references || []),
      ...(structured.referenceIds || []).map((r) => r.title),
    ].filter(Boolean);
    const refText = refs.length > 0 ? `Cross-References: ${refs.join(', ')}` : '';

    // Full searchable source text for this note
    const source = [note.title, StructuredNoteService.bodyText(structured), itemText, refText].filter(Boolean).join('\n\n');

    // Skip re-embedding if the note content hasn't changed
    const contentHash = fingerprint(source);
    const existing = await DatabaseService.execute('SELECT contentHash FROM note_vectors WHERE noteId = ? LIMIT 1;', [noteId]);
    if (existing.length > 0 && existing[0].contentHash === contentHash) return;

    // Delete stale chunks before inserting fresh ones
    await DatabaseService.execute('DELETE FROM note_vectors WHERE noteId = ?;', [noteId]);

    const chunks = splitIntoChunks(source);
    await withEmbeddingContext(async (context) => {
      for (let index = 0; index < chunks.length; index += 1) {
        const vector = await embedWithContext(context, chunks[index]);
        await DatabaseService.execute(
          'INSERT INTO note_vectors (chunkId, noteId, text, vectorJson, contentHash, updatedAt) VALUES (?, ?, ?, ?, ?, ?);',
          // Store vector as compact base64 Float32 binary (~4× smaller than JSON)
          [`${noteId}:${index}`, noteId, chunks[index], encodeVector(vector), contentHash, Date.now()]
        );
      }
    });
  }

  /**
   * Runs a hybrid semantic + keyword search across all indexed notes.
   *
   * Scoring:
   *   finalScore = (cosineSimilarity × 0.65) + (keywordHitRatio × 0.35)
   *
   * The 65/35 split was chosen empirically: pure vector search can miss
   * exact proper nouns (names, abbreviations), while pure keyword search
   * misses paraphrased intent. The blend covers both cases reasonably well.
   *
   * @param query  - Natural language search query.
   * @param limit  - Maximum number of chunks to return (default 6).
   */
  async search(query: string, limit = 6): Promise<RetrievedChunk[]> {
    await DatabaseService.initialize();
    const rows = await DatabaseService.execute('SELECT noteId, text, vectorJson FROM note_vectors;');

    // Extract significant keywords (>2 chars) for the keyword component of hybrid scoring
    const keywords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2);

    return withEmbeddingContext(async (context) => {
      const queryVector = await embedWithContext(context, query);

      const results = rows.map((row) => {
        // Decode compact binary vector and compute cosine similarity
        const vector = decodeVector(row.vectorJson);
        const vectorScore = vector.reduce((sum, value, index) => sum + value * queryVector[index], 0);

        // Keyword score: fraction of query keywords that appear in this chunk
        const textLower = row.text.toLowerCase();
        let keywordHits = 0;
        for (const kw of keywords) {
          if (textLower.includes(kw)) keywordHits += 1;
        }
        const keywordScore = keywords.length > 0 ? keywordHits / keywords.length : 0;

        // Hybrid score: weighted blend of semantic and lexical relevance
        const finalScore = (vectorScore * 0.65) + (keywordScore * 0.35);
        return { noteId: row.noteId, text: row.text, score: finalScore };
      });

      return results
        .filter((result) => result.score > 0.05) // drop near-zero relevance results
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    });
  }
}

export const LocalVectorIndex = new LocalVectorIndexClass();
