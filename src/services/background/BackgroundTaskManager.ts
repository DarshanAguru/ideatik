/**
 * BackgroundTaskManager - Manages background transcription processing (offline-only)
 */

import { Platform, ToastAndroid } from 'react-native';
import { TranscriptionQueue, QueuedTranscription } from '../queue/TranscriptionQueue';
import { WhisperService } from '../whisper/WhisperService';
import { NoteRepository } from '../database/NoteRepository';
import { CommandParser } from '../parsers/CommandParser';
import { StructuredNote } from '../parsers/types';
import { StructuredNoteService } from '../notes/StructuredNoteService';
import { useNotesStore } from '../../features/notes/notesStore';

class BackgroundTaskManagerClass {
  private isProcessing = false;
  private processInterval: any = null;

  async initialize(): Promise<void> {
    await TranscriptionQueue.initialize();
  }

  /**
   * Start background processing of transcription queue
   */
  startProcessing(intervalMs: number = 3000): void {
    if (this.isProcessing) {
      console.warn('Background processing already running');
      return;
    }

    this.isProcessing = true;
    console.log('Background transcription processing started (offline-only)');

    this.processInterval = setInterval(async () => {
      const modelExists = await WhisperService.checkModelExists();
      if (!modelExists) {
        console.log('Ideatik: Offline model not downloaded. Deferring queue processing...');
        return;
      }

      const pending = TranscriptionQueue.getNextPending();
      if (pending) {
        await this.processQueueItem(pending);
      } else if (TranscriptionQueue.pendingCount === 0 && TranscriptionQueue.length > 0) {
        await TranscriptionQueue.clearCompleted();
      }
    }, intervalMs);

    // Also attempt to process immediately on start
    (async () => {
      const modelExists = await WhisperService.checkModelExists();
      if (modelExists) {
        const pending = TranscriptionQueue.getNextPending();
        if (pending) {
          await this.processQueueItem(pending);
        }
      }
    })();
  }

