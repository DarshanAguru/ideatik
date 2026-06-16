/**
 * SearchService - Provides comprehensive search and filtering capabilities
 * Supports: text search, tag filtering, date range, note type filtering
 */

import { NoteMetadata } from '../database/types';
import { NoteRepository } from '../database/NoteRepository';
import { StructuredNoteService } from '../notes/StructuredNoteService';

export interface SearchFilters {
  query?: string; // Text search in title + transcript
  tags?: string[]; // Filter by tag IDs (OR operation)
  type?: 'note' | 'list' | 'finance' | null; // Filter by type
  dateFrom?: number; // Timestamp in ms
  dateTo?: number; // Timestamp in ms
  sortBy?: 'recent' | 'oldest' | 'alphabetical';
}

export interface SearchResult {
  notes: NoteMetadata[];
  totalCount: number;
  appliedFilters: SearchFilters;
}

class SearchServiceClass {
  /**
   * Perform comprehensive search with multiple filter types
   */
  async search(filters: SearchFilters = {}): Promise<SearchResult> {
    try {
      await NoteRepository.initialize();
      
      // Get all non-deleted notes
      let allNotes = await NoteRepository.findAll();

      // Apply text search (title + transcript + structured body/items)
      if (filters.query) {
        const q = filters.query.toLowerCase();
        allNotes = allNotes.filter(note => {
          const structured = StructuredNoteService.fromNote(note);
          const titleMatch = note.title.toLowerCase().includes(q);
          const transcriptMatch = note.transcript.toLowerCase().includes(q);
          const bodyMatch = StructuredNoteService.bodyText(structured).toLowerCase().includes(q);
          const itemMatch = StructuredNoteService.items(structured).some((item) => item.text.toLowerCase().includes(q));
          return titleMatch || transcriptMatch || bodyMatch || itemMatch;
        });
      }

      // Apply tag filter (OR: note has any of the specified tags)
      if (filters.tags && filters.tags.length > 0) {
        allNotes = allNotes.filter(note => {
          return filters.tags!.some(tagId => note.tags.includes(tagId));
        });
      }

      // Apply type filter
      if (filters.type) {
        allNotes = allNotes.filter(note => note.type === filters.type);
      }

      // Apply date range filter
      if (filters.dateFrom !== undefined) {
        allNotes = allNotes.filter(note => note.createdAt >= filters.dateFrom!);
      }
      if (filters.dateTo !== undefined) {
        allNotes = allNotes.filter(note => note.createdAt <= filters.dateTo!);
      }

      // Apply sorting
      const sorted = this.sortNotes(allNotes, filters.sortBy || 'recent');

      return {
        notes: sorted,
        totalCount: sorted.length,
        appliedFilters: filters,
      };
    } catch (error) {
      console.error('SearchService: Error performing search:', error);
      return {
        notes: [],
        totalCount: 0,
        appliedFilters: filters,
      };
    }
  }

  sortNotes(
    notes: NoteMetadata[],
    sortBy: 'recent' | 'oldest' | 'alphabetical'
  ): NoteMetadata[] {
    const sorted = [...notes];

    switch (sortBy) {
      case 'recent':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'oldest':
        sorted.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case 'alphabetical':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }

    return sorted;
  }

  /**
   * Search by tag only
   */
  async findByTag(tagId: string): Promise<NoteMetadata[]> {
    return (await this.search({ tags: [tagId] })).notes;
  }

  /**
   * Search by type only
   */
  async findByType(type: 'note' | 'list' | 'finance'): Promise<NoteMetadata[]> {
    return (await this.search({ type })).notes;
  }

  /**
   * Search by date range
   */
  async findByDateRange(from: Date, to: Date): Promise<NoteMetadata[]> {
    return (
      await this.search({
        dateFrom: from.getTime(),
        dateTo: to.getTime(),
      })
    ).notes;
  }

  /**
   * Get notes created today
   */
  async findToday(): Promise<NoteMetadata[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return (
      await this.search({
        dateFrom: startOfDay.getTime(),
        dateTo: endOfDay.getTime(),
      })
    ).notes;
  }

  /**
   * Get notes from the last N days
   */
  async findLastNDays(days: number): Promise<NoteMetadata[]> {
    const now = Date.now();
    const nDaysAgo = now - days * 24 * 60 * 60 * 1000;

    return (await this.search({ dateFrom: nDaysAgo })).notes;
  }
}

export const SearchService = new SearchServiceClass();
