import { markdownParser } from '../parsers/markdownParser';
import { noteFormatter } from '../parsers/noteFormatter';
import { NoteChecklistItem, StructuredNote } from '../parsers/types';
import { NoteMetadata, NoteReference } from '../database/types';

export interface StructuredNoteContent {
  version: 1;
  title: string;
  type: 'note' | 'list' | 'finance';
  bodyBlocks: string[];
  listItems: NoteChecklistItem[];
  financeItems: NoteChecklistItem[];
  referenceIds: NoteReference[];
  pendingReferenceCommands: string[];
}

const emptyContent = (title = 'Untitled Capture', type: 'note' | 'list' | 'finance' = 'note'): StructuredNoteContent => ({
  version: 1,
  title,
  type,
  bodyBlocks: [],
  listItems: [],
  financeItems: [],
  referenceIds: [],
  pendingReferenceCommands: [],
});

class StructuredNoteServiceClass {
  empty(title?: string, type?: 'note' | 'list' | 'finance'): StructuredNoteContent {
    return emptyContent(title, type);
  }

  parseJson(json?: string | null): StructuredNoteContent | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      if (!parsed || parsed.version !== 1) return null;
      return this.normalize(parsed);
    } catch {
      return null;
    }
  }

  fromMarkdown(markdown: string, fallbackTitle = 'Untitled Capture'): StructuredNoteContent {
    const parsed = markdownParser.parse(markdown || '');
    const title = parsed.title || fallbackTitle || 'Untitled Capture';
    const type = parsed.type || 'note';
    const allItems = parsed.items || [];
    const referenceIds = (parsed.references || []).map((titleRef) => ({
      noteId: '',
      title: titleRef,
    }));

    return this.normalize({
      version: 1,
      title,
      type,
      bodyBlocks: parsed.bodyText ? [parsed.bodyText] : [],
      listItems: type === 'finance' ? [] : allItems,
      financeItems: type === 'finance' ? allItems : [],
      referenceIds,
      pendingReferenceCommands: [],
    });
  }

  fromNote(note: Partial<NoteMetadata>): StructuredNoteContent {
    const structured = this.parseJson(note.structuredContentJson);
    if (structured) {
      return this.normalize({
        ...structured,
        title: note.title || structured.title,
        type: note.type || structured.type,
        referenceIds: note.referenceLinks || structured.referenceIds,
        pendingReferenceCommands: note.pendingReferenceCommands || structured.pendingReferenceCommands,
      });
    }
    return this.fromMarkdown(note.markdownContent || '', note.title || 'Untitled Capture');
  }

  toJson(content: StructuredNoteContent): string {
    return JSON.stringify(this.normalize(content));
  }

  toStructuredNote(content: StructuredNoteContent): StructuredNote {
    const normalized = this.normalize(content);
    return {
      title: normalized.title,
      type: normalized.type,
      bodyText: normalized.bodyBlocks.join('\n\n').trim(),
      items: normalized.type === 'finance' ? normalized.financeItems : normalized.listItems,
      references: normalized.referenceIds.map((ref) => ref.title),
    };
  }

  toMarkdown(content: StructuredNoteContent): string {
    return noteFormatter.format(this.toStructuredNote(content));
  }

  bodyText(content: StructuredNoteContent): string {
    return content.bodyBlocks.join('\n\n').trim();
  }

  items(content: StructuredNoteContent): NoteChecklistItem[] {
    return content.type === 'finance' ? content.financeItems : content.listItems;
  }

  normalize(input: any): StructuredNoteContent {
    const type = input.type === 'list' || input.type === 'finance' ? input.type : 'note';
    const bodyBlocks = Array.isArray(input.bodyBlocks)
      ? input.bodyBlocks.map((b: any) => String(b || '').trim()).filter(Boolean)
      : input.bodyText
      ? [String(input.bodyText).trim()]
      : [];

    const normalizeItem = (item: any, index: number): NoteChecklistItem => ({
      id: item.id || `item_${Date.now()}_${index}`,
      text: String(item.text || '').trim(),
      amount: item.amount === undefined || item.amount === null || item.amount === '' ? undefined : Number(item.amount),
      checked: Boolean(item.checked),
      isChecklist: item.isChecklist !== false,
    });

    const listItems = Array.isArray(input.listItems)
      ? input.listItems.map(normalizeItem).filter((i: NoteChecklistItem) => i.text)
      : Array.isArray(input.items) && type !== 'finance'
      ? input.items.map(normalizeItem).filter((i: NoteChecklistItem) => i.text)
      : [];

    const financeItems = Array.isArray(input.financeItems)
      ? input.financeItems.map(normalizeItem).filter((i: NoteChecklistItem) => i.text)
      : Array.isArray(input.items) && type === 'finance'
      ? input.items.map(normalizeItem).filter((i: NoteChecklistItem) => i.text)
      : [];

    const referenceIds = Array.isArray(input.referenceIds)
      ? input.referenceIds
          .map((ref: any) => ({
            noteId: String(ref.noteId || ref.id || ''),
            title: String(ref.title || ref.noteTitle || ref || '').trim(),
          }))
          .filter((ref: NoteReference) => ref.title || ref.noteId)
      : Array.isArray(input.references)
      ? input.references.map((title: any) => ({ noteId: '', title: String(title || '').trim() })).filter((ref: NoteReference) => ref.title)
      : [];

    return {
      version: 1,
      title: String(input.title || 'Untitled Capture').trim() || 'Untitled Capture',
      type,
      bodyBlocks,
      listItems,
      financeItems,
      referenceIds,
      pendingReferenceCommands: Array.isArray(input.pendingReferenceCommands)
        ? input.pendingReferenceCommands.map((r: any) => String(r || '').trim()).filter(Boolean)
        : [],
    };
  }
}

export const StructuredNoteService = new StructuredNoteServiceClass();
