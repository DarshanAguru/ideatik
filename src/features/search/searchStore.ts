import { create } from 'zustand';
import { SearchService, SearchFilters, SearchResult } from '../../services/search/SearchService';

interface SearchState {
  results: SearchResult | null;
  isSearching: boolean;
  filters: SearchFilters;

  // Actions
  search: (filters: SearchFilters) => Promise<void>;
  clearSearch: () => void;
  setFilters: (filters: SearchFilters) => void;
  updateFilter: (key: keyof SearchFilters, value: any) => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  results: null,
  isSearching: false,
  filters: {},

  search: async (filters: SearchFilters) => {
    set({ isSearching: true, filters });
    try {
      const results = await SearchService.search(filters);
      set({ results, isSearching: false });
    } catch (error) {
      console.error('Error searching:', error);
      set({ isSearching: false });
    }
  },

  clearSearch: () => {
    set({
      results: null,
      filters: {},
      isSearching: false,
    });
  },

  setFilters: (filters: SearchFilters) => {
    set({ filters });
  },

  updateFilter: async (key: keyof SearchFilters, value: any) => {
    const currentFilters = get().filters;
    const newFilters = { ...currentFilters, [key]: value };
    await get().search(newFilters);
  },
}));
