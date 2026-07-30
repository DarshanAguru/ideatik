import { NoteRepository } from '../database/NoteRepository';
import { StructuredNoteService } from '../notes/StructuredNoteService';
import { LocalVectorIndex, RetrievedChunk } from './LocalVectorIndex';
import { useSettingsStore } from '../../features/settings/settingsStore';
import { initLlama } from 'llama.rn';
import { AppState } from 'react-native';
import { SystemNotificationService } from '../notifications/SystemNotificationService';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface FinanceLineItem {
  text: string;
  amount: number;
}

export interface FinanceCategorySummary {
  category: string;
  total: number;
  items: FinanceLineItem[];
}

export interface FinanceIntelligenceResult {
  title: string;
  items: FinanceLineItem[];
  totalSpent: number;
  overallBudget?: number;
  remainingBudget?: number;
  percentageSpent?: number;
  categorySummaries?: FinanceCategorySummary[];
  highestCategory?: { name: string; amount: number };
  lowestCategory?: { name: string; amount: number };
  pendingItems?: string[];
  explanation: string;
  currency: string;
  sources?: RetrievedChunk[];
}

export interface SummaryResult {
  title?: string;
  bullets: string[];
  sources: RetrievedChunk[];
  rawText: string;
}

export interface QAResult {
  answer: string;
  sources: RetrievedChunk[];
}

export type RagResult =
  | { kind: 'finance'; data: FinanceIntelligenceResult }
  | { kind: 'summary'; data: SummaryResult }
  | { kind: 'qa'; data: QAResult }
  | { kind: 'empty'; message: string };

// ─── Category Dictionary & Helper NLP ──────────────────────────────────────────

const CATEGORIES: Record<string, string[]> = {
  food: ['food', 'lunch', 'dinner', 'breakfast', 'tea', 'coffee', 'snack', 'burger', 'chips', 'pizza', 'restaurant', 'cafe', 'meal', 'eating', 'groceries', 'milk'],
  transport: ['transport', 'cab', 'taxi', 'uber', 'ola', 'auto', 'rickshaw', 'bus', 'train', 'flight', 'petrol', 'fuel', 'travel', 'fare', 'toll'],
  stay: ['hotel', 'stay', 'resort', 'airbnb', 'room', 'accommodation', 'booking', 'lodge'],
  shopping: ['shopping', 'clothes', 'shoes', 'electronics', 'buy', 'purchase', 'mall'],
  bills: ['rent', 'electricity', 'water', 'wifi', 'internet', 'recharge', 'subscription', 'bill'],
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORIES)) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return 'other';
}

function extractTopicKeywords(query: string): string[] {
  const stopwords = new Set([
    'how', 'much', 'did', 'i', 'spend', 'spending', 'spent', 'cost', 'expense', 'expenses',
    'what', 'is', 'my', 'the', 'a', 'an', 'was', 'were', 'for', 'on', 'in', 'of', 'to',
    'show', 'find', 'which', 'highest', 'lowest', 'total', 'budget', 'left', 'remaining',
    'percentage', 'percent', 'portion', 'share', 'ratio', 'all', 'and', 'with',
    'explain', 'tell', 'me', 'about', 'note', 'notes', 'today', 'category',
  ]);
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopwords.has(w));
}

// ─── System Prompts & LLM Configuration ───────────────────────────────────────

const CITATION_INSTRUCTION = `\n5. CRITICAL CITATION RULE:\nAt the very end of your response, add exactly one line starting with "CITATION: " followed by the exact literal note line(s) or items from context that you used to form your conclusion (e.g. "CITATION: • Hotel Resort: Rs. 4000").`;

const SYSTEM_PROMPT_FINANCE = `You are Ideatik AI, a precise, deterministic financial intelligence assistant for personal notebooks.
STRICT RESPONSE FORMAT:
Always format your output using this exact structure:

## Financial Summary: [Title]
- **Grand Total Expense**: Rs. [Amount]
- **Budget Status**: [Budget info or Not specified]

### Category Breakdown
• **[CATEGORY]**: Rs. [Amount] ([Share]%)

### Itemized Expenses
• **[Item Text]**: Rs. [Amount]

STRICT RULES:
1. ACCURACY & MATH RULE: All expenses are in Indian Rupees (Rs. or ₹). DO NOT recalculate or guess math numbers yourself. Use ONLY the exact pre-computed math facts provided in the context.
2. CURRENCY SYMBOL RULE: Use ONLY "Rs." or "₹" for currency. NEVER use "$", "USD", "€", "£", or any other currency symbol.
3. Keep the format consistent, clean, exact, and predictable without changing response layout between queries.` + CITATION_INSTRUCTION;

