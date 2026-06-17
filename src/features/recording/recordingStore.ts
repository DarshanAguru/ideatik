import { create } from 'zustand';
import { AudioService } from '../../services/audio/AudioService';
import { WhisperService } from '../../services/whisper/WhisperService';
import { CommandParser } from '../../services/parsers/CommandParser';
import { NoteChecklistItem, StructuredNote } from '../../services/parsers/types';
import { markdownParser } from '../../services/parsers/markdownParser';
import { noteFormatter } from '../../services/parsers/noteFormatter';
import { NoteRepository } from '../../services/database/NoteRepository';
import { DatabaseService } from '../../services/database/DatabaseService';
import { Buffer } from 'buffer';
import { AutosaveManager } from '../../services/recovery/autosaveManager';
import { clearSnapshot, RecordingSnapshot } from '../../services/recovery/recordingSnapshot';
import { Platform, ToastAndroid, Alert } from 'react-native';
import { useNotesStore } from '../notes/notesStore';
import { BackgroundTaskManager } from '../../services/background/BackgroundTaskManager';
import { StructuredNoteService } from '../../services/notes/StructuredNoteService';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped' | 'transcribing';
export type NoteType = 'note' | 'list' | 'finance';

interface RecordingStore {
  recordingState: RecordingState;
  noteType: NoteType;
  noteId: string;
  elapsedTime: number;
  waveform: number[];
  audioUri: string;
  duration: number;
  
  // Transcripts & Parsed Attributes
  rawTranscript: string;
  partialTranscript: string;
  finalizedTranscript: string;
  checklistItems: NoteChecklistItem[];
  noteTitle: string;
  references: string[];
  markdown: string;
  
  // Triggers & Navigation
  showReferenceModal: boolean;
  autoSaved: boolean;
  transcriptionError: string | null;
  
  setShowReferenceModal: (show: boolean) => void;
  downloadModel: () => Promise<void>;
  startRecording: (type: NoteType) => Promise<void>;
  resumeFromSnapshot: (snapshot: RecordingSnapshot) => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<{ audioUri: string; duration: number }>;
  resetRecording: (discard?: boolean) => void;
  syncFromMarkdown: (markdownText: string) => void;
  insertReference: (noteTitle: string) => Promise<void>;
  
  // Model download states
  isDownloadingModel: boolean;
  modelDownloadProgress: number;
  downloadModelError: string | null;
}

let timerInterval: any = null;
let isStartingRecording = false;
let isTranscribing = false; // Prevent concurrent transcription
let startTime = 0;
let accumulatedTime = 0;


