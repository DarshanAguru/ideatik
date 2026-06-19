import { create } from 'zustand';
import { NoteMetadata } from '../../services/database/types';
import { NoteRepository } from '../../services/database/NoteRepository';
import { DatabaseService } from '../../services/database/DatabaseService';
import { StorageSyncManager } from '../../services/database/StorageSyncManager';
import { StructuredNoteService } from '../../services/notes/StructuredNoteService';
import { SearchFilters, SearchService } from '../../services/search/SearchService';

export type NoteTab = 'all' | 'notes' | 'lists';

interface NotesState {
  notesList: NoteMetadata[];
  searchQuery: string;
  selectedTab: NoteTab;
  filters: SearchFilters;
  isLoading: boolean;
  pinnedOrder: string[];
  recentOrder: string[];

  setSearchQuery: (query: string) => void;
  setSelectedTab: (tab: NoteTab) => void;
  setFilters: (filters: SearchFilters) => void;
  loadNotes: () => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  purgeNote: (id: string) => Promise<void>;
  toggleChecklistItem: (noteId: string, itemId: string, checked: boolean) => Promise<void>;
  saveStructuredNote: (noteId: string, updates: { title?: string; bodyText?: string; tags?: string[] }) => Promise<void>;
  updateChecklistItems: (noteId: string, items: any[]) => Promise<void>;
  getFilteredNotes: () => NoteMetadata[];
  setPinnedOrder: (order: string[]) => Promise<void>;
  setRecentOrder: (order: string[]) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notesList: [],
  searchQuery: '',
  selectedTab: 'all',
  filters: {},
  isLoading: false,
  pinnedOrder: [],
  recentOrder: [],

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTab: (selectedTab) => set({ selectedTab }),
  setFilters: (filters) => set({ filters }),

  loadNotes: async () => {
    set({ isLoading: true });
    try {
      await NoteRepository.initialize();

      // Sync physical markdown files on disk to metadata index in SQLite
      await StorageSyncManager.syncDiskToMetadata();

      // Check for crashed draft recovery
      const draftId = await DatabaseService.getMetadata('active_draft_note_id');
      if (draftId) {
        const draftNote = await NoteRepository.findById(draftId);
        if (draftNote) {
          const title = draftNote.title === 'Untitled Capture' ? 'Recovered Note' : `${draftNote.title} [Recovered]`;
          await NoteRepository.save({
            id: draftId,
            title,
          });
        }
        await DatabaseService.deleteMetadata('active_draft_note_id');
      }

      // Fetch stored custom sort order
      const pinnedOrderStr = await DatabaseService.getMetadata('pinned_notes_order');
      const recentOrderStr = await DatabaseService.getMetadata('recent_notes_order');
      const pinnedOrder = pinnedOrderStr ? JSON.parse(pinnedOrderStr) : [];
      const recentOrder = recentOrderStr ? JSON.parse(recentOrderStr) : [];

      const list = await NoteRepository.findAll();
      set({ 
        notesList: list, 
        pinnedOrder, 
        recentOrder, 
        isLoading: false 
      });
    } catch (e) {
      console.error('notesStore: Error loading notes:', e);
      set({ isLoading: false });
    }
  },

  deleteNote: async (id) => {
    try {
      await NoteRepository.delete(id);
      await get().loadNotes();
    } catch (e) {
      console.error(`notesStore: Error deleting note ${id}:`, e);
    }
  },

  restoreNote: async (id) => {
    try {
      await NoteRepository.restore(id);
      await get().loadNotes();
    } catch (e) {
      console.error(`notesStore: Error restoring note ${id}:`, e);
    }
  },

  purgeNote: async (id) => {
    try {
      await NoteRepository.purge(id);
      await get().loadNotes();
    } catch (e) {
      console.error(`notesStore: Error purging note ${id}:`, e);
    }
  },

