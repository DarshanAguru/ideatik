import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV();

const zustandStorage = {
  setItem: (name: string, value: string) => {
    storage.set(name, value);
  },
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => {
    storage.remove(name);
  },
};

export type ThemeMode = 'light' | 'dark';
export type NotesLayout = 'list' | 'grid';

interface SettingsState {
  themeMode: ThemeMode;
  notesLayout: NotesLayout;
  embeddingModelUri?: string;
  llmModelUri?: string;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setNotesLayout: (layout: NotesLayout) => void;
  setEmbeddingModelUri: (uri?: string) => void;
  setLlmModelUri: (uri?: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'light',
      notesLayout: 'list',
      embeddingModelUri: undefined,
      llmModelUri: undefined,
      toggleTheme: () =>
        set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
      setThemeMode: (themeMode) => set({ themeMode }),
      setNotesLayout: (notesLayout) => set({ notesLayout }),
      setEmbeddingModelUri: (embeddingModelUri) => set({ embeddingModelUri }),
      setLlmModelUri: (llmModelUri) => set({ llmModelUri }),
    }),
    {
      name: 'ideatik-settings-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
