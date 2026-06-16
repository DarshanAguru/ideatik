import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({
  id: 'ideatik-security-storage-keys',
});

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

interface SecurityState {
  isAppLockEnabled: boolean;
  isLocked: boolean;
  isOnboarded: boolean;

  setAppLockEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
  setOnboarded: (onboarded: boolean) => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set) => ({
      isAppLockEnabled: false,
      isLocked: false,
      isOnboarded: false,

      setAppLockEnabled: (isAppLockEnabled) => set({ isAppLockEnabled }),
      setLocked: (isLocked) => set({ isLocked }),
      setOnboarded: (isOnboarded) => set({ isOnboarded }),
    }),
    {
      name: 'ideatik-security-storage',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        isAppLockEnabled: state.isAppLockEnabled,
        isOnboarded: state.isOnboarded,
      }),
    }
  )
);
