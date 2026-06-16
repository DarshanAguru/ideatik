export interface NoteChecklistItem {
  id: string;
  text: string;
  amount?: number;
  checked: boolean;
  isChecklist: boolean; // false if it's a simple bullet item
}

export interface StructuredNote {
  title: string;
  type: 'note' | 'list' | 'finance';
  bodyText: string;
  items: NoteChecklistItem[];
  references: string[];
}
