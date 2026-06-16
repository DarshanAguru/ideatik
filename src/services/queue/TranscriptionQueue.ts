/**
 * TranscriptionQueue - Manages a queue of recordings waiting to be transcribed
 * Processes them one at a time to avoid memory issues with concurrent transcriptions
 */

import { DatabaseService } from '../database/DatabaseService';

export interface QueuedTranscription {
  id: string;
  noteId: string;
  audioUri: string;
  noteTitle: string;
  noteType: 'note' | 'list' | 'finance';
  duration: number;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

class TranscriptionQueueClass {
  private queue: Map<string, QueuedTranscription> = new Map();
  private isProcessing = false;
  private dbKey = 'transcription_queue';

  async initialize(): Promise<void> {
    await this.loadQueueFromStorage();
  }

  /**
   * Add a new transcription to queue
   */
  async enqueue(
    noteId: string,
    audioUri: string,
    noteTitle: string,
    noteType: 'note' | 'list' | 'finance',
    duration: number
  ): Promise<QueuedTranscription> {
    const queueItem: QueuedTranscription = {
      id: `tq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      noteId,
      audioUri,
      noteTitle,
      noteType,
      duration,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.queue.set(queueItem.id, queueItem);
    await this.saveQueueToStorage();

    return queueItem;
  }

  /**
   * Get next pending item in queue
   */
  getNextPending(): QueuedTranscription | null {
    for (const item of this.queue.values()) {
      if (item.status === 'pending') {
        return item;
      }
    }
    return null;
  }

  /**
   * Update item status
   */
  async updateStatus(
    id: string,
    status: 'processing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const item = this.queue.get(id);
    if (item) {
      item.status = status;
      if (error) {
        item.error = error;
      }
      await this.saveQueueToStorage();
    }
  }

  async retry(id: string): Promise<void> {
    const item = this.queue.get(id);
    if (!item) return;
    item.status = 'pending';
    item.error = undefined;
    await this.saveQueueToStorage();
  }

  /**
   * Get all items with status
   */
  getByStatus(status: QueuedTranscription['status']): QueuedTranscription[] {
    return Array.from(this.queue.values()).filter((item) => item.status === status);
  }

  /**
   * Remove completed item from queue
   */
  async remove(id: string): Promise<void> {
    this.queue.delete(id);
    await this.saveQueueToStorage();
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.size;
  }

  /**
   * Get pending count
   */
  get pendingCount(): number {
    return this.getByStatus('pending').length;
  }

  /**
   * Get all items
   */
  getAll(): QueuedTranscription[] {
    return Array.from(this.queue.values());
  }

  /**
   * Clear completed items
   */
  async clearCompleted(): Promise<void> {
    const completed = this.getByStatus('completed');
    for (const item of completed) {
      this.queue.delete(item.id);
    }
    await this.saveQueueToStorage();
  }

  /**
   * Persist queue to storage
   */
  private async saveQueueToStorage(): Promise<void> {
    try {
      const data = Array.from(this.queue.values());
      await DatabaseService.setMetadata(this.dbKey, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving transcription queue:', e);
    }
  }

  /**
   * Load queue from storage
   */
  private async loadQueueFromStorage(): Promise<void> {
    try {
      const data = await DatabaseService.getMetadata(this.dbKey);
      if (data) {
        const items: QueuedTranscription[] = JSON.parse(data);
        this.queue.clear();
        items.forEach((item) => {
          // Reset processing items back to pending
          if (item.status === 'processing') {
            item.status = 'pending';
          }
          this.queue.set(item.id, item);
        });
      }
    } catch (e) {
      console.error('Error loading transcription queue:', e);
    }
  }

  /**
   * Clear entire queue (dangerous)
   */
  async clear(): Promise<void> {
    this.queue.clear();
    await this.saveQueueToStorage();
  }
}

export const TranscriptionQueue = new TranscriptionQueueClass();