const SYSTEM_PROMPT_PENDING = `You are Ideatik AI, a precise checklist & task assistant for personal notebooks.
STRICT RESPONSE FORMAT:
Always format your output using clean section headings and bullet lists:

## Pending Tasks: [Note Title]
• **[Item Text]**

STRICT RULES:
1. Answer using ONLY the provided notebook checklists and tasks.
2. CURRENCY SYMBOL RULE: Use ONLY "Rs." or "₹" for any amounts. NEVER use "$", "USD", "€", or "£".
3. Keep response format consistent, structured, and factual.` + CITATION_INSTRUCTION;

const SYSTEM_PROMPT_SUMMARY = `You are Ideatik AI, an expressive, factual notebook summarization assistant.
STRICT RESPONSE FORMAT:
## Key Summary
• **[Topic/Action]**: [Details]

STRICT RULES:
1. Summarize the provided note context into 3 to 5 well-formatted bullet points (• ).
2. CURRENCY SYMBOL RULE: Use ONLY "Rs." or "₹" for any amounts. NEVER use "$", "USD", "€", or "£".
3. Highlight key topics, action items, or decisions accurately. Do NOT add outside fluff or hallucinated facts.` + CITATION_INSTRUCTION;

const SYSTEM_PROMPT_CONCEPT = `You are Ideatik AI, a precise, factual notebook assistant.
RULES:
1. Answer questions, explain concepts, give word meanings, perform math calculations, and extract details based on the user's captured notes.
2. CURRENCY SYMBOL RULE: Use ONLY "Rs." or "₹" for any amounts. NEVER use "$", "USD", "€", or "£".
3. Format your output using clear Markdown headings, bold emphasis (**key term**), and structured lists (• ).
4. Be consistent, helpful, and concise. Answer directly using the note context provided.
5. If a query is completely unrelated to notes, calculations, or word meanings, politely explain: "I am your dedicated notebook assistant! I can help you with your notes, checklists, expense calculations, word meanings, and summaries. Ask me anything about your notebook!"` + CITATION_INSTRUCTION;

function sanitizeCurrencySymbols(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\s?(\d+(\.\d+)?)/g, 'Rs. $1')
    .replace(/(\d+(\.\d+)?)\s?USD/gi, 'Rs. $1')
    .replace(/€\s?(\d+(\.\d+)?)/g, 'Rs. $1')
    .replace(/£\s?(\d+(\.\d+)?)/g, 'Rs. $1');
}

function extractCitationFromLlmOutput(rawText: string): { cleanText: string; citationText?: string } {
  if (!rawText) return { cleanText: '' };

  const sanitized = sanitizeCurrencySymbols(rawText);

  const match = sanitized.match(/\n?CITATION:\s*([\s\S]*)$/i);
  if (match) {
    const citationText = match[1].trim();
    const cleanText = sanitized.replace(/\n?CITATION:\s*([\s\S]*)$/i, '').trim();
    return { cleanText, citationText };
  }

  return { cleanText: sanitized.trim() };
}

// ─── LLM Execution ─────────────────────────────────────────────────────────────
// Two separate execution paths:
//   runFinanceLlm  → temperature 0.0, top_k 1  → ZERO variation (finance narration only)
//   runTextLlm     → temperature 0.05, top_k 10 → ≤5% variation (concept / summary / pending)
// Both cap n_batch at 256 to prevent CPU saturation / phone hangs.

async function runLlmInferenceInternal(
  systemPrompt: string,
  userPrompt: string,
  nPredict: number,
  temperature: number,
  topK: number,
  topP: number,
): Promise<string> {
  const startTime = Date.now();
  const model = useSettingsStore.getState().llmModelUri;
  if (!model) throw new Error('LLM_MODEL_NOT_CONFIGURED');
  const context = await initLlama({
    model,
    n_ctx: 2048,
    n_batch: 256,     // cap batch to avoid memory spikes / hangs
    n_threads: topK === 1 ? 2 : 4,   // finance = 2 threads (fast); text = 4 threads (quality)
    n_gpu_layers: 0,
    use_mlock: false,
  });
  try {
    const result = await context.completion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      n_predict: nPredict,
      temperature,
      top_k: topK,
      top_p: topP,
    });
    const answer = result.text.trim();

    const elapsed = Date.now() - startTime;
    if (AppState.currentState !== 'active' && elapsed > 3000) {
      void SystemNotificationService.notify({
        title: 'AI Answer Ready',
        body: answer.slice(0, 140),
      });
    }

    return answer;
  } finally {
    await context.release();
  }
}

/** Finance narration: temperature 0.0 — fully deterministic, zero variation. */
async function runFinanceLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  return runLlmInferenceInternal(systemPrompt, userPrompt, 120, 0.0, 1, 1.0);
}

/** Text inference (concept / summary / pending): temperature 0.05 — ≤5% variation, richer output. */
async function runTextLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  return runLlmInferenceInternal(systemPrompt, userPrompt, 360, 0.05, 10, 0.3);
}

/** Legacy alias kept for any call sites not yet migrated. */
async function runLlmInference(
  systemPrompt: string,
  userPrompt: string,
  nPredict = 360,
): Promise<string> {
  return runLlmInferenceInternal(systemPrompt, userPrompt, nPredict, 0.05, 10, 0.3);
}

