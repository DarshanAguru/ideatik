/**
 * BackgroundTaskManager - Manages background transcription processing (offline-only)
 */

import { Platform, ToastAndroid } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import { TranscriptionQueue, QueuedTranscription } from '../queue/TranscriptionQueue';
import { WhisperService } from '../whisper/WhisperService';
import { NoteRepository } from '../database/NoteRepository';
import { CommandParser } from '../parsers/CommandParser';
import { StructuredNote } from '../parsers/types';
import { StructuredNoteService } from '../notes/StructuredNoteService';
import { useNotesStore } from '../../features/notes/notesStore';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

class BackgroundTaskManagerClass {
  private isProcessing = false;

  async initialize(): Promise<void> {
    await TranscriptionQueue.initialize();
  }

  /**
   * The background task runner loop on JS side.
   */
  private async runJSProcessingLoop(): Promise<void> {
    const delay = 2000;
    console.log('BackgroundTaskManager: JS processing loop started');

    while (this.isProcessing) {
      try {
        const modelExists = await WhisperService.checkModelExists();
        if (!modelExists) {
          console.log('BackgroundTaskManager: Model not downloaded. Waiting...');
          await sleep(delay);
          continue;
        }

        // If the user is currently recording or has paused the recording, suspend background transcription to prevent CPU hogging.
        let isUserRecording = false;
        try {
          const { useRecordingStore } = require('../../features/recording/recordingStore');
          const recState = useRecordingStore.getState().recordingState;
          if (recState === 'recording' || recState === 'paused' || recState === 'transcribing') {
            isUserRecording = true;
          }
        } catch (e) {
          // Ignore any import/initialization issues
        }

        if (isUserRecording) {
          console.log('BackgroundTaskManager: User is actively recording or transcribing active capture. Suspending background queue.');
          await sleep(delay);
          continue;
        }

        const pending = TranscriptionQueue.getNextPending();
        if (pending) {
          await this.processQueueItem(pending);
        } else {
          if (TranscriptionQueue.length > 0) {
            await TranscriptionQueue.clearCompleted();
          }
          console.log('BackgroundTaskManager: Queue empty. Stopping JS processing loop.');
          break;
        }
      } catch (err) {
        console.error('BackgroundTaskManager: Error in JS background loop:', err);
      }
      await sleep(delay);
    }
    this.isProcessing = false;
  }

  /**
   * Start background processing of transcription queue
   */
  startProcessing(): void {
    if (this.isProcessing) {
      console.log('Background transcription processing already running');
      return;
    }

    const pending = TranscriptionQueue.getNextPending();
    if (!pending) {
      return;
    }

    this.isProcessing = true;
    console.log('Background transcription processing started (JS loop)');

    // Kick off the JS processing loop asynchronously
    this.runJSProcessingLoop();
  }

  /**
   * Stop background processing
   */
  stopProcessing(): void {
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

    // Pass the existing note type so it parses checklist/finance without "add" prefixes
    const parsed = CommandParser.parse(rawText, parserItems, note.type);

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
