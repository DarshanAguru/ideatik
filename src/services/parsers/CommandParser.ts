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
  parse(
    transcript: string,
    existingItems: ParsedItem[] = [],
    initialType: 'note' | 'list' | 'finance' = 'note'
  ): ParsedNoteResult {
    const result: ParsedNoteResult = {
      title: '',
      type: initialType,
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

    let workingText = transcript;

    // Check Title Command: "title start <title> end"
    const titleRegex = /\btitle\s+start\s+(.*?)\s+end\b/i;
    const titleMatch = workingText.match(titleRegex);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
      workingText = workingText.replace(titleRegex, '');
    }

    // 2. Check Reference Commands and replace with slot tokens
    let refIndex = 1;
    const addRefRegex = /\badd\s+(?:a\s+)?reference(?:\s*,?\s*here)?\b/gi;
    workingText = workingText.replace(addRefRegex, () => {
      result.hasReferenceCommand = true;
      const slotToken = `[${refIndex}]`;
      result.pendingReferenceCommands.push(slotToken);
      refIndex++;
      return slotToken;
    });
    result.references = [...result.pendingReferenceCommands];

    // Split text into sentences using sentence punctuation
    const sentences = workingText
      .split(/[.!?\n\r|]+/)
      .map(s => s.trim())
      .filter(Boolean);

    // List & Finance creation regexes
    const checklistRegex = /\b(?:create|make|start)\s+(?:a\s+)?(?:check)?list\b/i;
    const financeListRegex = /\b(?:create|make|start)\s+(?:a\s+)?(?:finance\s+list|financial\s+list|ledger)\b/i;

    const remainingBodyClauses: string[] = [];

    const parseAndAddItem = (clause: string, existing: ParsedItem[]) => {
      // Strip out leading add and optional item if present
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
            // Pattern 3: just a number at the end of the clause (e.g. "rent 1200" or "milk 5")
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
          const matchedExisting = existing.find(
            (ei) => ei.text.toLowerCase() === itemText.toLowerCase()
          );

          result.items.push({
            id: matchedExisting ? matchedExisting.id : itemId,
            text: itemText,
            amount: amount !== undefined && isNaN(amount) ? undefined : amount,
            checked: matchedExisting ? matchedExisting.checked : false,
          });

          if (result.type === 'note') {
            result.type = amount !== undefined ? 'finance' : 'list';
          }
        }
      }
    };

    const itemSplitRegex = /(?:\s+(?:and|then)\s+|\s*,\s*|\badd\s+(?:item\s*:?\s*|item\s+)?\b)/gi;

    for (const sentence of sentences) {
      let isListTrigger = false;
      let checkSentence = sentence;

      // Check list/finance triggers
      if (financeListRegex.test(checkSentence)) {
        result.type = 'finance';
        isListTrigger = true;
      } else if (checklistRegex.test(checkSentence)) {
        result.type = 'list';
        isListTrigger = true;
      }

      if (isListTrigger) {
        // Strip out the trigger command
        checkSentence = checkSentence
          .replace(financeListRegex, '')
          .replace(checklistRegex, '')
          .trim();
        // Remove leading connecting words like "with", "of", "containing", ":" or "and"
        checkSentence = checkSentence.replace(/^(?:with|of|containing|:)\s*/i, '').trim();
        if (!checkSentence) {
          continue;
        }

        // Split trigger sentence contents by and, then, commas, or add/add item
        const subClauses = checkSentence
          .split(itemSplitRegex)
          .map(s => s.trim())
          .filter(Boolean);

        for (const subClause of subClauses) {
          parseAndAddItem(subClause, existingItems);
        }
        continue;
      }

      // If it starts with "add", it is a list/finance item line
      const isAddTrigger = /^add\b/i.test(sentence);

      if (isAddTrigger) {
        // Split by and, then, commas, or add/add item to support multiple item additions in a single line
        const subClauses = sentence
          .split(itemSplitRegex)
          .map(s => s.trim())
          .filter(Boolean);

        for (const subClause of subClauses) {
          parseAndAddItem(subClause, existingItems);
        }
        continue;
      }

      // If it's not a list trigger or add command, it's standard body text
      remainingBodyClauses.push(sentence);
    }

    // Clean up body text spacing, isolated dangling punctuation
    result.bodyText = remainingBodyClauses
      .join('. ')
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
