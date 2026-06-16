import { createMMKV } from 'react-native-mmkv';
import { NoteChecklistItem } from '../parsers/types';
import { NoteType } from '../../features/recording/recordingStore';

const storage = createMMKV({ id: 'ideatik-recovery-db' });
const SNAPSHOT_KEY = 'ideatik-recording-snapshot';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecordingSnapshot {
  /** Stable ID of the draft note row in SQLite */
  noteId: string;
  noteType: NoteType;
  noteTitle: string;

  /** Full raw dictation text received from Whisper */
  rawTranscript: string;
  /** Text portion that was finalized before the last pause */
  finalizedTranscript: string;
  /** Partial body text used for preview */
  partialTranscript: string;

  /** Structured items list (checklist / finance) */
  checklistItems: NoteChecklistItem[];
  /** Wiki-link references inserted by voice command */
  references: string[];
  /** Full compiled Markdown string */
  markdown: string;

  /** Seconds elapsed at the time of the last snapshot */
  elapsedTime: number;
  /** Path to the temporary or permanent audio file, if any */
  audioUri: string;

  /** Unix timestamp (ms) when snapshot was last written */
  savedAt: number;
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

/**
 * Serializes the recording snapshot to MMKV. Overwrites any existing snapshot.
 */
export function saveSnapshot(snapshot: RecordingSnapshot): void {
  try {
    storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (e) {
    console.error('RecordingSnapshot: Failed to save snapshot:', e);
  }
}

/**
 * Reads and deserializes the recording snapshot from MMKV.
 * Returns null if none exists or if parsing fails.
 */
export function loadSnapshot(): RecordingSnapshot | null {
  try {
    const raw = storage.getString(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecordingSnapshot;
  } catch (e) {
    console.error('RecordingSnapshot: Failed to load snapshot:', e);
    return null;
  }
}

/**
 * Removes the snapshot from MMKV. Call after recording is finished,
 * discarded, or successfully saved.
 */
export function clearSnapshot(): void {
  try {
    storage.remove(SNAPSHOT_KEY);
  } catch (e) {
    console.warn('RecordingSnapshot: Failed to clear snapshot:', e);
  }
}