// eslint-disable-next-line @typescript-eslint/no-unused-vars
const transcribeLocallyInBackground = async (
  noteId: string,
  audioUri: string,
  initialTitle: string,
  initialType: NoteType,
  initialRefs: string[],
  duration: number
) => {
  try {
    const result = await WhisperService.transcribeFile(audioUri);
    if (!result || !result.text) return;
    const { text: rawText } = result;

    // Load current note state to preserve any concurrent edits
    const existing = await NoteRepository.findById(noteId);
    if (!existing) return;

    // Parse commands and content
    const parserItems = (existing.markdownContent
      ? markdownParser.parse(existing.markdownContent).items
      : []
    ).map((item) => ({
      id: item.id,
      text: item.text,
      amount: item.amount,
      checked: item.checked,
    }));

    const parsed = CommandParser.parse(rawText, parserItems, existing.type);
    
    // Merge references
    const mergedRefs = [...(existing.references || [])];
    parsed.references.forEach((ref) => {
      if (!mergedRefs.includes(ref)) {
        mergedRefs.push(ref);
      }
    });

    const oldType = existing.type;
    const finalType = parsed.type !== 'note' ? parsed.type : existing.type;

    // Determine final title
    const currentTitle = existing.title || initialTitle;
    let finalTitle = currentTitle;
    const isDefaultTitle = !currentTitle || currentTitle === 'Untitled Capture' || /^(note|list|finance-list)-\d+$/i.test(currentTitle);

    if (isDefaultTitle) {
      if (parsed.title) {
        finalTitle = parsed.title;
      } else if (finalType !== oldType || currentTitle === 'Untitled Capture' || currentTitle === '') {
        // Re-resolve default title using the new type
        finalTitle = await NoteRepository.resolveUniqueTitle(noteId, undefined, finalType);
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
        isChecklist: i.amount !== undefined || parsed.type !== 'note' || existing.type !== 'note',
      })),
      references: mergedRefs,
    };

    const compiledMarkdown = noteFormatter.format(structured);

    await NoteRepository.save({
      id: noteId,
      title: finalTitle,
      type: finalType,
      markdownContent: compiledMarkdown,
      transcript: parsed.bodyText,
      references: mergedRefs,
      duration: duration,
      transcriptionStatus: 'completed_offline',
    });

    // Refresh the notes store immediately
    await useNotesStore.getState().loadNotes();

    // Show notification
    const displayTitle = finalTitle && finalTitle !== 'Untitled Capture' ? finalTitle : 'Voice Note';
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Transcription finished: "${displayTitle}"`, ToastAndroid.LONG);
    } else {
      Alert.alert('Transcription Finished', `"${displayTitle}" has been transcribed.`);
    }
  } catch (error) {
    console.error('Background transcription error:', error);
  }
};


export const useRecordingStore = create<RecordingStore>((set, get) => ({
  recordingState: 'idle',
  noteType: 'note',
  noteId: '',
  elapsedTime: 0,
  waveform: Array(40).fill(0.05),
  audioUri: '',
  duration: 0,
  
  rawTranscript: '',
  partialTranscript: '',
  finalizedTranscript: '',
  checklistItems: [],
  noteTitle: '',
  references: [],
  markdown: '',
  
  showReferenceModal: false,
  autoSaved: false,
  transcriptionError: null,

  isDownloadingModel: false,
  modelDownloadProgress: 0,
  downloadModelError: null,

  setShowReferenceModal: (show) => {
    set({ showReferenceModal: show });
  },

  downloadModel: async () => {
    set({ isDownloadingModel: true, modelDownloadProgress: 0, downloadModelError: null });
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        await WhisperService.downloadModel((progress) => {
          set({ modelDownloadProgress: progress });
        });
        set({ isDownloadingModel: false });
        return; // Success
      } catch (error) {
        attempt++;
        console.warn(`Model download failed (attempt ${attempt}/${maxRetries}):`, error);
        if (attempt >= maxRetries) {
          const msg = error instanceof Error ? error.message : 'Unknown model download error';
          set({ isDownloadingModel: false, downloadModelError: msg });
          throw error;
        }
        // Wait 2 seconds before retrying
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 2000));
      }
    }
  },

  startRecording: async (type: NoteType) => {
    if (isStartingRecording) {
      console.warn('startRecording: already in progress, ignoring duplicate call');
      return;
    }
    isStartingRecording = true;
    try {
      await NoteRepository.initialize();

      const modelExists = await WhisperService.checkModelExists();
      if (!modelExists) {
        throw new Error('MODEL_NOT_FOUND');
      }

      const noteId = Date.now().toString();
      await DatabaseService.setMetadata('active_draft_note_id', noteId);
      
      set({
        noteId,
        noteType: type,
        recordingState: 'recording',
        elapsedTime: 0,
        waveform: Array(40).fill(0.05),
        audioUri: '',
        duration: 0,
        rawTranscript: '',
        partialTranscript: '',
        finalizedTranscript: '',
        checklistItems: [],
        noteTitle: 'Untitled Capture',
        references: [],
        markdown: '',
        showReferenceModal: false,
        autoSaved: false,
      });

      // Kick off autosave loop — provides snapshot every 5s and on backgrounding
      AutosaveManager.start(() => {
        const s = get();
        if (s.recordingState === 'idle') return null;
        return {
          noteId: s.noteId,
          noteType: s.noteType,
          noteTitle: s.noteTitle,
          rawTranscript: s.rawTranscript,
          finalizedTranscript: s.finalizedTranscript,
          partialTranscript: s.partialTranscript,
          checklistItems: s.checklistItems,
          references: s.references,
          markdown: s.markdown,
          elapsedTime: s.elapsedTime,
          audioUri: s.audioUri,
          savedAt: Date.now(),
        };
      });

      try {
        await AudioService.start(noteId);

        startTime = Date.now();
        accumulatedTime = 0;
        timerInterval = setInterval(() => {
          const elapsed = accumulatedTime + Math.floor((Date.now() - startTime) / 1000);
          set({ elapsedTime: elapsed });
        }, 200);

      } catch (error) {
        set({ recordingState: 'idle' });
        console.error('Failed to start recording session:', error);
        throw error;
      }
    } finally {
      isStartingRecording = false;
    }
  },

  pauseRecording: async () => {
    if (get().recordingState !== 'recording') return;
    
    if (timerInterval) clearInterval(timerInterval);

    try {
      await AudioService.pause();
      
      accumulatedTime += Math.floor((Date.now() - startTime) / 1000);
      
      set({ 
        recordingState: 'paused',
        finalizedTranscript: get().rawTranscript
      });
    } catch (e) {
      console.error('Error pausing recording:', e);
    }
  },

  resumeRecording: async () => {
    if (get().recordingState !== 'paused') return;

    try {
      await AudioService.resume();
      
      set({ recordingState: 'recording' });

      startTime = Date.now();
      timerInterval = setInterval(() => {
        const elapsed = accumulatedTime + Math.floor((Date.now() - startTime) / 1000);
        set({ elapsedTime: elapsed });
      }, 200);

    } catch (e) {
      console.error('Error resuming recording:', e);
    }
  },

  stopRecording: async () => {
    if (isTranscribing) {
      console.warn('stopRecording: transcription already in progress');
      return { audioUri: '', duration: 0 };
    }

    const { recordingState } = get();
    if (recordingState !== 'recording' && recordingState !== 'paused') {
      return { audioUri: '', duration: 0 };
    }

    if (timerInterval) clearInterval(timerInterval);
    isTranscribing = true;

    try {
      set({ recordingState: 'transcribing', transcriptionError: null });

      const { audioUri, duration } = await AudioService.stop();
      const current = get();
      const placeholderContent = StructuredNoteService.normalize({
        title: current.noteTitle || 'Untitled Capture',
        type: current.noteType,
        bodyBlocks: current.partialTranscript ? [current.partialTranscript] : [],
        listItems: current.noteType === 'finance' ? [] : current.checklistItems,
        financeItems: current.noteType === 'finance' ? current.checklistItems : [],
        referenceIds: current.references.map((title) => ({ noteId: '', title })),
        pendingReferenceCommands: [],
      });

      // Save final note state and assets
      await NoteRepository.save({
        id: current.noteId,
        title: placeholderContent.title,
        type: placeholderContent.type,
        structuredContentJson: StructuredNoteService.toJson(placeholderContent),
        markdownContent: StructuredNoteService.toMarkdown(placeholderContent),
        transcript: StructuredNoteService.bodyText(placeholderContent),
        audioUri: audioUri,
        references: current.references,
        referenceLinks: placeholderContent.referenceIds,
        duration: duration,
        transcriptionStatus: 'queued',
        transcriptionError: undefined,
      });

      const savedNote = await NoteRepository.findById(current.noteId);
      await BackgroundTaskManager.initialize();
      await BackgroundTaskManager.queueForTranscription(
        current.noteId,
        savedNote?.audioUri || audioUri,
        placeholderContent.title,
        placeholderContent.type,
        duration
      );
      BackgroundTaskManager.startProcessing();

      await DatabaseService.deleteMetadata('active_draft_note_id');

      // Stop autosave loop and clear snapshot — recording is done
      AutosaveManager.stop();
      clearSnapshot();

      set({
        recordingState: 'stopped',
        audioUri,
        duration,
      });

      return { audioUri, duration };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to stop recording:', error);
      set({ 
        recordingState: 'idle',
        transcriptionError: errorMsg,
      });
      throw error;
    } finally {
      isTranscribing = false;
      AudioService.reset(); // Ensure clean state
    }
  },

  resetRecording: (discard = false) => {
    if (timerInterval) clearInterval(timerInterval);
    isTranscribing = false;
    startTime = 0;
    accumulatedTime = 0;
    
    try {
      AudioService.reset();
      if (discard || get().recordingState !== 'stopped') {
        WhisperService.release();
        WhisperService.resetContext();
      }
    } catch (e) {
      console.warn('Error during resetRecording cleanup:', e);
    }

    const noteId = get().noteId;
    if (discard && noteId) {
      NoteRepository.purge(noteId).catch(console.error);
    }

    DatabaseService.deleteMetadata('active_draft_note_id').catch(console.error);

    // Stop autosave loop and remove snapshot
    AutosaveManager.stop();
    clearSnapshot();

    set({
      recordingState: 'idle',
      elapsedTime: 0,
      waveform: Array(40).fill(0.05),
      audioUri: '',
      duration: 0,
      rawTranscript: '',
      partialTranscript: '',
      finalizedTranscript: '',
      checklistItems: [],
      noteTitle: '',
      references: [],
      markdown: '',
      showReferenceModal: false,
      autoSaved: false,
      transcriptionError: null,
    });
  },

  resumeFromSnapshot: async (snapshot: RecordingSnapshot) => {
    // Restore all in-memory state from the snapshot
    accumulatedTime = snapshot.elapsedTime;
    startTime = Date.now();

    set({
      noteId: snapshot.noteId,
      noteType: snapshot.noteType,
      noteTitle: snapshot.noteTitle,
      rawTranscript: snapshot.rawTranscript,
      finalizedTranscript: snapshot.finalizedTranscript,
      partialTranscript: snapshot.partialTranscript,
      checklistItems: snapshot.checklistItems,
      references: snapshot.references,
      markdown: snapshot.markdown,
      elapsedTime: snapshot.elapsedTime,
      audioUri: snapshot.audioUri,
      recordingState: 'paused', // Start paused so user can choose to resume
      waveform: Array(40).fill(0.05),
      duration: 0,
      showReferenceModal: false,
      autoSaved: false,
      isDownloadingModel: false,
      modelDownloadProgress: 0,
      downloadModelError: null,
    });

    // Ensure DB is ready and draft marker is set
    await NoteRepository.initialize();
    await DatabaseService.setMetadata('active_draft_note_id', snapshot.noteId);

    // Restart the autosave loop so ongoing changes keep being captured
    AutosaveManager.start(() => {
      const s = get();
      if (s.recordingState === 'idle') return null;
      return {
        noteId: s.noteId,
        noteType: s.noteType,
        noteTitle: s.noteTitle,
        rawTranscript: s.rawTranscript,
        finalizedTranscript: s.finalizedTranscript,
        partialTranscript: s.partialTranscript,
        checklistItems: s.checklistItems,
        references: s.references,
        markdown: s.markdown,
        elapsedTime: s.elapsedTime,
        audioUri: s.audioUri,
        savedAt: Date.now(),
      };
    });
  },

  syncFromMarkdown: (markdownText: string) => {
    // Parse the manually edited Markdown back into structured store attributes
    const parsed = markdownParser.parse(markdownText, get().checklistItems);
    
    set({
      markdown: markdownText,
      noteTitle: parsed.title || 'Untitled Capture',
      noteType: parsed.type,
      partialTranscript: parsed.bodyText,
      checklistItems: parsed.items,
      references: parsed.references,
    });

    // Autosave manual edits
    NoteRepository.save({
      id: get().noteId,
      title: parsed.title || 'Untitled Capture',
      type: parsed.type,
      markdownContent: markdownText,
      transcript: parsed.bodyText,
      references: parsed.references,
      duration: get().elapsedTime,
    }).catch((e) => console.error('Manual edit autosave error:', e));
  },

  insertReference: async (title: string) => {
    // 1. Add to references list if not already present
    const refs = [...get().references];
    if (!refs.includes(title)) {
      refs.push(title);
    }

    // 2. Append markdown wiki-link to finalizedTranscript
    const currentFinal = get().finalizedTranscript;
    const separator = currentFinal && !currentFinal.endsWith(' ') ? ' ' : '';
    const newFinal = `${currentFinal}${separator}[[${title}]]`;

    // 3. Compile updated markdown
    const parserItems = get().checklistItems.map((item) => ({
      id: item.id,
      text: item.text,
      amount: item.amount,
      checked: item.checked,
    }));

    const parsed = CommandParser.parse(newFinal, parserItems, get().noteType);
    
    const structured: StructuredNote = {
      title: parsed.title || get().noteTitle,
      type: parsed.type,
      bodyText: parsed.bodyText,
      items: parsed.items.map((i) => ({
        id: i.id,
        text: i.text,
        amount: i.amount,
        checked: i.checked,
        isChecklist: i.amount !== undefined || parsed.type !== 'note',
      })),
      references: refs,
    };

    const compiledMarkdown = noteFormatter.format(structured);

    set({
      references: refs,
      finalizedTranscript: newFinal,
      rawTranscript: newFinal,
      partialTranscript: parsed.bodyText,
      checklistItems: structured.items,
      noteType: parsed.type,
      noteTitle: parsed.title || get().noteTitle,
      markdown: compiledMarkdown,
      showReferenceModal: false,
    });

    // 4. Autosave updated state
    await NoteRepository.save({
      id: get().noteId,
      title: get().noteTitle,
      type: get().noteType,
      markdownContent: compiledMarkdown,
      transcript: parsed.bodyText,
      references: refs,
      duration: get().elapsedTime,
    });

    // 5. Resume recording
    await get().resumeRecording();
  },
}));
