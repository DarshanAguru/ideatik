import { StructuredNote, NoteChecklistItem } from './types';

class MarkdownParserClass {
  /**
   * Parses standard Markdown into a structured note model.
   * If existingItems are provided, matches and preserves their IDs.
   */
  parse(markdown: string, existingItems: NoteChecklistItem[] = []): StructuredNote {
    const result: StructuredNote = {
      title: '',
      type: 'note',
      bodyText: '',
      items: [],
      references: [],
    };

    if (!markdown.trim()) {
      return result;
    }

    const lines = markdown.split('\n');
    const cleanBodyLines: string[] = [];
    let itemIndex = 0;

    // Parse inline references [[...]] globally from the entire text
    const wikiLinkRegex = /\[\[(.+?)]]/g;
    let match;
    while ((match = wikiLinkRegex.exec(markdown)) !== null) {
      const refTitle = match[1].trim();
      if (refTitle && !result.references.includes(refTitle)) {
        result.references.push(refTitle);
      }
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // 1. Skip computed financial summary lines
      if (trimmed.startsWith('> **Total:') || trimmed.startsWith('>**Total:')) {
        return;
      }

      // 2. Heading H1
      const titleMatch = trimmed.match(/^#\s+(.+)$/);
      if (titleMatch) {
        result.title = titleMatch[1].trim();
        return;
      }

      // 3. Skip references-only line if it was parsed globally
      // (Lines that consist only of one or more [[Ref]] links)
      const cleanLine = trimmed.replace(/\[\[.+?\]\]/g, '').trim();
      if (cleanLine === '') {
        return;
      }

      // 4. Checklist Item
      // Matches: "- [ ] milk", "* [x] bread", "- [ ] eggs: 3.50", "- [x] gasoline: -40", "- [ ] apple $2.50"
      const checklistMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (checklistMatch) {
        const checked = checklistMatch[1].toLowerCase() === 'x';
        let itemText = checklistMatch[2].trim();
        let amount: number | undefined;

        // Extract amount from end of string: e.g. ": 4.50", ": $4.50", " $4.50", " 4.50"
        const amountMatch = itemText.match(/(?::\s*|\s+)\$?(-?\d+(?:\.\d+)?)$/);
        if (amountMatch) {
          const parsedVal = parseFloat(amountMatch[1]);
          if (!isNaN(parsedVal)) {
            amount = parsedVal;
            itemText = itemText.substring(0, itemText.length - amountMatch[0].length).trim();
          }
        }

        const itemId = `item_${itemIndex++}`;
        
        // Match with existing item to preserve stable IDs
        const matchItem = existingItems.find(
          (ei) => ei.text.toLowerCase() === itemText.toLowerCase()
        );

        result.items.push({
          id: matchItem ? matchItem.id : itemId,
          text: itemText,
          amount,
          checked,
          isChecklist: true,
        });

        if (amount !== undefined) {
          result.type = 'finance';
        } else if (result.type === 'note') {
          result.type = 'list';
        }
        return;
      }

      // 5. Bullet List Item
      // Matches: "- item", "* item", ignoring checkbox formats
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        const itemText = bulletMatch[1].trim();
        
        // Prevent matching checklists that failed regex 4
        if (!itemText.startsWith('[ ]') && !itemText.startsWith('[x]') && !itemText.startsWith('[X]')) {
          const itemId = `item_${itemIndex++}`;
          const matchItem = existingItems.find(
            (ei) => ei.text.toLowerCase() === itemText.toLowerCase()
          );

          result.items.push({
            id: matchItem ? matchItem.id : itemId,
            text: itemText,
            checked: false,
            isChecklist: false,
          });

          if (result.type === 'note') {
            result.type = 'list';
          }
          return;
        }
      }

      // 6. Regular Paragraph Line (exclude standalone inline wiki-link text that got cleaned up)
      // Strip out the inline [[Ref]] text formatting from body text for clean render, or keep it.
      // Keeping [[Ref]] format is standard markdown so we keep it.
      cleanBodyLines.push(trimmed);
    });

    result.bodyText = cleanBodyLines.join(' ');
    return result;
  }
}

export const markdownParser = new MarkdownParserClass();
