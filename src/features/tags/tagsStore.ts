import { create } from 'zustand';
import { Tag } from '../../services/database/tagTypes';
import { TagRepository } from '../../services/database/TagRepository';

interface TagsState {
  tags: Tag[];
  isLoading: boolean;

  loadTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<Tag>;
  updateTag: (id: string, name?: string, color?: string) => Promise<Tag | null>;
  deleteTag: (id: string) => Promise<void>;
  getTagById: (id: string) => Tag | null;
  getTagsByIds: (ids: string[]) => Tag[];
}

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: [],
  isLoading: false,

  loadTags: async () => {
    set({ isLoading: true });
    try {
      await TagRepository.initialize();
      const tags = await TagRepository.getAll();
      set({ tags, isLoading: false });
    } catch (e) {
      console.error('Error loading tags:', e);
      set({ isLoading: false });
    }
  },

  createTag: async (name: string, color?: string) => {
    try {
      const tag = await TagRepository.create(name, color);
      set((state) => ({
        tags: [tag, ...state.tags],
      }));
      return tag;
    } catch (e) {
      console.error('Error creating tag:', e);
      throw e;
    }
  },

  updateTag: async (id: string, name?: string, color?: string) => {
    try {
      const updated = await TagRepository.update(id, name, color);
      if (updated) {
        set((state) => ({
          tags: state.tags.map((t) => (t.id === id ? updated : t)),
        }));
      }
      return updated;
    } catch (e) {
      console.error('Error updating tag:', e);
      throw e;
    }
  },

  deleteTag: async (id: string) => {
    try {
      await TagRepository.delete(id);
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
      }));
    } catch (e) {
      console.error('Error deleting tag:', e);
      throw e;
    }
  },

  getTagById: (id: string) => {
    return get().tags.find((t) => t.id === id) || null;
  },

  getTagsByIds: (ids: string[]) => {
    return get().tags.filter((t) => ids.includes(t.id));
  },
}));
