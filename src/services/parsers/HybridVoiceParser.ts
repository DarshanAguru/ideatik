import { CommandParser, ParsedNoteResult } from './CommandParser';
import { useSettingsStore } from '../../features/settings/settingsStore';

export class HybridVoiceParserClass {
  /**
   * Hybrid Voice Parser:
   * 1. Runs deterministic CommandParser baseline.
   * 2. If offline LLM model is available, enriches item segmentation and expense amount pairs semantically.
   * 3. Fallback safely to CommandParser if LLM is unavailable or fails.
   */
  async parse(
    rawText: string,
    existingItems: any[] = [],
    initialType: 'note' | 'list' | 'finance' = 'note'
  ): Promise<ParsedNoteResult> {
    // Step 1: Fast deterministic baseline
    const baseline = CommandParser.parse(rawText, existingItems, initialType);
    if (!rawText.trim()) return baseline;

    // Check if offline LLM & Embedding models are BOTH configured and available
    const llmModelUri = useSettingsStore.getState().llmModelUri;
    const embeddingModelUri = useSettingsStore.getState().embeddingModelUri;
    if (!llmModelUri || !embeddingModelUri) {
      return baseline;
    }

    try {
      const { OfflineAiModelService } = require('../ai/OfflineAiModelService');
      const hasLlm = await OfflineAiModelService.checkModelExists('llm');
      const hasEmbedding = await OfflineAiModelService.checkModelExists('embedding');
      if (!hasLlm || !hasEmbedding) {
        return baseline;
      }

      // Step 2: Semantic LLM structure extraction
      const prompt = `System: You are an intelligent note & list parser. Given a transcript of spoken text, extract structured information.
Rules:
1. Determine note type: "note", "list", or "finance".
2. If list/finance: group items by spoken meaning. For example:
   - "add tea cost 100 add coffee cost 100" -> finance items: [{"text": "tea", "amount": 100}, {"text": "coffee", "amount": 100}]
   - "add milk add coffee add tea bag add milk cookies for kids" -> list items: [{"text": "milk"}, {"text": "coffee"}, {"text": "tea bag"}, {"text": "milk cookies for kids"}]
3. Keep exact wording intact for descriptions. Do not break single phrase items like "milk cookies for kids" into multiple entries.
4. Output JSON format strictly:
{
  "type": "note" | "list" | "finance",
  "items": [{"text": "string", "amount": number | null}],
  "title": "string or null"
}

Transcript: "${rawText}"
JSON:`;

      const llmResult = await OfflineAiModelService.generateCompletion('llm', prompt, {
        maxTokens: 256,
        temperature: 0.1,
      });

      if (!llmResult) return baseline;

      // Extract JSON from LLM output
      const jsonMatch = llmResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedJson = JSON.parse(jsonMatch[0]);
        if (parsedJson && Array.isArray(parsedJson.items) && parsedJson.items.length > 0) {
          const semanticType = parsedJson.type === 'list' || parsedJson.type === 'finance' ? parsedJson.type : baseline.type;
          const semanticItems = parsedJson.items
            .filter((it: any) => it && it.text && String(it.text).trim())
            .map((it: any, idx: number) => ({
              id: existingItems[idx]?.id || `item_llm_${Date.now()}_${idx}`,
              text: String(it.text).trim(),
              amount: it.amount !== undefined && it.amount !== null && !isNaN(Number(it.amount)) ? Number(it.amount) : undefined,
              checked: false,
            }));

          return {
            title: parsedJson.title || baseline.title,
            type: semanticType,
            bodyText: baseline.bodyText,
            items: semanticItems,
            hasReferenceCommand: baseline.hasReferenceCommand,
            references: baseline.references,
            pendingReferenceCommands: baseline.pendingReferenceCommands,
          };
        }
      }
    } catch (e) {
      console.warn('HybridVoiceParser: LLM semantic enrichment fallback to baseline:', e);
    }

    return baseline;
  }
}

export const HybridVoiceParser = new HybridVoiceParserClass();
