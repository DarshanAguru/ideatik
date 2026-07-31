import { HybridVoiceParser } from './HybridVoiceParser';

describe('HybridVoiceParser', () => {
  it('parses baseline checklist items fast when offline LLM is not installed', async () => {
    const transcript = 'create list add milk add coffee add tea bag add milk cookies for kids';
    const result = await HybridVoiceParser.parse(transcript);

    expect(result.type).toBe('list');
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('parses finance expense items correctly', async () => {
    const transcript = 'create finance list add tea cost 100 add coffee cost 100';
    const result = await HybridVoiceParser.parse(transcript);

    expect(result.type).toBe('finance');
    expect(result.items.length).toBe(2);
    expect(result.items[0].text.toLowerCase()).toContain('tea');
    expect(result.items[0].amount).toBe(100);
    expect(result.items[1].text.toLowerCase()).toContain('coffee');
    expect(result.items[1].amount).toBe(100);
  });
});
