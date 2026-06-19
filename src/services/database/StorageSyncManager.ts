import { FilesystemService } from './FilesystemService';
import { NoteRepository } from './NoteRepository';
import { markdownParser } from '../parsers/markdownParser';
import RNFS from 'react-native-fs';

class StorageSyncManagerClass {
  private hasSynced = false;

  /**
   * Scans all Markdown files on disk, compares them with database indexes,
   * and rebuilds missing database rows. This is critical for crash-recovery.
   */
  async syncDiskToMetadata(): Promise<void> {
    if (this.hasSynced) return;
    try {
      // 1. Scan notes directory for md files
      const noteIds = await FilesystemService.listMarkdownNotes();

      for (const id of noteIds) {
        const dbNote = await NoteRepository.findById(id);
        
        // Check if markdown file exists and read stats for modification time
        const mdPath = FilesystemService.getMarkdownPath(id);
        const stats = await RNFS.stat(mdPath);
        const fileModifiedTime = stats.mtime ? new Date(stats.mtime).getTime() : Date.now();

        // If note is missing in DB or file on disk was modified later than DB metadata
        if (!dbNote || fileModifiedTime > dbNote.updatedAt) {
          console.log(`StorageSyncManager: Syncing note ${id} from disk to DB...`);
          
          const markdownContent = await FilesystemService.readMarkdown(id);
          const parsed = markdownParser.parse(markdownContent);
          
          // Verify if matching audio file exists on disk
          const wavPath = FilesystemService.getAudioPath(id);
          const hasAudio = await RNFS.exists(wavPath);

          // Parse id timestamp to get a fallback createdAt time
          const parsedTimestamp = Number(id);
          const createdAt = isNaN(parsedTimestamp) ? fileModifiedTime : parsedTimestamp;

          await NoteRepository.save({
            id,
            title: parsed.title || 'Untitled Sync',
            type: parsed.type,
            markdownContent,
            transcript: parsed.bodyText,
            audioUri: hasAudio ? wavPath : '',
            references: parsed.references,
            createdAt,
            updatedAt: fileModifiedTime,
            duration: dbNote ? dbNote.duration : 0,
            isDeleted: false,
            isLocked: dbNote ? dbNote.isLocked : false,
            isPinned: dbNote ? dbNote.isPinned : false,
          });
        }
      }
      this.hasSynced = true;
    } catch (e) {
      console.error('StorageSyncManager: Error during disk metadata sync:', e);
    }
  }
}

export const StorageSyncManager = new StorageSyncManagerClass();
