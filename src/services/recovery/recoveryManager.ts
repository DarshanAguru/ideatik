import { loadSnapshot, clearSnapshot, RecordingSnapshot } from './recordingSnapshot';
import { NoteRepository } from '../database/NoteRepository';
import { DatabaseService } from '../database/DatabaseService';

// ─── RecoveryManager ─────────────────────────────────────────────────────────

class RecoveryManagerClass {
  /**
   * Checks whether there is an orphaned recording from a previous session.
   *
   * An orphaned recording is one where:
   *   1. A RecordingSnapshot exists in MMKV (written by AutosaveManager), AND
   *   2. The snapshot's noteId still has a row in the SQLite notes table, AND
   *   3. The active_draft_note_id metadata key still points to the same id
   *      (meaning the recording was never properly finished or discarded).
   *
   * Returns the snapshot if all conditions are met, otherwise null.
   * If the snapshot is stale / the note no longer exists, it is cleared.
   */
  async checkForOrphanedRecording(): Promise<RecordingSnapshot | null> {
    try {
      const snapshot = loadSnapshot();
      if (!snapshot || !snapshot.noteId) return null;

      // Ensure DB is initialised before querying
      await NoteRepository.initialize();

      // Cross-check: the draft marker must still be set to this noteId
      const activeDraftId = await DatabaseService.getMetadata('active_draft_note_id');
      if (activeDraftId !== snapshot.noteId) {
        // The recording was properly finished or cleaned up in a previous run.
        clearSnapshot();
        return null;
      }

      // Cross-check: the note must still exist in SQLite (not purged)
      const note = await NoteRepository.findById(snapshot.noteId);
      if (!note) {
        // Ghost snapshot — note was deleted externally; clean up
        clearSnapshot();
        await DatabaseService.deleteMetadata('active_draft_note_id');
        return null;
      }

      return snapshot;
    } catch (e) {
      console.error('RecoveryManager: Error checking for orphaned recording:', e);
      return null;
    }
  }

  /**
   * Marks the draft as permanently saved (promoted to a regular note).
   * Removes both the MMKV snapshot and the active_draft_note_id metadata key.
   * The SQLite note row stays untouched.
   */
  async promoteDraftToNote(_noteId: string): Promise<void> {
    clearSnapshot();
    await DatabaseService.deleteMetadata('active_draft_note_id');
  }

  /**
   * Permanently discards the orphaned recording:
   * - Purges the note row + file assets from SQLite / filesystem.
   * - Removes the MMKV snapshot.
   * - Removes the active_draft_note_id metadata key.
   */
  async discardOrphanedRecording(noteId: string): Promise<void> {
    try {
      await NoteRepository.purge(noteId);
    } catch (e) {
      console.warn('RecoveryManager: Error purging orphaned note:', e);
    }
    clearSnapshot();
    await DatabaseService.deleteMetadata('active_draft_note_id');
  }
}

export const RecoveryManager = new RecoveryManagerClass();