// ─── Deterministic Finance Intelligence ────────────────────────────────────────
//
// Architecture:
//   1. LLM (semantic only): classify each item into a category → returns text lines "item -> category"
//   2. TypeScript: parse classification, apply query filter, compute ALL math (sums, %, budget)
//   3. TypeScript: build the entire formatted response
//   LLM never sees or produces any numbers.

/** LLM prompt for pure semantic categorization — returns structured text, ZERO numbers. */
const CATEGORIZE_PROMPT = `You are a finance item categorizer. Your ONLY job is to classify expense items.
For each item below, output EXACTLY one line in this format:
item text -> category

Categories: food, transport, stay, shopping, bills, entertainment, health, other

Rules:
- Output ONLY the lines. No explanations. No numbers. No totals.
- Each line must be: [exact item text] -> [category]
- Every item must appear exactly once.`;

/** Parse LLM categorization output: "item text -> category" per line */
function parseLlmCategorization(
  raw: string,
  allItems: FinanceLineItem[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const validCats = new Set(['food', 'transport', 'stay', 'shopping', 'bills', 'entertainment', 'health', 'other']);
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const arrowIdx = line.lastIndexOf('->');
    if (arrowIdx === -1) continue;
    const itemText = line.slice(0, arrowIdx).trim().replace(/^\d+\.\s*/, '');
    const cat = line.slice(arrowIdx + 2).trim().toLowerCase();
    if (itemText && validCats.has(cat)) {
      result[itemText] = cat;
    }
  }
  // Fallback: items the LLM didn't classify → use keyword detector
  for (const item of allItems) {
    if (!result[item.text]) {
      result[item.text] = detectCategory(item.text);
    }
  }
  return result;
}

/** Detect what the user's query is asking for */
type FinanceQueryIntent =
  | { kind: 'category_breakdown' }               // "category wise", "breakdown", "split by category"
  | { kind: 'specific_category'; cat: string }   // "how much food", "show transport"
  | { kind: 'specific_items'; keywords: string[] } // "hotel", "restaurant X"
  | { kind: 'budget_status' }                    // "remaining budget", "left"
  | { kind: 'highest_lowest' }                   // "highest", "most spent on"
  | { kind: 'summary' };                         // default: full summary

function detectQueryIntent(query: string, topicKeywords: string[]): FinanceQueryIntent {
  const lq = query.toLowerCase();
  if (lq.match(/\b(category|categor|breakdown|split|percent|portion|share|ratio|wise)\b/)) {
    return { kind: 'category_breakdown' };
  }
  if (lq.match(/\b(budget|remaining|left|balance|over budget)\b/)) {
    return { kind: 'budget_status' };
  }
  if (lq.match(/\b(highest|most|biggest|largest|maximum)\b/)) {
    return { kind: 'highest_lowest' };
  }
  // Check if any keyword matches a known category
  for (const kw of topicKeywords) {
    for (const [cat, words] of Object.entries(CATEGORIES)) {
      if (words.includes(kw) || cat === kw) {
        return { kind: 'specific_category', cat };
      }
    }
  }
  if (topicKeywords.length > 0) {
    return { kind: 'specific_items', keywords: topicKeywords };
  }
  return { kind: 'summary' };
}

function extractAmountFromText(text: string): number | undefined {
  if (!text) return undefined;
  // Match currency prefix or colon or number with optional commas: e.g. "Rs. 18,000", "₹12,500", ": 18,000", "18000"
  let match = text.match(/(?:rs\.?|₹|\$|:)\s*(-?[\d,]+(?:\.\d+)?)/i);
  if (!match) {
    match = text.match(/\b(-?[\d,]+(?:\.\d+)?)\s*$/i);
  }
  if (!match) {
    match = text.match(/\b(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?)\b/);
  }
  if (!match) return undefined;

  const rawNumStr = match[1].replace(/,/g, '');
  const val = parseFloat(rawNumStr);
  return isNaN(val) ? undefined : val;
}