  toggleChecklistItem: async (noteId, itemId, checked) => {
    try {
      const note = await NoteRepository.findById(noteId);
      if (!note) return;

      const structured = StructuredNoteService.fromNote(note);
      const items = StructuredNoteService.items(structured);
      const updatedItems = items.map((item) => {
        if (item.id === itemId) {
          return { ...item, checked };
        }
        return item;
      });

      const nextStructured = {
        ...structured,
        listItems: structured.type === 'finance' ? structured.listItems : updatedItems,
        financeItems: structured.type === 'finance' ? updatedItems : structured.financeItems,
      };

      // Save updated note state
      await NoteRepository.save({
        id: noteId,
        structuredContentJson: StructuredNoteService.toJson(nextStructured),
        transcript: StructuredNoteService.bodyText(nextStructured),
        isLocked: note.isLocked,
        isPinned: note.isPinned,
      });

      // Reload lists
      await get().loadNotes();
    } catch (e) {
      console.error(`notesStore: Failed to toggle checkbox item ${itemId} in note ${noteId}:`, e);
    }
  },

  saveStructuredNote: async (noteId, updates) => {
    const note = await NoteRepository.findById(noteId);
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      title: updates.title !== undefined ? updates.title : structured.title,
      bodyBlocks: updates.bodyText !== undefined ? [updates.bodyText] : structured.bodyBlocks,
    });

    await NoteRepository.save({
      id: noteId,
      title: nextStructured.title,
      type: nextStructured.type,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
      referenceLinks: nextStructured.referenceIds,
      references: nextStructured.referenceIds.map((ref) => ref.title),
      pendingReferenceCommands: nextStructured.pendingReferenceCommands,
      tags: updates.tags !== undefined ? updates.tags : note.tags,
      isLocked: note.isLocked,
      isPinned: note.isPinned,
    });
    await get().loadNotes();
  },

  updateChecklistItems: async (noteId, items) => {
    const note = await NoteRepository.findById(noteId);
    if (!note) return;
    const structured = StructuredNoteService.fromNote(note);
    const nextStructured = StructuredNoteService.normalize({
      ...structured,
      listItems: structured.type === 'finance' ? structured.listItems : items,
      financeItems: structured.type === 'finance' ? items : structured.financeItems,
    });

    await NoteRepository.save({
      id: noteId,
      structuredContentJson: StructuredNoteService.toJson(nextStructured),
      transcript: StructuredNoteService.bodyText(nextStructured),
      isLocked: note.isLocked,
      isPinned: note.isPinned,
    });
    await get().loadNotes();
  },

  setPinnedOrder: async (order) => {
    set({ pinnedOrder: order });
    await DatabaseService.setMetadata('pinned_notes_order', JSON.stringify(order));
  },

  setRecentOrder: async (order) => {
    set({ recentOrder: order });
    await DatabaseService.setMetadata('recent_notes_order', JSON.stringify(order));
  },

  getFilteredNotes: () => {
    const { notesList, searchQuery, selectedTab, filters } = get();
    
    const filtered = notesList.filter((note) => {
      // 1. Tab Filter
      if (selectedTab === 'notes' && note.type !== 'note') return false;
      if (selectedTab === 'lists' && note.type !== 'list' && note.type !== 'finance') return false;
      if (filters.type && note.type !== filters.type) return false;
      if (filters.tags && filters.tags.length > 0 && !filters.tags.some((tag) => note.tags.includes(tag))) return false;
      if (filters.dateFrom !== undefined && note.createdAt < filters.dateFrom) return false;
      if (filters.dateTo !== undefined && note.createdAt > filters.dateTo) return false;

      // 2. Search query filter
      const query = (filters.query || searchQuery).trim();
      if (query === '') return true;

      const structured = StructuredNoteService.fromNote(note);
      const q = query.toLowerCase();
      const matchTitle = note.title.toLowerCase().includes(q);
      const matchTranscript = note.transcript.toLowerCase().includes(q);
      const matchBody = StructuredNoteService.bodyText(structured).toLowerCase().includes(q);
      const matchItems = StructuredNoteService.items(structured).some((item) => item.text.toLowerCase().includes(q));

      return matchTitle || matchTranscript || matchBody || matchItems;
    });

    return SearchService.sortNotes(filtered, filters.sortBy || 'recent');
  },
}));
