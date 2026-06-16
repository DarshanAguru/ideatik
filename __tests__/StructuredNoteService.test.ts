import { StructuredNoteService } from '../src/services/notes/StructuredNoteService';

describe('StructuredNoteService', () => {
  it('migrates markdown lists into structured content and exports markdown', () => {
    const content = StructuredNoteService.fromMarkdown(
      '# Groceries\n\nRemember the weekly shop.\n\n- [ ] Milk\n- [x] Bread: 3.50\n\n[[Meal Plan]]',
      'Fallback'
    );

    expect(content.title).toBe('Groceries');
    expect(content.type).toBe('finance');
    expect(content.bodyBlocks).toEqual(['Remember the weekly shop.']);
    expect(content.financeItems).toHaveLength(2);
    expect(content.financeItems[1].amount).toBe(3.5);
    expect(content.referenceIds[0].title).toBe('Meal Plan');

    const markdown = StructuredNoteService.toMarkdown(content);
    expect(markdown).toContain('# Groceries');
    expect(markdown).toContain('- [x] Bread: 3.50');
  });

  it('normalizes direct structured list and finance item arrays', () => {
    const content = StructuredNoteService.normalize({
      title: 'Budget',
      type: 'finance',
      bodyBlocks: ['Trip costs'],
      financeItems: [{ id: '1', text: 'Train', amount: '12.25', checked: true }],
      referenceIds: [{ noteId: 'abc', title: 'Travel' }],
      pendingReferenceCommands: ['reference'],
    });

    expect(StructuredNoteService.bodyText(content)).toBe('Trip costs');
    expect(StructuredNoteService.items(content)[0].amount).toBe(12.25);
    expect(content.referenceIds[0].noteId).toBe('abc');
    expect(content.pendingReferenceCommands).toEqual(['reference']);
  });
});