async function financeIntelligenceStrategy(query: string): Promise<RagResult> {
  const lowerQuery = query.toLowerCase();
  const topicKeywords = extractTopicKeywords(query);
  const isToday = lowerQuery.includes('today');
  const startOfToday = new Date().setHours(0, 0, 0, 0);

  const allNotes = await NoteRepository.findAll();
  const activeNotes = allNotes.filter((n) => !n.isDeleted && !n.isLocked);

  const allFinance = activeNotes.filter((n) => {
    if (n.type === 'finance') return true;
    const lowerTitle = n.title.toLowerCase();
    if (lowerTitle.match(/\b(finance|finances|expense|expenses|budget|spent|ledger|cost|money|bills|bill|trip|shopping)\b/)) {
      return true;
    }
    const structured = StructuredNoteService.fromNote(n);
    const items = StructuredNoteService.items(structured);
    return items.some((i) => i.amount !== undefined && !isNaN(Number(i.amount)));
  });

  if (allFinance.length === 0) {
    return { kind: 'empty', message: "I couldn't find any finance notes in your notebook." };
  }

  // Semantic note selection
  let vectorMatchedIds = new Set<string>();
  try {
    const vectorHits = await LocalVectorIndex.search(query, 3);
    vectorHits.forEach((h) => vectorMatchedIds.add(h.noteId));
  } catch { }

  const FINANCE_GENERIC_KEYWORDS = new Set([
    'summarise', 'summarize', 'summary', 'overview', 'list', 'finance', 'finances',
    'expense', 'expenses', 'total', 'all', 'show', 'my', 'the', 'breakdown', 'what',
    'did', 'spend', 'how', 'much', 'category', 'breakdown', 'percent', 'wise',
  ]);
  const specificTitleKeywords = topicKeywords.filter(
    (kw) => !FINANCE_GENERIC_KEYWORDS.has(kw) && detectCategory(kw) === 'other'
  );

  let financeNotes: typeof allFinance = [];
  if (specificTitleKeywords.length > 0) {
    const titleMatched = allFinance.filter((n) => {
      const lowerTitle = n.title.toLowerCase();
      return specificTitleKeywords.some((kw) => kw.length > 2 && lowerTitle.includes(kw));
    });
    if (titleMatched.length > 0) financeNotes = titleMatched;
  }
  if (financeNotes.length === 0) {
    financeNotes = isToday
      ? allFinance.filter((n) => n.createdAt >= startOfToday)
      : allFinance;
  }

  // Extract all finance line items
  let allItems: FinanceLineItem[] = [];
  const noteTitle = financeNotes.map((n) => n.title).join(' & ');
  let overallBudget: number | undefined;

  for (const note of financeNotes) {
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    const budgetMatch =
      note.title.match(/budget\s*:?\s*([\d,]+)/i) ||
      StructuredNoteService.bodyText(structured).match(/budget\s*:?\s*([\d,]+)/i);
    if (budgetMatch && !overallBudget) {
      overallBudget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
    }

    const processedTexts = new Set<string>();

    for (const item of items) {
      let amount: number | undefined =
        item.amount !== undefined && !isNaN(Number(item.amount))
          ? Number(item.amount)
          : undefined;

      if (amount === undefined) {
        amount = extractAmountFromText(item.text);
      }

      if (amount !== undefined && !isNaN(amount)) {
        allItems.push({ text: item.text, amount });
        processedTexts.add(item.text.toLowerCase().trim());
      }
    }

    // Also scan body text lines for any expense items not in the structured items list
    const bodyLines = StructuredNoteService.bodyText(structured).split('\n');
    for (const line of bodyLines) {
      const trimmedLine = line.trim().replace(/^[-*•]\s+/, '').replace(/^\[[ xX]\]\s+/, '');
      if (!trimmedLine) continue;
      const lower = trimmedLine.toLowerCase();
      if (processedTexts.has(lower)) continue;

      const amt = extractAmountFromText(trimmedLine);
      if (amt !== undefined && !isNaN(amt)) {
        const cleanLabel = trimmedLine
          .replace(/(?::\s*|\s+)(?:rs\.?|₹|\$)?\s*(-?[\d,]+(?:\.\d+)?)$/i, '')
          .trim() || trimmedLine;
        allItems.push({ text: cleanLabel, amount: amt });
        processedTexts.add(lower);
      }
    }
  }

  if (allItems.length === 0) {
    return { kind: 'empty', message: 'No expense items with amounts found in your finance notes.' };
  }

  // ── STEP 1: LLM Semantic Categorization (no numbers, no math) ──────────────
  // Ask LLM to assign each item to a category. LLM outputs ONLY "item -> category" lines.
  let itemCategoryMap: Record<string, string> = {};
  const llmModel = useSettingsStore.getState().llmModelUri;
  if (llmModel && allItems.length > 0) {
    const itemListStr = allItems.map((it, i) => `${i + 1}. ${it.text}`).join('\n');
    const categorizationUserPrompt =
      `Classify these expense items. Output one line per item as: [item text] -> [category]\n\n${itemListStr}`;
    try {
      const rawCat = await runFinanceLlm(CATEGORIZE_PROMPT, categorizationUserPrompt);
      itemCategoryMap = parseLlmCategorization(rawCat, allItems);
    } catch {
      // Fallback: keyword-based categorization
      for (const item of allItems) {
        itemCategoryMap[item.text] = detectCategory(item.text);
      }
    }
  } else {
    for (const item of allItems) {
      itemCategoryMap[item.text] = detectCategory(item.text);
    }
  }

  // ── STEP 2: TypeScript computes ALL math ────────────────────────────────────
  const fmt = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;

  // Build category map using LLM's semantic classification
  const categoryMap: Record<string, FinanceLineItem[]> = {};
  for (const item of allItems) {
    const cat = itemCategoryMap[item.text] ?? detectCategory(item.text);
    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push(item);
  }

  const grandTotalAll = allItems.reduce((sum, i) => sum + i.amount, 0);
  const remainingBudget =
    overallBudget !== undefined ? Math.max(0, overallBudget - grandTotalAll) : undefined;

  const categorySummaries: FinanceCategorySummary[] = Object.entries(categoryMap)
    .map(([cat, items]) => ({
      category: cat,
      total: items.reduce((s, i) => s + i.amount, 0),
      items,
    }))
    .sort((a, b) => b.total - a.total);

  const highestCategory =
    categorySummaries.length > 0
      ? { name: categorySummaries[0].category, amount: categorySummaries[0].total }
      : undefined;
  const lowestCategory =
    categorySummaries.length > 0
      ? {
          name: categorySummaries[categorySummaries.length - 1].category,
          amount: categorySummaries[categorySummaries.length - 1].total,
        }
      : undefined;

  // ── STEP 3: Query-aware TypeScript response builder ──────────────────────────
  const intent = detectQueryIntent(query, topicKeywords);
  let explanation: string;
  let relevantItems: FinanceLineItem[] = allItems;

  const budgetLine = overallBudget
    ? `\n- **Budget**: ${fmt(overallBudget)}  |  **Remaining**: ${fmt(remainingBudget ?? 0)}  |  **Used**: ${grandTotalAll > 0 ? Math.round((grandTotalAll / overallBudget) * 100) : 0}%`
    : '';

  if (intent.kind === 'category_breakdown') {
    // Category-wise breakdown with percentages — all computed by TypeScript
    const breakdownLines = categorySummaries.map((cs) => {
      const pct = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
      const itemLines = cs.items
        .sort((a, b) => b.amount - a.amount)
        .map((it) => `  • ${it.text}: ${fmt(it.amount)}`)
        .join('\n');
      return `**${cs.category.toUpperCase()}** — ${fmt(cs.total)} (${pct}%)\n${itemLines}`;
    });
    explanation =
      `## Category Breakdown: ${noteTitle}\n` +
      `- **Grand Total**: ${fmt(grandTotalAll)}${budgetLine}\n\n` +
      `### Breakdown by Category\n${breakdownLines.join('\n\n')}`;

  } else if (intent.kind === 'specific_category') {
    // Specific category query: show only that category's items & subtotal
    const cs = categorySummaries.find((s) => s.category === intent.cat);
    if (cs) {
      const pct = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
      const itemLines = cs.items
        .sort((a, b) => b.amount - a.amount)
        .map((it) => `  • ${it.text}: ${fmt(it.amount)}`)
        .join('\n');
      relevantItems = cs.items;
      explanation =
        `## ${cs.category.toUpperCase()} Expenses: ${noteTitle}\n` +
        `- **${cs.category.toUpperCase()} Total**: ${fmt(cs.total)} (${pct}% of total ${fmt(grandTotalAll)})\n\n` +
        `### Items\n${itemLines}`;
    } else {
      explanation =
        `## ${intent.cat.toUpperCase()} Expenses: ${noteTitle}\n` +
        `No items classified as "${intent.cat}" were found.\n\n` +
        `Grand Total (all categories): ${fmt(grandTotalAll)}`;
    }

  } else if (intent.kind === 'specific_items') {
    // Keyword-filtered items — match by item text
    const kwFiltered = allItems.filter((it) =>
      intent.keywords.some((kw) => it.text.toLowerCase().includes(kw))
    );
    if (kwFiltered.length > 0) {
      const filteredTotal = kwFiltered.reduce((s, i) => s + i.amount, 0);
      const pct = grandTotalAll > 0 ? Math.round((filteredTotal / grandTotalAll) * 100) : 0;
      const itemLines = kwFiltered
        .sort((a, b) => b.amount - a.amount)
        .map((it) => `  • ${it.text}: ${fmt(it.amount)}`)
        .join('\n');
      relevantItems = kwFiltered;
      explanation =
        `## Matching Expenses: ${noteTitle}\n` +
        `- **Filtered Total**: ${fmt(filteredTotal)} (${pct}% of total ${fmt(grandTotalAll)})\n\n` +
        `### Matching Items\n${itemLines}`;
    } else {
      explanation =
        `## Expenses: ${noteTitle}\n` +
        `- **Grand Total**: ${fmt(grandTotalAll)}${budgetLine}\n\n` +
        `No items matched "${intent.keywords.join(', ')}" — showing full breakdown:\n\n` +
        categorySummaries
          .map((cs) => {
            const pct = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
            return `**${cs.category.toUpperCase()}** — ${fmt(cs.total)} (${pct}%)`;
          })
          .join('\n');
    }

  } else if (intent.kind === 'budget_status') {
    const pctUsed = overallBudget && overallBudget > 0
      ? Math.round((grandTotalAll / overallBudget) * 100)
      : null;
    explanation =
      `## Budget Status: ${noteTitle}\n` +
      `- **Total Spent**: ${fmt(grandTotalAll)}\n` +
      (overallBudget
        ? `- **Budget**: ${fmt(overallBudget)}\n` +
          `- **Remaining**: ${fmt(remainingBudget ?? 0)}\n` +
          `- **Used**: ${pctUsed}%\n\n` +
          (grandTotalAll > (overallBudget ?? 0)
            ? `⚠️ Over budget by ${fmt(grandTotalAll - (overallBudget ?? 0))}`
            : `✓ Within budget`)
        : `- No budget set in this ledger.\n\n`) +
      `\n\n### Top Spending Categories\n` +
      categorySummaries
        .slice(0, 3)
        .map((cs) => {
          const pct = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
          return `  • **${cs.category.toUpperCase()}**: ${fmt(cs.total)} (${pct}%)`;
        })
        .join('\n');

  } else if (intent.kind === 'highest_lowest') {
    const sorted = [...categorySummaries].sort((a, b) => b.total - a.total);
    const topCat = sorted[0];
    const topItemsSorted = [...allItems].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const pct = topCat && grandTotalAll > 0 ? Math.round((topCat.total / grandTotalAll) * 100) : 0;
    explanation =
      `## Top Spending: ${noteTitle}\n` +
      `- **Grand Total**: ${fmt(grandTotalAll)}\n` +
      `- **Highest Category**: ${topCat ? `${topCat.category.toUpperCase()} — ${fmt(topCat.total)} (${pct}%)` : 'N/A'}\n\n` +
      `### Top 5 Biggest Expenses\n` +
      topItemsSorted.map((it) => `  • ${it.text}: ${fmt(it.amount)}`).join('\n') +
      `\n\n### All Categories Ranked\n` +
      sorted.map((cs, i) => {
        const p = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
        return `  ${i + 1}. **${cs.category.toUpperCase()}** — ${fmt(cs.total)} (${p}%)`;
      }).join('\n');

  } else {
    // Default: full summary
    const breakdownLines = categorySummaries.map((cs) => {
      const pct = grandTotalAll > 0 ? Math.round((cs.total / grandTotalAll) * 100) : 0;
      const itemLines = cs.items
        .sort((a, b) => b.amount - a.amount)
        .map((it) => `  • ${it.text}: ${fmt(it.amount)}`)
        .join('\n');
      return `**${cs.category.toUpperCase()}** — ${fmt(cs.total)} (${pct}%)\n${itemLines}`;
    });
    explanation =
      `## Financial Summary: ${noteTitle}\n` +
      `- **Grand Total Expense**: ${fmt(grandTotalAll)}${budgetLine}\n\n` +
      `### Category Breakdown\n${breakdownLines.join('\n\n')}`;
  }

  // Sources — show relevant items to user
  const sources: RetrievedChunk[] = [];
  for (const n of financeNotes.slice(0, 3)) {
    const structured = StructuredNoteService.fromNote(n);
    const items = StructuredNoteService.items(structured);
    const excerptItems = relevantItems.length < allItems.length ? relevantItems : items.slice(0, 5);
    const excerpt = excerptItems
      .map((it) => `• ${it.text}${it.amount !== undefined ? `: Rs. ${it.amount}` : ''}`)
      .join('\n');
    sources.push({
      noteId: n.id,
      title: n.title,
      type: n.type,
      text: excerpt || n.title,
      score: 1.0,
    });
  }

  return {
    kind: 'finance',
    data: {
      title: noteTitle,
      items: allItems,
      totalSpent: grandTotalAll,
      overallBudget,
      remainingBudget,
      categorySummaries,
      highestCategory,
      lowestCategory,
      explanation,
      currency: 'Rs.',
      sources,
    },
  };
}

