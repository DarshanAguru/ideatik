/**
 * NoteRepository.ts
 *
 * Single source of truth for reading and writing note data.
 *
 * Storage model:
 *   - SQLite (`notes` table)  — stores all searchable metadata: id, title, type,
 *     transcription status, duration, tags, references, structured content JSON.
 *     markdownContent is stored as an empty string here (see note below).
 *   - Filesystem (`.md` files) — stores the canonical Markdown representation
 *     of each note under <DocumentDirectory>/files/notes/<id>.md.
 *   - Filesystem (`.wav` files) — stores recorded audio under
 *     <DocumentDirectory>/files/audio/<id>.wav.
 *
 * Why keep markdownContent off SQLite?
 *   Markdown can be megabytes for long notes. Storing it in SQLite doubles the
 *   write cost and inflates the DB file. StructuredNoteService.fromNote() always
 *   prefers `structuredContentJson`, so markdownContent in SQLite is redundant.
 *   When mapRowToNote() is called, markdownContent is regenerated from the
 *   in-memory structured data rather than re-read from disk.
 *
 * Save cache:
 *   `createdAt` and `audioUri` are looked up from an in-memory Map on each
 *   save to avoid a SQLite read on every autosave tick (which fires every 5 s
 *   during recording). The cache is invalidated on purge.
 */
import { DatabaseService } from './DatabaseService';
import { FilesystemService } from './FilesystemService';
import { NoteMetadata, NoteReference } from './types';
import { StructuredNoteService } from '../notes/StructuredNoteService';



class NoteRepositoryClass {
  // In-memory cache of (createdAt, audioUri) keyed by noteId.
  // Avoids a SQLite read on every autosave during recording.
  private saveCache = new Map<string, { createdAt: number; audioUri: string }>();

  /**
   * Initializes the underlying database driver.
   */
  async initialize(): Promise<void> {
    await DatabaseService.initialize();
  }

