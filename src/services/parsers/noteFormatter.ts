import { StructuredNote } from './types';
import { markdownBuilder } from './markdownBuilder';

class NoteFormatterClass {
  /**
   * Computes the sums of all positive/negative numbers in the list.
   * Calculates both global total and subtotal of checked items.
   */
  calculateFinancialTotals(items: Array<{ amount?: number; checked: boolean }>) {
    let total = 0;
    let checkedTotal = 0;
    items.forEach((item) => {
      if (item.amount !== undefined) {
        total += item.amount;
        if (item.checked) {
          checkedTotal += item.amount;
        }
      }
    });
    return { total, checkedTotal };
  }

  /**
   * Compiles the note and appends a computed totals block if note type is 'finance'.
   */
  format(note: StructuredNote): string {
    let md = markdownBuilder.build(note);
    
    if (note.type === 'finance' && note.items.length > 0) {
      const { total, checkedTotal } = this.calculateFinancialTotals(note.items);
      md += `\n\n> **Total: ${total.toFixed(2)} | Checked: ${checkedTotal.toFixed(2)}**`;
    }
    
    return md;
  }
}

export const noteFormatter = new NoteFormatterClass();