// ─── Pending Items Strategy ───────────────────────────────────────────────────


async function pendingItemsStrategy(query?: string): Promise<RagResult> {
  const allNotes = await NoteRepository.findAll();
  const pendingByNote: Record<string, string[]> = {};
  let totalPending = 0;

  for (const note of allNotes.filter((n) => !n.isDeleted && !n.isLocked)) {
    const structured = StructuredNoteService.fromNote(note);
    const items = StructuredNoteService.items(structured);
    const unchecked = items.filter((i) => !i.checked);
    if (unchecked.length > 0) {
      pendingByNote[note.title] = unchecked.map((i) => i.text + (i.amount !== undefined ? ` (Rs. ${i.amount})` : ''));
      totalPending += unchecked.length;
    }
  }

  if (totalPending === 0) {
    return { kind: 'empty', message: 'You have no pending items or checklists in your notebook.' };
  }

  const contextStr = Object.entries(pendingByNote)
    .map(([title, items]) => `Checklist Note: "${title}"\nUnchecked Items:\n${items.map((it) => `• ${it}`).join('\n')}`)
    .join('\n\n');

  let answer = '';
  const llmModel = useSettingsStore.getState().llmModelUri;
  if (llmModel && query) {
    try {
      answer = await runTextLlm(
        SYSTEM_PROMPT_PENDING,
        `Pending Tasks & Checklists:\n${contextStr}\n\nUser Question: ${query}`,
      );
    } catch { }
  }

  if (!answer) {
    const lines = Object.entries(pendingByNote).map(([title, items]) => `* ${title}:\n${items.map((i) => `  • ${i}`).join('\n')}`);
    answer = `Here are your pending checklist items (${totalPending} total):\n\n${lines.join('\n\n')}`;
  }

  const topicKeywords = extractTopicKeywords(query || '');
  const pendingNotes = allNotes.filter((n) => !n.isDeleted && !n.isLocked && StructuredNoteService.items(StructuredNoteService.fromNote(n)).some((i) => !i.checked));

  const sources: RetrievedChunk[] = [];
  for (const n of pendingNotes.slice(0, 3)) {
    const items = pendingByNote[n.title] || [];
    const relevant = items.filter((it) => {
      const itLower = it.toLowerCase();
      return topicKeywords.length > 0 && topicKeywords.some((kw: string) => itLower.includes(kw));
    });
    const selected = relevant.length > 0 ? relevant : items.slice(0, 4);

    sources.push({
      noteId: n.id,
      title: n.title,
      type: n.type,
      text: selected.map((i) => `• ${i}`).join('\n'),
      score: 1.0,
    });
  }

  return {
    kind: 'qa',
    data: { answer, sources },
  };
}

