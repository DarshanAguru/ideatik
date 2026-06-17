/* eslint-env jest */
import { CommandParser } from './CommandParser';

describe('CommandParser', () => {
  it('correctly parses title, checklist, ledger, and reference commands', () => {
    const transcript = "Today I need to prepare for the party. Title start party prep end. Create a checklist. Add item balloons amount 10. Add item cake. I should also clean the room. Add reference here. That's all for now.";
    
    const result = CommandParser.parse(transcript);
    
    expect(result.title).toBe('party prep');
    expect(result.type).toBe('list');
    expect(result.hasEndCommand).toBe(false);
    expect(result.hasReferenceCommand).toBe(true);
    expect(result.references).toContain('[1]');
    expect(result.pendingReferenceCommands).toContain('[1]');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('balloons');
    expect(result.items[0].amount).toBe(10);
    expect(result.items[1].text).toBe('cake');
    expect(result.items[1].amount).toBeUndefined();
    expect(result.bodyText).toBe("Today I need to prepare for the party. I should also clean the room. [1]. That's all for now.");
  });

  it('handles variations in title start and end pattern spacing and casing', () => {
    const t1 = CommandParser.parse("TITLE   start  shopping checklist  end");
    expect(t1.title).toBe('shopping checklist');

    const t2 = CommandParser.parse("title start grocery list end");
    expect(t2.title).toBe('grocery list');
  });

  it('handles add items to list pattern', () => {
    const t = CommandParser.parse("add fresh milk to list");
    expect(t.items).toHaveLength(1);
    expect(t.items[0].text).toBe('fresh milk');
  });

  it('handles variations of add reference command', () => {
    const t1 = CommandParser.parse("Please add reference here");
    expect(t1.hasReferenceCommand).toBe(true);
    expect(t1.references).toContain('[1]');

    const t2 = CommandParser.parse("I want to add a reference, here");
    expect(t2.hasReferenceCommand).toBe(true);
    expect(t2.references).toContain('[1]');

    const t3 = CommandParser.parse("Just add reference");
    expect(t3.hasReferenceCommand).toBe(true);
    expect(t3.references).toContain('[1]');
  });

  it('handles conversational and sequential list item additions without explicit add prefix', () => {
    const transcript = "create a list of apples and milk and oranges";
    const result = CommandParser.parse(transcript);
    
    expect(result.type).toBe('list');
    expect(result.items).toHaveLength(3);
    expect(result.items[0].text).toBe('apples');
    expect(result.items[1].text).toBe('milk');
    expect(result.items[2].text).toBe('oranges');
  });

  it('handles conversational finance list item additions with amounts', () => {
    const transcript = "create a finance list of rent 500 rupees and electricity 100 dollars";
    const result = CommandParser.parse(transcript);
    
    expect(result.type).toBe('finance');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe('rent');
    expect(result.items[0].amount).toBe(500);
    expect(result.items[1].text).toBe('electricity');
    expect(result.items[1].amount).toBe(100);
  });

  it('splits sequential items correctly when prefixed with add or add item', () => {
    const t1 = CommandParser.parse("add item apples add item bananas add item oranges");
    expect(t1.items).toHaveLength(3);
    expect(t1.items[0].text).toBe('apples');
    expect(t1.items[1].text).toBe('bananas');
    expect(t1.items[2].text).toBe('oranges');

    const t2 = CommandParser.parse("create a list add item grapes add item pears");
    expect(t2.type).toBe('list');
    expect(t2.items).toHaveLength(2);
    expect(t2.items[0].text).toBe('grapes');
    expect(t2.items[1].text).toBe('pears');
  });
});