  /**
   * Stop background processing
   */
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    this.isProcessing = false;
    console.log('Background transcription processing stopped');
  }

  /**
   * Apply a transcription result to a note in the database
   */
  private async applyTranscriptionToNote(
    noteId: string,
    rawText: string,
    duration: number
  ): Promise<void> {
    const note = await NoteRepository.findById(noteId);
    if (!note) {
      throw new Error(`Note not found: ${noteId}`);
    }

    const currentStructured = StructuredNoteService.fromNote(note);
    const parserItems = StructuredNoteService.items(currentStructured).map((i) => ({
      id: i.id,
      text: i.text,
      amount: i.amount,
      checked: i.checked,
    }));

    const parsed = CommandParser.parse(rawText, parserItems);

    const mergedRefTitles = [...(note.references || [])];
    parsed.references.forEach((ref) => {
      if (!mergedRefTitles.includes(ref)) {
        mergedRefTitles.push(ref);
      }
    });
    const existingLinks = currentStructured.referenceIds || [];
    const unresolvedLinks = parsed.references
      .filter((title) => !existingLinks.some((ref) => ref.title.toLowerCase() === title.toLowerCase()))
      .map((title) => ({ noteId: '', title }));

    const oldType = note.type;
    const finalType = parsed.type !== 'note' ? parsed.type : note.type;
    const isDefaultTitle = !note.title || note.title === 'Untitled Capture' || /^(note|list|finance-list)-\d+$/i.test(note.title);

    let finalTitle = note.title;
    if (isDefaultTitle) {
      if (parsed.title) {
        finalTitle = parsed.title;
      } else if (finalType !== oldType || !note.title || note.title === 'Untitled Capture') {
        finalTitle = await NoteRepository.resolveUniqueTitle(note.id, undefined, finalType);
      }
    }

    const structured: StructuredNote = {
      title: finalTitle,
      type: finalType,
      bodyText: parsed.bodyText,
      items: parsed.items.map((i) => ({
        id: i.id,
        text: i.text,
        amount: i.amount,
        checked: i.checked,
        isChecklist: i.amount !== undefined || finalType !== 'note',
      })),
      references: mergedRefTitles,
    };

    const compiledContent = StructuredNoteService.normalize({
      title: structured.title,
      type: structured.type,
      bodyBlocks: structured.bodyText ? [structured.bodyText] : [],
      listItems: finalType === 'finance' ? currentStructured.listItems : structured.items,
      financeItems: finalType === 'finance' ? structured.items : currentStructured.financeItems,
      referenceIds: [...existingLinks, ...unresolvedLinks],
      pendingReferenceCommands: parsed.pendingReferenceCommands || [],
    });
    const compiledMarkdown = StructuredNoteService.toMarkdown(compiledContent);

    await NoteRepository.save({
      id: noteId,
      title: finalTitle,
      type: finalType,
      markdownContent: compiledMarkdown,
      structuredContentJson: StructuredNoteService.toJson(compiledContent),
      transcript: parsed.bodyText,
      references: mergedRefTitles,
      referenceLinks: compiledContent.referenceIds,
      pendingReferenceCommands: compiledContent.pendingReferenceCommands,
      duration: duration,
      transcriptionStatus: 'completed_offline',
      transcriptionError: undefined,
    });

    await useNotesStore.getState().loadNotes();

    const displayTitle = finalTitle && finalTitle !== 'Untitled Capture' ? finalTitle : 'Voice Note';
    this.showNotification(`✓ Transcribed: "${displayTitle}"`, 'success');
  }

  /**
   * Process a single queue item
   */
  private async processQueueItem(item: QueuedTranscription): Promise<void> {
    try {
      await TranscriptionQueue.updateStatus(item.id, 'processing');
      await NoteRepository.save({
        id: item.noteId,
        transcriptionStatus: 'processing_offline' as any,
        transcriptionError: undefined,
      });

      const result = await WhisperService.transcribeFile(item.audioUri);

      if (!result || !result.text) {
        throw new Error('Transcription returned empty result');
      }

      await this.applyTranscriptionToNote(item.noteId, result.text, item.duration);
      await TranscriptionQueue.updateStatus(item.id, 'completed');
      console.log(`Successfully transcribed: ${item.noteId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`BackgroundTaskManager: Transcription failed for note ${item.noteId}:`, error);

      // Audio-only fallback: preserve audio if transcription fails
      try {
        const existingNote = await NoteRepository.findById(item.noteId);
        if (existingNote && existingNote.audioUri) {
          await NoteRepository.save({
            id: item.noteId,
            transcriptionStatus: 'completed_offline',
            transcriptionError: undefined,
            transcript: existingNote.transcript || '',
          });
          await TranscriptionQueue.updateStatus(item.id, 'completed');
          await useNotesStore.getState().loadNotes();
          console.log(`BackgroundTaskManager: Saved ${item.noteId} as audio-only note.`);
          return;
        }
      } catch (saveErr) {
        console.error('BackgroundTaskManager: Failed to save audio-only fallback:', saveErr);
      }

      await TranscriptionQueue.updateStatus(item.id, 'failed', errorMsg);
      await NoteRepository.save({
        id: item.noteId,
        transcriptionStatus: 'failed',
        transcriptionError: errorMsg,
      });
      await useNotesStore.getState().loadNotes();
      this.showNotification(`✗ Failed: ${item.noteTitle}`, 'error');
    } finally {
      try {
        await WhisperService.release();
        WhisperService.resetContext();
      } catch (e) {
        console.warn('BackgroundTaskManager: Whisper cleanup failed:', e);
      }
    }
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  async queueForTranscription(
    noteId: string,
    audioUri: string,
    noteTitle: string,
    noteType: 'note' | 'list' | 'finance',
    duration: number
  ): Promise<QueuedTranscription> {
    return await TranscriptionQueue.enqueue(noteId, audioUri, noteTitle, noteType, duration);
  }

  getQueueStatus(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const all = TranscriptionQueue.getAll();
    return {
      total: all.length,
      pending: TranscriptionQueue.getByStatus('pending').length,
      processing: TranscriptionQueue.getByStatus('processing').length,
      completed: TranscriptionQueue.getByStatus('completed').length,
      failed: TranscriptionQueue.getByStatus('failed').length,
    };
  }

  get isActive(): boolean {
    return this.isProcessing;
  }
}

export const BackgroundTaskManager = new BackgroundTaskManagerClass();
