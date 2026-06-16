export interface ParsedItem {
  id: string;
  text: string;
  amount?: number;
  checked: boolean;
}

export interface ParsedNoteResult {
  title: string;
  type: 'note' | 'list' | 'finance';
  bodyText: string;
  items: ParsedItem[];
  hasEndCommand: boolean;
  hasReferenceCommand: boolean;
  references: string[];
  pendingReferenceCommands: string[];
}

class CommandParserClass {
  /**
   * Parses the voice transcript and extracts commands, title, checklist items, and body text.
   * Rebuilds the document structure statefully from scratch on every run.
   */
  parse(transcript: string, existingItems: ParsedItem[] = []): ParsedNoteResult {
    const result: ParsedNoteResult = {
      title: '',
      type: 'note',
      bodyText: '',
      items: [],
      hasEndCommand: false,
      hasReferenceCommand: false,
      references: [],
      pendingReferenceCommands: [],
    };

    if (!transcript.trim()) {
      return result;
    }

    // 1. Check End Note / Stop Recording Command anywhere in the text
    const endCommandRegex = /\b(?:end|finish|save)\s+note\b/i;
    const stopRecordingRegex = /\b(?:stop|finish)\s+recording\b/i;
    if (endCommandRegex.test(transcript) || stopRecordingRegex.test(transcript)) {
      result.hasEndCommand = true;
    }

    // Clean out end commands from working transcript text
    let workingText = transcript.replace(endCommandRegex, '').replace(stopRecordingRegex, '');

    // 2. Check Reference Commands and replace with slot tokens
    let refIndex = 1;
    const addRefRegex = /\badd\s+reference\s+here\b/gi;
    workingText = workingText.replace(addRefRegex, () => {
      result.hasReferenceCommand = true;
      const slotToken = `[${refIndex}]`;
      result.pendingReferenceCommands.push(slotToken);
      refIndex++;
      return slotToken;
    });
    result.references = [...result.pendingReferenceCommands];

    // Split text into clauses/sentences using periods, exclamation marks, question marks, semicolons or newlines
    const clauses = workingText
      .split(/(?:[.!?\n\r|]|\b(?:and|then)\b)/)
      .map(s => s.trim())
      .filter(Boolean);

    // List & Finance creation regexes
    const checklistRegex = /\b(?:create|make|start)\s+(?:a\s+)?(?:check)?list\b/i;
    const financeListRegex = /\b(?:create|make|start)\s+(?:a\s+)?(?:finance\s+list|financial\s+list|ledger)\b/i;

    const remainingBodyClauses: string[] = [];

    for (const clause of clauses) {
      // Check list/finance triggers
      if (financeListRegex.test(clause)) {
        result.type = 'finance';
        continue;
      }
      if (checklistRegex.test(clause)) {
        result.type = 'list';
        continue;
      }

      // Check add item trigger
      // Matches: "add item [X]", "add [X]", "add [X] to list", etc.
      if (/^add\b/i.test(clause)) {
        // Strip out leading add and optional item
        let content = clause.replace(/^add\s+(?:item\s*:?\s*|item\s+)?/i, '').trim();
        // Remove trailing "to list" or "to checklist"
        content = content.replace(/\s+to\s+(?:the\s+)?(?:check)?list$/i, '').trim();

        if (content) {
          // Parse amount out of content
          let amount: number | undefined = undefined;

          // Pattern for trailing currency (e.g. "50 rupees", "12 rs", "100.50 ₹", "10 dollars")
          const patternTrailing = content.match(/([\d.-]+)\s*(?:₹|rupee|rupees|rs|\$|dollar|dollars)\b/i);
          // Pattern 1: amount/$/₹/dollar/dollars/rupee/rupees/rs/for/cost/costs followed by a number
          const pattern1 = content.match(/\b(?:amount|\$|₹|dollar|dollars|rupee|rupees|rs|for|cost|costs|price|value)\s*:?\s*([\d.-]+)/i);

          if (patternTrailing) {
            amount = parseFloat(patternTrailing[1]);
            content = content.replace(patternTrailing[0], '').trim();
          } else if (pattern1) {
            amount = parseFloat(pattern1[1]);
            content = content.replace(pattern1[0], '').trim();
          } else {
            // Pattern 2: a colon followed by a number at the end
            const pattern2 = content.match(/:\s*([\d.-]+)$/i);
            if (pattern2) {
              amount = parseFloat(pattern2[1]);
              content = content.replace(pattern2[0], '').trim();
            } else {
              // Pattern 3: just a number at the end of the clause (e.g. "add rent 1200" or "add milk 5")
              const pattern3 = content.match(/\s+([\d.-]+)$/i);
              if (pattern3) {
                amount = parseFloat(pattern3[1]);
                content = content.replace(pattern3[0], '').trim();
              }
            }
          }

          const itemText = content.replace(/^:\s*/, '').trim();
          if (itemText) {
            const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const existing = existingItems.find(
              (ei) => ei.text.toLowerCase() === itemText.toLowerCase()
            );

            result.items.push({
              id: existing ? existing.id : itemId,
              text: itemText,
              amount: amount !== undefined && isNaN(amount) ? undefined : amount,
              checked: existing ? existing.checked : false,
            });

            if (result.type === 'note') {
              result.type = amount !== undefined ? 'finance' : 'list';
            }
          }
        }
        continue;
      }

      // If it's not a command, it's part of the standard body text
      remainingBodyClauses.push(clause);
    }

    // Clean up body text spacing, isolated dangling punctuation
    result.bodyText = remainingBodyClauses
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*([.!?])\s*/g, '$1 ')
      .replace(/(?:^|\s)[.!?](?=\s|$)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Ensure sentences end with a period if they don't have punctuation
    if (result.bodyText && !/[.!?]$/.test(result.bodyText)) {
      result.bodyText += '.';
    }

    return result;
  }

  /**
   * Generates standard Markdown based on note type, body text, and items.
   */
  generateMarkdown(
    type: 'note' | 'list' | 'finance',
    bodyText: string,
    items: ParsedItem[]
  ): string {
    let markdown = bodyText.trim();

    if (items.length > 0) {
      if (markdown) {
        markdown += '\n\n';
      }
      const itemsMarkdown = items
        .map((item) => {
          const checkbox = item.checked ? '- [x]' : '- [ ]';
          if (type === 'finance' && item.amount !== undefined) {
            const amtStr = typeof item.amount === 'number' ? item.amount.toFixed(2) : item.amount;
            return `${checkbox} ${item.text}: ${amtStr}`;
          }
          return `${checkbox} ${item.text}`;
        })
        .join('\n');
      markdown += itemsMarkdown;
    }

    return markdown;
  }
}

export const CommandParser = new CommandParserClass();
