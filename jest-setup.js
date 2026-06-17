/* eslint-env jest */

import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);

// Mock MMKV to prevent NitroModules load error
jest.mock('react-native-mmkv', () => {
  class MockMMKV {
    storage = new Map();
    set(key, value) {
      this.storage.set(key, value);
    }
    getString(key) {
      return this.storage.get(key);
    }
    getNumber(key) {
      return this.storage.get(key);
    }
    getBoolean(key) {
      return this.storage.get(key);
    }
    delete(key) {
      this.storage.delete(key);
    }
    remove(key) {
      this.storage.delete(key);
    }
    clearAll() {
      this.storage.clear();
    }
  }
  return {
    MMKV: MockMMKV,
    createMMKV: () => new MockMMKV(),
  };
});

// Mock SQLite storage
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(() => ({
    transaction: jest.fn((cb) => {
      if (cb) {
        cb({
          executeSql: jest.fn((sql, params, success) => {
            if (success) {
              success({}, { rows: { item: () => null, length: 0 }, rowsAffected: 0 });
            }
          }),
        });
      }
    }),
  })),
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  mkdir: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  copyFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(true)),
  readDir: jest.fn(() => Promise.resolve([])),
  stat: jest.fn(() => Promise.resolve({ size: 1024, mtime: new Date() })),
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve()),
  appendFile: jest.fn(() => Promise.resolve()),
  MainBundlePath: 'test_path',
  CachesDirectoryPath: 'test_path',
  DocumentDirectoryPath: 'test_path',
  ExternalDirectoryPath: 'test_path',
  ExternalStorageDirectoryPath: 'test_path',
  TemporaryDirectoryPath: 'test_path',
  LibraryDirectoryPath: 'test_path',
  PicturesDirectoryPath: 'test_path',
}));

// Mock react-native-sound
jest.mock('react-native-sound', () => {
  class MockSound {
    static setCategory() {}
    constructor(path, type, callback) {
      if (callback) {
        setTimeout(callback, 0);
      }
    }
    play(callback) {
      if (callback) {
        setTimeout(() => callback(true), 0);
      }
    }
    stop() {}
    pause() {}
    release() {}
    getDuration() {
      return 10;
    }
    getCurrentTime(callback) {
      if (callback) {
        callback(0);
      }
    }
  }
  return MockSound;
});

// Mock react-native-audio-record
jest.mock('react-native-audio-record', () => ({
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  on: jest.fn(),
}));

// Mock whisper.rn
jest.mock('whisper.rn', () => ({
  initWhisper: jest.fn(() =>
    Promise.resolve({
      transcribe: jest.fn(() => Promise.resolve({ text: 'Mock transcription' })),
    })
  ),
}));

// Mock react-native-tts
jest.mock('react-native-tts', () => ({
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
  speak: jest.fn(),
  stop: jest.fn(),
  setDefaultLanguage: jest.fn(),
  setDefaultRate: jest.fn(),
  setDefaultVoice: jest.fn(),
  setDefaultPitch: jest.fn(),
  voices: jest.fn(() => Promise.resolve([])),
}));

// Mock react-native-background-actions
jest.mock('react-native-background-actions', () => ({
  start: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  isRunning: jest.fn(() => false),
  updateNotification: jest.fn(() => Promise.resolve()),
}));

// Mock @react-native-clipboard/clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn(() => Promise.resolve('')),
  hasString: jest.fn(() => Promise.resolve(false)),
}));