/** Helper function that resolves cross-references in format [1], [2], [[Title]], or referenceIds. */
async function expandCrossReferences(sources: RetrievedChunk[]): Promise<string> {
  const allNotes = await NoteRepository.findAll();
  const noteMap = new Map(allNotes.map((n) => [n.id, n]));
  const titleMap = new Map(allNotes.map((n) => [n.title.toLowerCase(), n]));

  const contextBlocks: string[] = [];
  const processedNoteIds = new Set<string>();

  for (let i = 0; i < sources.length; i++) {
    const chunk = sources[i];
    processedNoteIds.add(chunk.noteId);
    let blockText = `[Source ${i + 1}]\n${chunk.text}`;

    const note = noteMap.get(chunk.noteId);
    if (note) {
      const structured = StructuredNoteService.fromNote(note);
      const refs = [
        ...(note.references || []),
        ...(structured.referenceIds || []).map((r) => r.title),
      ];

      // Extract inline bracketed references like [1], [2] or [[Title]] from body text
      const bodyText = StructuredNoteService.bodyText(structured);
      const bracketMatches = bodyText.match(/\[\[?([^\]]+)\]?\]/g) || [];
      for (const match of bracketMatches) {
        const cleaned = match.replace(/[\[\]]/g, '').trim();
        if (cleaned) refs.push(cleaned);
      }

      // Look up cross-referenced notes
      const expandedRefs: string[] = [];
      for (const refItem of refs) {
        const targetNote = titleMap.get(refItem.toLowerCase()) || allNotes.find((n) => n.references?.includes(refItem));
        if (targetNote && !processedNoteIds.has(targetNote.id)) {
          processedNoteIds.add(targetNote.id);
          const refStructured = StructuredNoteService.fromNote(targetNote);
          const refItems = StructuredNoteService.items(refStructured)
            .map((it) => `• ${it.text}${it.amount !== undefined ? `: Rs. ${it.amount}` : ''}`)
            .join('\n');
          const refBody = StructuredNoteService.bodyText(refStructured);
          expandedRefs.push(`--- Cross-Referenced Note: "${targetNote.title}" ---\n${refBody}\n${refItems}`);
        }
      }

      if (expandedRefs.length > 0) {
        blockText += `\n\nCross-Referenced Notes Data:\n${expandedRefs.join('\n\n')}`;
      }
    }

    contextBlocks.push(blockText);
  }

  return contextBlocks.join('\n\n');
}

