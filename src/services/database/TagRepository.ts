import { DatabaseService } from './DatabaseService';
import { Tag } from './tagTypes';

class TagRepositoryClass {
  private tags: Map<string, Tag> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadAllTags();
    this.initialized = true;
  }

  private async loadAllTags(): Promise<void> {
    try {
      const rows = await DatabaseService.execute(
        'SELECT * FROM tags ORDER BY createdAt DESC;'
      );
      this.tags.clear();
      rows.forEach((row) => {
        this.tags.set(row.id, {
          id: row.id,
          name: row.name,
          color: row.color,
          createdAt: row.createdAt,
        });
      });
    } catch (e) {
      console.warn('Error loading tags:', e);
      // Table might not exist yet, create it
      await this.createTableIfNeeded();
    }
  }

  private async createTableIfNeeded(): Promise<void> {
    try {
      await DatabaseService.execute(`
        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL,
          createdAt INTEGER NOT NULL
        );
      `);
    } catch (e) {
      console.error('Error creating tags table:', e);
    }
  }

  async getAll(): Promise<Tag[]> {
    await this.initialize();
    return Array.from(this.tags.values());
  }

  async getById(id: string): Promise<Tag | null> {
    await this.initialize();
    return this.tags.get(id) || null;
  }

  async create(name: string, color: string = '#8B5CF6'): Promise<Tag> {
    const id = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const tag: Tag = {
      id,
      name: name.trim(),
      color,
      createdAt: now,
    };

    try {
      await DatabaseService.execute(
        'INSERT INTO tags (id, name, color, createdAt) VALUES (?, ?, ?, ?);',
        [tag.id, tag.name, tag.color, tag.createdAt]
      );
      this.tags.set(id, tag);
      return tag;
    } catch (e) {
      console.error('Error creating tag:', e);
      throw e;
    }
  }

  async update(id: string, name?: string, color?: string): Promise<Tag | null> {
    const tag = this.tags.get(id);
    if (!tag) return null;

    const updated: Tag = {
      ...tag,
      name: name !== undefined ? name.trim() : tag.name,
      color: color !== undefined ? color : tag.color,
    };

    try {
      await DatabaseService.execute(
        'UPDATE tags SET name = ?, color = ? WHERE id = ?;',
        [updated.name, updated.color, id]
      );
      this.tags.set(id, updated);
      return updated;
    } catch (e) {
      console.error('Error updating tag:', e);
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Remove tag from all notes
      const notes = await DatabaseService.execute('SELECT id, tagsJson FROM notes;');
      for (const note of notes) {
        try {
          const tags = JSON.parse(note.tagsJson || '[]');
          const filtered = tags.filter((t: string) => t !== id);
          await DatabaseService.execute(
            'UPDATE notes SET tagsJson = ? WHERE id = ?;',
            [JSON.stringify(filtered), note.id]
          );
        } catch (e) {
          console.warn('Error removing tag from note:', e);
        }
      }

      // Delete the tag
      await DatabaseService.execute('DELETE FROM tags WHERE id = ?;', [id]);
      this.tags.delete(id);
    } catch (e) {
      console.error('Error deleting tag:', e);
      throw e;
    }
  }

  // Colors palette for quick tag creation
  static readonly COLOR_PALETTE = [
    '#EF4444', // red
    '#F97316', // orange
    '#FBBF24', // amber
    '#84CC16', // lime
    '#22C55E', // green
    '#10B981', // emerald
    '#14B8A6', // teal
    '#06B6D4', // cyan
    '#0EA5E9', // sky
    '#3B82F6', // blue
    '#6366F1', // indigo
    '#8B5CF6', // violet
    '#D946EF', // fuchsia
    '#EC4899', // pink
  ];

  static getColorForIndex(index: number): string {
    return this.COLOR_PALETTE[index % this.COLOR_PALETTE.length];
  }
}

export const TagRepository = new TagRepositoryClass();
