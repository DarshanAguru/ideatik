/* eslint-env jest */
import { CommandParser } from '../src/services/parsers/CommandParser';

describe('CommandParser Unit Tests', () => {
  it('correctly parses title, checklist, ledger, and reference commands', () => {
    const transcript = "Today I need to prepare for the party. Title start party prep end. Create a checklist. Add item balloons amount 10. Add item cake. I should also clean the room. Add reference here. That's all for now. End note.";
    
    const result = CommandParser.parse(transcript);
    
    expect(result.title).toBe('party prep');
    expect(result.type).toBe('list');
    expect(result.hasEndCommand).toBe(true);
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
});
