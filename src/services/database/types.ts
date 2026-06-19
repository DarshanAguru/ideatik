export interface NoteMetadata {
  id: string;
  title: string;
  type: 'note' | 'list' | 'finance';
  markdownContent: string;
  structuredContentJson: string;
  transcript: string;
  audioUri: string;
  references: string[];
  referenceLinks: NoteReference[];
  pendingReferenceCommands: string[];
  tags: string[]; // New: tag IDs
  createdAt: number;
  updatedAt: number;
  duration: number;
  aiSummary?: string;
  isDeleted: boolean;
  isLocked: boolean;
  isPinned?: boolean;
  transcriptionStatus: 'idle' | 'queued' | 'processing' | 'processing_offline' | 'completed' | 'completed_offline' | 'failed';
  transcriptionError?: string;
}

export interface NoteReference {
  noteId: string;
  title: string;
}
