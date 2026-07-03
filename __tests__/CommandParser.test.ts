/* eslint-env jest */
import { CommandParser } from '../src/services/parsers/CommandParser';

describe('CommandParser', () => {
  it('correctly parses checklist, ledger, and reference commands', () => {
    const transcript =
      'Today I need to prepare for the party. Create a checklist. Add item balloons. Add item cake. I should also clean the room. Add reference here.';

    const result = CommandParser.parse(transcript);

    expect(result.title).toBe('');
    expect(result.type).toBe('list');
    expect(result.hasReferenceCommand).toBe(true);
    expect(result.references).toContain('[1]');
    expect(result.pendingReferenceCommands).toContain('[1]');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('balloons');
    expect(result.items[1].text).toBe('cake');
    expect(result.bodyText).toBe(
      'Today I need to prepare for the party. I should also clean the room. [1].',
    );
  });

  it('handles add items to list pattern', () => {
    const t = CommandParser.parse('add fresh milk to list');
    expect(t.items).toHaveLength(1);
    expect(t.items[0].text).toBe('fresh milk');
  });

  it('handles variations of add reference command with misspellings and synonyms', () => {
    const t1 = CommandParser.parse('Please add refrence hear');
    expect(t1.hasReferenceCommand).toBe(true);
    expect(t1.references).toContain('[1]');

    const t2 = CommandParser.parse('I want to link reference, here');
    expect(t2.hasReferenceCommand).toBe(true);
    expect(t2.references).toContain('[1]');

    const t3 = CommandParser.parse('insert citation');
    expect(t3.hasReferenceCommand).toBe(true);
    expect(t3.references).toContain('[1]');

    const t4 = CommandParser.parse('difference hear');
    expect(t4.hasReferenceCommand).toBe(true);
    expect(t4.references).toContain('[1]');
  });

  it('add is the only item splitter — everything between two adds is one item', () => {
    const result = CommandParser.parse(
      'create list add item 1 and item 2 add other item',
    );
    expect(result.type).toBe('list');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('item 1 and item 2');
    expect(result.items[1].text).toBe('other item');
  });

  it('handles implicit checklist mode for subsequent sentences', () => {
    const transcript = 'create checklist. organic eggs. brown bread. chocolate.';
    const result = CommandParser.parse(transcript);

    expect(result.type).toBe('list');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].text).toBe('organic eggs');
    expect(result.items[1].text).toBe('brown bread');
    expect(result.items[2].text).toBe('chocolate');
    expect(result.bodyText).toBe('');
  });

  it('splits list items only when add keyword is repeated', () => {
    const t = CommandParser.parse('create list add milk add eggs add bread');
    expect(t.type).toBe('list');
    expect(t.items).toHaveLength(3);
    expect(t.items[0].text).toBe('milk');
    expect(t.items[1].text).toBe('eggs');
    expect(t.items[2].text).toBe('bread');
  });

  it('finance: cost keyword separates description from amount (digits)', () => {
    const result = CommandParser.parse(
      'create finance list add rent cost 1200 add coffee cost 50',
    );
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(1200);
    expect(result.items[1].text).toBe('coffee');
    expect(result.items[1].amount).toBe(50);
  });

  it('finance: amount can be spoken in English words', () => {
    const result = CommandParser.parse(
      'create finance list add rent cost twelve thousand add coffee cost fifty rupees',
    );
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(12000);
    expect(result.items[1].text).toBe('coffee');
    expect(result.items[1].amount).toBe(50);
  });

  it('finance: compound spoken amount (twelve thousand fifty rupees)', () => {
    const result = CommandParser.parse(
      'create ledger add rent cost twelve thousand fifty rupees',
    );
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(12050);
  });

  it('finance: stray cost without add does not corrupt preceding amount', () => {
    // "and coffee cost fifty" has no "add" prefix so coffee is NOT a new item;
    // amount for rent stops at the next "cost" keyword → 12050, not 12100.
    const result = CommandParser.parse(
      'create finance list add rent cost twelve thousand and fifty and coffee cost fifty',
    );
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(12050);
  });

  it('finance: correct with proper add before each item', () => {
    const result = CommandParser.parse(
      'create finance list add rent cost twelve thousand and fifty add coffee cost fifty',
    );
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(12050);
    expect(result.items[1].text).toBe('coffee');
    expect(result.items[1].amount).toBe(50);
  });

  it('correctly handles multiple add items explicitly', () => {
    const t = CommandParser.parse('create checklist add item milk add item eggs');
    expect(t.type).toBe('list');
    expect(t.items).toHaveLength(2);
    expect(t.items[0].text).toBe('milk');
    expect(t.items[1].text).toBe('eggs');

    const t2 = CommandParser.parse('create a list add item grapes add item pears');
    expect(t2.type).toBe('list');
    expect(t2.items).toHaveLength(2);
    expect(t2.items[0].text).toBe('grapes');
    expect(t2.items[1].text).toBe('pears');
  });

  it('preserves the word item when followed by a number', () => {
    const result = CommandParser.parse('add item 1 and item 2');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe('item 1 and item 2');
  });

  it('connectives like "and" do NOT split items', () => {
    const result = CommandParser.parse('create list add apple juice and mango juice');
    expect(result.type).toBe('list');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe('apple juice and mango juice');
  });
});
