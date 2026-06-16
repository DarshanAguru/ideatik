/**
 * Custom formatting for notes without displaying markdown.
 * Handles rendering structured note content in a clean, readable format.
 */

import { NoteChecklistItem, StructuredNote } from '../parsers/types';

export interface FormattedContent {
  title: string;
  type: 'note' | 'list' | 'finance';
  bodyText: string;
  items: NoteChecklistItem[];
  references: string[];
}

class CustomNoteFormatterClass {
  /**
   * Convert structured note to formatted display object
   * (does NOT use markdown for display)
   */
  format(structured: StructuredNote): FormattedContent {
    return {
      title: structured.title,
      type: structured.type,
      bodyText: structured.bodyText,
      items: structured.items,
      references: structured.references,
    };
  }

  /**
   * Get display text for a list item
   */
  formatListItem(item: NoteChecklistItem): string {
    if (item.amount !== undefined) {
      return `${item.text} - ₹${item.amount.toFixed(2)}`;
    }
    return item.text;
  }

  /**
   * Calculate financial totals
   */
  calculateFinancialTotals(items: NoteChecklistItem[]): { total: number; checkedTotal: number } {
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
   * Get statistics for a list
   */
  getListStats(items: NoteChecklistItem[]): {
    total: number;
    checked: number;
    unchecked: number;
    totalAmount?: number;
    checkedAmount?: number;
    remainingAmount?: number;
  } {
    const total = items.length;
    const checked = items.filter((i) => i.checked).length;
    const unchecked = total - checked;

    const hasAmounts = items.some((i) => i.amount !== undefined);
    if (hasAmounts) {
      const { total: totalAmount, checkedTotal: checkedAmount } = this.calculateFinancialTotals(items);
      return {
        total,
        checked,
        unchecked,
        totalAmount,
        checkedAmount,
        remainingAmount: totalAmount - checkedAmount,
      };
    }

    return { total, checked, unchecked };
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return `₹${amount.toFixed(2)}`;
  }

  /**
   * Format a note title (clean, no special formatting)
   */
  formatTitle(title: string): string {
    return title.trim() || 'Untitled';
  }
}

export const customNoteFormatter = new CustomNoteFormatterClass();
