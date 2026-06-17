import { DatabaseService } from './DatabaseService';
import { FilesystemService } from './FilesystemService';
import { NoteMetadata, NoteReference } from './types';
import { StructuredNoteService } from '../notes/StructuredNoteService';

function isDefaultTitle(title: string | undefined): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (
    t === 'untitled capture' ||
    t === 'untitled list' ||
    t === 'untitled finance' ||
    t === 'untitled note' ||
    t === 'untitled' ||
    t === 'untitled sync'
  ) {
    return true;
  }
  // Matches sequential defaults, e.g. note-1, list-5, finance-list-12, etc.
  if (/^(note|list|finance-list)-\d+$/.test(t)) {
    return true;
  }
  return false;
}

class NoteRepositoryClass {
  // In-memory cache of note metadata (createdAt and audioUri) to optimize high-frequency saves
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
      const structuredNote = StructuredNoteService.toStructuredNote(structured);

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
      const duration = note.duration !== undefined ? note.duration : 0;
      const aiSummary = note.aiSummary || undefined;
      const isDeleted = note.isDeleted !== undefined ? note.isDeleted : false;
      const isLocked = note.isLocked !== undefined ? note.isLocked : false;
      const transcriptionStatus = note.transcriptionStatus || (existingNote ? existingNote.transcriptionStatus : 'idle');
      const transcriptionError = note.transcriptionError || undefined;

      // Update cache
      this.saveCache.set(note.id, {
        createdAt,
        audioUri: finalAudioUri,
      });

      // Save metadata to SQLite
      await DatabaseService.execute(
        `INSERT OR REPLACE INTO notes (
          id, title, type, markdownContent, structuredContentJson, transcript, audioUri, referencesJson,
          referenceLinksJson, pendingReferenceCommandsJson, tagsJson, createdAt, updatedAt, duration,
          aiSummary, isDeleted, isLocked, transcriptionStatus, transcriptionError
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          note.id,
          title,
          type,
          mdContent,
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
          transcriptionStatus,
          transcriptionError || null,
        ]
      );
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
      transcriptionStatus: row.transcriptionStatus || 'idle',
      transcriptionError: row.transcriptionError || undefined,
    };
  }
}

export const NoteRepository = new NoteRepositoryClass();
