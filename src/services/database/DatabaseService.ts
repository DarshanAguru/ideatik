import SQLite from 'react-native-sqlite-storage';
import { createMMKV } from 'react-native-mmkv';

class DatabaseServiceClass {
  private db: any = null;
  private mmkv: any = null;
  private isSqliteAvailable = false;
  private isInitialized = false;   // ← guard: skip re-init on every screen focus
  private mockStore: Record<string, any> = {};

  constructor() {
    try {
      this.mmkv = createMMKV({ id: 'ideatik-metadata-db' });
    } catch {
      // MMKV not available in node context (e.g. tests)
      this.mmkv = null;
    }
  }

  async initialize(): Promise<void> {
    // Guard: only initialise once per app session
    if (this.isInitialized) return;
    try {
      SQLite.enablePromise(true);
      this.db = await SQLite.openDatabase({
        name: 'ideatik.db',
        location: 'default',
      });
      
      // Create notes table
      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          markdownContent TEXT NOT NULL,
          structuredContentJson TEXT DEFAULT '',
          transcript TEXT NOT NULL,
          audioUri TEXT NOT NULL,
          referencesJson TEXT NOT NULL,
          referenceLinksJson TEXT DEFAULT '[]',
          pendingReferenceCommandsJson TEXT DEFAULT '[]',
          tagsJson TEXT DEFAULT '[]',
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          aiSummary TEXT,
          isDeleted INTEGER DEFAULT 0,
          isLocked INTEGER DEFAULT 0,
          transcriptionStatus TEXT DEFAULT 'idle',
          transcriptionError TEXT
        );
      `);

      await this.addColumnIfMissing('notes', 'structuredContentJson', "TEXT DEFAULT ''");
      await this.addColumnIfMissing('notes', 'isLocked', 'INTEGER DEFAULT 0');
      await this.addColumnIfMissing('notes', 'tagsJson', "TEXT DEFAULT '[]'");
      await this.addColumnIfMissing('notes', 'referenceLinksJson', "TEXT DEFAULT '[]'");
      await this.addColumnIfMissing('notes', 'pendingReferenceCommandsJson', "TEXT DEFAULT '[]'");
      await this.addColumnIfMissing('notes', 'transcriptionStatus', "TEXT DEFAULT 'idle'");
      await this.addColumnIfMissing('notes', 'transcriptionError', 'TEXT');

      await this.db.executeSql(`
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL,
          createdAt INTEGER NOT NULL
        );
      `);
      
      // Create indexes
      await this.db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(createdAt) WHERE isDeleted = 0;
      `);
      await this.db.executeSql(`
        CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type) WHERE isDeleted = 0;
      `);
      
      this.isSqliteAvailable = true;
      this.isInitialized = true;
      console.log('DatabaseService: SQLite initialized successfully.');
    } catch (e) {
      console.warn('DatabaseService: SQLite initialization failed. Using MMKV/memory fallback.', e);
      this.isSqliteAvailable = false;
    }
  }

  private async addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    } catch {
      // Column already exists.
    }
  }

  /**
   * Executes SQL query. Calls SQLite JSI driver or falls back to storage engines.
   */
  async execute(query: string, params: any[] = []): Promise<any[]> {
    if (this.isSqliteAvailable && this.db) {
      try {
        const [results] = await this.db.executeSql(query, params);
        const rows = [];
        for (let i = 0; i < results.rows.length; i++) {
          rows.push(results.rows.item(i));
        }
        return rows;
      } catch (e) {
        console.error('DatabaseService: SQLite execute error:', e);
        throw e;
      }
    } else {
      return this.executeMockFallback(query, params);
    }
  }

  private getNotes(): any[] {
    if (this.mmkv) {
      try {
        const data = this.mmkv.getString('notes');
        return data ? JSON.parse(data) : [];
      } catch {
        // Fallback to local store if MMKV throws
      }
    }
    if (!this.mockStore.notes) {
      this.mockStore.notes = [];
    }
    return this.mockStore.notes;
  }

  private saveNotes(notes: any[]): void {
    if (this.mmkv) {
      try {
        this.mmkv.set('notes', JSON.stringify(notes));
        return;
      } catch {
        // Fallback to local store if MMKV throws
      }
    }
    this.mockStore.notes = notes;
  }

  /**
   * Simple mock SQL execution runner for in-memory and MMKV testing.
   */
  private executeMockFallback(query: string, params: any[] = []): any[] {
    const sql = query.trim().replace(/\s+/g, ' ').toLowerCase();
    const notes = this.getNotes();

    // 1. SELECT ALL (active or deleted)
    if (sql.startsWith('select * from notes') && sql.includes('order by createdat desc')) {
      const activeOnly = sql.includes('isdeleted = 0');
      const filtered = activeOnly ? notes.filter((n) => !n.isDeleted) : notes;
      return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    }

    // 2. SELECT BY ID
    if (sql.startsWith('select * from notes') && sql.includes('where id =')) {
      const id = params[0];
      const found = notes.find((n) => n.id === id);
      return found ? [found] : [];
    }

    // 3. INSERT OR REPLACE
    if (sql.startsWith('insert or replace into notes') || sql.startsWith('insert into notes')) {
      const note = {
        id: params[0],
        title: params[1],
        type: params[2],
        markdownContent: params[3],
        structuredContentJson: params[4],
        transcript: params[5],
        audioUri: params[6],
        referencesJson: params[7],
        referenceLinksJson: params[8],
        pendingReferenceCommandsJson: params[9],
        tagsJson: params[10],
        createdAt: params[11],
        updatedAt: params[12],
        duration: params[13],
        aiSummary: params[14],
        isDeleted: params[15] === 1,
        isLocked: params[16] === 1,
        transcriptionStatus: params[17] || 'idle',
        transcriptionError: params[18],
      };
      
      const index = notes.findIndex((n) => n.id === note.id);
      if (index >= 0) {
        notes[index] = note;
      } else {
        notes.push(note);
      }
      this.saveNotes(notes);
      return [];
    }

    // 4. UPDATE SOFT-DELETE
    if (sql.startsWith('update notes set isdeleted')) {
      const isDeleted = sql.includes('isdeleted = 1');
      const id = params[0];
      const index = notes.findIndex((n) => n.id === id);
      if (index >= 0) {
        notes[index].isDeleted = isDeleted;
        notes[index].updatedAt = Date.now();
        this.saveNotes(notes);
      }
      return [];
    }

    // 5. HARD DELETE
    if (sql.startsWith('delete from notes')) {
      if (sql.includes('where id =')) {
        const id = params[0];
        const filtered = notes.filter((n) => n.id !== id);
        this.saveNotes(filtered);
      } else {
        this.saveNotes([]);
      }
      return [];
    }

    if (sql.startsWith('select * from tags')) {
      return [...(this.mockStore.tags || [])].sort((a, b) => b.createdAt - a.createdAt);
    }

    if (sql.startsWith('insert into tags')) {
      const tags = this.mockStore.tags || [];
      tags.push({
        id: params[0],
        name: params[1],
        color: params[2],
        createdAt: params[3],
      });
      this.mockStore.tags = tags;
      return [];
    }

    if (sql.startsWith('update tags set')) {
      const tags = this.mockStore.tags || [];
      const index = tags.findIndex((t: any) => t.id === params[2]);
      if (index >= 0) {
        tags[index] = { ...tags[index], name: params[0], color: params[1] };
      }
      this.mockStore.tags = tags;
      return [];
    }

    if (sql.startsWith('delete from tags')) {
      const tags = this.mockStore.tags || [];
      this.mockStore.tags = tags.filter((t: any) => t.id !== params[0]);
      return [];
    }

    if (sql.startsWith('select id, tagsjson from notes')) {
      return notes.map((n) => ({ id: n.id, tagsJson: n.tagsJson || '[]' }));
    }

    if (sql.startsWith('update notes set tagsjson')) {
      const index = notes.findIndex((n) => n.id === params[1]);
      if (index >= 0) {
        notes[index].tagsJson = params[0];
        notes[index].updatedAt = Date.now();
        this.saveNotes(notes);
      }
      return [];
    }

    return [];
  }

  async setMetadata(key: string, value: string): Promise<void> {
    if (this.mmkv) {
      this.mmkv.set(key, value);
    } else {
      this.mockStore[key] = value;
    }
  }

  async getMetadata(key: string): Promise<string | null> {
    if (this.mmkv) {
      return this.mmkv.getString(key) || null;
    }
    return this.mockStore[key] || null;
  }

  async deleteMetadata(key: string): Promise<void> {
    if (this.mmkv) {
      this.mmkv.remove(key);
    } else {
      delete this.mockStore[key];
    }
  }

  async clearAllData(): Promise<void> {
    try {
      // 1. Clear SQLite notes
      if (this.isSqliteAvailable && this.db) {
        await this.db.executeSql('DELETE FROM notes;');
      }
      
      // 2. Clear MMKV metadata
      if (this.mmkv) {
        this.mmkv.clearAll();
      }
      
      // 3. Clear file system folders
      const RNFS = require('react-native-fs');
      const audioDir = `${RNFS.DocumentDirectoryPath}/files/audio`;
      const notesDir = `${RNFS.DocumentDirectoryPath}/files/notes`;
      await RNFS.unlink(audioDir).catch(() => {});
      await RNFS.unlink(notesDir).catch(() => {});
      
      // Recreate empty dirs
      await RNFS.mkdir(audioDir).catch(() => {});
      await RNFS.mkdir(notesDir).catch(() => {});
      
      console.log('DatabaseService: Local data cleared successfully.');
    } catch (e) {
      console.error('DatabaseService: Failed to clear local data:', e);
      throw e;
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