function deduplicateSources(sources: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const unique: RetrievedChunk[] = [];
  for (const s of sources) {
    const key = s.noteId || s.text.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  return unique;
}

function filterSourcesByQueryIntent(
  sources: RetrievedChunk[],
  allNotes: any[],
  query: string
): RetrievedChunk[] {
  const lowerQuery = query.toLowerCase().trim();

  const titleMatchedNotes = allNotes.filter((n) => {
    if (!n.title || n.title.trim().length < 2) return false;
    const lowerTitle = n.title.toLowerCase().trim();
    if (lowerQuery.includes(lowerTitle)) return true;
    const titleWords = lowerTitle.split(/\s+/).filter((w: string) => w.length > 3);
    return titleWords.length > 0 && titleWords.every((w: string) => lowerQuery.includes(w));
  });

  if (titleMatchedNotes.length > 0) {
    const matchedNoteIds = new Set(titleMatchedNotes.map((n) => n.id));
    const titleFiltered = sources.filter((s) => matchedNoteIds.has(s.noteId));
    if (titleFiltered.length > 0) {
      return titleFiltered;
    }
  }

  return sources;
}

// ─── Concept Q&A & Targeted Summarization ──────────────────────────────────────

async function conceptQaStrategy(query: string): Promise<RagResult> {
  const allNotes = await NoteRepository.findAll();
  const rawSources = await LocalVectorIndex.search(query, 5);

  const sourcesWithMeta = rawSources.map((s) => {
    const note = allNotes.find((n) => n.id === s.noteId);
    return {
      ...s,
      title: note ? note.title : undefined,
      type: note ? (note.type as any) : undefined,
    };
  });

  let sources = deduplicateSources(sourcesWithMeta);
  sources = filterSourcesByQueryIntent(sources, allNotes, query);

  if (sources.length === 0) {
    return { kind: 'empty', message: "I couldn't find that in your notes." };
  }

  const lowerQuery = query.toLowerCase();
  const isSummary = lowerQuery.includes('summarize') || lowerQuery.includes('summary') || lowerQuery.includes('overview');
  const isConceptExplain = lowerQuery.includes('explain') || lowerQuery.includes('meaning') || lowerQuery.includes('what is');

  const retrievedContext = await expandCrossReferences(sources);

  const llmModel = useSettingsStore.getState().llmModelUri;
  if (!llmModel) {
    const bullets = sources.slice(0, 4).map((s) => `• ${s.text.split(/[.!?]/)[0].trim()}`);
    return {
      kind: 'summary',
      data: { bullets, sources, rawText: bullets.join('\n') },
    };
  }

  if (isSummary) {
    try {
      const raw = await runTextLlm(
        SYSTEM_PROMPT_SUMMARY,
        `Note context:\n${retrievedContext}\n\nPlease summarize:`,
      );
      const bullets = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('•') || l.startsWith('-') || l.match(/^\d+\./))
        .map((l) => l.replace(/^[-\d.]+\s*/, '• '));

      return {
        kind: 'summary',
        data: { bullets: bullets.length > 0 ? bullets : [raw], sources, rawText: raw },
      };
    } catch {
      const bullets = sources.slice(0, 4).map((s) => `• ${s.text.split(/[.!?]/)[0].trim()}`);
      return { kind: 'summary', data: { bullets, sources, rawText: bullets.join('\n') } };
    }
  }

  // Targeted Concept Explanation & Word Meanings
  try {
    const rawLlm = await runTextLlm(
      SYSTEM_PROMPT_CONCEPT,
      `Notebook Context:\n${retrievedContext}\n\nUser Question: ${query}`,
    );
    const { cleanText, citationText } = extractCitationFromLlmOutput(rawLlm);

    if (citationText && sources.length > 0) {
      sources[0].text = citationText;
    }

    return {
      kind: 'qa',
      data: {
        answer: cleanText || "I couldn't find relevant details in your notes.",
        sources,
      },
    };
  } catch {
    return {
      kind: 'qa',
      data: { answer: sources.map((s) => s.text).join('\n\n'), sources },
    };
  }
}

