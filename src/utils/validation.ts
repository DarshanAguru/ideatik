/**
 * Data validation utilities for ensuring data integrity
 */

import { NoteMetadata } from '../services/database/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate note metadata
 */
export function validateNote(note: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!note.id || typeof note.id !== 'string') {
    errors.push('Note must have a valid id');
  }

  if (!note.title || typeof note.title !== 'string') {
    errors.push('Note must have a valid title');
  }

  if (!note.type || !['note', 'list', 'finance'].includes(note.type)) {
    errors.push(`Note type must be one of: note, list, finance (got: ${note.type})`);
  }

  if (typeof note.createdAt !== 'number' || note.createdAt <= 0) {
    errors.push('Note must have a valid createdAt timestamp');
  }

  if (typeof note.updatedAt !== 'number' || note.updatedAt <= 0) {
    errors.push('Note must have a valid updatedAt timestamp');
  }

  // Optional fields
  if (note.markdownContent && typeof note.markdownContent !== 'string') {
    errors.push('markdownContent must be a string');
  }

  if (note.transcript && typeof note.transcript !== 'string') {
    warnings.push('transcript should be a string');
  }

  if (note.audioUri && typeof note.audioUri !== 'string') {
    warnings.push('audioUri should be a string');
  }

  if (note.references && !Array.isArray(note.references)) {
    errors.push('references must be an array');
  }

  if (note.tags && !Array.isArray(note.tags)) {
    errors.push('tags must be an array');
  }

  if (note.duration && typeof note.duration !== 'number') {
    warnings.push('duration should be a number');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate search filters
 */
export function validateSearchFilters(filters: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (filters.query && typeof filters.query !== 'string') {
    errors.push('query must be a string');
  }

  if (filters.tags && !Array.isArray(filters.tags)) {
    errors.push('tags must be an array');
  }

  if (filters.type && !['note', 'list', 'finance'].includes(filters.type)) {
    errors.push(`type must be one of: note, list, finance`);
  }

  if (filters.dateFrom && typeof filters.dateFrom !== 'number') {
    errors.push('dateFrom must be a timestamp');
  }

  if (filters.dateTo && typeof filters.dateTo !== 'number') {
    errors.push('dateTo must be a timestamp');
  }

  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    warnings.push('dateFrom is after dateTo');
  }

  if (filters.sortBy && !['recent', 'oldest', 'alphabetical'].includes(filters.sortBy)) {
    errors.push('sortBy must be one of: recent, oldest, alphabetical');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitize note title
 */
export function sanitizeTitle(title: string): string {
  if (!title) return 'Untitled';
  return title.trim().slice(0, 500); // Reasonable length limit
}

/**
 * Validate audio file format
 */
export function isValidAudioUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  // Should end with common audio extensions or have file:// prefix
  return /\.(wav|mp3|m4a|aac|ogg)$/i.test(uri) || uri.startsWith('file://');
}

/**
 * Validate reference string
 */
export function isValidReference(ref: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  return ref.trim().length > 0 && ref.trim().length <= 500;
}

/**
 * Check for data corruption
 */
export function checkDataIntegrity(notes: NoteMetadata[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idSet = new Set<string>();

  notes.forEach((note, index) => {
    const validation = validateNote(note);

    if (!validation.valid) {
      errors.push(`Note at index ${index}: ${validation.errors.join(', ')}`);
    }

    warnings.push(...validation.warnings);

    // Check for duplicate IDs
    if (idSet.has(note.id)) {
      errors.push(`Duplicate note ID: ${note.id}`);
    }
    idSet.add(note.id);

    // Check for time anomalies
    if (note.updatedAt < note.createdAt) {
      warnings.push(`Note ${note.id}: updatedAt is before createdAt`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
