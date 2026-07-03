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
  hasReferenceCommand: boolean;
  references: string[];
  pendingReferenceCommands: string[];
}

// ─── Spoken-number → numeric converter ────────────────────────────────────────
// Handles digits, comma-separated numbers, and English word numbers
// e.g. "twelve thousand fifty rupees" → 12050
function wordsToNumber(raw: string): number | undefined {
  // Strip currency/filler words before trying to parse
  const cleaned = raw
    .toLowerCase()
    .replace(/\b(?:rupees?|rs|inr|dollars?|usd|pounds?|gbp)\b/g, '')
    .replace(/\b(?:and|a)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;

  // If it looks purely numeric (with optional commas/dots), use parseFloat
  if (/^[\d,.\s]+$/.test(cleaned)) {
    const n = parseFloat(cleaned.replace(/,/g, ''));
    return isNaN(n) ? undefined : n;
  }

  // Word-to-number lookup tables
  const ones: Record<string, number> = {
    zero: 0, oh: 0,
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  };
  const tensMap: Record<string, number> = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };

  const tokens = cleaned.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let current = 0;

  for (const tok of tokens) {
    if (ones[tok] !== undefined) {
      current += ones[tok];
    } else if (tensMap[tok] !== undefined) {
      current += tensMap[tok];
    } else if (tok === 'hundred') {
      current = (current === 0 ? 1 : current) * 100;
    } else if (tok === 'thousand') {
      current = (current === 0 ? 1 : current) * 1000;
      total += current;
      current = 0;
    } else if (tok === 'lakh' || tok === 'lac') {
      current = (current === 0 ? 1 : current) * 100000;
      total += current;
      current = 0;
    } else if (tok === 'million') {
      current = (current === 0 ? 1 : current) * 1000000;
      total += current;
      current = 0;
    } else {
      // Attempt direct digit fallback (handles mixed strings like "1200")
      const n = parseFloat(tok.replace(/,/g, ''));
      if (!isNaN(n)) current += n;
    }
  }

  total += current;
  return total > 0 ? total : undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Split `text` by the "add" (or "ad") keyword as a standalone word.
 * Returns an array of segments where each segment (except possibly the first)
 * is prefixed with "add " so the caller can detect and strip it.
 *
 * e.g. "add milk add eggs" → ["add milk", "add eggs"]
 *      "extra add milk"    → ["extra", "add milk"]
 */
function splitByAdd(text: string): string[] {
  const parts = text.split(/\b(?:add|ad)\b\s+/i);
  return parts
    .map((p, i) => (i === 0 ? p.trim() : `add ${p.trim()}`))
    .filter(Boolean);
}

// ─── Parser class ─────────────────────────────────────────────────────────────

class CommandParserClass {
  /**
   * Parse a voice transcript into a structured note result.
   *
   * Checklist items
   * ───────────────
   *  • The word "add" (or phonetic "ad") is the ONLY item separator.
   *  • Everything from one "add" to the next "add" becomes one list item verbatim.
   *  • Connectives like "and", "also", "then" are NOT split triggers.
   *
   * Finance items
   * ─────────────
   *  • Same "add" separator rule applies.
   *  • Within an "add" segment, the word "cost" separates the description from
   *    the amount, e.g. "add rent cost twelve thousand" → {text:"rent", amount:12000}.
   *  • Amounts can be spoken as English words or plain digits.
   */
  parse(
    transcript: string,
    existingItems: ParsedItem[] = [],
    initialType: 'note' | 'list' | 'finance' = 'note',
  ): ParsedNoteResult {
    const result: ParsedNoteResult = {
      title: '',
      type: initialType,
      bodyText: '',
      items: [],
      hasReferenceCommand: false,
      references: [],
      pendingReferenceCommands: [],
    };

    if (!transcript.trim()) return result;

    let workingText = transcript;

    // ── 1. Replace reference commands with slot tokens BEFORE any other processing
    let refIndex = 1;
    const addRefRegex =
      /\b(?:(?:add|ad|and|had|at|i'd|edit|insert|attach|include|link|create|put|make)\s+(?:a\s+)?(?:ref|reference|referenc|refrence|refference|referense|referance|preferance|difference|refence|reverence|citation|link|source|resource|context)(?:\s*(?:here|hear|herein))?|(?:ref|reference|referenc|refrence|refference|referense|referance|preferance|difference|refence|reverence|citation|link|source|resource|context)\s+(?:here|hear))\b/gi;

    workingText = workingText.replace(addRefRegex, () => {
      result.hasReferenceCommand = true;
      const slotToken = `[${refIndex}]`;
      result.pendingReferenceCommands.push(slotToken);
      refIndex++;
      return slotToken;
    });
    result.references = [...result.pendingReferenceCommands];

    // ── 2. Split transcript into sentences
    const sentences = workingText
      .split(/[.!?\n\r|]+/)
      .map(s => s.trim())
      .filter(Boolean);

    // Trigger patterns
    const checklistRegex =
      /\b(?:create|make|start|begin|setup|set\s+up|new|open)\s+(?:a\s+)?(?:check\s*list|check\s*lest|todo|to-do|task\s+list|bullet\s+list|list|lest)\b|\b(?:checklist|check\s*lest)\b/i;
    const financeListRegex =
      /\b(?:create|make|start|begin|setup|set\s+up|new|open)\s+(?:a\s+)?(?:finance\s*list|financial\s*list|ledger|expense\s*list|expenses\s*list|budget\s*list|money\s*list|expense\s*tracker|finance\s*ledger|financial\s*ledger|finance\s*lest|financial\s*lest)\b|\b(?:ledger|finance\s+list|financial\s+list)\b/i;

    const remainingBodyClauses: string[] = [];

    // ── 3. Helpers ──────────────────────────────────────────────────────────

    const addSingleItem = (
      itemText: string,
      amount: number | undefined,
      existing: ParsedItem[],
    ) => {
      if (!itemText) return;
      const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const matchedExisting = existing.find(
        ei => ei.text.toLowerCase() === itemText.toLowerCase(),
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
    };

    /**
     * Parse a single "add <...>" segment into a list/finance item.
     *
     * List mode  : everything after "add" (and optional leading "item") is the item text.
     * Finance mode: everything before "cost" is the description; everything after
     *               "cost" is parsed as a number (supports spoken words).
     */
    const parseAddSegment = (segment: string, existing: ParsedItem[]) => {
      // Strip the leading "add" / "ad" trigger word
      let content = segment.replace(/^(?:add|ad)\s+/i, '').trim();

      // Strip optional "item" prefix ONLY when NOT followed by a digit
      // so "add item milk" → "milk"  but "add item 1 and item 2" → "item 1 and item 2"
      content = content.replace(/^item\s+(?!\d)/i, '').trim();

      // Strip trailing "to list" / "to checklist"
      content = content.replace(/\s+to\s+(?:the\s+)?(?:check)?list$/i, '').trim();

      if (!content) return;

      if (result.type === 'finance') {
        // Find the "cost" keyword boundary
        const costIdx = content.search(/\bcost\b/i);
        if (costIdx !== -1) {
          const desc = content.slice(0, costIdx).trim();
          const afterCost = content.slice(costIdx + 4).trim(); // skip "cost"
          // Stop at the NEXT "cost" occurrence — any further "cost" without a
          // preceding "add" is malformed input and must not pollute the amount.
          // e.g. "rent cost twelve thousand and fifty and coffee cost fifty"
          //      → amount text is only "twelve thousand and fifty and coffee" → 12050
          const nextCostIdx = afterCost.search(/\bcost\b/i);
          const amountText =
            nextCostIdx !== -1 ? afterCost.slice(0, nextCostIdx).trim() : afterCost;
          const amount = wordsToNumber(amountText);
          if (desc) addSingleItem(desc, amount, existing);
        } else {
          // No "cost" keyword — add as description-only entry
          addSingleItem(content, undefined, existing);
        }
      } else {
        // List mode — entire content is the item text
        addSingleItem(content, undefined, existing);
      }
    };

    // ── 4. Process each sentence ─────────────────────────────────────────────

    for (const sentence of sentences) {
      let checkSentence = sentence;
      let isListTrigger = false;

      // Detect list/finance trigger
      if (financeListRegex.test(checkSentence)) {
        result.type = 'finance';
        isListTrigger = true;
      } else if (checklistRegex.test(checkSentence)) {
        result.type = 'list';
        isListTrigger = true;
      }

      if (isListTrigger) {
        // Strip trigger phrase and leading connectives
        checkSentence = checkSentence
          .replace(financeListRegex, '')
          .replace(checklistRegex, '')
          .replace(/^(?:with|of|containing|:)\s*/i, '')
          .trim();

        if (!checkSentence) continue;

        // Process remaining content — only "add" segments become items
        const segments = splitByAdd(checkSentence);
        for (const seg of segments) {
          if (/^(?:add|ad)\s/i.test(seg)) {
            parseAddSegment(seg, existingItems);
          }
          // Text before the first "add" in a trigger sentence is ignored
        }
        continue;
      }

      // ── Non-trigger sentences ─────────────────────────────────────────────

      const isAddTrigger = /^\b(?:add|ad)\b/i.test(sentence);
      const isRefSlot = /^\[\d+\]$/.test(sentence.trim());
      const wordCount = sentence.split(/\s+/).filter(Boolean).length;

      // Implicit item: short sentence (≤ 3 words) while already in list/finance mode
      // (covers period-separated dictation: "create checklist. eggs. milk. bread.")
      const isImplicitItem =
        (result.type === 'list' || result.type === 'finance') &&
        wordCount <= 3 &&
        !isRefSlot &&
        !isAddTrigger;

      if (isAddTrigger) {
        const segments = splitByAdd(sentence);
        for (const seg of segments) {
          if (/^(?:add|ad)\s/i.test(seg)) {
            parseAddSegment(seg, existingItems);
          }
        }
        continue;
      }

      if (isImplicitItem) {
        let content = sentence.trim();
        content = content.replace(/\s+to\s+(?:the\s+)?(?:check)?list$/i, '').trim();

        if (result.type === 'finance') {
          const costIdx = content.search(/\bcost\b/i);
          if (costIdx !== -1) {
            const desc = content.slice(0, costIdx).trim();
            const amountText = content.slice(costIdx + 4).trim();
            const amount = wordsToNumber(amountText);
            addSingleItem(desc, amount, existingItems);
          } else {
            addSingleItem(content, undefined, existingItems);
          }
        } else {
          addSingleItem(content, undefined, existingItems);
        }
        continue;
      }

      // Standard body text
      remainingBodyClauses.push(sentence);
    }

    // ── 5. Assemble body text ─────────────────────────────────────────────────
    result.bodyText = remainingBodyClauses
      .join('. ')
      .replace(/\s+/g, ' ')
      .replace(/\s*([.!?])\s*/g, '$1 ')
      .replace(/(?:^|\s)[.!?](?=\s|$)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

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
    items: ParsedItem[],
  ): string {
    let markdown = bodyText.trim();

    if (items.length > 0) {
      if (markdown) markdown += '\n\n';
      const itemsMarkdown = items
        .map(item => {
          const checkbox = item.checked ? '- [x]' : '- [ ]';
          if (type === 'finance' && item.amount !== undefined) {
            const amtStr =
              typeof item.amount === 'number'
                ? item.amount.toFixed(2)
                : item.amount;
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