// ─── Intent Classifier ────────────────────────────────────────────────────────

class SmartRagServiceClass {
  /** Classify intent without running the full pipeline — used by ChatScreen for intent badges. */
  classifyIntent(query: string): 'finance' | 'pending' | 'summary' | 'qa' {
    const lower = query.toLowerCase();
    if (lower.includes('pending') || lower.includes('shopping items') || lower.includes('todo items')) {
      return 'pending';
    }
    const financeKws = [
      'spend', 'spending', 'spent', 'cost', 'expense', 'expenses', 'budget',
      'how much', 'total', 'rupees', 'rupee', 'left', 'remaining', 'percentage',
      'highest', 'lowest', 'food', 'transport', 'hotel', 'cab', 'bill',
    ];
    if (financeKws.some((kw) => lower.includes(kw))) return 'finance';
    if (lower.includes('summarize') || lower.includes('summary') || lower.includes('overview')) return 'summary';
    return 'qa';
  }

  async answer(query: string): Promise<RagResult> {
    const lower = query.toLowerCase();

    // Pending items intent
    if (lower.includes('pending') || lower.includes('shopping items') || lower.includes('todo items')) {
      return pendingItemsStrategy();
    }

    // Finance intent
    const isFinance = [
      'spend', 'spending', 'spent', 'cost', 'expense', 'expenses', 'budget',
      'how much', 'total', 'rupees', 'rupee', 'left', 'remaining', 'percentage',
      'highest', 'lowest', 'food', 'transport', 'hotel', 'cab', 'bill',
    ].some((kw) => lower.includes(kw));

    if (isFinance) {
      return financeIntelligenceStrategy(query);
    }

    // Concept / Note Q&A / Summary
    return conceptQaStrategy(query);
  }
}

export const SmartRagService = new SmartRagServiceClass();