  /**
   * Saves note metadata to DB indexer and writes raw markdown contents to disk.
   * Relocates recording segment files to their permanent audio folders.
   */
  async save(note: Partial<NoteMetadata> & { id: string }): Promise<void> {
    try {
      const now = Date.now();
      const existingNote = await this.findById(note.id);
      
      // Try to get cached metadata to avoid SQLite read overhead
      let cached = this.saveCache.get(note.id);
      
      if (!cached && existingNote) {
          cached = {
            createdAt: existingNote.createdAt,
            audioUri: existingNote.audioUri,
          };
          this.saveCache.set(note.id, cached);
      }

      // Determine file path values
      let finalAudioUri = note.audioUri || (cached ? cached.audioUri : '');
      
      // If audioUri is a temporary WAV file, move it to permanent storage
      if (note.audioUri && (note.audioUri.includes('/tmp/') || !note.audioUri.includes('/files/audio/'))) {
        const movedPath = await FilesystemService.saveAudio(note.id, note.audioUri);
        if (movedPath) {
          finalAudioUri = movedPath;
        }
      }

      const structured = StructuredNoteService.fromNote({
        ...(existingNote || {}),
        ...note,
      });

      const type = note.type || (existingNote ? existingNote.type : (structured.type || 'note'));


      const title = await this.resolveUniqueTitle(note.id, note.title || structured.title, type);
      
      // Sync the resolved title back into structured note
      structured.title = title;

      const structuredContentJson = StructuredNoteService.toJson(structured);
      const mdContent = StructuredNoteService.toMarkdown(structured);

      // Write generated markdown file for compatibility/export only.
      await FilesystemService.writeMarkdown(note.id, mdContent);

      const transcript = note.transcript !== undefined ? note.transcript : StructuredNoteService.bodyText(structured);
      const referenceLinks = note.referenceLinks || structured.referenceIds || [];
      const references = note.references || referenceLinks.map((ref) => ref.title);
      const pendingReferenceCommands = note.pendingReferenceCommands || structured.pendingReferenceCommands || [];
      const tags = note.tags || (existingNote ? existingNote.tags : []);
      const createdAt = note.createdAt || (cached ? cached.createdAt : now);
      const duration = note.duration !== undefined ? note.duration : (existingNote ? existingNote.duration : 0);
      const aiSummary = note.aiSummary !== undefined ? note.aiSummary : (existingNote ? existingNote.aiSummary : undefined);
      const isDeleted = note.isDeleted !== undefined ? note.isDeleted : (existingNote ? existingNote.isDeleted : false);
      const isLocked = note.isLocked !== undefined ? note.isLocked : (existingNote ? existingNote.isLocked : false);
      const isPinned = note.isPinned !== undefined ? note.isPinned : (existingNote ? existingNote.isPinned : false);
      const transcriptionStatus = note.transcriptionStatus || (existingNote ? existingNote.transcriptionStatus : 'idle');
      const transcriptionError = note.transcriptionError !== undefined ? note.transcriptionError : (existingNote ? existingNote.transcriptionError : undefined);

      // Update cache
      this.saveCache.set(note.id, {
        createdAt,
        audioUri: finalAudioUri,
      });

      // Extract checklist and finance items from structured note, check for multi-word items, and add to dictionary
      try {
        const { useDictionaryStore } = require('../../features/dictionary/dictionaryStore');
        const items = [
          ...(structured.listItems || []),
          ...(structured.financeItems || []),
        ];
        for (const item of items) {
          if (item.text) {
            useDictionaryStore.getState().addWord(item.text);
          }
        }
      } catch (err) {
        console.warn('NoteRepository: Error syncing words to dictionary store:', err);
      }

      // Save metadata to SQLite.
      // markdownContent is intentionally stored empty here — the canonical file is already written
      // to disk by FilesystemService.writeMarkdown() above. StructuredNoteService.fromNote()
      // always prefers structuredContentJson, so this avoids doubling large text fields in SQLite.
      await DatabaseService.execute(
        `INSERT OR REPLACE INTO notes (
          id, title, type, markdownContent, structuredContentJson, transcript, audioUri, referencesJson,
          referenceLinksJson, pendingReferenceCommandsJson, tagsJson, createdAt, updatedAt, duration,
          aiSummary, isDeleted, isLocked, isPinned, transcriptionStatus, transcriptionError
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          note.id,
          title,
          type,
          '', // markdownContent: stored empty — canonical copy is on disk
          structuredContentJson,
          transcript,
          finalAudioUri,
          JSON.stringify(references),
          JSON.stringify(referenceLinks),
          JSON.stringify(pendingReferenceCommands),
          JSON.stringify(tags),
          createdAt,
          now,
          duration,
          aiSummary || null,
          isDeleted ? 1 : 0,
          isLocked ? 1 : 0,
          isPinned ? 1 : 0,
          transcriptionStatus,
          transcriptionError || null,
        ]
      );

      // Coalesced indexing runs after persistence, keeping the write path fast
      // and allowing retrieval to reuse vectors across app launches.
      try {
        const { LocalVectorIndex } = require('../ai/LocalVectorIndex');
        LocalVectorIndex.schedule(note.id);
      } catch (error) {
        console.warn('NoteRepository: Failed to schedule local indexing:', error);
      }
    } catch (e) {
      console.error(`NoteRepository: Failed to save note ${note.id}:`, e);
      throw e;
    }
  }

  /**
   * Fetches a note metadata record by its ID.
   */
  async findById(id: string): Promise<NoteMetadata | null> {
    try {
      const rows = await DatabaseService.execute(
        `SELECT * FROM notes WHERE id = ?;`,
        [id]
      );
      if (rows.length === 0) return null;
      return this.mapRowToNote(rows[0]);
    } catch (e) {
      console.error(`NoteRepository: Error finding note ${id}:`, e);
      return null;
    }
  }

  /**
   * Lists all active (non-soft-deleted) notes sorted by creation date descending.
   */
  async findAll(): Promise<NoteMetadata[]> {
    try {
      const rows = await DatabaseService.execute(
        `SELECT * FROM notes WHERE isDeleted = 0 ORDER BY createdAt DESC;`
      );
      return rows.map((row) => this.mapRowToNote(row));
    } catch (e) {
      console.error('NoteRepository: Error fetching notes:', e);
      return [];
    }
  }

  /**
   * Soft deletes a note by toggling its isDeleted flag.
   */
  async delete(id: string): Promise<void> {
    try {
      await this.purge(id);
    } catch (e) {
      console.error(`NoteRepository: Error deleting note ${id}:`, e);
      throw e;
    }
  }

  /**
   * Restores a soft-deleted note.
   */
  async restore(id: string): Promise<void> {
    try {
      await DatabaseService.execute(
        `UPDATE notes SET isDeleted = 0 WHERE id = ?;`,
        [id]
      );
    } catch (e) {
      console.error(`NoteRepository: Error restoring note ${id}:`, e);
      throw e;
    }
  }

  /**
   * Hard deletes note metadata from DB and unlinks all asset files from disk.
   */
  async purge(id: string): Promise<void> {
    try {
      this.saveCache.delete(id);
      await DatabaseService.execute(
        `DELETE FROM notes WHERE id = ?;`,
        [id]
      );
      await FilesystemService.deleteAssets(id);
      try {
        const { TranscriptionQueue } = require('../queue/TranscriptionQueue');
        await TranscriptionQueue.removeByNoteId(id);
      } catch (err) {
        console.warn('NoteRepository: Error removing from transcription queue:', err);
      }
      try {
        const { LocalVectorIndex } = require('../ai/LocalVectorIndex');
        await LocalVectorIndex.removeNote(id);
      } catch (err) {
        console.warn('NoteRepository: Error removing vector embeddings:', err);
      }
    } catch (e) {
      console.error(`NoteRepository: Error purging note assets ${id}:`, e);
      throw e;
    }
  }

  /**
   * Generates a unique, collision-proof title for a note by appending sequential numbers.
   */
  async resolveUniqueTitle(noteId: string, inputTitle: string | undefined, type: string): Promise<string> {
    const cleanInput = inputTitle ? inputTitle.trim() : '';
    let baseTitle = cleanInput;
    let isGeneratedDefault = false;

    const normalizedInput = cleanInput.toLowerCase();
    const isUntitled = !cleanInput || 
      normalizedInput === 'untitled capture' ||
      normalizedInput === 'untitled list' ||
      normalizedInput === 'untitled finance' ||
      normalizedInput === 'untitled note' ||
      normalizedInput === 'untitled' ||
      normalizedInput === 'untitled sync';

    if (isUntitled) {
      isGeneratedDefault = true;
      if (type === 'finance') {
        baseTitle = 'finance-list';
      } else if (type === 'list') {
        baseTitle = 'list';
      } else {
        baseTitle = 'note';
      }
    }

    const rows = await DatabaseService.execute(
      `SELECT title FROM notes WHERE id != ? AND isDeleted = 0 AND title LIKE ?;`,
      [noteId, `${baseTitle}%`]
    );
    
    const existingTitles = new Set<string>();
    if (rows && rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const titleVal = rows[i]?.title;
        if (titleVal) {
          existingTitles.add(titleVal.toLowerCase());
        }
      }
    }

    if (isGeneratedDefault) {
      let suffix = 1;
      while (true) {
        const candidate = `${baseTitle}-${suffix}`;
        if (!existingTitles.has(candidate.toLowerCase())) {
          return candidate;
        }
        suffix++;
      }
    } else {
      if (!existingTitles.has(baseTitle.toLowerCase())) {
        return baseTitle;
      }
      let suffix = 1;
      while (true) {
        const candidate = `${baseTitle}-${suffix}`;
        if (!existingTitles.has(candidate.toLowerCase())) {
          return candidate;
        }
        suffix++;
      }
    }
  }

  /**
   * Maps database raw row structure back to the typed NoteMetadata object.
   */
  private mapRowToNote(row: any): NoteMetadata {
    let refs: string[] = [];
    try {
      refs = JSON.parse(row.referencesJson || '[]');
    } catch {
      refs = [];
    }

    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tagsJson || '[]');
    } catch {
      tags = [];
    }

    let referenceLinks: NoteReference[] = [];
    try {
      referenceLinks = JSON.parse(row.referenceLinksJson || '[]');
    } catch {
      referenceLinks = refs.map((title) => ({ noteId: '', title }));
    }

    let pendingReferenceCommands: string[] = [];
    try {
      pendingReferenceCommands = JSON.parse(row.pendingReferenceCommandsJson || '[]');
    } catch {
      pendingReferenceCommands = [];
    }

    const structuredContentJson = row.structuredContentJson || '';
    const structured = StructuredNoteService.parseJson(structuredContentJson)
      || StructuredNoteService.fromMarkdown(row.markdownContent || '', row.title);
    const normalizedStructuredJson = structuredContentJson || StructuredNoteService.toJson({
      ...structured,
      referenceIds: referenceLinks.length > 0 ? referenceLinks : refs.map((title) => ({ noteId: '', title })),
      pendingReferenceCommands,
    });

    // Regenerate markdownContent from structured data (not stored in SQLite to save space)
    const markdownContent = row.markdownContent || StructuredNoteService.toMarkdown(structured);

    return {
      id: row.id,
      title: row.title,
      type: row.type as 'note' | 'list' | 'finance',
      markdownContent: row.markdownContent,
      structuredContentJson: normalizedStructuredJson,
      transcript: row.transcript,
      audioUri: row.audioUri,
      references: refs,
      referenceLinks,
      pendingReferenceCommands,
      tags: tags,
      createdAt: Number(row.createdAt),
      updatedAt: Number(row.updatedAt),
      duration: Number(row.duration),
      aiSummary: row.aiSummary || undefined,
      isDeleted: row.isDeleted === 1 || row.isDeleted === true,
      isLocked: row.isLocked === 1 || row.isLocked === true,
      isPinned: row.isPinned === 1 || row.isPinned === true,
      transcriptionStatus: row.transcriptionStatus || 'idle',
      transcriptionError: row.transcriptionError || undefined,
    };
  }
}

export const NoteRepository = new NoteRepositoryClass();
