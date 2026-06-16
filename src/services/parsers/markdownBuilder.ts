import { StructuredNote } from './types';

class MarkdownBuilderClass {
  /**
   * Converts a structured note model into standard Markdown.
   */
  build(note: StructuredNote): string {
    const parts: string[] = [];

    // 1. Heading
    if (note.title.trim()) {
      parts.push(`# ${note.title.trim()}`);
    }

    // 2. Body text / Paragraphs
    if (note.bodyText.trim()) {
      parts.push(note.bodyText.trim());
    }

    // 3. Lists (Checklists or Bullet lists)
    if (note.items.length > 0) {
      const listMarkdown = note.items
        .map((item) => {
          if (item.isChecklist) {
            const checkbox = item.checked ? '[x]' : '[ ]';
            if (note.type === 'finance' && item.amount !== undefined) {
              const amtStr = typeof item.amount === 'number' ? item.amount.toFixed(2) : item.amount;
              return `- ${checkbox} ${item.text}: ${amtStr}`;
            }
            return `- ${checkbox} ${item.text}`;
          } else {
            return `- ${item.text}`;
          }
        })
        .join('\n');
      parts.push(listMarkdown);
    }

    // 4. References
    if (note.references.length > 0) {
      const refsMarkdown = note.references.map((ref) => `[[${ref}]]`).join(' ');
      parts.push(refsMarkdown);
    }

    return parts.join('\n\n');
  }
}

export const markdownBuilder = new MarkdownBuilderClass();
