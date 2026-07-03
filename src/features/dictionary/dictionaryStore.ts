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

export interface DictionaryItem {
  text: string;
  lastUsed: number;
  isDefault: boolean;
}

interface DictionaryState {
  dictionary: DictionaryItem[];
  addWord: (text: string) => void;
  getMultiWordItems: () => string[];
  cleanupUnusedWords: () => void;
}

const DEFAULT_MULTI_WORD_ITEMS = [
  'fresh milk', 'whole milk', 'almond milk', 'soy milk', 'coconut milk', 'oat milk', 'skim milk', 'skimmed milk',
  'large eggs', 'organic eggs', 'free range eggs',
  'toilet paper', 'paper towel', 'paper towels',
  'dark chocolate', 'milk chocolate', 'chocolate cake', 'chocolate chip', 'chocolate chips',
  'olive oil', 'coconut oil', 'vegetable oil', 'sunflower oil',
  'ice cream', 'peanut butter', 'cream cheese', 'sour cream',
  'brown bread', 'white bread', 'wheat bread', 'garlic bread',
  'green tea', 'black tea', 'herbal tea',
  'ground coffee', 'instant coffee',
  'orange juice', 'apple juice', 'grape juice', 'lemon juice',
  'sweet potato', 'sweet potatoes',
  'maple syrup', 'hot sauce', 'soy sauce', 'tomato sauce', 'pasta sauce',
  'bell pepper', 'bell peppers', 'black pepper', 'chili powder', 'garlic powder', 'onion powder',
  'greek yogurt', 'strawberry yogurt', 'blueberry yogurt',
  'body wash', 'hand soap', 'dish soap', 'laundry detergent', 'fabric softener',
  'dog food', 'cat food', 'pet food',
  'trash bag', 'trash bags', 'garbage bag', 'garbage bags',
  'red wine', 'white wine', 'craft beer',
  'french fries', 'potato chips', 'tortilla chips',
  'cleaning spray', 'window cleaner',
];

const CLEANUP_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const useDictionaryStore = create<DictionaryState>()(
  persist(
    (set, get) => ({
      dictionary: [],
      addWord: (text: string) => {
        const cleaned = text.trim().toLowerCase();
        // Only keep multi-word items (contains space)
        if (!cleaned || !cleaned.includes(' ')) return;

        const current = get().dictionary;
        
        // If dictionary is empty, inflate default items first
        let list = current.length > 0 ? [...current] : DEFAULT_MULTI_WORD_ITEMS.map(word => ({
          text: word,
          lastUsed: Date.now(),
          isDefault: true,
        }));

        const existingIdx = list.findIndex(item => item.text === cleaned);
        if (existingIdx !== -1) {
          const updated = { ...list[existingIdx], lastUsed: Date.now() };
          list[existingIdx] = updated;
        } else {
          list.push({
            text: cleaned,
            lastUsed: Date.now(),
            isDefault: false,
          });
        }
        set({ dictionary: list });
      },
      getMultiWordItems: () => {
        const current = get().dictionary;
        if (current.length === 0) {
          // If not inflated yet, return defaults
          return DEFAULT_MULTI_WORD_ITEMS;
        }
        return current.map(item => item.text);
      },
      cleanupUnusedWords: () => {
        const current = get().dictionary;
        if (current.length === 0) return;
        const now = Date.now();
        const cleanedList = current.filter(item => {
          if (item.isDefault) return true;
          return now - item.lastUsed < CLEANUP_THRESHOLD_MS;
        });
        set({ dictionary: cleanedList });
      },
    }),
    {
      name: 'ideatik-dictionary-storage',
      storage: createJSONStorage(() => zustandStorage),
      onRehydrateStorage: () => (state) => {
        // Inflate default items if the rehydrated state is empty
        if (state && state.dictionary.length === 0) {
          state.dictionary = DEFAULT_MULTI_WORD_ITEMS.map(word => ({
            text: word,
            lastUsed: Date.now(),
            isDefault: true,
          }));
        }
      },
    }
  )
);
